import { useEffect, useRef, useState } from "react";
import Welcome from "./components/Welcome.jsx";
import CharacterCreation from "./components/CharacterCreation.jsx";
import GameScreen from "./components/GameScreen.jsx";
import ApiSettings from "./components/ApiSettings.jsx";
import PromptEditor from "./components/PromptEditor.jsx";
import SaveManager from "./components/SaveManager.jsx";
import UpdateDialog from "./components/UpdateDialog.jsx";
import WorldMap from "./components/WorldMap.jsx";
import { createInitialGame, DEFAULT_SYSTEM_PROMPT, migrateSystemPrompt } from "./data/defaults.js";
import { buildRejectedToolNarrative, dedupeToolCalls, executeToolCalls, isRepairableToolError, normalizeToolCalls, validateToolCall } from "./engine/tools.js";
import { auditTurnChanges, createAuditBaseline } from "./engine/audit.js";
import { resolveTurnProgress } from "./engine/turn.js";
import { loadApiSettings, requestAIWithReasoningFallback, saveApiSettings } from "./services/api.js";
import { buildChoiceRegenerationContext, buildPlanningContext, buildRenderingContext, buildToolRepairContext, updateMemory } from "./services/memory.js";
import { mockResponse } from "./services/mock.js";
import { deleteSave, exportSave, importSave, listSaves, loadGame, saveGame } from "./services/storage.js";
import { extractNarrativePreview } from "./services/streamPreview.js";
import { ensureMapMoveToolCall } from "./services/mapTravel.js";
import { hasUsableChoices, injectOccultEntryChoice } from "./services/choices.js";
import { createTurnResolution } from "./services/turnResolution.js";
import { makeId } from "./utils/id.js";
import { checkForUpdate, isNativeAndroid } from "./services/updates.js";

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
  const controllerRef = useRef(null);
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
    if (streamTimerRef.current) return;
    streamTimerRef.current = setTimeout(() => {
      setStreamText(pendingStreamRef.current);
      streamTimerRef.current = null;
    }, 40);
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

  const runTurn = async (action, options = {}) => {
    if (!game || busyRef.current || !action.trim()) return false;
    const selectedRisk = (Array.isArray(game.choices) ? game.choices : []).find((choice) => choice.label === action)?.risk;
    busyRef.current = true; lastActionRef.current = action; setLoading(true); setTurnPhase(options.manualRetry ? "manualRetry" : "generating"); setError(""); resetStreamPreview();
    const controller = new AbortController(); controllerRef.current = controller;
    try {
      const requestModel = (requestMessages, requestOptions = {}, preview = false) => requestAIWithReasoningFallback(settings, requestMessages, controller.signal, preview ? queueStreamPreview : undefined, {
        ...requestOptions,
        onReasoningChunk: () => setTurnPhase((current) => ["generating", "manualRetry", "finalizing"].includes(current) ? "thinking" : current),
        onReasoningRecovery: () => { if (preview) resetStreamPreview(); setTurnPhase("budgetRecovery"); },
        onReasoningFallback: () => { if (preview) resetStreamPreview(); setTurnPhase("reasoningRetry"); },
      });

      const planningMessages = settings.mockMode ? [] : buildPlanningContext(game, action, prompt, { nativeTools: settings.nativeTools });
      const planningResponse = settings.mockMode
        ? await mockResponse(game, action, controller.signal, queueStreamPreview)
        : await requestModel(planningMessages, { toolSet: "state", disableJsonMode: Boolean(settings.nativeTools) });
      let proposedToolCalls = dedupeToolCalls(normalizeToolCalls(ensureMapMoveToolCall(planningResponse.toolCalls, options.mapDestination, game.turn + 1), game));

      if (!settings.mockMode) {
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

      setTurnPhase("validating");
      const execution = executeToolCalls(game, proposedToolCalls);
      const progress = resolveTurnProgress(execution.game, action, selectedRisk, proposedToolCalls, execution.results);
      const resolvedGame = {
        ...execution.game,
        turn: game.turn + 1,
        worldTime: progress.worldTime,
        occult: progress.occult,
        hiddenDanger: progress.hiddenDanger,
      };
      const resolution = createTurnResolution(proposedToolCalls, execution.results, progress);

      let response = planningResponse;
      if (!settings.mockMode) {
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
      } else if (execution.results.some((result) => !result.ok)) {
        const rejectionNarrative = buildRejectedToolNarrative(action, execution.results);
        response = { ...response, narrative: execution.results.some((result) => result.ok) ? `${response.narrative}\n\n${rejectionNarrative}` : rejectionNarrative, hasNarrative: true };
      }

      let choices = hasValidModelChoices(response) ? response.choices : [];
      let choiceMeta = hasValidModelChoices(response) ? response.choiceMeta : { source: "unavailable", fallback: false, reason: choiceValidationError(response) };
      if (!settings.mockMode && !choices.length) {
        setTurnPhase("choiceRetry");
        try {
          const choiceResponse = await requestChoicesFromAI(resolvedGame, action, response.narrative, choiceMeta.reason, controller.signal);
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
      const nextMemory = updateMemory(execution.game, action, occultNarrative, resolution);
      const next = {
        ...resolvedGame, ...nextMemory, choices: nextChoices, choiceMeta,
        worldEvents: [...game.worldEvents, ...(progress.occultEntry ? [{ id: makeId("event"), turn: game.turn + 1, text: `非凡入口出现：${progress.occultEntry.title}` }] : [])].slice(-40),
        changeLog: [...game.changeLog, ...execution.logs].slice(-100),
        lastTurnBaseline: createAuditBaseline(game, game.turn + 1),
        lastTurnAudit: null,
      };
      resetStreamPreview(); commitGame(next);
      return true;
    } catch (err) {
      setError(err.name === "AbortError" ? "生成已由你中止；游戏状态没有改变。" : err.message || "未知错误，请重试本轮。");
      return false;
    } finally { resetStreamPreview(); setTurnPhase("idle"); setLoading(false); busyRef.current = false; controllerRef.current = null; }
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
    const execution = executeToolCalls({ ...game, turn: game.turn - 1 }, [{ id: makeId("local"), name, args, reason }]);
    commitGame({ ...execution.game, turn: game.turn, changeLog: [...game.changeLog, ...execution.logs].slice(-100), lastTurnBaseline: createAuditBaseline(game, game.turn), lastTurnAudit: null });
  };
  const auditCurrentTurn = () => {
    if (!game?.lastTurnBaseline || loading) return;
    const audit = auditTurnChanges(game.lastTurnBaseline, game);
    commitGame({ ...game, lastTurnAudit: audit });
  };
  const saveSlot = (slotId, label) => { if (game) saveGame(game, slotId, label); refreshSaves(); };
  const loadSlot = (slotId) => { const loaded = loadGame(slotId); if (loaded) { setGame(loaded); setScreen("game"); setModal(null); } };
  const removeSlot = (slotId) => { deleteSave(slotId); refreshSaves(); };

  return <>
    <a className="skip-link" href="#main">跳到主要内容</a>
    {screen === "welcome" && <Welcome hasSave={saves.some((slot) => slot.slotId === "autosave")} apiSettings={settings} onNew={() => setScreen("create")} onContinue={handleContinue} onImport={handleImport} onApi={() => setModal("api")} />}
    {screen === "create" && <CharacterCreation onBack={() => setScreen("welcome")} onCreate={handleCreate} />}
    {screen === "game" && game && <GameScreen game={game} loading={loading} turnPhase={turnPhase} streamText={streamText} error={error} onAction={runTurn} onAbort={() => controllerRef.current?.abort()} onRetry={retryLastTurn} onRegenerateChoices={regenerateChoices} onLocalTool={runLocalTool} onAudit={auditCurrentTurn} onOpenMap={() => setModal("map")} onOpenApi={() => setModal("api")} onOpenPrompt={() => setModal("prompt")} onOpenSaves={() => { refreshSaves(); setModal("saves"); }} onHome={() => setScreen("welcome")} />}
    {modal === "map" && game && <WorldMap game={game} loading={loading} onClose={() => setModal(null)} onTravel={(location) => runTurn(`前往${location.name}`, { mapDestination: location })} />}
    {modal === "api" && <ApiSettings settings={settings} onSave={handleSettingsSave} onCheckUpdate={() => setModal("update")} onClose={() => setModal(null)} />}
    {(modal === "update" || modal === "update-auto") && <UpdateDialog automatic={modal === "update-auto"} onClose={() => setModal(null)} />}
    {modal === "prompt" && <PromptEditor value={prompt} onSave={handlePromptSave} onClose={() => setModal(null)} />}
    {modal === "saves" && game && <SaveManager saves={saves} game={game} onSave={saveSlot} onLoad={loadSlot} onDelete={removeSlot} onExport={exportSave} onImport={handleImport} onClose={() => setModal(null)} />}
  </>;
}
