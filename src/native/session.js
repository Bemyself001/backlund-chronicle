import { createInitialGame, EMPTY_CHARACTER, DEFAULT_API_SETTINGS, DEFAULT_SYSTEM_PROMPT, SAVE_VERSION } from "../system/game.js";
import { PATHWAYS, OPENINGS, TALENTS, VISITABLE_PEOPLE, SPECIAL_RECIPES, ORGANIZATIONS } from "../content/index.js";
import { cleanGame, migrateSave, validatePlayableSave } from "../services/saveCodec.js";
import { buildAIRequestBody, normalizeChatCompletion } from "../services/api.js";
import { buildPlanningContext, buildRenderingContext, buildToolRepairContext, buildChoiceRegenerationContext, computeMemoryUpdate, visibleGameState } from "../services/memory.js";
import { normalizeToolCalls, dedupeToolCalls, executeToolCalls, validateToolCall, isRepairableToolError } from "../engine/tools.js";
import { resolveTurnProgress } from "../engine/turn.js";
import { createTurnResolution } from "../services/turnResolution.js";
import { ensureMapMoveToolCall, inferMapDestination, ensureMapDiscoveryToolCall } from "../services/mapTravel.js";
import { validatePlayerActions, ensurePlayerActionTools } from "../services/playerActions.js";
import { ensureRequestedAdvancementToolCall } from "../services/advancement.js";
import { validateTalismanRequest, ensureTalismanToolCall } from "../services/talismans.js";
import { inferCommissionInquiry, ensureCommissionOfferTool, inferCommissionTrackingRequest, restoreCommissionRecord, appendCommissionReport } from "../services/commissions.js";
import { inspectQuestTracking } from "../services/questTracking.js";
import { projectQuestJournal, questAssistance } from "../engine/questRuntime.js";
import { collectImportantItemConfirmations, createAuditBaseline, auditTurnChanges } from "../engine/audit.js";
import { choiceResult, modelChoices, choiceValidationError, injectOccultEntryChoice } from "../services/choices.js";
import { appendFixedRenardTreatmentScene, markNarrativeEventsDelivered } from "../services/narrativeEvents.js";
import { resolveSpecialAction } from "../services/specialActions.js";
import { specialState, availableSpecialActions, commissionOffer, actionGate, registrationGate } from "../engine/specialActions.js";
import { visitPersonGate, requestedPersonVisit } from "../engine/visitablePeople.js";
import { medicinePurchaseGate } from "../engine/medicineAccess.js";
import { medicineRecipe } from "../engine/recovery.js";
import { getChurchTalisman } from "../system/talismans.js";
import { processTriggers } from "../engine/triggerEngine.js";
import { getMapLocations, normalizeLocationKnowledge, hexForLocation, estimateTravelByHex } from "../system/map.js";
import { visibleHexes, exploreHex, canExploreHex } from "../system/hexworld.js";
import { appendStoryMessages } from "../services/storyHistory.js";
import { moneyToPence, formatMoney } from "../system/money.js";
import { getAdvancement } from "../system/character.js";
import { makeId } from "../utils/id.js";

