import { useEffect, useRef, useState } from "react";
import Welcome from "./components/Welcome.jsx";
import CharacterCreation from "./components/CharacterCreation.jsx";
import GameScreen from "./components/GameScreen.jsx";
import ApiSettings from "./components/ApiSettings.jsx";
import PromptEditor from "./components/PromptEditor.jsx";
import SaveManager from "./components/SaveManager.jsx";
import UpdateDialog from "./components/UpdateDialog.jsx";
import ChangelogDialog from "./components/ChangelogDialog.jsx";
import WorldMap from "./components/WorldMap.jsx";
import ImportantItemConfirmation from "./components/ImportantItemConfirmation.jsx";
import { createInitialGame, DEFAULT_SYSTEM_PROMPT, migrateSystemPrompt } from "./data/defaults.js";
import { buildRejectedToolNarrative, dedupeToolCalls, executeToolCalls, isRepairableToolError, normalizeToolCalls, validateToolCall } from "./engine/tools.js";
import { auditTurnChanges, collectImportantItemConfirmations, createAuditBaseline } from "./engine/audit.js";
import { resolveTurnProgress } from "./engine/turn.js";
import { loadApiSettings, requestAIWithReasoningFallback, saveApiSettings } from "./services/api.js";
import { buildChoiceRegenerationContext, buildPlanningContext, buildRenderingContext, buildSummaryContext, buildToolRepairContext, buildUnifiedContext, computeMemoryUpdate, composeSummary, parseSectionedSummary } from "./services/memory.js";
import { mockResponse } from "./services/mock.js";
import { deleteSave, exportSave, importSave, listSaves, loadGame, saveGame } from "./services/storage.js";
import { extractNarrativePreview } from "./services/streamPreview.js";
import { ensureMapMoveToolCall, ensureMockMapDiscoveryToolCall } from "./services/mapTravel.js";
import { hasUsableChoices, injectOccultEntryChoice } from "./services/choices.js";
import { createTurnResolution } from "./services/turnResolution.js";
import { makeId } from "./utils/id.js";
import { checkForUpdate, isNativeAndroid } from "./services/updates.js";
import { finishTurnMetrics, markTurnMetric, recordModelRequest, startTurnMetrics } from "./services/turnMetrics.js";

function hasValidModelChoices(response) {
  return response?.choiceMeta?.source === "model"
    && hasUsableChoices(response.choices)
    && new Set(response.choices.map((choice) => choice.risk)).size === 3;
}

function choiceValidationError(response) {
  return response?.choiceMeta?.reason || "模型没有返回三个互不重复且风险不同的行动选项";
}

