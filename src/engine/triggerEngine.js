import { normalizeInventoryItem } from "../system/items.js";
import { getAdvancement } from "../system/character.js";
import { allConditionsMatch } from "./triggerConditions.js";
import { TRIGGER_DEFINITIONS, getTriggerDefinition } from "./triggerDefinitions.js";
import { canReceiveNewOccultEntry } from "./occultTriggers.js";
import {
  availableOccultEntry,
  makeTriggerInstanceId,
  normalizeTriggerState,
  setTriggerFact,
  syncLegacyOccult,
  terminalTrigger,
} from "./triggerState.js";
import { buildTriggerSignals } from "./triggerSignals.js";

function definitionEligible(definition, context) {
  if (!allConditionsMatch(definition.eligibility || [], context)) return false;
  if (definition.category === "occult-entry" && !canReceiveNewOccultEntry(context.game)) return false;
  return true;
}

function canRegisterEligibility(state, definition, turn) {
  if (state.active.some((entry) => entry.definitionId === definition.id)) return false;
  const history = state.history.filter((entry) => entry.definitionId === definition.id);
  if (definition.oncePerSave && history.length) return false;
  if (definition.cooldown != null && history.length) {
    const lastTurn = Math.max(...history.map((entry) => Number(entry.completedTurn ?? entry.createdTurn ?? 0)));
    if (turn < lastTurn + Number(definition.cooldown)) return false;
  }
  return true;
}

function refreshEligibility(game, state, signals, action, turn) {
  const context = { game, state, signals, action, turn };
  state.active = state.active.filter((instance) => {
    if (instance.status !== "eligible") return true;
    const definition = getTriggerDefinition(instance.definitionId);
    return definition && definitionEligible(definition, context);
  });
  for (const definition of TRIGGER_DEFINITIONS) {
    if (!canRegisterEligibility(state, definition, turn) || !definitionEligible(definition, context)) continue;
    state.active.push({
      instanceId: makeTriggerInstanceId(game.id || "game", definition.id, turn),
      definitionId: definition.id,
      category: definition.category,
      status: "eligible",
      stage: definition.eligibleStage || "eligible",
      eligibleTurn: turn,
      createdTurn: turn,
      expiresTurn: null,
      engagedTurn: null,
      completedTurn: null,
      source: { action: "", evidenceIds: [] },
      stageHistory: [],
    });
  }
}

function sceneAppropriate(game) {
  return Boolean(game.location?.name || game.location?.id) && Number(game.hiddenDanger?.stage || 0) < 5;
}

function hasExploreSignal(signals) {
  return signals.some((signal) => ["action.investigate", "item.inspected", "clue.added", "location.changed", "relationship.changed"].includes(signal.kind));
}

function occultDefinitionCanAppear(definition, context) {
  const { game, state, signals, turn } = context;
  if (!canReceiveNewOccultEntry(game) || availableOccultEntry(state)) return false;
  const advancement = getAdvancement(game.character || {});
  if (definition.pathwayId && advancement.pathwayId !== definition.pathwayId) return false;
  const contacted = Number(game.occult?.contact) === 1 || Boolean(state.facts["occult.contact"]);
  if (!contacted && definition.occultScope !== "general") return false;
  const directExploration = hasExploreSignal(signals);
  const guaranteed = !contacted && !state.facts["occult.initial-entry-offered"] && turn >= state.nextInitialOccultWindow && sceneAppropriate(game);
  return directExploration || guaranteed;
}

function definitionCanAppear(definition, context) {
  const { state } = context;
  if (!state.active.some((entry) => entry.definitionId === definition.id && entry.status === "eligible")) return false;
  if (!definitionEligible(definition, context)) return false;
  if (definition.category === "occult-entry") return occultDefinitionCanAppear(definition, context);
  return allConditionsMatch(definition.appearWhen || [], context);
}

function candidateScore(definition, context) {
  const advancement = getAdvancement(context.game.character || {});
  let score = Number(definition.priority || 0);
  if (definition.pathwayId && definition.pathwayId === advancement.pathwayId) score += 100;
  else if (definition.category === "occult-entry" && definition.occultScope === "general") score += 45;
  if (definition.appearWhen?.length && allConditionsMatch(definition.appearWhen, context)) score += 250;
  if (definition.category === "occult-entry" && hasExploreSignal(context.signals)) score += 75;
  return score;
}

