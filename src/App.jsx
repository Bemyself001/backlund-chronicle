import { useEffect, useRef, useState } from "react";
import Welcome from "./components/Welcome.jsx";
import Splash from "./components/Splash.jsx";
import CharacterCreation from "./components/CharacterCreation.jsx";
import GameScreen from "./components/GameScreen.jsx";
import ApiSettings from "./components/ApiSettings.jsx";
import PromptEditor from "./components/PromptEditor.jsx";
import SaveManager from "./components/SaveManager.jsx";
import UpdateDialog from "./components/UpdateDialog.jsx";
import ChangelogDialog from "./components/ChangelogDialog.jsx";
import WorldMap from "./components/WorldMap.jsx";
import Modal from "./components/Modal.jsx";
import SpecialActions from "./components/SpecialActions.jsx";
import { resolveSpecialAction } from "./services/specialActions.js";
import { medicineRecipe } from "./engine/recovery.js";
import { specialState } from "./engine/specialActions.js";
import ImportantItemConfirmation from "./components/ImportantItemConfirmation.jsx";
import { createInitialGame, DEFAULT_SYSTEM_PROMPT, migrateSystemPrompt } from "./system/game.js";
import { dedupeToolCalls, executeToolCalls, normalizeToolCalls } from "./engine/tools.js";
import { auditTurnChanges, collectImportantItemConfirmations, createAuditBaseline } from "./engine/audit.js";
import { resolveTurnProgress } from "./engine/turn.js";
import { timedAction } from "./engine/restTime.js";
import { processTriggers } from "./engine/triggerEngine.js";
import { loadApiSettings, requestAIWithReasoningFallback, saveApiSettings } from "./services/api.js";
import { buildFastNarrativeContinuationContext, buildFastPresentationContext, buildItemInspectionContext, buildPlanningContext, buildRenderingContext, buildSummaryContext, buildToolRepairContext, computeMemoryUpdate } from "./services/memory.js";
import { applyMemorySummary, createMemorySummaryJob, parseMemoryDigestPayload, mergeLatestMemory } from "./services/memoryState.js";
import { deleteSave, exportSave, importSave, listSaves, loadGame, saveGame } from "./services/storage.js";
import { extractNarrativePreview } from "./services/streamPreview.js";
import { ensureMapMoveToolCall, ensureMapDiscoveryToolCall } from "./services/mapTravel.js";
import { choiceResult, choiceValidationError, hasValidModelChoices, modelChoices, injectOccultEntryChoice } from "./services/choices.js";
import { applyChoiceRecovery, recoverChoices } from "./services/choiceRecovery.js";
import { createTurnResolution } from "./services/turnResolution.js";
import { pendingQuestNarration, markNarrativeEventsDelivered, eventDirections, appendFixedRenardTreatmentScene } from "./services/narrativeEvents.js";
import { makeId } from "./utils/id.js";
import { canHotUpdate, checkForUpdate, downloadAndApplyOta, isNativeAndroid } from "./services/updates.js";
import { finishTurnMetrics, markTurnMetric, recordModelRequest, startTurnMetrics } from "./services/turnMetrics.js";
import { recordUsageEvent, attachCreationUsage } from "./services/usageHistory.js";
import { isExplicitAdvancementIntent } from "./system/character.js";
import { exploreHex } from "./system/hexworld.js";
import { ensureRequestedAdvancementToolCall } from "./services/advancement.js";
import { finalizeFastPresentation, launchFastModeTasks, throwIfFastTaskAborted } from "./services/fastMode.js";
import { repairToolCallsConcurrently } from "./services/toolRepair.js";
import { prayerAvailability, settlePrayer } from "./engine/prayer.js";
import { generatePrayer } from "./services/prayer.js";
import { actionRequest, retryRequest } from "./services/actionRequest.js";
import { appendStoryMessages } from "./services/storyHistory.js";
import { IS_STARTUP_TEST, openStartupDiagnostics, startupStage } from "./services/startup.js";
import { loadOnboarding, saveOnboarding } from "./services/onboarding.js";
import { ensureTalismanToolCall, validateTalismanRequest } from "./services/talismans.js";
import { getChurchTalisman } from "./system/talismans.js";
import { activeEnemies } from "./system/combat.js";
import { requestedPersonVisit, visitPersonGate } from "./engine/visitablePeople.js";
import { validatePlayerActions, ensurePlayerActionTools } from "./services/playerActions.js";
import { inspectQuestTracking } from "./services/questTracking.js";
import { prepareContextIndex } from "./services/contextIndex.js";