// A session is local to one QuickJS instance. No browser globals, UI, or credentials.
// Pending settlement is disposable until both narrative and player confirmations exist.
export function createNativeSession() {
  let game = null;
  let pending = null;
  const requireGame = () => { if (!game) throw new Error("请先创建角色或载入存档。"); };
  const requireIdle = () => { if (pending) throw new Error("本轮正在处理中，请先取消或完成。"); };
  const request = (messages, options = {}) => ({ request: buildAIRequestBody(pending.settings, messages, { disableJsonMode: pending.settings.nativeTools, ...options }) });
  const enforce = calls => {
    const { options, action, playerRequests, tracking, inquiry, talisman } = pending;
    if (tracking && ["travel", "progress", "commission"].includes(tracking.kind)) return [{ id: `track:${game.turn + 1}:${tracking.entry.id}`, name: "quest.track", args: options.questTrackingRequest, reason: action }];
    if (inquiry) return ensureCommissionOfferTool(calls, inquiry, game);
    return ensureMapMoveToolCall(ensurePlayerActionTools(ensureRequestedAdvancementToolCall(ensureTalismanToolCall(calls, talisman, game), playerRequests.advancementRequest, game.turn + 1, game), { ...playerRequests, talismanRequest: talisman }, game, action), options.mapDestination, game.turn + 1, game);
  };

  function view() {
    if (!game) return null;
    const journal = projectQuestJournal(structuredClone(game));
    for (const entries of Object.values(journal)) if (Array.isArray(entries)) for (const entry of entries) entry.assistance = questAssistance(game, entry);
    const knowledge = normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, game.location.id, game);
    const state = specialState(game);
    const action = (label, operation, id, gate = "", extra = {}) => ({ label, disabledReason: gate, request: { operation, id, revision: state.revision, ...extra } });
    const money = moneyToPence(game.money);
    const work = availableSpecialActions(game).map(definition => {
      const offer = commissionOffer(game, definition);
      const gate = actionGate(game, definition) || (state.active ? "已有进行中的委托" : state.availableTurn > game.turn ? `还需${state.availableTurn - game.turn}回合` : money < (definition.stake || 0) ? "赌注不足" : "");
      return { title: offer.title, description: offer.scene, actions: [action("接取委托 · 1回合", "accept", definition.id, gate)] };
    });
    if (state.active) work.unshift({ title: state.active.offer.title, description: state.active.offer.scene, actions: [
      ...state.active.offer.options.map(option => action(`${option.label} · 基础报酬${option.reward}便士`, "resolve", state.active.id, "", { optionId: option.id })), action("放弃委托 · 1回合", "abandon", state.active.id),
    ] });
    const recipes = SPECIAL_RECIPES.filter(recipe => recipe.pathwayId === getAdvancement(game.character).pathwayId).map(recipe => ({ title: recipe.name, description: `${recipe.description}\n材料${recipe.cost}便士；储备${state.materials[recipe.id] || 0}份`, actions: [
      action("购买材料 · 1回合", "buy", recipe.id, actionGate(game, recipe) || (money < recipe.cost ? "资金不足" : "")),
      action("制作成品 · 1回合", "craft", recipe.id, actionGate(game, recipe) || (!(state.materials[recipe.id] > 0) ? "材料不足" : "")),
    ] }));
    const products = Object.entries(state.products).flatMap(([id, recipeId]) => {
      const recipe = SPECIAL_RECIPES.find(entry => entry.id === recipeId);
      const item = game.inventory.find(entry => entry.instanceId === id && entry.quantity > 0);
      return recipe && item ? [{ title: `${item.name} ×${item.quantity}`, description: recipe.description, actions: [
        ...(recipe.stat ? [action("使用一份 · 1回合", "use", id)] : []), action(`出售一份 · ${recipe.sale}便士`, "sell", id, item.equipped ? "先卸下装备" : ""),
      ] }] : [];
    });
    return { ...visibleGameState(game), id: game.id, moneyLabel: formatMoney(game.money), choices: game.choices, choiceMeta: game.choiceMeta,
      storyHistory: game.storyHistory, changeLog: game.changeLog, worldEvents: game.worldEvents, longTermSummary: game.longTermSummary,
      capacity: game.capacity, equipment: game.equipment, journal, trackedQuestId: game.trackedQuestId,
      map: { cells: visibleHexes(game).map(cell => ({ ...cell, explorable: canExploreHex(game, cell.q, cell.r).ok })), locations: getMapLocations(game).filter(location => knowledge[location.id]?.status !== "unknown").map(location => ({
        ...location, ...hexForLocation(location), knowledge: knowledge[location.id], travel: estimateTravelByHex(game.location, location),
      })) },
      special: { work, craft: [...recipes, ...products], supplies: [
        { title: "雾鸦旅店", description: "睡眠恢复按本地规则结算。", actions: [action("睡觉8小时 · 1回合", "sleep", "soot-lamp", game.location.id !== "soot-lamp" ? "需要到达雾鸦旅店" : "")] },
        ...SPECIAL_RECIPES.filter(recipe => recipe.stat).map(recipe => ({ title: recipe.name, description: recipe.description, actions: [action(`购买成品 · ${recipe.sale}便士`, "buy-medicine", recipe.id, medicinePurchaseGate(game) || (money < recipe.sale ? "资金不足" : ""))] })),
      ], people: VISITABLE_PEOPLE.map(person => ({ ...person, actions: [action(`拜访${person.name} · 1回合`, "visit-person", person.id, visitPersonGate(game, person.id))], conversationReason: visitPersonGate(game, person.id, { conversation: true }) })),
      organization: [
        ...(getAdvancement(game.character).pathwayId === "corpse_collector" ? [{ title: "墓地管理处", actions: [action("登记守墓人 · 1回合", "register", "gravekeeper", registrationGate(game, "gravekeeper"))] }] : []),
        ...ORGANIZATIONS.filter(organization => organization.headquarters && organization.tags.includes("official")).map(organization => ({ title: organization.name, description: organization.description, actions: [action(`正式加入${organization.name} · 1回合`, "register", organization.id, registrationGate(game, organization.id), { confirmed: true })] })),
      ], revision: state.revision },
    };
  }

  function begin({ action: rawAction, options = {}, settings = {}, prompt = DEFAULT_SYSTEM_PROMPT }) {
    requireGame(); requireIdle();
    let action = String(rawAction || "").trim();
    if (!action) throw new Error("请输入本轮行动。");
    if (options.commissionRestoreRequest) {
      const restored = restoreCommissionRecord(game, options.commissionRestoreRequest);
      if (!restored.ok) throw new Error(restored.reason);
      game = restored.game; return { complete: true, view: view() };
    }
    options = { ...options, questTrackingRequest: options.questTrackingRequest || inferCommissionTrackingRequest(game, action) };
    const tracking = options.questTrackingRequest ? inspectQuestTracking(structuredClone(game), options.questTrackingRequest) : null;
    if (tracking && !tracking.ok) throw new Error(tracking.reason);
    if (tracking?.kind === "commission-status" || tracking?.kind === "special-action") {
      game = { ...game, trackedQuestId: tracking.entry.id };
      return { complete: true, panel: tracking.kind === "special-action" ? "special" : "quests", view: view() };
    }
    if (tracking?.kind === "choice") throw new Error(tracking.reason);
    if (tracking) action = tracking.action;
    const person = requestedPersonVisit(game, action);
    if (person && !options.personConversation) { game = resolveSpecialAction(game, { operation: "visit-person", id: person.id, revision: specialState(game).revision }); return { complete: true, view: view() }; }
    options = { ...options, mapDestination: inferMapDestination(game, action, options.mapDestination) };
    const playerRequests = validatePlayerActions(game, action, options);
    if (options.personConversation) { const reason = visitPersonGate(game, options.personConversation, { conversation: true }); if (reason) throw new Error(reason); }
    const talisman = validateTalismanRequest(game, options.talismanRequest);
    const inquiry = tracking ? null : inferCommissionInquiry(game, action);
    // Credentials never cross the rules boundary, even if a caller supplies them.
    const safeSettings = { ...DEFAULT_API_SETTINGS, ...settings, apiKey: "", profiles: {}, customHeaders: "{}" };
    pending = { action, options, playerRequests, tracking, inquiry, talisman, settings: safeSettings, prompt, calls: [], repairs: 0 };
    return request(buildPlanningContext(game, action, prompt, { nativeTools: safeSettings.nativeTools, ...options, ...playerRequests, questTrackingPlan: tracking, commissionInquiry: inquiry, talismanRequest: talisman }), { toolSet: "state" });
  }

  function plan({ response, repairedIndex }) {
    if (!pending) throw new Error("回合已取消。");
    const normalized = normalizeChatCompletion(response);
    if (repairedIndex !== undefined) {
      const previous = pending.calls[repairedIndex];
      const replacement = normalizeToolCalls(normalized.toolCalls, game).find(call => call.name === previous?.name);
      if (replacement) pending.calls[repairedIndex] = { ...replacement, id: previous.id };
    } else pending.calls = enforce(dedupeToolCalls(normalizeToolCalls(ensureMapDiscoveryToolCall(normalized.toolCalls, pending.options.mapInvestigation, game.turn + 1, game), game)));
    pending.calls = enforce(pending.calls);
    for (let index = 0; index < pending.calls.length && pending.repairs < 3; index++) {
      const validation = validateToolCall(game, pending.calls[index]);
      if (validation.error && isRepairableToolError(pending.calls[index], validation.error)) {
        pending.repairs++;
        return { repairIndex: index, ...request(buildToolRepairContext(game, pending.action, pending.calls[index], validation.reason || validation.error, pending.prompt, { nativeTools: pending.settings.nativeTools }), { toolSet: "state", allowedToolNames: [pending.calls[index].name], forceDisableReasoning: true, maxTokensModeOverride: "manual", maxTokensOverride: 1600 }) };
      }
    }
    const preview = executeToolCalls(game, pending.calls, { playerAction: pending.action, questTrackingRequest: pending.options.questTrackingRequest });
    const rejected = preview.results.find(result => !result.ok);
    if (rejected) throw new Error(`本轮规则核验未完成：${rejected.reason}。进度与物品未改变，可重试。`);
    pending.confirmations = collectImportantItemConfirmations(pending.calls, preview.results);
    return { confirmations: pending.confirmations };
  }

  function settle({ approvedKeys = [] } = {}) {
    if (!pending) throw new Error("回合已取消。");
    const approved = new Set(approvedKeys);
    const blockedCallIndexes = (pending.confirmations || []).filter(change => !approved.has(change.key)).map(change => change.callIndex);
    const execution = executeToolCalls(game, pending.calls, { playerAction: pending.action, questTrackingRequest: pending.options.questTrackingRequest, blockedCallIndexes });
    if (pending.tracking) execution.game.trackedQuestId = pending.tracking.entry.id;
    const progress = resolveTurnProgress(execution.game, pending.action, game.choices.find(choice => choice.label === pending.action)?.risk, pending.calls, execution.results, { travelOnly: pending.tracking?.kind === "travel", commissionOnly: Boolean(pending.inquiry || pending.tracking?.entry.commission || pending.calls.some(call => call.name === "commission.offer")) });
    const settled = { ...execution.game, turn: game.turn + 1, worldTime: progress.worldTime, occult: progress.occult, triggerState: progress.triggerState, hiddenDanger: progress.hiddenDanger };
    const resolution = createTurnResolution(pending.calls, execution.results, progress, settled);
    pending.execution = execution; pending.progress = progress; pending.settled = settled; pending.resolution = resolution;
    pending.confirmationStatus = { required: Boolean(pending.confirmations?.length), status: blockedCallIndexes.length ? "rejected" : "confirmed", confirmed: (pending.confirmations?.length || 0) - blockedCallIndexes.length, rejected: blockedCallIndexes.length };
    return request(buildRenderingContext(game, settled, pending.action, pending.prompt, resolution, { nativeTools: pending.settings.nativeTools }), { toolSet: "choices" });
  }

  function finish({ response }) {
    if (!pending?.settled) throw new Error("没有可提交的回合。");
    const normalized = normalizeChatCompletion(response);
    if (!normalized.hasNarrative) throw new Error("模型没有返回最终剧情正文，请重试本轮。");
    const { action, execution, progress, settled, resolution } = pending;
    let narrative = appendCommissionReport(appendFixedRenardTreatmentScene(normalized.narrative, progress), resolution);
    const appeared = progress.newTrigger?.presentation;
    if (appeared && !narrative.includes(appeared.title) && !resolution.derivedEffects.narrativeEvents.some(event => event.triggerDefinitionId === progress.newTrigger.definitionId)) narrative += `\n\n【${appeared.title}】${appeared.text}`;
    const memory = computeMemoryUpdate(execution.game, action, narrative, resolution, { settledGame: settled });
    const choices = choiceResult(modelChoices(normalized), choiceValidationError(normalized));
    const baseline = createAuditBaseline(game, settled.turn);
    game = markNarrativeEventsDelivered({ ...settled, ...memory.updates, ...choices,
      choices: choices.choices.length === 3 && !settled.questFocus?.id ? injectOccultEntryChoice(choices.choices, appeared || progress.triggerState.active.find(entry => entry.status === "available")?.presentation) : choices.choices,
      changeLog: [...game.changeLog, ...execution.logs, ...(progress.statusTickLogs || [])].slice(-100),
      worldEvents: [...game.worldEvents, ...(appeared ? [{ id: makeId("event"), turn: settled.turn, text: `特殊事件出现：${appeared.title}` }] : [])].slice(-40),
      lastTurnBaseline: baseline, lastTurnAudit: { ...auditTurnChanges(baseline, settled), importantItemConfirmation: pending.confirmationStatus }, lastTurnMetrics: null,
    }, resolution.derivedEffects.narrativeEvents, { action });
    pending = null;
    return { complete: true, view: view() };
  }

  function localTool({ name, args, reason }) {
    requireGame(); requireIdle();
    const item = game.inventory.find(entry => entry.instanceId === args.instanceId);
    if (name === "item.use" && item?.potion) return { action: `服用${item.name}魔药并尝试逐级晋升`, options: { advancementRequest: { potionInstanceId: item.instanceId } } };
    if (name === "item.use" && getChurchTalisman(item)) return { action: reason, options: { talismanRequest: args } };
    if (name === "item.use" && medicineRecipe(item)) { game = resolveSpecialAction(game, { operation: "use", id: item.instanceId, revision: specialState(game).revision }); return { complete: true, view: view() }; }
    const call = { id: makeId("local"), name, args, reason };
    const baseline = createAuditBaseline(game, game.turn);
    const execution = executeToolCalls({ ...game, turn: game.turn - 1 }, [call]);
    if (!execution.results[0]?.ok) throw new Error(execution.results[0]?.reason || "物品操作失败。");
    const progress = processTriggers(execution.game, { action: reason, toolCalls: [call], toolResults: execution.results, turn: game.turn });
    const next = { ...execution.game, turn: game.turn, triggerState: progress.state, changeLog: [...game.changeLog, ...execution.logs].slice(-100) };
    const inspection = execution.results[0]?.data?.itemInspection;
    if (inspection) Object.assign(next, computeMemoryUpdate({ ...next, turn: next.turn - 1 }, reason, inspection.observation, createTurnResolution([call], execution.results, { triggerSignals: progress.signals }), { settledGame: next }).updates);
    game = { ...next, lastTurnBaseline: baseline, lastTurnAudit: auditTurnChanges(baseline, next) };
    return { complete: true, view: view() };
  }

  return {
    catalog: () => ({ character: EMPTY_CHARACTER, pathways: PATHWAYS.map(({ id, name }) => ({ id, name })), openings: OPENINGS.map(({ district, title, summary }) => ({ district, title, summary })), talents: TALENTS, defaultSettings: { ...DEFAULT_API_SETTINGS, stream: true }, defaultPrompt: DEFAULT_SYSTEM_PROMPT }),
    create: ({ character, loadout }) => { requireIdle(); if (!character?.name?.trim()) throw new Error("请填写角色姓名。"); game = createInitialGame({ ...EMPTY_CHARACTER, ...character }, loadout); return view(); },
    load: ({ payload }) => { requireIdle(); game = validatePlayableSave(migrateSave(structuredClone(payload?.game || payload))); return view(); },
    view, begin, plan, settle, finish, tool: localTool,
    cancel: () => { pending = null; return view(); },
    special: request => { requireGame(); requireIdle(); game = resolveSpecialAction(game, request); return view(); },
    focus: ({ id }) => { requireGame(); requireIdle(); game.trackedQuestId = id; return view(); },
    explore: ({ q, r }) => { requireGame(); requireIdle(); const next = structuredClone(game); const result = exploreHex(next, q, r); if (!result.ok) throw new Error(result.reason || "此处无法探索。"); Object.assign(next, appendStoryMessages(next, [{ id: makeId("msg"), role: "assistant", turn: game.turn, content: result.narrative, source: "fixed" }])); game = next; return view(); },
    export: () => { requireGame(); return { format: "backlund-chronicle-save", version: SAVE_VERSION, exportedAt: new Date().toISOString(), game: cleanGame(game) }; },
    choiceRequest: ({ settings, prompt = DEFAULT_SYSTEM_PROMPT }) => { requireGame(); requireIdle(); const narrative = game.storyHistory.filter(message => message.role === "assistant").at(-1)?.content || ""; return { request: buildAIRequestBody(settings, buildChoiceRegenerationContext(game, "继续当前场景", narrative, "missing_choices", prompt, { nativeTools: settings.nativeTools }), { toolSet: "choices", disableJsonMode: settings.nativeTools, requireChoiceTool: true }) }; },
    choices: ({ response }) => { requireGame(); requireIdle(); const normalized = normalizeChatCompletion(response); const result = choiceResult(modelChoices(normalized), choiceValidationError(normalized)); game = { ...game, ...result }; return view(); },
  };
}