function makeAvailableInstance(game, state, definition, turn, action, signals) {
  const evidenceIds = signals.map((signal) => signal.id).filter(Boolean);
  const instance = state.active.find((entry) => entry.definitionId === definition.id && entry.status === "eligible") || {
    instanceId: makeTriggerInstanceId(game.id || "game", definition.id, turn), definitionId: definition.id, category: definition.category, stageHistory: [],
  };
  instance.status = "available";
  instance.stage = definition.initialStage || "discovered";
  instance.createdTurn = turn;
  instance.expiresTurn = definition.expiresAfterTurns == null ? null : turn + Number(definition.expiresAfterTurns);
  instance.engagedTurn = null;
  instance.completedTurn = null;
  instance.source = { action: String(action || ""), evidenceIds };
  instance.presentation = structuredClone(definition.presentation || {});
  instance.stageHistory.push({ id: `${instance.instanceId}:eligible:available`, from: "eligible", to: "available", turn, evidenceIds });
  return instance;
}

function applySignalsAsFacts(state, signals, turn) {
  for (const signal of signals) {
    if (signal.kind === "fact.discovered" && signal.factId) setTriggerFact(state, signal.factId, turn, signal.evidenceIds || [signal.id]);
  }
}

function applyReward(game, state, reward, turn) {
  const rewardId = String(reward.id || "");
  if (!rewardId || state.rewardsClaimed.includes(rewardId)) return null;
  if (reward.type === "fact") setTriggerFact(state, reward.key, turn, [`reward:${rewardId}`], reward.value ?? true);
  else if (reward.type === "clue") {
    if (!game.clues.some((clue) => clue.id === reward.clue?.id)) game.clues.push({ detail: "", ...structuredClone(reward.clue), discoveredAt: `第 ${turn} 轮`, isNew: true });
  } else if (reward.type === "item") {
    if (!game.inventory.some((item) => item.instanceId === reward.item?.instanceId || item.itemId === reward.item?.itemId)) game.inventory.push(normalizeInventoryItem({ quantity: 1, ...structuredClone(reward.item), acquiredAt: `第 ${turn} 轮` }));
  }
  state.rewardsClaimed.push(rewardId);
  return rewardId;
}

function completeInstance(game, state, instance, definition, turn, events) {
  const rewards = (definition.rewards || []).map((reward) => applyReward(game, state, reward, turn)).filter(Boolean);
  const completed = terminalTrigger(state, instance, "completed", turn);
  if (completed) events.completed.push({ ...completed, rewards });
}

function advanceExisting(game, state, signals, action, turn, events) {
  const context = { game, state, signals, action, turn };
  for (const instance of [...state.active]) {
    const definition = getTriggerDefinition(instance.definitionId);
    if (!definition) continue;
    if (instance.status === "available" && definition.autoEngageWhen?.length && allConditionsMatch(definition.autoEngageWhen, context)) {
      instance.status = "engaged";
      instance.engagedTurn = turn;
      const previousStage = instance.stage;
      instance.stage = definition.engagedStage || instance.stage;
      instance.stageHistory.push({ id: `${instance.instanceId}:engaged`, from: previousStage, to: instance.stage, turn, evidenceIds: signals.map((signal) => signal.id) });
      events.engaged.push(structuredClone(instance));
    }
    if (instance.status !== "engaged") continue;
    const stage = (definition.stages || []).find((entry) => entry.id === instance.stage);
    const failWhen = stage?.failWhen || definition.failWhen || [];
    if (failWhen.length && allConditionsMatch(failWhen, context)) {
      const failed = terminalTrigger(state, instance, "failed", turn);
      if (failed) events.failed.push(failed);
      continue;
    }
    if (!stage?.advanceWhen?.length || !allConditionsMatch(stage.advanceWhen, context)) continue;
    const previousStage = instance.stage;
    instance.stage = stage.nextStage || instance.stage;
    instance.stageHistory.push({ id: `${instance.instanceId}:${previousStage}:${instance.stage}`, from: previousStage, to: instance.stage, turn, evidenceIds: signals.map((signal) => signal.id) });
    events.advanced.push({ instanceId: instance.instanceId, definitionId: instance.definitionId, from: previousStage, to: instance.stage, turn });
    if (stage.complete) completeInstance(game, state, instance, definition, turn, events);
  }
}

