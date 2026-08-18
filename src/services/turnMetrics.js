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
  };
}

export function recordModelRequest(metrics) {
  metrics.modelRequests += 1;
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
  return {
    planningMs: round((metrics.planningCompletedAt ?? now) - metrics.startedAt),
    firstNarrativeMs: metrics.firstNarrativeAt === null ? null : round(metrics.firstNarrativeAt - metrics.startedAt),
    confirmationWaitMs: round(confirmationWait),
    totalMs: round(now - metrics.startedAt),
    modelRequests: metrics.modelRequests,
  };
}
