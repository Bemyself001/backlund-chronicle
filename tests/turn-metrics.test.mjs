import assert from "node:assert/strict";
import test from "node:test";
import { finishTurnMetrics, markTurnMetric, recordModelRequest, startTurnMetrics } from "../src/services/turnMetrics.js";

test("turn metrics separate planning, player confirmation wait, first narrative and total time", () => {
  const metrics = startTurnMetrics(100);
  recordModelRequest(metrics);
  recordModelRequest(metrics);
  markTurnMetric(metrics, "planningCompletedAt", 350);
  markTurnMetric(metrics, "confirmationStartedAt", 400);
  markTurnMetric(metrics, "confirmationCompletedAt", 900);
  markTurnMetric(metrics, "firstNarrativeAt", 1050);
  markTurnMetric(metrics, "firstNarrativeAt", 1100);
  assert.deepEqual(finishTurnMetrics(metrics, 1250), {
    planningMs: 250,
    firstNarrativeMs: 950,
    confirmationWaitMs: 500,
    totalMs: 1150,
    modelRequests: 2,
  });
});
