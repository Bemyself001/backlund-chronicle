import { normalizeTokenUsage } from "./apiUsage.js";

const TOKEN_FIELDS = ["promptTokens", "cacheHitTokens", "cacheMissTokens", "completionTokens", "reasoningTokens"];

function currentTime() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function startTurnMetrics(now = currentTime()) {
  return {
    startedAt: now,
    planningCompletedAt: null,
    confirmationStartedAt: null,
    confirmationCompletedAt: null,
    firstNarrativeAt: null,
    modelRequests: 0,
    promptTokens: 0,
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    reportedTokens: {},
    incompleteUsageRequests: 0,
    incompleteCacheRequests: 0,
    failedRequests: 0,
    abortedRequests: 0,
    retryRequests: 0,
    pairedCacheHitTokens: 0,
    pairedCacheMissTokens: 0,
    phases: {},
    requests: [],
  };
}

export function recordModelRequest(metrics, response = null) {
  const event = response && Object.hasOwn(response, "usageComplete")
    ? response
    : { ...normalizeTokenUsage(response?.responseMetadata?.usage), phase: "unknown", status: "success" };
  metrics.modelRequests += 1;
  if (!event.usageComplete) metrics.incompleteUsageRequests += 1;
  if (!event.cacheUsageComplete) metrics.incompleteCacheRequests += 1;
  if (event.status === "failed") metrics.failedRequests += 1;
  if (event.status === "aborted") metrics.abortedRequests += 1;
  if (event.recoveryAttempt > 0) metrics.retryRequests += 1;
  for (const key of TOKEN_FIELDS) {
    if (Number.isFinite(event[key])) {
      metrics[key] += event[key];
      metrics.reportedTokens[key] = true;
    }
  }
  const phase = typeof event.phase === "string" && /^[a-z][a-zA-Z0-9_-]{0,39}$/.test(event.phase) ? event.phase : "unknown";
  if (!Object.hasOwn(metrics.phases, phase)) metrics.phases[phase] = { requests: 0, failed: 0, aborted: 0, totalMs: 0, incompleteUsageRequests: 0, pairedCacheHitTokens: 0, pairedCacheMissTokens: 0, ...Object.fromEntries(TOKEN_FIELDS.map(key => [key, null])) };
  const totals = metrics.phases[phase];
  totals.requests += 1;
  totals.failed += event.status === "failed" ? 1 : 0;
  totals.aborted += event.status === "aborted" ? 1 : 0;
  totals.totalMs += Number.isFinite(event.totalMs) ? event.totalMs : 0;
  totals.incompleteUsageRequests += event.usageComplete ? 0 : 1;
  for (const key of TOKEN_FIELDS) if (Number.isFinite(event[key])) totals[key] = (totals[key] ?? 0) + event[key];
  // A hit-only packet must not share a denominator with a different request's misses.
  if (event.cacheUsageComplete && Number.isFinite(event.cacheHitTokens) && Number.isFinite(event.cacheMissTokens)) {
    metrics.pairedCacheHitTokens += event.cacheHitTokens;
    metrics.pairedCacheMissTokens += event.cacheMissTokens;
    totals.pairedCacheHitTokens += event.cacheHitTokens;
    totals.pairedCacheMissTokens += event.cacheMissTokens;
  }
  // Keep a bounded diagnostic trail containing only explicit metadata fields.
  metrics.requests.push({
    phase, status: event.status || "success", recoveryAttempt: event.recoveryAttempt || 0,
    httpStatus: event.httpStatus ?? null,
    firstResponseMs: event.firstResponseMs ?? null,
    firstContentMs: event.firstContentMs ?? null,
    totalMs: event.totalMs ?? null,
    ...Object.fromEntries(TOKEN_FIELDS.map(key => [key, Number.isFinite(event[key]) ? event[key] : null])),
    usageComplete: Boolean(event.usageComplete), cacheUsageComplete: Boolean(event.cacheUsageComplete),
  });
  if (metrics.requests.length > 64) metrics.requests.shift();
}

export function markTurnMetric(metrics, key, now = currentTime()) {
  if (key === "firstNarrativeAt" && metrics[key] !== null) return;
  metrics[key] = now;
}

export function finishTurnMetrics(metrics, now = currentTime()) {
  const round = (value) => Math.max(0, Math.round(value));
  const confirmationWait = metrics.confirmationStartedAt === null || metrics.confirmationCompletedAt === null
    ? 0
    : metrics.confirmationCompletedAt - metrics.confirmationStartedAt;
  const hitRate = value => value.pairedCacheHitTokens + value.pairedCacheMissTokens > 0
    ? Math.round(value.pairedCacheHitTokens * 100 / (value.pairedCacheHitTokens + value.pairedCacheMissTokens)) : null;
  return {
    planningMs: round((metrics.planningCompletedAt ?? now) - metrics.startedAt),
    firstNarrativeMs: metrics.firstNarrativeAt === null ? null : round(metrics.firstNarrativeAt - metrics.startedAt),
    confirmationWaitMs: round(confirmationWait),
    totalMs: round(now - metrics.startedAt),
    modelRequests: metrics.modelRequests,
    ...Object.fromEntries(TOKEN_FIELDS.map(key => [key, metrics.reportedTokens[key] ? metrics[key] : null])),
    cacheHitRate: hitRate(metrics),
    usageComplete: metrics.incompleteUsageRequests === 0 && metrics.modelRequests > 0,
    cacheUsageComplete: metrics.incompleteCacheRequests === 0 && metrics.modelRequests > 0,
    incompleteUsageRequests: metrics.incompleteUsageRequests,
    incompleteCacheRequests: metrics.incompleteCacheRequests,
    failedRequests: metrics.failedRequests,
    abortedRequests: metrics.abortedRequests,
    retryRequests: metrics.retryRequests,
    phases: Object.fromEntries(Object.entries(metrics.phases).map(([phase, value]) => [phase, { ...value, cacheHitRate: hitRate(value) }])),
    requests: metrics.requests.map(request => ({ ...request })),
  };
}

export function summarizeTurnMetrics(turns = []) {
  const valid = turns.filter(turn => turn && Number.isFinite(turn.modelRequests));
  return {
    turns: valid.length,
    modelRequests: valid.reduce((total, turn) => total + turn.modelRequests, 0),
    totalMs: valid.reduce((total, turn) => total + (turn.totalMs || 0), 0),
    usageComplete: valid.length > 0 && valid.every(turn => turn.usageComplete),
    cacheUsageComplete: valid.length > 0 && valid.every(turn => turn.cacheUsageComplete),
    ...Object.fromEntries(TOKEN_FIELDS.map(key => {
      const reported = valid.map(turn => turn[key]).filter(Number.isFinite);
      return [key, reported.length ? reported.reduce((total, count) => total + count, 0) : null];
    })),
  };
}

export function summarizeRequestMetrics(events = []) {
  const metrics = startTurnMetrics(0);
  for (const event of events) if (event && Object.hasOwn(event, "usageComplete")) recordModelRequest(metrics, event);
  const totalMs = events.reduce((total, event) => total + (Number.isFinite(event?.totalMs) ? event.totalMs : 0), 0);
  return finishTurnMetrics(metrics, totalMs);
}
