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
  };
}

export function recordModelRequest(metrics, response = null) {
  metrics.modelRequests += 1;
  const usage = response?.responseMetadata?.usage;
  if (!usage) return;
  const prompt = Number(usage.prompt_tokens);
  const hit = Number(usage.prompt_cache_hit_tokens);
  const miss = Number(usage.prompt_cache_miss_tokens);
  if (Number.isFinite(prompt)) metrics.promptTokens += prompt;
  if (Number.isFinite(hit)) metrics.cacheHitTokens += hit;
  if (Number.isFinite(miss)) metrics.cacheMissTokens += miss;
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
  const cachedTokens = metrics.cacheHitTokens + metrics.cacheMissTokens;
  return {
    planningMs: round((metrics.planningCompletedAt ?? now) - metrics.startedAt),
    firstNarrativeMs: metrics.firstNarrativeAt === null ? null : round(metrics.firstNarrativeAt - metrics.startedAt),
    confirmationWaitMs: round(confirmationWait),
    totalMs: round(now - metrics.startedAt),
    modelRequests: metrics.modelRequests,
    promptTokens: metrics.promptTokens || null,
    cacheHitTokens: metrics.cacheHitTokens || null,
    cacheMissTokens: metrics.cacheMissTokens || null,
    cacheHitRate: cachedTokens > 0 ? Math.round((metrics.cacheHitTokens / cachedTokens) * 100) : null,
  };
}
