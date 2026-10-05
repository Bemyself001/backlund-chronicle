import { summarizeRequestMetrics } from "./turnMetrics.js";

const KEY = "mist-request-usage-v1";
const MAX_REQUESTS = 160;
const EMPTY = [];
const listeners = new Set();
let ledger;
const number = value => ["number", "string"].includes(typeof value) && String(value).trim() && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const text = (value, max = 160) => typeof value === "string" ? value.slice(0, max) : "";
const PHASES = ["planning", "narrative", "draft", "repair", "choices", "memory", "inspection", "prayer", "loadout"];
const enumText = (value, allowed, fallback = "") => allowed.includes(value) ? value : fallback;

function safeEvent(event, turn) {
  const record = {
    turn: Math.floor(number(turn) || 0),
    requestId: typeof event.requestId === "string" && /^[a-zA-Z0-9:_-]{1,160}$/.test(event.requestId) ? event.requestId : "",
    phase: enumText(event.phase, PHASES, "unknown"),
    provider: enumText(event.provider, ["openai", "deepseek", "kimi", "custom"], "custom"),
    model: text(event.model),
    status: enumText(event.status, ["success", "failed", "aborted"], "unknown"),
    errorCode: enumText(event.errorCode, ["REASONING_EXHAUSTED", "EMPTY_RESPONSE", "ABORTED", "REQUEST_FAILED"]),
    finishReason: enumText(event.finishReason, ["stop", "length", "tool_calls", "function_call", "content_filter"]),
  };
  for (const key of ["recoveryAttempt", "httpStatus", "firstResponseMs", "firstContentMs", "totalMs", "promptTokens", "cacheHitTokens", "cacheMissTokens", "completionTokens", "reasoningTokens"]) record[key] = number(event[key]);
  record.usageComplete = event.usageComplete === true && record.promptTokens !== null && record.completionTokens !== null;
  record.cacheUsageComplete = event.cacheUsageComplete === true && record.cacheHitTokens !== null && record.cacheMissTokens !== null;
  return record;
}

function uniqueEvents(events) {
  const seen = new Set();
  return events.slice().reverse().filter(event => {
    if (!event.requestId) return true;
    if (seen.has(event.requestId)) return false;
    seen.add(event.requestId);
    return true;
  }).reverse();
}

function loadLedger() {
  if (ledger) return ledger;
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) || "[]");
    ledger = Array.isArray(raw) ? raw.slice(-5).filter(item => typeof item?.gameId === "string" && Array.isArray(item.events)).map(item => ({ gameId: item.gameId, events: uniqueEvents(item.events.slice(-MAX_REQUESTS).filter(event => event && typeof event === "object" && !Array.isArray(event)).map(event => safeEvent(event, event.turn))) })) : [];
  } catch { ledger = []; }
  return ledger;
}

export function recordUsageEvent(gameId, turn, event) {
  if (typeof gameId !== "string" || !gameId || !event || typeof event !== "object" || Array.isArray(event)) return;
  const records = loadLedger();
  const existing = records.find(item => item.gameId === gameId);
  const safe = safeEvent(event, turn);
  const events = [...(existing?.events || []).filter(item => !safe.requestId || item.requestId !== safe.requestId), safe].slice(-MAX_REQUESTS);
  ledger = [...records.filter(item => item.gameId !== gameId), { gameId, events }].slice(-5);
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(ledger)); } catch { /* Diagnostics remain available in memory when storage is full. */ }
  for (const listener of listeners) {
    try { listener(); } catch { /* One diagnostic subscriber must not break the others. */ }
  }
}

export function usageSnapshot(gameId) {
  return loadLedger().find(item => item.gameId === gameId)?.events || EMPTY;
}

export const CREATION_USAGE_ID = "pending-character-creation";

export function attachCreationUsage(gameId) {
  if (!gameId || gameId === CREATION_USAGE_ID) return;
  const records = loadLedger();
  const pending = records.find(item => item.gameId === CREATION_USAGE_ID)?.events;
  if (!pending?.length) return;
  const existing = records.find(item => item.gameId === gameId)?.events || [];
  ledger = [...records.filter(item => ![gameId, CREATION_USAGE_ID].includes(item.gameId)), { gameId, events: uniqueEvents([...existing, ...pending]).slice(-MAX_REQUESTS) }].slice(-5);
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(ledger)); } catch { /* in-memory fallback */ }
  for (const listener of listeners) { try { listener(); } catch { /* optional subscriber */ } }
}

export function subscribeUsage(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recentUsage(events, count = 20) {
  const turns = [...new Set(events.map(event => event.turn))].sort((a, b) => b - a).slice(0, Math.floor(number(count) ?? 20));
  const selected = events.filter(event => turns.includes(event.turn));
  return { ...summarizeRequestMetrics(selected), turnCount: turns.length };
}

export function resetUsageCache() { ledger = undefined; }
