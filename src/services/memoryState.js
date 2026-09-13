export const MEMORY_STATE_VERSION = 2;
export const MEMORY_SUMMARY_BATCH_SIZE = 10;

const CERTAINTIES = new Set(["confirmed", "reported", "intended"]);
const THREAD_KINDS = new Set(["promise", "question", "plan"]);

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function compactNarrative(value, maxLength = 700) {
  const text = cleanText(value, 4000);
  if (text.length <= maxLength) return text;
  const head = Math.ceil(maxLength * .6);
  return `${text.slice(0, head)}……${text.slice(-(maxLength - head - 2))}`;
}

function sourceTurns(value, allowedTurns = null) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((turn) => Number.isInteger(turn) && turn >= 0
    && (!allowedTurns || allowedTurns.has(turn))))].sort((a, b) => a - b).slice(-8);
}

function budgetItems(items, budget, line) {
  const accepted = [];
  let used = 0;
  for (const item of items) {
    const length = line(item).length;
    if (accepted.length && used + length > budget) break;
    accepted.push(item);
    used += length;
  }
  return accepted;
}

function normalizeStoredDigest(raw = {}) {
  const people = Array.isArray(raw.people) ? raw.people.flatMap((item) => {
    const name = cleanText(item?.name, 32);
    const summary = cleanText(item?.summary, 120);
    return name && summary ? [{ name, summary, sourceTurns: sourceTurns(item.sourceTurns) }] : [];
  }) : [];
  const events = Array.isArray(raw.events) ? raw.events.flatMap((item) => {
    const summary = cleanText(item?.summary, 150);
    return summary ? [{ summary, certainty: CERTAINTIES.has(item?.certainty) ? item.certainty : "confirmed",
      sourceTurns: sourceTurns(item.sourceTurns) }] : [];
  }) : [];
  const openThreads = Array.isArray(raw.openThreads) ? raw.openThreads.flatMap((item) => {
    const summary = cleanText(item?.summary, 140);
    return summary ? [{ summary, kind: THREAD_KINDS.has(item?.kind) ? item.kind : "question",
      sourceTurns: sourceTurns(item.sourceTurns) }] : [];
  }) : [];
  return {
    people: budgetItems(people.slice(0, 10), 260, (item) => `${item.name}${item.summary}${item.sourceTurns.join("、")}`),
    events: budgetItems(events.slice(0, 10), 340, (item) => `${item.summary}${item.sourceTurns.join("、")}`),
    openThreads: budgetItems(openThreads.slice(0, 8), 220, (item) => `${item.summary}${item.sourceTurns.join("、")}`),
  };
}

function legacyDigest(summary, throughTurn) {
  const text = cleanText(summary, 900);
  return {
    people: [],
    events: text ? [{ summary: text, certainty: "reported", sourceTurns: [Math.max(0, throughTurn)] }] : [],
    openThreads: [],
  };
}

export function normalizeMemoryState(game = {}) {
  const turn = Math.max(0, Number(game.turn) || 0);
  const raw = game.memoryState;
  if (!raw || raw.version !== MEMORY_STATE_VERSION) {
    return {
      version: MEMORY_STATE_VERSION,
      revision: 0,
      throughTurn: turn,
      digest: legacyDigest(game.longTermSummary, turn),
      pending: [],
    };
  }
  const throughTurn = Math.max(0, Math.min(turn, Number(raw.throughTurn) || 0));
  const seen = new Set();
  const pending = (Array.isArray(raw.pending) ? raw.pending : []).flatMap((episode) => {
    const episodeTurn = Number(episode?.turn);
    const id = cleanText(episode?.id, 100);
    if (!id || seen.has(id) || !Number.isInteger(episodeTurn) || episodeTurn <= throughTurn || episodeTurn > turn) return [];
    seen.add(id);
    return [{
      id,
      turn: episodeTurn,
      action: cleanText(episode.action, 140),
      narrative: compactNarrative(episode.narrative),
      worldTime: cleanText(episode.worldTime, 80),
      location: episode.location && typeof episode.location === "object" ? {
        id: cleanText(episode.location.id, 80), name: cleanText(episode.location.name, 100),
      } : null,
      accepted: Array.isArray(episode.accepted) ? episode.accepted.map((entry) => cleanText(entry, 140)).filter(Boolean).slice(0, 8) : [],
      rejected: Array.isArray(episode.rejected) ? episode.rejected.map((entry) => cleanText(entry, 140)).filter(Boolean).slice(0, 8) : [],
    }];
  }).sort((a, b) => a.turn - b.turn);
  return {
    version: MEMORY_STATE_VERSION,
    revision: Math.max(0, Number(raw.revision) || 0),
    throughTurn,
    digest: normalizeStoredDigest(raw.digest),
    pending,
  };
}

export function createMemoryEpisode(game, action, narrative, resolution = null, settledGame = game) {
  const turn = Math.max(0, Number(game.turn) + 1);
  const describe = (entry) => cleanText(entry?.log || entry?.reason || entry?.name, 140);
  return {
    id: `memory-${cleanText(game.id, 64)}-${turn}`,
    turn,
    action: cleanText(action, 140),
    narrative: compactNarrative(narrative),
    worldTime: cleanText(settledGame?.worldTime || resolution?.derivedEffects?.worldTime, 80),
    location: settledGame?.location ? { id: cleanText(settledGame.location.id, 80), name: cleanText(settledGame.location.name, 100) } : null,
    accepted: (resolution?.accepted || []).map(describe).filter(Boolean).slice(0, 8),
    rejected: (resolution?.rejected || []).map(describe).filter(Boolean).slice(0, 8),
  };
}