function expireAvailable(state, turn, events) {
  for (const instance of [...state.active]) {
    if (instance.status !== "available" || instance.expiresTurn == null || turn < instance.expiresTurn) continue;
    const expired = terminalTrigger(state, instance, "expired", turn);
    if (expired) events.expired.push(expired);
  }
}

function selectNewDefinition(game, state, signals, action, turn) {
  if (signals.some((signal) => ["trigger.engaged", "trigger.abandoned"].includes(signal.kind))) return null;
  if ([...state.active, ...state.history].some((entry) => entry.status !== "eligible" && entry.createdTurn === turn)) return null;
  const context = { game, state, signals, action, turn };
  return TRIGGER_DEFINITIONS
    .filter((definition) => definitionCanAppear(definition, context))
    .sort((left, right) => candidateScore(right, context) - candidateScore(left, context) || left.id.localeCompare(right.id))[0] || null;
}

export function processTriggers(game, { action = "", toolCalls = [], toolResults = [], turn = Number(game.turn || 0) + 1 } = {}) {
  const state = normalizeTriggerState(game);
  game.triggerState = state;
  const signals = buildTriggerSignals(game, action, toolCalls, toolResults, turn);
  const events = { available: [], engaged: [], advanced: [], completed: [], failed: [], expired: [], abandoned: [] };
  applySignalsAsFacts(state, signals, turn);
  if (Number(game.occult?.contact) === 1) setTriggerFact(state, "occult.contact", turn, ["legacy:occult.contact"]);
  advanceExisting(game, state, signals, action, turn, events);
  expireAvailable(state, turn, events);
  refreshEligibility(game, state, signals, action, turn);
  const definition = selectNewDefinition(game, state, signals, action, turn);
  if (definition) {
    const instance = makeAvailableInstance(game, state, definition, turn, action, signals);
    if (!state.active.some((entry) => entry.instanceId === instance.instanceId)) state.active.push(instance);
    if (definition.category === "occult-entry" && Number(game.occult?.contact) !== 1) setTriggerFact(state, "occult.initial-entry-offered", turn, [instance.instanceId]);
    events.available.push(structuredClone(instance));
  }
  syncLegacyOccult(game, state);
  return { state, signals, events, newTrigger: events.available[0] || null, occultEntry: events.available.find((entry) => entry.category === "occult-entry") || null };
}

export function engageTrigger(game, instanceId, turn, action = "") {
  const state = normalizeTriggerState(game);
  game.triggerState = state;
  const instance = state.active.find((entry) => entry.instanceId === instanceId);
  if (!instance || instance.status !== "available") return { ok: false, reason: "当前没有匹配的可追查事件" };
  const definition = getTriggerDefinition(instance.definitionId);
  const previousStage = instance.stage;
  instance.status = "engaged";
  instance.engagedTurn = turn;
  instance.stage = definition?.engagedStage || instance.stage;
  instance.stageHistory.push({ id: `${instance.instanceId}:engaged`, from: previousStage, to: instance.stage, turn, evidenceIds: [`player:${turn}`] });
  if (instance.category === "occult-entry") {
    game.occult = { ...(game.occult || {}), contact: 1, contactedAt: `第 ${turn} 轮`, contactedEntryId: instance.instanceId };
    setTriggerFact(state, "occult.contact", turn, [instance.instanceId]);
  }
  syncLegacyOccult(game, state);
  return { ok: true, instance, definition, action };
}

export function abandonTrigger(game, instanceId, turn) {
  const state = normalizeTriggerState(game);
  game.triggerState = state;
  const instance = state.active.find((entry) => entry.instanceId === instanceId);
  if (!instance || !["available", "engaged"].includes(instance.status)) return { ok: false, reason: "当前没有匹配的可放弃事件" };
  const abandoned = terminalTrigger(state, instance, "abandoned", turn);
  syncLegacyOccult(game, state);
  return { ok: true, instance: abandoned };
}