export default function App() {
  const [screen, setScreen] = useState("splash");
  const [game, setGame] = useState(null);
  const [settings, setSettings] = useState(() => startupStage("读取 API 设置", loadApiSettings));
  const [prompt, setPrompt] = useState(() => startupStage("读取叙事设置", () => {
    const saved = localStorage.getItem("mist-system-prompt");
    if (!saved) return DEFAULT_SYSTEM_PROMPT;
    const migrated = migrateSystemPrompt(saved);
    if (migrated !== saved) localStorage.setItem("mist-system-prompt", migrated);
    return migrated;
  }));
  const [modal, setModal] = useState(null);
  const [mapFocus, setMapFocus] = useState(null);
  const openMap = (locationId = null) => { setMapFocus(typeof locationId === "string" ? locationId : null); setModal("map"); };
  const [saves, setSaves] = useState(() => startupStage("读取存档列表", listSaves));
  const [onboardingStep, setOnboardingStep] = useState(() => loadOnboarding(saves.length > 0));
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [turnPhase, setTurnPhase] = useState("idle");
  const [error, setError] = useState("");
  const [itemConfirmation, setItemConfirmation] = useState(null);
  const controllerRef = useRef(null);
  const itemConfirmationResolverRef = useRef(null);
  const busyRef = useRef(false);
  const lastActionRef = useRef(null);
  const prayerRetryRef = useRef(null);
  const streamTimerRef = useRef(null);
  const pendingStreamRef = useRef("");
  const summaryJobRef = useRef(null);
  const refreshSaves = () => setSaves(listSaves());

  useEffect(() => { saveOnboarding(onboardingStep); }, [onboardingStep]);
  useEffect(() => game ? prepareContextIndex(game) : undefined, [game]);

  useEffect(() => {
    if (IS_STARTUP_TEST || !isNativeAndroid()) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      checkForUpdate().then(async (result) => {
        if (!active || !result.hasUpdate) return;
        if (canHotUpdate(result)) {
          // 静默热更新：后台下载页面资源包，下次启动生效；失败则退回更新弹窗
          try {
            await downloadAndApplyOta(result, { reload: false });
            return;
          } catch { /* 退回完整安装包流程 */ }
        }
        setModal("update-auto");
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
    setGame(current => saveGame(mergeLatestMemory(next, current)));
    refreshSaves();
  };
  const resetAction = () => { lastActionRef.current = null; prayerRetryRef.current = null; setError(""); resetStreamPreview(); };
  const requireIdle = () => { if (busyRef.current) throw new Error("请先中止生成或等待本轮完成，再切换档案。"); };
  const handleCreate = (character, loadout) => { requireIdle(); const next = createInitialGame(character, loadout); attachCreationUsage(next.id); commitGame(next); resetAction(); setScreen("game"); };
  const handleContinue = () => loadSlot("autosave");
  const handleImport = async (file) => {
    requireIdle();
    busyRef.current = true; setLoading(true);
    try { const imported = await importSave(file); setGame(imported); resetAction(); refreshSaves(); setScreen("game"); }
    finally { busyRef.current = false; setLoading(false); }
  };
  const handleSettingsSave = (next) => { setSettings(saveApiSettings(next)); };
  const handlePromptSave = (next) => { localStorage.setItem("mist-system-prompt", next); setPrompt(next); };

  const requestImportantItemConfirmation = (changes, signal) => new Promise((resolve) => {
    if (signal.aborted) { resolve({ cancelled: true, aborted: true }); return; }
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

  const requestChoicesFromAI = (targetGame, action, narrative, initialResponse, signal, onRequestMetrics) => recoverChoices({
    game: targetGame, action, narrative, initialResponse, signal, prompt, settings,
    onRequestMetrics: event => { recordUsageEvent(targetGame.id, targetGame.turn, event); onRequestMetrics?.(event); },
  });

  const saveRecoveredChoices = (target, response, metrics) => {
    const entry = target.triggerState?.active?.filter((item) => item.status === "available").sort((left, right) => right.createdTurn - left.createdTurn)[0]?.presentation
      || (target.occult?.entryAvailable ? target.occult.currentEntry : null);
    const choices = injectOccultEntryChoice(response.choices, entry);
    setGame(current => {
      const next = applyChoiceRecovery(current, target, { ...response, choices });
      return next === current ? current : saveGame(metrics ? { ...next, lastTurnMetrics: finishTurnMetrics(metrics) } : next);
    });
  };

  // 每满十个未总结回合，后台整理一批；失败时原摘要和待总结事件保持不变。
  useEffect(() => {
    if (!game || summaryJobRef.current) return undefined;
    const job = createMemorySummaryJob(game);
    if (!job) return undefined;
    const jobKey = `${job.gameId}:${job.baseRevision}:${job.throughTurn}`;
    summaryJobRef.current = jobKey;
    const summaryController = new AbortController();
    (async () => {
      try {
        const response = await requestAIWithReasoningFallback(settings, buildSummaryContext(job), summaryController.signal, undefined, {
          phase: "memory", onRequestMetrics: event => recordUsageEvent(job.gameId, job.throughTurn, event),
          disableTools: true,
          forceDisableReasoning: true,
          skipReasoningRetry: true,
          streamOverride: false,
          maxTokensModeOverride: "manual",
          maxTokensOverride: 1600,
        });
        const digest = parseMemoryDigestPayload(response.protocolPayload, job);
        if (!digest) return;
        setGame((current) => {
          const next = applyMemorySummary(current, job, digest);
          if (next === current) return current;
          return saveGame(next);
        });
      } catch { /* 保留现有摘要与事件，等下次载入或回合完成后重试 */ }
      finally {
        if (summaryJobRef.current === jobKey) summaryJobRef.current = null;
      }
    })();
    return undefined;
  }, [game, settings]);

  const runTurn = async (action, options = {}) => {
    if (!game || busyRef.current || !action.trim()) return false;
    let questTrackingPlan = null;
    let playerRequests;
    try {
      if (options.questTrackingRequest) {
        questTrackingPlan = inspectQuestTracking(game, options.questTrackingRequest);
        if (!questTrackingPlan.ok) throw new Error(questTrackingPlan.reason);
        if (questTrackingPlan.kind === "special-action") { commitGame({ ...game, trackedQuestId: questTrackingPlan.entry.id }); setModal("special"); return false; }
        if (questTrackingPlan.kind === "choice") throw new Error(questTrackingPlan.reason || "请在任务簿选择具体行动。");
        action = questTrackingPlan.action;
      }
      playerRequests = validatePlayerActions(game, action, options);
    } catch (err) { setError(err.message); return false; }
    const requestedVisit = requestedPersonVisit(game, action);
    if (requestedVisit && !options.personConversation) {
      lastActionRef.current = actionRequest(action, options);
      prayerRetryRef.current = null;
      const result = handleSpecialAction({ operation: "visit-person", id: requestedVisit.id, revision: specialState(game).revision });
      if (!result.ok) setError(result.error);
      return result.ok;
    }
    prayerRetryRef.current = null;
    const selectedRisk = (Array.isArray(game.choices) ? game.choices : []).find((choice) => choice.label === action)?.risk;
    busyRef.current = true; lastActionRef.current = actionRequest(action, options); setLoading(true); setTurnPhase(options.manualRetry ? "manualRetry" : "generating"); setError(""); resetStreamPreview();
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
      if (controller.signal.aborted) return;
      armWatchdog();
      const hasPreview = queueStreamPreview(rawContent);
      if (hasPreview) markTurnMetric(metrics, "firstNarrativeAt");
    };
    try {
      const requestModel = async (requestMessages, requestOptions = {}, preview = false) => {
        const response = await requestAIWithReasoningFallback(settings, requestMessages, controller.signal, preview ? handleTurnPreview : undefined, {
        ...requestOptions,
        phase: requestOptions.phase || (requestOptions.toolSet === "choices" ? "narrative" : "planning"),
        onRequestMetrics: event => { recordModelRequest(metrics, event); recordUsageEvent(game.id, game.turn + 1, event); },
        onReasoningChunk: () => { armWatchdog(); setTurnPhase((current) => ["generating", "manualRetry", "finalizing"].includes(current) ? "thinking" : current); },
        onReasoningRecovery: () => { if (preview) resetStreamPreview(); setTurnPhase("budgetRecovery"); },
        onReasoningFallback: () => { if (preview) resetStreamPreview(); setTurnPhase("reasoningRetry"); },
        });
        return response;
      };

      const advancementIntent = isExplicitAdvancementIntent(action) && game.inventory.some((item) => item.potion);
      const talismanRequest = validateTalismanRequest(game, options.talismanRequest);
      if (options.personConversation) {
        const reason = visitPersonGate(game, options.personConversation, { conversation: true });
        if (reason) throw new Error(reason);
      }
      // All sleep, rest and waiting narration must use the settled clock.
      const fastMode = Boolean(settings.fastMode) && !questTrackingPlan && !playerRequests.abilityRequest && !playerRequests.combatRequest && !playerRequests.identificationRequest && !playerRequests.advancementRequest && !options.personConversation && !advancementIntent && !talismanRequest && !activeEnemies(game).length && !/符咒/.test(action) && timedAction(action, game.worldTime) === null;
      const planningOptions = { nativeTools: settings.nativeTools, mapInvestigation: options.mapInvestigation, talismanRequest, ...playerRequests, questTrackingPlan };
      let planningResponse;
      let fastPresentationTask = null;
      if (fastMode) {
        // 状态规划与剧情呈现同时启动；规划一完成即可继续校验、修复和结算，
        // 不必等待仍在流式输出的剧情草稿。
        const fastTasks = launchFastModeTasks({
          planning: () => requestModel(
            buildPlanningContext(game, action, prompt, planningOptions),
            { toolSet: "state", disableJsonMode: Boolean(settings.nativeTools) },
          ),
          presentation: () => requestModel(
            buildFastPresentationContext(game, action, prompt),
            { phase: "draft", disableTools: true, maxTokensModeOverride: "manual", maxTokensOverride: 5200, skipReasoningRetry: true },
            true,
          ),
        });
        fastPresentationTask = fastTasks.presentation;
        const planningOutcome = await fastTasks.planning;
        throwIfFastTaskAborted(planningOutcome);
        if (planningOutcome.error) {
          controller.abort();
          await fastPresentationTask;
          throw planningOutcome.error;
        }
        planningResponse = planningOutcome.value;
      }
      if (!fastMode) {
        planningResponse = await requestModel(
          buildPlanningContext(game, action, prompt, planningOptions),
          { toolSet: "state", disableJsonMode: Boolean(settings.nativeTools) },
        );
      }
      const discoveryAdjustedCalls = ensureMapDiscoveryToolCall(normalizeToolCalls(planningResponse.toolCalls, game), options.mapInvestigation, game.turn + 1, game);
      const advancementAdjustedCalls = ensureRequestedAdvancementToolCall(discoveryAdjustedCalls, playerRequests.advancementRequest, game.turn + 1, game);
      let proposedToolCalls = dedupeToolCalls(normalizeToolCalls(ensureMapMoveToolCall(advancementAdjustedCalls, options.mapDestination, game.turn + 1), game));
      const enforceRequests = calls => {
        if (questTrackingPlan && ["travel", "progress"].includes(questTrackingPlan.kind)) return [{ id: `track:${game.turn + 1}:${options.questTrackingRequest.id}`, name: "quest.track", args: { ...options.questTrackingRequest }, reason: action }];
        return ensurePlayerActionTools(ensureRequestedAdvancementToolCall(ensureTalismanToolCall(calls, talismanRequest, game), playerRequests.advancementRequest, game.turn + 1, game), { ...playerRequests, talismanRequest }, game, action);
      };
      proposedToolCalls = enforceRequests(proposedToolCalls);

      // 两种模式都并发修复最多三条独立参数错误；修复完成后仍按原顺序进入串行状态执行。
      const repairPlan = await repairToolCallsConcurrently(game, proposedToolCalls, async ({ call, error }) => {
        const repairMessages = buildToolRepairContext(game, action, call, error, prompt, { nativeTools: settings.nativeTools });
        const repairResponse = await requestModel(repairMessages, {
          phase: "repair",
          toolSet: "state",
          allowedToolNames: [call.name],
          disableJsonMode: Boolean(settings.nativeTools),
          forceDisableReasoning: true,
          maxTokensModeOverride: "manual",
          maxTokensOverride: 1600,
        });
        return repairResponse.toolCalls;
      }, {
        maxRepairs: 3,
        onRepairsStarted: () => setTurnPhase("toolRetry"),
      });
      proposedToolCalls = enforceRequests(repairPlan.calls);
      const advancementProposed = proposedToolCalls.some((call) => call.name === "advancement.promote");
      if (advancementProposed) resetStreamPreview();
      markTurnMetric(metrics, "planningCompletedAt");

      setTurnPhase("validating");
      let execution = executeToolCalls(game, proposedToolCalls, { playerAction: action, questTrackingRequest: options.questTrackingRequest });
      const rejected = execution.results.filter((result, index) => !result.ok && !(proposedToolCalls[index]?.name === "enemy.act" && /眩晕|已被击败/.test(result.reason)));
      if (questTrackingPlan) execution.game.trackedQuestId = questTrackingPlan.entry.id;
      if (talismanRequest) {
        const index = proposedToolCalls.findIndex(call => call.name === "item.use" && call.args.instanceId === talismanRequest.instanceId);
        if (!execution.results[index]?.ok) throw new Error(`${execution.results[index]?.reason || "符咒效果未能完成"}。符咒与回合均未消耗，可重试。`);
      }
      if (rejected.length) throw new Error(`本轮规则核验未完成：${rejected[0].reason}。游戏进度与物品未改变，可重试。`);
      let progress = resolveTurnProgress(execution.game, action, selectedRisk, proposedToolCalls, execution.results, { travelOnly: questTrackingPlan?.kind === "travel" });
      let resolvedGame = {
        ...execution.game,
        turn: game.turn + 1,
        worldTime: progress.worldTime,
        occult: progress.occult,
        triggerState: progress.triggerState,
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
        const advancementChange = importantChanges.find((change) => change.confirmationKind === "advancement");
        const blockedCallIndexes = importantChanges.filter((change) => !approvedKeys.has(change.key)).map((change) => change.callIndex);
        const rejectedChanges = importantChanges.filter(change => blockedCallIndexes.includes(change.callIndex)).length;
        confirmationStatus = {
          required: true,
          status: blockedCallIndexes.length ? (approvedKeys.size ? "partially-confirmed" : "rejected") : "confirmed",
          confirmed: importantChanges.length - rejectedChanges,
          rejected: rejectedChanges,
          advancement: advancementChange ? {
            status: blockedCallIndexes.includes(advancementChange.callIndex) ? "declined" : "confirmed",
            target: advancementChange.advancement.after,
          } : null,
        };
        if (blockedCallIndexes.length) {
          execution = executeToolCalls(game, proposedToolCalls, { blockedCallIndexes, playerAction: action, questTrackingRequest: options.questTrackingRequest });
          progress = resolveTurnProgress(execution.game, action, selectedRisk, proposedToolCalls, execution.results, { travelOnly: questTrackingPlan?.kind === "travel" });
          resolvedGame = {
            ...execution.game,
            turn: game.turn + 1,
            worldTime: progress.worldTime,
            occult: progress.occult,
            triggerState: progress.triggerState,
            hiddenDanger: progress.hiddenDanger,
          };
        }
      }
      const resolution = createTurnResolution(proposedToolCalls, execution.results, progress, resolvedGame);

      let fastPresentationResponse = null;
      if (fastPresentationTask) {
        const presentationOutcome = await fastPresentationTask;
        throwIfFastTaskAborted(presentationOutcome);
        fastPresentationResponse = presentationOutcome.value;
        if (!fastPresentationResponse?.hasNarrative) resetStreamPreview();
      }

      let response = fastPresentationResponse || planningResponse;
      let needsFullRendering = !fastMode || !fastPresentationResponse?.hasNarrative || advancementProposed;

      if (fastMode && fastPresentationResponse?.hasNarrative && !advancementProposed) {
        setTurnPhase("finalizing");
        const finalTasks = launchFastModeTasks({
          continuation: () => finalizeFastPresentation(
            fastPresentationResponse, resolution,
            (draft, settled) => requestModel(
              buildFastNarrativeContinuationContext(game, resolvedGame, action, draft, prompt, settled, { nativeTools: settings.nativeTools }),
              { phase: "narrative", toolSet: "choices", disableJsonMode: Boolean(settings.nativeTools), forceDisableReasoning: true, maxTokensModeOverride: "manual", maxTokensOverride: 5200 },
            ),
          ),
        });
        const continuationOutcome = await finalTasks.continuation;
        throwIfFastTaskAborted(continuationOutcome);

        if (continuationOutcome.value?.hasNarrative) {
          response = continuationOutcome.value;
        } else {
          needsFullRendering = true;
        }
      }

      if (needsFullRendering) {
        resetStreamPreview();
        setTurnPhase("finalizing");
        const renderMessages = buildRenderingContext(game, resolvedGame, action, prompt, resolution, { nativeTools: settings.nativeTools });
        response = await requestModel(renderMessages, { toolSet: "choices", disableJsonMode: Boolean(settings.nativeTools) }, true);
        if (!response.hasNarrative) {
          const originalChoices = { choices: response.choices, choiceMeta: response.choiceMeta };
          resetStreamPreview();
          setTurnPhase("reasoningRetry");
          const narrativeOnlyMessages = [...renderMessages, { role: "system", content: "上一次响应没有最终剧情。现在只在 assistant.content 中返回纯文本剧情，不要调用任何工具，不要输出 JSON。" }];
          const narrativeResponse = await requestModel(narrativeOnlyMessages, { phase: "narrative", disableTools: true, disableJsonMode: true, forceDisableReasoning: true }, true);
          response = { ...narrativeResponse, ...originalChoices };
        }
        if (!response.hasNarrative) throw new Error("模型没有返回最终剧情正文，请重试本轮。");
      }

      response = { ...response, narrative: appendFixedRenardTreatmentScene(response.narrative, progress) };
      const { choices, choiceMeta } = choiceResult(modelChoices(response), choiceValidationError(response));

      const appearedTrigger = progress.newTrigger ? { id: progress.newTrigger.instanceId, ...progress.newTrigger.presentation } : null;
      const generatedTriggerNarrative = resolution.derivedEffects.narrativeEvents.some(event => event.triggerDefinitionId === progress.newTrigger?.definitionId);
      const occultNarrative = appearedTrigger && !generatedTriggerNarrative && !response.narrative.includes(appearedTrigger.title)
        ? `${response.narrative}\n\n【${appearedTrigger.title}】${appearedTrigger.text}`
        : response.narrative;
      const availableTrigger = progress.newTrigger?.presentation
        || progress.triggerState?.active?.filter((item) => item.status === "available").sort((left, right) => right.createdTurn - left.createdTurn)[0]?.presentation
        || (progress.occult?.entryAvailable ? progress.occult.currentEntry : null);
      const nextChoices = choices.length === 3
        ? injectOccultEntryChoice(choices, availableTrigger)
        : choices;
      const memoryPlan = computeMemoryUpdate(execution.game, action, occultNarrative, resolution, { settledGame: resolvedGame });
      const auditBaseline = createAuditBaseline(game, game.turn + 1);
      const automaticAudit = { ...auditTurnChanges(auditBaseline, resolvedGame), importantItemConfirmation: confirmationStatus };
      const next = markNarrativeEventsDelivered({
        ...resolvedGame, ...memoryPlan.updates, choices: nextChoices, choiceMeta,
        worldEvents: [...game.worldEvents, ...(appearedTrigger ? [{ id: makeId("event"), turn: game.turn + 1, text: `特殊事件出现：${appearedTrigger.title}` }] : [])].slice(-40),
        changeLog: [...game.changeLog, ...execution.logs, ...(progress.statusTickLogs || [])].slice(-100),
        lastTurnBaseline: auditBaseline,
        lastTurnAudit: automaticAudit,
        lastTurnMetrics: finishTurnMetrics(metrics),
      }, resolution.derivedEffects.narrativeEvents);
      if (controller.signal.aborted) throw new DOMException("请求已中止", "AbortError");
      resetStreamPreview(); commitGame(next);
      // Narrative and settlement are durable before any optional suggestion request.
      clearTimeout(watchdogTimer);
      if (!hasValidModelChoices(next)) {
        setTurnPhase("choiceRetry");
        try {
          const recovered = await requestChoicesFromAI(next, action, occultNarrative, next, controller.signal,
            choiceResponse => recordModelRequest(metrics, choiceResponse));
          saveRecoveredChoices(next, recovered, metrics);
        } catch {
          saveRecoveredChoices(next, choiceResult(next.choices, "request_failed"), metrics);
        }
      }
      return true;
    } catch (err) {
      setError(err.name === "AbortError"
        ? (timedOut ? "等待模型响应超过 150 秒，本轮已自动中止；游戏状态没有改变，可直接重试。" : "生成已由你中止；游戏状态没有改变。")
        : err.message || "未知错误，请重试本轮。");
      return false;
    } finally { clearTimeout(watchdogTimer); controller.abort(); resetStreamPreview(); setItemConfirmation(null); itemConfirmationResolverRef.current = null; setTurnPhase("idle"); setLoading(false); busyRef.current = false; controllerRef.current = null; }
  };

  const handlePray = async (locationId) => {
    if (!game || busyRef.current) return false;
    const available = prayerAvailability(game, locationId);
    if (!available.ok) { setError(available.reason); return false; }
    busyRef.current = true;
    prayerRetryRef.current = locationId;
    setLoading(true); setTurnPhase("generating"); setError(""); setModal(null); resetStreamPreview();
    const controller = new AbortController(); controllerRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const text = await generatePrayer(available.church, settings, controller.signal, event => recordUsageEvent(game.id, game.turn, event));
      if (controller.signal.aborted) throw new DOMException("祷告已取消", "AbortError");
      const { next, action, progress, recovered, sanityRecovered } = settlePrayer(game, locationId);
      let narrative = `${text}\n\n${available.church.environment}`;
      if (progress.newTrigger?.presentation) {
        narrative += `\n\n【${progress.newTrigger.presentation.title}】${progress.newTrigger.presentation.text}`;
      }
      const resolution = createTurnResolution([], [], progress, next);
      const hints = eventDirections(resolution.derivedEffects.narrativeEvents);
      if (hints) narrative += `\n\n${hints}`;
      const memory = computeMemoryUpdate(game, action, narrative, resolution, { settledGame: next });
      const baseline = createAuditBaseline(game, next.turn);
      const trigger = progress.newTrigger?.presentation || next.triggerState?.active?.find((entry) => entry.status === "available")?.presentation;
      commitGame(markNarrativeEventsDelivered({ ...next, ...memory.updates,
        choices: injectOccultEntryChoice(game.choices, trigger),
        changeLog: [...game.changeLog, ...progress.statusTickLogs, { id: makeId("log"), turn: next.turn, text: `向${available.church.deity}祷告：理智恢复 ${sanityRecovered} 点，灵性恢复 ${recovered} 点。`, tone: "success" }].slice(-100),
        lastTurnBaseline: baseline, lastTurnAudit: auditTurnChanges(baseline, next), lastTurnMetrics: null,
      }, resolution.derivedEffects.narrativeEvents));
      prayerRetryRef.current = null;
      return true;
    } catch (err) {
      setError(err.name === "AbortError" ? "祷告生成已取消或超时，未消耗回合和冷却，可重试。" : `祷告未完成：${err.message} 未消耗回合和冷却。`);
      return false;
    } finally {
      clearTimeout(timer); controllerRef.current = null; busyRef.current = false; setLoading(false); setTurnPhase("idle");
    }
  };

  const regenerateChoices = async () => {
    if (!game || busyRef.current) return false;
    const narrative = [...game.recentDialogues].reverse().find((message) => message.role === "assistant")?.content || "";
    const action = [...game.recentDialogues].reverse().find((message) => message.role === "user")?.content || "继续当前场景";
    if (!narrative) return false;
    busyRef.current = true; setLoading(true); setTurnPhase("choiceRetry"); setError("");
    const controller = new AbortController(); controllerRef.current = controller;
    try {
      const response = await requestChoicesFromAI(game, action, narrative, game, controller.signal);
      saveRecoveredChoices(game, response);
      return hasValidModelChoices(response);
    } catch {
      saveRecoveredChoices(game, choiceResult(modelChoices(game), "request_failed"));
      return false;
    } finally {
      setTurnPhase("idle"); setLoading(false); busyRef.current = false; controllerRef.current = null;
    }
  };

  const retryLastTurn = () => {
    if (prayerRetryRef.current) return handlePray(prayerRetryRef.current);
    const request = retryRequest(lastActionRef.current);
    if (!request?.action.trim()) { setError("没有可以重试的上一轮行动。请在输入框中描述新的行动。"); return Promise.resolve(false); }
    return runTurn(request.action, request.options);
  };

  const runLocalTool = async (name, args, reason, showStory) => {
    if (!game || busyRef.current) return;
    if (name === "item.use" && game.inventory.find(item => item.instanceId === args.instanceId)?.potion) {
      showStory?.();
      const bottle = game.inventory.find(item => item.instanceId === args.instanceId);
      return runTurn(`服用${bottle.name}魔药并尝试逐级晋升`, { advancementRequest: { potionInstanceId: args.instanceId } });
    }
    if (name === "item.use" && getChurchTalisman(game.inventory.find(item => item.instanceId === args.instanceId))) {
      showStory?.();
      return runTurn(reason, { talismanRequest: args });
    }
    if (name === "item.use" && medicineRecipe(game.inventory.find(item => item.instanceId === args.instanceId))) {
      const result = handleSpecialAction({ operation: "use", id: args.instanceId, revision: specialState(game).revision });
      if (!result.ok) setError(result.error);
      return;
    }
    const auditBaseline = createAuditBaseline(game, game.turn);
    const call = { id: makeId("local"), name, args, reason };
    const execution = executeToolCalls({ ...game, turn: game.turn - 1 }, [call]);
    const triggerProgress = processTriggers(execution.game, { action: reason, toolCalls: [call], toolResults: execution.results, turn: game.turn });
    const triggerLogs = triggerProgress.events.available.map((entry) => ({ id: makeId("log"), turn: game.turn, text: `发现可选事件「${entry.presentation?.title || "特殊事件"}」。`, tone: "neutral" }));
    const next = { ...execution.game, turn: game.turn, triggerState: triggerProgress.state, occult: execution.game.occult, changeLog: [...game.changeLog, ...execution.logs, ...triggerLogs].slice(-100) };
    const settled = { ...next, lastTurnBaseline: auditBaseline, lastTurnAudit: { ...auditTurnChanges(auditBaseline, next), importantItemConfirmation: { required: false, status: "player-action", confirmed: 0, rejected: 0 } } };
    commitGame(settled);
    const inspection = name === "item.inspect" && execution.results[0]?.ok ? execution.results[0].data?.itemInspection : null;
    if (!inspection) return;
    showStory?.();
    const resolution = createTurnResolution([call], execution.results, { triggerSignals: triggerProgress.signals });
    resolution.derivedEffects.worldTime = next.worldTime;
    if (!inspection.narrative) {
      const memory = computeMemoryUpdate({ ...settled, turn: settled.turn - 1 }, reason, inspection.observation, resolution, { settledGame: settled });
      commitGame({ ...settled, ...memory.updates });
      return;
    }
    const events = pendingQuestNarration(next);
    busyRef.current = true; setLoading(true); setTurnPhase("finalizing"); setError(""); resetStreamPreview();
    const controller = new AbortController(); controllerRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 150000);
    try {
      resolution.derivedEffects.narrativeEvents = events;
      const response = await requestAIWithReasoningFallback(settings, buildItemInspectionContext(game, next, reason, prompt, resolution, inspection), controller.signal, queueStreamPreview, { phase: "inspection", onRequestMetrics: event => recordUsageEvent(game.id, game.turn, event), disableTools: true, disableJsonMode: true });
      if (controller.signal.aborted) throw new DOMException("已取消", "AbortError");
      if (!response.hasNarrative) throw new Error("模型没有返回剧情正文");
      const memory = computeMemoryUpdate({ ...settled, turn: settled.turn - 1 }, reason, response.narrative, resolution, { settledGame: settled });
      commitGame({ ...markNarrativeEventsDelivered(settled, events), ...memory.updates });
    } catch (err) {
      const fallback = computeMemoryUpdate({ ...settled, turn: settled.turn - 1 }, reason, inspection.observation, resolution, { settledGame: settled });
      commitGame({ ...settled, ...fallback.updates });
      setError(`检查已保存，但百字剧情生成未完成：${err.message}。已显示本地检查结果，再次检查即可重试。`);
    } finally {
      clearTimeout(timer); controllerRef.current = null; busyRef.current = false; setLoading(false); setTurnPhase("idle"); resetStreamPreview();
    }
  };
  const handleSpecialAction = (request) => {
    if (!game || busyRef.current) return { ok: false, error: "本轮正在处理中" };
    busyRef.current = true;
    try {
      const next = resolveSpecialAction(game, request);
      commitGame(next);
      setError("");
      return { ok: true, message: `已保存至第 ${next.turn} 轮，结果可在剧情和回合摘要查看。` };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally { busyRef.current = false; }
  };
  const handleExplore = (cell) => {
    if (!game || busyRef.current) return;
    const next = structuredClone(game);
    const result = exploreHex(next, cell.q, cell.r);
    if (!result.ok) return;
    const message = { id: makeId("msg"), role: "assistant", turn: game.turn, content: result.narrative, source: "fixed" };
    Object.assign(next, appendStoryMessages(next, [message]));
    next.changeLog = [...next.changeLog, `探索了${next.location.name}，耗时约 ${result.minutes} 分钟`].slice(-100);
    commitGame(next);
    setModal(null);
  };
  const saveSlot = (slotId, label, number) => { if (game) saveGame(game, slotId, label, number); refreshSaves(); };
  const loadSlot = (slotId) => { requireIdle(); const loaded = loadGame(slotId); if (loaded) { setGame(loaded); resetAction(); setScreen("game"); setModal(null); } };
  const removeSlot = (slotId) => { deleteSave(slotId); refreshSaves(); };

  return <>
    <a className="skip-link" href="#main">跳到主要内容</a>
    {screen === "splash" && <Splash onEnter={() => setScreen("welcome")} />}
    {screen === "welcome" && <Welcome loading={loading} hasSave={saves.some((slot) => slot.slotId === "autosave")} saves={saves} apiSettings={settings} onNew={() => { if (!busyRef.current) setScreen("create"); }} onContinue={handleContinue} onLoadSlot={loadSlot} onImport={handleImport} onApi={() => setModal("api")} onUpdate={() => setModal("update")} onChangelog={() => setModal("changelog")} onDiagnostics={openStartupDiagnostics} onboardingStep={!modal && onboardingStep !== "complete" ? onboardingStep : null} onOnboardingStep={setOnboardingStep} />}
    {screen === "create" && <CharacterCreation onBack={() => setScreen("welcome")} onCreate={handleCreate} settings={settings} onApi={() => setModal("api")} />}
    {screen === "game" && game && <GameScreen game={game} loading={loading} turnPhase={turnPhase} streamText={streamText} error={error} onAction={runTurn} onAbort={() => controllerRef.current?.abort()} onRetry={retryLastTurn} onRegenerateChoices={regenerateChoices} onLocalTool={runLocalTool} onOpenMap={openMap} onSpecialAction={handleSpecialAction} onOpenApi={() => setModal("api")} onOpenPrompt={() => setModal("prompt")} onOpenSaves={() => { refreshSaves(); setModal("saves"); }} onHome={() => { if (!busyRef.current) { resetAction(); setScreen("welcome"); } }} />}
    {itemConfirmation && <ImportantItemConfirmation changes={itemConfirmation.changes} onConfirm={(approvedKeys) => settleImportantItemConfirmation({ approvedKeys })} onCancel={() => settleImportantItemConfirmation({ cancelled: true })} />}
    {modal === "map" && game && <WorldMap game={game} loading={loading} initialLocationId={mapFocus} onSpecial={() => setModal("special")} onClose={() => setModal(null)} onTravel={(location) => { setModal(null); return runTurn(`前往${location.name}`, { mapDestination: location }); }} onInvestigate={(location, knowledge) => { setModal(null); return runTurn(`根据地图上的传闻，调查${knowledge.note || location.district}。`, { mapInvestigation: { locationId: location.id, currentStatus: knowledge.status, rumor: knowledge.note || location.rumor } }); }} onExplore={handleExplore} onPray={handlePray} />}
    {modal === "special" && game && <Modal title="特殊行动" onClose={() => setModal(null)}><SpecialActions game={game} loading={loading} onExecute={handleSpecialAction} onOpenMap={openMap} onAction={(action, options) => { setModal(null); return runTurn(action, options); }} /></Modal>}
    {modal === "api" && <ApiSettings settings={settings} onSave={handleSettingsSave} onClose={() => setModal(null)} onSetupComplete={screen === "welcome" && onboardingStep === "setup" ? () => { setOnboardingStep("import"); setScreen("welcome"); setModal(null); } : undefined} />}
    {(modal === "update" || modal === "update-auto") && <UpdateDialog automatic={modal === "update-auto"} onClose={() => setModal(null)} />}
    {modal === "changelog" && <ChangelogDialog onClose={() => setModal(null)} />}
    {modal === "prompt" && <PromptEditor value={prompt} onSave={handlePromptSave} onClose={() => setModal(null)} />}
    {modal === "saves" && game && <SaveManager loading={loading} saves={saves} game={game} onSave={saveSlot} onLoad={loadSlot} onDelete={removeSlot} onExport={exportSave} onImport={handleImport} onClose={() => setModal(null)} />}
  </>;
}
