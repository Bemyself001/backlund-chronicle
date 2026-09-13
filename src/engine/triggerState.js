const TERMINAL_STATUSES = new Set(["completed", "failed", "abandoned", "expired"]);
const ACTIVE_STATUSES = new Set(["eligible", "available", "engaged"]);

function stableHash(value = "") {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function initialOccultWindow(gameId = "") {
  return 8 + (stableHash(`${gameId}:initial-occult-window`) % 5);
}

export function createTriggerState(game = {}) {
  return {
    version: 1,
    active: [],
    history: [],
    facts: {},
    rewardsClaimed: [],
    nextInitialOccultWindow: initialOccultWindow(game.id),
  };
}

function normalizeFact(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      value: value.value ?? true,
      firstTurn: Number.isInteger(Number(value.firstTurn)) ? Number(value.firstTurn) : null,
      evidenceIds: [...new Set(Array.isArray(value.evidenceIds) ? value.evidenceIds.filter(Boolean).map(String) : [])],
    };
  }
  return { value: value ?? true, firstTurn: null, evidenceIds: [] };
}

function normalizeInstance(instance = {}, fallbackStatus = "available") {
  const status = [...ACTIVE_STATUSES, ...TERMINAL_STATUSES].includes(instance.status) ? instance.status : fallbackStatus;
  const createdTurn = Math.max(0, Number(instance.createdTurn ?? instance.turn ?? 0) || 0);
  return {
    instanceId: String(instance.instanceId || instance.id || `trigger-legacy-${createdTurn}`),
    definitionId: String(instance.definitionId || instance.id || "occult.entry.legacy"),
    category: String(instance.category || "occult-entry"),
    status,
    stage: String(instance.stage || (status === "available" ? "discovered" : "eligible")),
    createdTurn,
    expiresTurn: instance.expiresTurn == null ? null : Math.max(createdTurn, Number(instance.expiresTurn) || createdTurn),
    engagedTurn: instance.engagedTurn == null ? null : Math.max(0, Number(instance.engagedTurn) || 0),
    completedTurn: instance.completedTurn == null ? null : Math.max(0, Number(instance.completedTurn) || 0),
    source: {
      action: String(instance.source?.action || ""),
      evidenceIds: [...new Set(Array.isArray(instance.source?.evidenceIds) ? instance.source.evidenceIds.filter(Boolean).map(String) : [])],
    },
    presentation: instance.presentation && typeof instance.presentation === "object" ? { ...instance.presentation } : undefined,
    stageHistory: Array.isArray(instance.stageHistory) ? instance.stageHistory.map((entry) => ({ ...entry })) : [],
  };
}

function legacyPresentation(entry = {}) {
  return {
    title: String(entry.title || "非凡入口"),
    text: String(entry.text || "一条曾经出现的隐秘线索仍在等待你决定是否追查。"),
    choice: entry.choice || { label: "追查这条非凡入口（可选）", intent: "occult", risk: "medium" },
  };
}

export function normalizeTriggerState(game = {}) {
  const supplied = game.triggerState && typeof game.triggerState === "object" ? game.triggerState : null;
  const state = supplied ? {
    version: 1,
    active: Array.isArray(supplied.active) ? supplied.active.map((entry) => normalizeInstance(entry, "available")) : [],
    history: Array.isArray(supplied.history) ? supplied.history.map((entry) => normalizeInstance(entry, "completed")) : [],
    facts: Object.fromEntries(Object.entries(supplied.facts || {}).map(([key, value]) => [key, normalizeFact(value)])),
    rewardsClaimed: [...new Set(Array.isArray(supplied.rewardsClaimed) ? supplied.rewardsClaimed.filter(Boolean).map(String) : [])],
    nextInitialOccultWindow: Math.max(8, Math.min(12, Number(supplied.nextInitialOccultWindow) || initialOccultWindow(game.id))),
  } : createTriggerState(game);

  const current = game.occult?.entryAvailable && game.occult?.currentEntry ? game.occult.currentEntry : null;
  if (current && ![...state.active, ...state.history].some((entry) => entry.instanceId === current.id)) {
      const createdTurn = Math.max(0, Number(current.turn ?? game.occult?.lastEntryTurn ?? game.turn ?? 0) || 0);
      state.active.push(normalizeInstance({
        ...current,
        instanceId: current.id || `trigger-legacy-${createdTurn}`,
        definitionId: current.definitionId || current.id || "occult.entry.legacy",
        category: "occult-entry",
        status: "available",
        stage: "discovered",
        createdTurn,
        expiresTurn: supplied ? (current.expiresTurn ?? createdTurn + 10) : Math.max(0, Number(game.turn || 0)) + 10,
        presentation: legacyPresentation(current),
        source: { action: "旧存档入口迁移", evidenceIds: [] },
      }));
  }
  if (!supplied) {
    for (const entry of Array.isArray(game.occult?.entryHistory) ? game.occult.entryHistory : []) {
      if (!entry || state.active.some((active) => active.instanceId === entry.id)) continue;
      const turn = Math.max(0, Number(entry.turn || 0));
      state.history.push(normalizeInstance({
        ...entry,
        instanceId: entry.id || `trigger-legacy-history-${turn}`,
        definitionId: entry.definitionId || entry.id || "occult.entry.legacy",
        category: "occult-entry",
        status: "expired",
        stage: "closed",
        createdTurn: turn,
        completedTurn: turn,
        presentation: legacyPresentation(entry),
        source: { action: "旧入口历史迁移", evidenceIds: [] },
      }, "expired"));
    }
  }

  const seen = new Set();
  state.active = state.active.filter((entry) => ACTIVE_STATUSES.has(entry.status) && !seen.has(entry.instanceId) && seen.add(entry.instanceId));
  state.history = state.history.filter((entry) => TERMINAL_STATUSES.has(entry.status) && !seen.has(entry.instanceId) && seen.add(entry.instanceId));
  return state;
}