export function appendMemoryEpisode(game, episode) {
  const state = normalizeMemoryState(game);
  const pending = [...state.pending.filter((item) => item.id !== episode.id), episode].sort((a, b) => a.turn - b.turn);
  return { ...state, pending };
}

export function createMemorySummaryJob(game) {
  const state = normalizeMemoryState(game);
  if (state.pending.length < MEMORY_SUMMARY_BATCH_SIZE) return null;
  const episodes = state.pending.slice(0, MEMORY_SUMMARY_BATCH_SIZE);
  return {
    gameId: game.id,
    baseRevision: state.revision,
    episodeIds: episodes.map((episode) => episode.id),
    throughTurn: episodes.at(-1).turn,
    previousDigest: state.digest,
    episodes,
  };
}

function allKnownTurns(job) {
  const turns = new Set(job.episodes.map((episode) => episode.turn));
  for (const item of [...job.previousDigest.people, ...job.previousDigest.events, ...job.previousDigest.openThreads]) {
    for (const turn of item.sourceTurns || []) turns.add(turn);
  }
  return turns;
}

export function parseMemoryDigestPayload(payload, job) {
  const raw = payload?.memory ?? payload?.memoryDigest ?? payload;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.people) || !Array.isArray(raw.events) || !Array.isArray(raw.openThreads)) return null;
  const allowed = allKnownTurns(job);
  const validSources = (item) => {
    const turns = sourceTurns(item?.sourceTurns, allowed);
    return turns.length && turns.length === new Set(item.sourceTurns?.map(Number)).size ? turns : null;
  };
  const people = [];
  for (const item of raw.people.slice(0, 10)) {
    const name = cleanText(item?.name, 32); const summary = cleanText(item?.summary, 120); const turns = validSources(item);
    if (!name || !summary || !turns) return null;
    people.push({ name, summary, sourceTurns: turns });
  }
  const events = [];
  for (const item of raw.events.slice(0, 10)) {
    const summary = cleanText(item?.summary, 150); const turns = validSources(item);
    if (!summary || !CERTAINTIES.has(item?.certainty) || !turns) return null;
    events.push({ summary, certainty: item.certainty, sourceTurns: turns });
  }
  const openThreads = [];
  for (const item of raw.openThreads.slice(0, 8)) {
    const summary = cleanText(item?.summary, 140); const turns = validSources(item);
    if (!summary || !THREAD_KINDS.has(item?.kind) || !turns) return null;
    openThreads.push({ summary, kind: item.kind, sourceTurns: turns });
  }
  if (!people.length && !events.length && !openThreads.length) return null;
  return normalizeStoredDigest({ people, events, openThreads });
}

export function composeMemorySummary(digest) {
  const normalized = normalizeStoredDigest(digest);
  const refs = (item) => item.sourceTurns?.length ? `（第${item.sourceTurns.join("、")}轮）` : "";
  const certaintyLabel = { confirmed: "已确认", reported: "转述", intended: "意图" };
  const threadLabel = { promise: "承诺", question: "问题", plan: "计划" };
  const sections = [
    ["人物", normalized.people.map((item) => `${item.name}：${item.summary}${refs(item)}`)],
    ["事件", normalized.events.map((item) => `[${certaintyLabel[item.certainty]}]${item.summary}${refs(item)}`)],
    ["未完成事项", normalized.openThreads.map((item) => `[${threadLabel[item.kind]}]${item.summary}${refs(item)}`)],
  ];
  return sections.filter(([, items]) => items.length).map(([label, items]) => `【${label}】${items.join("；")}`).join("\n");
}

export function applyMemorySummary(game, job, digest) {
  if (!game || game.id !== job.gameId) return game;
  const state = normalizeMemoryState(game);
  if (state.revision !== job.baseRevision || !job.episodeIds.every((id) => state.pending.some((episode) => episode.id === id))) return game;
  const nextState = {
    ...state,
    revision: state.revision + 1,
    throughTurn: job.throughTurn,
    digest: normalizeStoredDigest(digest),
    pending: state.pending.filter((episode) => !job.episodeIds.includes(episode.id)),
  };
  return { ...game, memoryState: nextState, longTermSummary: composeMemorySummary(nextState.digest) };
}

export function memoryPromptState(game) {
  const state = normalizeMemoryState(game);
  const cutoff = Math.max(0, Number(game.turn) - 3);
  const olderPending = state.pending.filter((episode) => episode.turn <= cutoff);
  const selected = [];
  let budget = 0;
  for (const episode of [...olderPending].reverse()) {
    const compact = { turn: episode.turn, action: episode.action, outcome: compactNarrative(episode.narrative, 360),
      accepted: episode.accepted, rejected: episode.rejected };
    const length = JSON.stringify(compact).length;
    if (selected.length && budget + length > 4200) break;
    selected.push(compact); budget += length;
  }
  return { throughTurn: state.throughTurn, digest: state.digest, unsummarizedEvents: selected.reverse() };
}
