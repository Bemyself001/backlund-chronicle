import assert from "node:assert/strict";
import test from "node:test";
import { recentUsage, recordUsageEvent, resetUsageCache, subscribeUsage, usageSnapshot, attachCreationUsage, CREATION_USAGE_ID } from "../src/services/usageHistory.js";

const KEY = "mist-request-usage-v1";
const event = (requestId, patch = {}) => ({ requestId, phase: "planning", provider: "deepseek", model: "deepseek-v4-flash", status: "success", recoveryAttempt: 0, httpStatus: 200, totalMs: 200, promptTokens: 100, cacheHitTokens: 0, cacheMissTokens: 100, completionTokens: 0, reasoningTokens: null, usageComplete: true, cacheUsageComplete: true, ...patch });

function storage(context, initial = {}) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const items = new Map(Object.entries(initial));
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) } });
  resetUsageCache();
  context.after(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
    resetUsageCache();
  });
  return items;
}

test("creation attempts attach to the created save once and stay outside game state", context => {
  storage(context);
  recordUsageEvent(CREATION_USAGE_ID, 0, event("creation-1", { phase: "loadout" }));
  attachCreationUsage("new-save");
  attachCreationUsage("new-save");
  assert.equal(usageSnapshot("new-save").length, 1);
  assert.equal(usageSnapshot("new-save")[0].phase, "loadout");
  assert.deepEqual(usageSnapshot(CREATION_USAGE_ID), []);
  resetUsageCache();
  assert.equal(usageSnapshot("new-save").length, 1);
});

test("ledger persists failed and aborted requests separately from game data, preserving zero and dropping secrets", context => {
  const items = storage(context);
  recordUsageEvent("save-a", 2, event("request-1", { status: "failed", errorCode: "REQUEST_FAILED", headers: { Authorization: "SECRET-KEY" }, messages: [{ content: "SECRET-PROMPT" }], error: { message: "SECRET-ERROR" } }));
  recordUsageEvent("save-a", 2, event("request-2", { status: "aborted", phase: "memory", promptTokens: null, cacheHitTokens: null, cacheMissTokens: null, completionTokens: null, usageComplete: false, cacheUsageComplete: false }));
  const serialized = items.get(KEY);
  assert.equal(serialized.includes("SECRET"), false);
  assert.equal(items.size, 1);
  resetUsageCache();
  const requests = usageSnapshot("save-a");
  assert.equal(requests[0].cacheHitTokens, 0);
  assert.equal(requests[0].completionTokens, 0);
  assert.equal(requests[1].cacheHitTokens, null);
  const summary = recentUsage(requests);
  assert.equal(summary.modelRequests, 2);
  assert.equal(summary.failedRequests, 1);
  assert.equal(summary.abortedRequests, 1);
  assert.equal(summary.phases.memory.requests, 1);
  assert.equal(summary.incompleteUsageRequests, 1);
  assert.equal(summary.cacheHitRate, 0);
  assert.deepEqual(usageSnapshot("save-b"), []);
});

test("ledger deduplicates request IDs both live and on reload and stays bounded per save", context => {
  storage(context, { [KEY]: JSON.stringify([{ gameId: "save-a", events: [event("same"), event("same", { completionTokens: 20 })] }]) });
  assert.equal(usageSnapshot("save-a").length, 1);
  recordUsageEvent("save-a", 1, event("same", { completionTokens: 30 }));
  assert.equal(usageSnapshot("save-a").length, 1);
  assert.equal(usageSnapshot("save-a")[0].completionTokens, 30);
  for (let index = 0; index < 180; index += 1) recordUsageEvent("save-a", index, event(`request-${index}`));
  assert.equal(usageSnapshot("save-a").length, 160);
  assert.equal(recentUsage(usageSnapshot("save-a")).turnCount, 20);
  assert.equal(recentUsage(usageSnapshot("save-a")).modelRequests, 20);
  for (let index = 0; index < 6; index += 1) recordUsageEvent(`save-${index}`, 0, event("request-0"));
  assert.equal(usageSnapshot("save-a").length, 0);
  assert.equal(usageSnapshot("save-0").length, 0);
  assert.equal(usageSnapshot("save-5").length, 1);
});

test("malformed diagnostic values cannot turn missing usage into zero or retain error text", context => {
  storage(context);
  recordUsageEvent("save-a", Infinity, event("request-1", { promptTokens: " ", completionTokens: false, cacheHitTokens: [], cacheMissTokens: {}, status: "SECRET-STATUS", errorCode: "SECRET-ERROR", phase: "SECRET-PROMPT", finishReason: "SECRET-REASON" }));
  const [record] = usageSnapshot("save-a");
  assert.equal(record.turn, 0);
  assert.equal(record.promptTokens, null);
  assert.equal(record.completionTokens, null);
  assert.equal(record.cacheHitTokens, null);
  assert.equal(record.cacheMissTokens, null);
  assert.equal(record.usageComplete, false);
  assert.equal(record.cacheUsageComplete, false);
  assert.equal(JSON.stringify(record).includes("SECRET"), false);
});

test("storage quota and subscriber failures leave diagnostics available in memory", context => {
  storage(context);
  globalThis.localStorage.setItem = () => { throw new Error("quota exceeded"); };
  let calls = 0;
  const stopBroken = subscribeUsage(() => { throw new Error("observer error"); });
  const stopHealthy = subscribeUsage(() => { calls += 1; });
  context.after(() => { stopBroken(); stopHealthy(); });
  assert.doesNotThrow(() => recordUsageEvent("save-a", 1, event("request-1")));
  assert.equal(calls, 1);
  assert.equal(usageSnapshot("save-a").length, 1);
  const first = usageSnapshot("save-a");
  assert.equal(usageSnapshot("save-a"), first);
  recordUsageEvent("save-a", 1, event("request-2"));
  assert.notEqual(usageSnapshot("save-a"), first);
});