export function setTriggerFact(state, key, turn, evidenceIds = [], value = true) {
  if (!key) return false;
  const previous = state.facts[key];
  state.facts[key] = {
    value,
    firstTurn: previous?.firstTurn ?? turn,
    evidenceIds: [...new Set([...(previous?.evidenceIds || []), ...evidenceIds.filter(Boolean).map(String)])],
  };
  return !previous || previous.value !== value;
}

export function terminalTrigger(state, instance, status, turn) {
  if (!TERMINAL_STATUSES.has(status)) return null;
  const terminal = { ...instance, status, completedTurn: turn, expiresTurn: instance.expiresTurn ?? null };
  state.active = state.active.filter((entry) => entry.instanceId !== instance.instanceId);
  if (!state.history.some((entry) => entry.instanceId === instance.instanceId)) state.history.push(terminal);
  return terminal;
}

export function availableOccultEntry(state) {
  return state.active.find((entry) => entry.category === "occult-entry" && entry.status === "available") || null;
}

export function playerVisibleTriggers(state) {
  return state.active.filter((entry) => entry.status === "available" || entry.status === "engaged").map((entry) => ({
    instanceId: entry.instanceId,
    definitionId: entry.definitionId,
    category: entry.category,
    status: entry.status,
    stage: entry.stage,
    createdTurn: entry.createdTurn,
    title: entry.presentation?.title || "特殊事件",
    text: entry.status === "available" ? entry.presentation?.text || "" : undefined,
    choice: entry.status === "available" ? entry.presentation?.choice || null : undefined,
  }));
}

export function syncLegacyOccult(game, state) {
  const entry = availableOccultEntry(state);
  const previous = game.occult || {};
  game.occult = {
    ...previous,
    contact: Number(previous.contact) === 1 || game.character?.advancement?.type === "extraordinary" ? 1 : 0,
    revealLevel: Math.max(0, Number(previous.revealLevel || 0)),
    entryAvailable: Boolean(entry),
    currentEntry: entry ? {
      id: entry.instanceId,
      definitionId: entry.definitionId,
      turn: entry.createdTurn,
      title: entry.presentation?.title || "非凡入口",
      text: entry.presentation?.text || "",
      choice: entry.presentation?.choice || { label: "追查这条非凡入口（可选）", intent: "occult", risk: "medium" },
    } : null,
    lastEntryTurn: entry?.createdTurn ?? previous.lastEntryTurn ?? null,
    entryHistory: state.history.filter((item) => item.category === "occult-entry").slice(-20).map((item) => ({
      id: item.instanceId,
      definitionId: item.definitionId,
      turn: item.createdTurn,
      status: item.status,
      title: item.presentation?.title || "非凡入口",
      text: item.presentation?.text || "",
      choice: item.presentation?.choice,
    })),
  };
  return game.occult;
}

export function makeTriggerInstanceId(gameId, definitionId, turn) {
  return `trigger-${stableHash(`${gameId}:${definitionId}:${turn}`).toString(36)}-${turn}`;
}

export { ACTIVE_STATUSES, TERMINAL_STATUSES };
