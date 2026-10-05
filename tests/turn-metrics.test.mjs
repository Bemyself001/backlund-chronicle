import assert from "node:assert/strict";
import test from "node:test";
import { finishTurnMetrics, markTurnMetric, recordModelRequest, startTurnMetrics, summarizeRequestMetrics } from "../src/services/turnMetrics.js";
import { normalizeTokenUsage } from "../src/services/apiUsage.js";

test("turn metrics separate planning, player confirmation wait, first narrative and total time", () => {
  const metrics = startTurnMetrics(100);
  recordModelRequest(metrics);
  recordModelRequest(metrics, { responseMetadata: { usage: { prompt_tokens: 2000, prompt_cache_hit_tokens: 1500, prompt_cache_miss_tokens: 500 } } });
  markTurnMetric(metrics, "planningCompletedAt", 350);
  markTurnMetric(metrics, "confirmationStartedAt", 400);
  markTurnMetric(metrics, "confirmationCompletedAt", 900);
  markTurnMetric(metrics, "firstNarrativeAt", 1050);
  markTurnMetric(metrics, "firstNarrativeAt", 1100);
  const finished = finishTurnMetrics(metrics, 1250);
  assert.deepEqual(Object.fromEntries(Object.entries(finished).filter(([key]) => ["planningMs", "firstNarrativeMs", "confirmationWaitMs", "totalMs", "modelRequests", "promptTokens", "cacheHitTokens", "cacheMissTokens", "cacheHitRate"].includes(key))), {
    planningMs: 250,
    firstNarrativeMs: 950,
    confirmationWaitMs: 500,
    totalMs: 1150,
    modelRequests: 2,
    promptTokens: 2000,
    cacheHitTokens: 1500,
    cacheMissTokens: 500,
    cacheHitRate: 75,
  });
  assert.equal(finished.usageComplete, false);
  assert.equal(finished.incompleteUsageRequests, 2);
});

test("usage normalization preserves real zero, missing usage and provider cache detail", () => {
  assert.equal(normalizeTokenUsage(null).cacheHitTokens, null);
  assert.equal(normalizeTokenUsage({ prompt_cache_hit_tokens: null }).cacheHitTokens, null);
  assert.equal(normalizeTokenUsage({ prompt_cache_hit_tokens: " " }).cacheHitTokens, null);
  assert.equal(normalizeTokenUsage({ prompt_cache_hit_tokens: [] }).cacheHitTokens, null);
  assert.deepEqual(normalizeTokenUsage({ prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens: 30, completion_tokens_details: { reasoning_tokens: 12 } }), {
    promptTokens: 100, cacheHitTokens: 0, cacheMissTokens: 100, completionTokens: 30, reasoningTokens: 12,
    usageComplete: true, cacheUsageComplete: true,
  });
});

test("cache rate uses paired hit and miss values from the same requests", () => {
  const partial = { phase: "planning", status: "success", ...normalizeTokenUsage({ prompt_cache_hit_tokens: 900 }) };
  const summary = summarizeRequestMetrics([
    partial,
    { phase: "planning", status: "success", ...normalizeTokenUsage({ prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100 }) },
  ]);
  assert.equal(summary.cacheHitTokens, 900);
  assert.equal(summary.cacheMissTokens, 100);
  assert.equal(summary.cacheHitRate, 0);
  assert.equal(summary.phases.planning.cacheHitRate, 0);
  assert.equal(summary.incompleteCacheRequests, 1);
  assert.equal(summarizeRequestMetrics([partial]).cacheHitRate, null);
});

test("request summaries retain failed and interrupted attempts and isolate finish snapshots", () => {
  const events = [
    { phase: "planning", status: "failed", recoveryAttempt: 0, totalMs: 100, ...normalizeTokenUsage({ prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100 }) },
    { phase: "planning", status: "success", recoveryAttempt: 1, totalMs: 200, ...normalizeTokenUsage({ prompt_tokens: 100, completion_tokens: 40, prompt_cache_hit_tokens: 50, prompt_cache_miss_tokens: 50 }) },
    { phase: "memory", status: "aborted", totalMs: 50, ...normalizeTokenUsage(null) },
  ];
  const summary = summarizeRequestMetrics(events);
  assert.equal(summary.modelRequests, 3);
  assert.equal(summary.promptTokens, 200);
  assert.equal(summary.completionTokens, 60);
  assert.equal(summary.retryRequests, 1);
  assert.equal(summary.failedRequests, 1);
  assert.equal(summary.abortedRequests, 1);
  assert.equal(summary.incompleteUsageRequests, 1);
  assert.equal(summary.phases.planning.requests, 2);
  assert.equal(summary.phases.memory.promptTokens, null);
  const metrics = startTurnMetrics(0);
  recordModelRequest(metrics, events[0]);
  const snapshot = finishTurnMetrics(metrics, 100);
  recordModelRequest(metrics, events[1]);
  assert.equal(snapshot.phases.planning.requests, 1);
  assert.equal(snapshot.cacheHitTokens, 0);
});