export default function App() {
  const [screen, setScreen] = useState("welcome");
  const [game, setGame] = useState(null);
  const [settings, setSettings] = useState(loadApiSettings);
  const [prompt, setPrompt] = useState(() => {
    const saved = localStorage.getItem("mist-system-prompt");
    if (!saved) return DEFAULT_SYSTEM_PROMPT;
    const migrated = migrateSystemPrompt(saved);
    if (migrated !== saved) localStorage.setItem("mist-system-prompt", migrated);
    return migrated;
  });
  const [modal, setModal] = useState(null);
  const [saves, setSaves] = useState(listSaves);
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [turnPhase, setTurnPhase] = useState("idle");
  const [error, setError] = useState("");
  const [itemConfirmation, setItemConfirmation] = useState(null);
  const controllerRef = useRef(null);
  const itemConfirmationResolverRef = useRef(null);
  const busyRef = useRef(false);
  const lastActionRef = useRef("");
  const streamTimerRef = useRef(null);
  const pendingStreamRef = useRef("");
  const refreshSaves = () => setSaves(listSaves());

  useEffect(() => {
    if (!isNativeAndroid()) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      checkForUpdate().then((result) => {
        if (active && result.hasUpdate) setModal("update-auto");
      }).catch(() => {});
    }, 1800);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  const resetStreamPreview = () => {
    if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    streamTimerRef.current = null;
    pendingStreamRef.current = "";
    setStreamText("");
  };
  const queueStreamPreview = (rawContent) => {
    const preview = extractNarrativePreview(rawContent);
    pendingStreamRef.current = preview;
    if (preview) setTurnPhase((current) => ["generating", "manualRetry", "thinking", "budgetRecovery", "toolRetry", "reasoningRetry", "finalizing"].includes(current) ? "streaming" : current);
    if (streamTimerRef.current) return Boolean(preview);
    streamTimerRef.current = setTimeout(() => {
      setStreamText(pendingStreamRef.current);
      streamTimerRef.current = null;
    }, 40);
    return Boolean(preview);
  };

  const commitGame = (next) => {
    const saved = saveGame(next);
    setGame(saved);
    refreshSaves();
  };
  const handleCreate = (character) => { const next = createInitialGame(character); commitGame(next); setScreen("game"); };
  const handleContinue = () => { const loaded = loadGame(); if (loaded) { setGame(loaded); setScreen("game"); } };
  const handleImport = async (file) => { const imported = await importSave(file); setGame(imported); refreshSaves(); setScreen("game"); };
  const handleSettingsSave = (next) => { setSettings(saveApiSettings(next)); };
  const handlePromptSave = (next) => { localStorage.setItem("mist-system-prompt", next); setPrompt(next); };

  const requestImportantItemConfirmation = (changes, signal) => new Promise((resolve) => {
    const finish = (decision) => {
      signal.removeEventListener("abort", handleAbort);
      itemConfirmationResolverRef.current = null;
      setItemConfirmation(null);
      resolve(decision);
    };
    const handleAbort = () => finish({ cancelled: true, aborted: true });
    itemConfirmationResolverRef.current = finish;
    setItemConfirmation({ changes });
    signal.addEventListener("abort", handleAbort, { once: true });
  });

  const settleImportantItemConfirmation = (decision) => itemConfirmationResolverRef.current?.(decision);

  const requestChoicesFromAI = (targetGame, action, narrative, validationError, signal) => {
    const messages = buildChoiceRegenerationContext(targetGame, action, narrative, validationError, prompt, { nativeTools: settings.nativeTools });
    return requestAIWithReasoningFallback(settings, messages, signal, undefined, {
      toolSet: "choices",
      disableJsonMode: Boolean(settings.nativeTools),
      forceDisableReasoning: true,
      maxTokensModeOverride: "manual",
      maxTokensOverride: 1200,
    });
  };

  // 回合提交后异步让模型重写长期摘要；失败或玩家已开始新回合则保留截断版
  const scheduleSummaryRewrite = (memoryPlan, gameId, turn) => {
    if (settings.mockMode || !memoryPlan.archived.length) return;
    const summaryController = new AbortController();
    (async () => {
      try {
        const response = await requestAIWithReasoningFallback(settings, buildSummaryContext(memoryPlan.previousSummary, memoryPlan.archived, prompt), summaryController.signal, undefined, {
          disableTools: true,
          disableJsonMode: true,
          forceDisableReasoning: true,
          skipReasoningRetry: true,
          maxTokensModeOverride: "manual",
          maxTokensOverride: 1200,
        });
        const summary = String(response.narrative || "").trim().slice(-1800);
        if (!summary) return;
        const sections = parseSectionedSummary(summary);
        setGame((current) => {
          if (!current || current.id !== gameId || current.turn !== turn) return current;
          if (!sections) return saveGame({ ...current, longTermSummary: summary.replace(/\s+/g, " ") });
          return saveGame({ ...current, memorySections: sections, longTermSummary: composeSummary(sections) });
        });
      } catch { /* 截断版摘要已随回合写入，静默降级 */ }
    })();
  };

  const runTurn = async (action, options = {}) => {
    if (!game || busyRef.current || !action.trim()) return false;
    const selectedRisk = (Array.isArray(game.choices) ? game.choices : []).find((choice) => choice.label === action)?.risk;
    busyRef.current = true; lastActionRef.current = action; setLoading(true); setTurnPhase(options.manualRetry ? "manualRetry" : "generating"); setError(""); resetStreamPreview();
    const controller = new AbortController(); controllerRef.current = controller;
    const metrics = startTurnMetrics();
    let timedOut = false;
    let watchdogTimer = null;
    const armWatchdog = () => {
      clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(() => { timedOut = true; controller.abort(); }, 150000);
    };
    armWatchdog();
    const handleTurnPreview = (rawContent) => {
      armWatchdog();
      const hasPreview = queueStreamPreview(rawContent);
      if (hasPreview) markTurnMetric(metrics, "firstNarrativeAt");
    };
    try {
      const requestModel = async (requestMessages, requestOptions = {}, preview = false) => {
        const response = await requestAIWithReasoningFallback(settings, requestMessages, controller.signal, preview ? handleTurnPreview : undefined, {
        ...requestOptions,
        onReasoningChunk: () => { armWatchdog(); setTurnPhase((current) => ["generating", "manualRetry", "finalizing"].includes(current) ? "thinking" : current); },
        onReasoningRecovery: () => { if (preview) resetStreamPreview(); setTurnPhase("budgetRecovery"); },
        onReasoningFallback: () => { if (preview) resetStreamPreview(); setTurnPhase("reasoningRetry"); },
        });
        recordModelRequest(metrics, response);
        return response;
      };

      let fastMode = Boolean(settings.fastMode) && !settings.mockMode;
      let planningResponse;
      if (settings.mockMode) {
        planningResponse = await mockResponse(game, action, controller.signal, handleTurnPreview);
      } else if (fastMode) {
        try {
          // 快速模式固定使用 JSON 协议：narrative 是首个字段，剧情必然最先逐字流出，
          // 不受模型「先出工具调用再写正文」的原生通道顺序影响
          planningResponse = await requestModel(
            buildUnifiedContext(game, action, prompt, { nativeTools: false, mapInvestigation: options.mapInvestigation }),
            { disableTools: true, maxTokensModeOverride: "manual", maxTokensOverride: 6000, skipReasoningRetry: true },
            true,
          );
        } catch (unifiedError) {
          if (unifiedError.name === "AbortError") throw unifiedError;
          if (!["REASONING_EXHAUSTED", "EMPTY_RESPONSE"].includes(unifiedError.code)) throw unifiedError;
          // 合并请求推理耗尽/空响应时不再原样重试，直接降级为两段式完成本轮
          fastMode = false;
          resetStreamPreview();
          setTurnPhase("reasoningRetry");
        }
      }
      if (!settings.mockMode && !fastMode) {
        planningResponse = await requestModel(
          buildPlanningContext(game, action, prompt, { nativeTools: settings.nativeTools, mapInvestigation: options.mapInvestigation }),
          { toolSet: "state", disableJsonMode: Boolean(settings.nativeTools) },
        );
      }
      const discoveryAdjustedCalls = settings.mockMode ? ensureMockMapDiscoveryToolCall(planningResponse.toolCalls, options.mapInvestigation, game.turn + 1, game) : planningResponse.toolCalls;
      let proposedToolCalls = dedupeToolCalls(normalizeToolCalls(ensureMapMoveToolCall(discoveryAdjustedCalls, options.mapDestination, game.turn + 1), game));

      if (!settings.mockMode && !fastMode) {
        // 工具修复重试仅在严格模式保留；快速模式下缺参/无效调用直接拒绝，由下一轮叙事找补
        const repairedCalls = [];
        let repairCount = 0;
        for (const proposedCall of proposedToolCalls) {
          let checked = validateToolCall(game, proposedCall);
          if (checked.error && isRepairableToolError(checked.call, checked.error) && repairCount < 3) {
            repairCount += 1;
            setTurnPhase("toolRetry");
            const repairMessages = buildToolRepairContext(game, action, checked.call, checked.error, prompt, { nativeTools: settings.nativeTools });
            try {
              const repairResponse = await requestModel(repairMessages, {
                toolSet: "state",
                allowedToolNames: [checked.call.name],
                disableJsonMode: Boolean(settings.nativeTools),
                forceDisableReasoning: true,
                maxTokensModeOverride: "manual",
                maxTokensOverride: 1600,
              });
              const repaired = normalizeToolCalls(repairResponse.toolCalls, game).find((call) => call.name === checked.call.name);
              if (repaired) checked = validateToolCall(game, repaired);
            } catch (repairError) {
              if (repairError.name === "AbortError") throw repairError;
            }
          }
          repairedCalls.push(checked.call);
        }
        proposedToolCalls = dedupeToolCalls(repairedCalls);
      }
      markTurnMetric(metrics, "planningCompletedAt");

      setTurnPhase("validating");
      let execution = executeToolCalls(game, proposedToolCalls);
      let progress = resolveTurnProgress(execution.game, action, selectedRisk, proposedToolCalls, execution.results);
      let resolvedGame = {
        ...execution.game,
        turn: game.turn + 1,
        worldTime: progress.worldTime,
        occult: progress.occult,
        hiddenDanger: progress.hiddenDanger,
      };
      const importantChanges = collectImportantItemConfirmations(proposedToolCalls, execution.results);
      let confirmationStatus = { required: false, status: "not-required", confirmed: 0, rejected: 0 };
      if (importantChanges.length) {
        setTurnPhase("itemConfirmation");
        markTurnMetric(metrics, "confirmationStartedAt");
        const decision = await requestImportantItemConfirmation(importantChanges, controller.signal);
        markTurnMetric(metrics, "confirmationCompletedAt");
        if (decision.cancelled) {
          const abortError = new Error("玩家取消了重要物品确认");
          abortError.name = "AbortError";
          throw abortError;
        }
        const approvedKeys = new Set(decision.approvedKeys || []);
        const blockedCallIndexes = importantChanges.filter((change) => !approvedKeys.has(change.key)).map((change) => change.callIndex);
        confirmationStatus = {
          required: true,
          status: blockedCallIndexes.length ? (approvedKeys.size ? "partially-confirmed" : "rejected") : "confirmed",
          confirmed: importantChanges.length - blockedCallIndexes.length,
          rejected: blockedCallIndexes.length,
        };
        if (blockedCallIndexes.length) {
          execution = executeToolCalls(game, proposedToolCalls, { blockedCallIndexes });
          progress = resolveTurnProgress(execution.game, action, selectedRisk, proposedToolCalls, execution.results);
          resolvedGame = {
            ...execution.game,
            turn: game.turn + 1,
            worldTime: progress.worldTime,
            occult: progress.occult,
            hiddenDanger: progress.hiddenDanger,
          };
        }
      }
      const resolution = createTurnResolution(proposedToolCalls, execution.results, progress);

      let response = planningResponse;
      const rejectedNarrativeSuffix = () => {
        const rejectionNarrative = buildRejectedToolNarrative(action, execution.results);
        return execution.results.some((result) => result.ok) ? `${response.narrative}\n\n${rejectionNarrative}` : rejectionNarrative;
      };
      if (!settings.mockMode && !(fastMode && response.hasNarrative)) {
        resetStreamPreview();
        setTurnPhase("finalizing");
        const renderMessages = buildRenderingContext(game, resolvedGame, action, prompt, resolution, { nativeTools: settings.nativeTools });
        response = await requestModel(renderMessages, { toolSet: "choices", disableJsonMode: Boolean(settings.nativeTools) }, true);
        if (!response.hasNarrative) {
          const originalChoices = { choices: response.choices, choiceMeta: response.choiceMeta };
          resetStreamPreview();
          setTurnPhase("reasoningRetry");
          const narrativeOnlyMessages = [...renderMessages, { role: "system", content: "上一次响应没有最终剧情。现在只在 assistant.content 中返回纯文本剧情，不要调用任何工具，不要输出 JSON。" }];
          const narrativeResponse = await requestModel(narrativeOnlyMessages, { disableTools: true, disableJsonMode: true, forceDisableReasoning: true }, true);
          response = { ...narrativeResponse, ...originalChoices };
        }
        if (!response.hasNarrative) throw new Error("模型没有返回最终剧情正文，请重试本轮。");
      } else if (settings.mockMode && execution.results.some((result) => !result.ok)) {
        // 仅 Mock 模式把拒绝说明拼进正文；快速模式的拒绝记录经 changeLog 与下一轮上下文回填
        response = { ...response, narrative: rejectedNarrativeSuffix(), hasNarrative: true };
      }

      let choices = hasValidModelChoices(response) ? response.choices : [];
      let choiceMeta = hasValidModelChoices(response) ? response.choiceMeta : { source: "unavailable", fallback: false, reason: choiceValidationError(response) };
      if (!settings.mockMode && !choices.length) {
        setTurnPhase("choiceRetry");
        try {
          const choiceResponse = await requestChoicesFromAI(resolvedGame, action, response.narrative, choiceMeta.reason, controller.signal);
          recordModelRequest(metrics, choiceResponse);
          if (hasValidModelChoices(choiceResponse)) {
            choices = choiceResponse.choices;
            choiceMeta = { ...choiceResponse.choiceMeta, source: "regenerated" };
          }
        } catch (choiceError) {
          if (choiceError.name === "AbortError") throw choiceError;
          choiceMeta = { source: "unavailable", fallback: false, reason: choiceError.message || choiceMeta.reason };
        }
      }

      const occultNarrative = progress.occultEntry && !response.narrative.includes(progress.occultEntry.title)
        ? `${response.narrative}\n\n【${progress.occultEntry.title}】${progress.occultEntry.text}`
        : response.narrative;
      const nextChoices = choices.length === 3
        ? injectOccultEntryChoice(choices, progress.occult.contact === 0 ? (progress.occultEntry || progress.occult.currentEntry) : null)
        : [];
      const memoryPlan = computeMemoryUpdate(execution.game, action, occultNarrative, resolution);
      const auditBaseline = createAuditBaseline(game, game.turn + 1);
      const automaticAudit = { ...auditTurnChanges(auditBaseline, resolvedGame), importantItemConfirmation: confirmationStatus };
      const next = {
        ...resolvedGame, ...memoryPlan.updates, choices: nextChoices, choiceMeta,
        worldEvents: [...game.worldEvents, ...(progress.occultEntry ? [{ id: makeId("event"), turn: game.turn + 1, text: `非凡入口出现：${progress.occultEntry.title}` }] : [])].slice(-40),
        changeLog: [...game.changeLog, ...execution.logs].slice(-100),
        lastTurnBaseline: auditBaseline,
        lastTurnAudit: automaticAudit,
        lastTurnMetrics: finishTurnMetrics(metrics),
      };
      resetStreamPreview(); commitGame(next);
      scheduleSummaryRewrite(memoryPlan, next.id, next.turn);
      return true;
    } catch (err) {
      setError(err.name === "AbortError"
        ? (timedOut ? "等待模型响应超过 150 秒，本轮已自动中止；游戏状态没有改变，可直接重试。" : "生成已由你中止；游戏状态没有改变。")
        : err.message || "未知错误，请重试本轮。");
      return false;
    } finally { clearTimeout(watchdogTimer); resetStreamPreview(); setItemConfirmation(null); itemConfirmationResolverRef.current = null; setTurnPhase("idle"); setLoading(false); busyRef.current = false; controllerRef.current = null; }
  };

  const regenerateChoices = async () => {
    if (!game || busyRef.current || settings.mockMode) return false;
    const narrative = [...game.recentDialogues].reverse().find((message) => message.role === "assistant")?.content || "";
    const action = [...game.recentDialogues].reverse().find((message) => message.role === "user")?.content || "继续当前场景";
    if (!narrative) { setError("当前没有可用于生成选项的剧情正文。"); return false; }
    busyRef.current = true; setLoading(true); setTurnPhase("choiceRetry"); setError("");
    const controller = new AbortController(); controllerRef.current = controller;
    try {
      const response = await requestChoicesFromAI(game, action, narrative, game.choiceMeta?.reason || "手动重新生成", controller.signal);
      if (!hasValidModelChoices(response)) throw new Error("AI 仍未返回三个有效选项，请稍后再试或直接自由输入行动。");
      commitGame({ ...game, choices: response.choices, choiceMeta: { ...response.choiceMeta, source: "regenerated" } });
      return true;
    } catch (choiceError) {
      setError(choiceError.name === "AbortError" ? "选项生成已中止。" : choiceError.message || "选项生成失败。");
      return false;
    } finally {
      setTurnPhase("idle"); setLoading(false); busyRef.current = false; controllerRef.current = null;
    }
  };

  const retryLastTurn = () => {
    const action = lastActionRef.current.trim();
    if (!action) { setError("没有可以重试的上一轮行动。请在输入框中描述新的行动。"); return Promise.resolve(false); }
    return runTurn(action, { manualRetry: true });
  };

  const runLocalTool = (name, args, reason) => {
    if (!game || loading) return;
    const auditBaseline = createAuditBaseline(game, game.turn);
    const execution = executeToolCalls({ ...game, turn: game.turn - 1 }, [{ id: makeId("local"), name, args, reason }]);
    const next = { ...execution.game, turn: game.turn, changeLog: [...game.changeLog, ...execution.logs].slice(-100) };
    commitGame({ ...next, lastTurnBaseline: auditBaseline, lastTurnAudit: { ...auditTurnChanges(auditBaseline, next), importantItemConfirmation: { required: false, status: "player-action", confirmed: 0, rejected: 0 } } });
  };
  const saveSlot = (slotId, label) => { if (game) saveGame(game, slotId, label); refreshSaves(); };
  const loadSlot = (slotId) => { const loaded = loadGame(slotId); if (loaded) { setGame(loaded); setScreen("game"); setModal(null); } };
  const removeSlot = (slotId) => { deleteSave(slotId); refreshSaves(); };

  return <>
    <a className="skip-link" href="#main">跳到主要内容</a>
    {screen === "welcome" && <Welcome hasSave={saves.some((slot) => slot.slotId === "autosave")} apiSettings={settings} onNew={() => setScreen("create")} onContinue={handleContinue} onImport={handleImport} onApi={() => setModal("api")} onChangelog={() => setModal("changelog")} />}
    {screen === "create" && <CharacterCreation onBack={() => setScreen("welcome")} onCreate={handleCreate} />}
    {screen === "game" && game && <GameScreen game={game} loading={loading} turnPhase={turnPhase} streamText={streamText} error={error} onAction={runTurn} onAbort={() => controllerRef.current?.abort()} onRetry={retryLastTurn} onRegenerateChoices={regenerateChoices} onLocalTool={runLocalTool} onOpenMap={() => setModal("map")} onOpenApi={() => setModal("api")} onOpenPrompt={() => setModal("prompt")} onOpenSaves={() => { refreshSaves(); setModal("saves"); }} onHome={() => setScreen("welcome")} />}
    {itemConfirmation && <ImportantItemConfirmation changes={itemConfirmation.changes} onConfirm={(approvedKeys) => settleImportantItemConfirmation({ approvedKeys })} onCancel={() => settleImportantItemConfirmation({ cancelled: true })} />}
    {modal === "map" && game && <WorldMap game={game} loading={loading} onClose={() => setModal(null)} onTravel={(location) => { setModal(null); return runTurn(`前往${location.name}`, { mapDestination: location }); }} onInvestigate={(location, knowledge) => { setModal(null); return runTurn(`根据地图上的传闻，调查${knowledge.note || location.district}。`, { mapInvestigation: { locationId: location.id, currentStatus: knowledge.status, rumor: knowledge.note || location.rumor } }); }} />}
    {modal === "api" && <ApiSettings settings={settings} onSave={handleSettingsSave} onCheckUpdate={() => setModal("update")} onClose={() => setModal(null)} />}
    {(modal === "update" || modal === "update-auto") && <UpdateDialog automatic={modal === "update-auto"} onClose={() => setModal(null)} />}
    {modal === "changelog" && <ChangelogDialog onClose={() => setModal(null)} />}
    {modal === "prompt" && <PromptEditor value={prompt} onSave={handlePromptSave} onClose={() => setModal(null)} />}
    {modal === "saves" && game && <SaveManager saves={saves} game={game} onSave={saveSlot} onLoad={loadSlot} onDelete={removeSlot} onExport={exportSave} onImport={handleImport} onClose={() => setModal(null)} />}
  </>;
}
