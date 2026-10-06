import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as nextTick } from "node:timers/promises";
import { requestAIWithReasoningFallback } from "../src/services/api.js";
import { recoverChoices } from "../src/services/choiceRecovery.js";
import { createInitialGame, EMPTY_CHARACTER, DEFAULT_API_SETTINGS } from "../src/data/defaults.js";

const settings = { ...DEFAULT_API_SETTINGS, baseUrl: "https://cancel.invalid/v1", model: "test", apiKey: "test", nativeTools: false, stream: false };
const messages = [{ role: "user", content: "打开书本" }];
const response = content => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }), { headers: { "Content-Type": "application/json" } });

test("cancel returns before an uncooperative fetch and discards its late empty response", { timeout: 1500 }, async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let release;
  let calls = 0;
  const controller = new AbortController();
  globalThis.fetch = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const pending = requestAIWithReasoningFallback(settings, messages, controller.signal);
  const cancelled = assert.rejects(pending, { name: "AbortError" });
  await nextTick();
  assert.equal(calls, 1);
  controller.abort();
  await cancelled;
  release(response(""));
  await nextTick();
  assert.equal(calls, 1, "a late empty response must not trigger a retry");
});

test("cancel closes an idle SSE reader and rejects before any further chunk", { timeout: 1500 }, async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let closed = 0;
  const previews = [];
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(stream) { stream.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"第一句"}}]}\n\n')); },
    cancel() { closed++; },
  }), { headers: { "Content-Type": "text/event-stream" } });
  const controller = new AbortController();
  const pending = requestAIWithReasoningFallback({ ...settings, stream: true }, messages, controller.signal, chunk => previews.push(chunk));
  const cancelled = assert.rejects(pending, { name: "AbortError" });
  await nextTick();
  assert.deepEqual(previews, ["第一句"]);
  controller.abort();
  await cancelled;
  await nextTick();
  assert.equal(closed, 1);
  assert.deepEqual(previews, ["第一句"]);
});

test("aborting inside recovery callback cannot dispatch the automatic retry", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response(""); };
  const controller = new AbortController();
  await assert.rejects(requestAIWithReasoningFallback(settings, messages, controller.signal, undefined, {
    onReasoningRecovery: () => controller.abort(),
  }), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("choice recovery cancellation releases a hung request without a fallback", { timeout: 1500 }, async () => {
  const controller = new AbortController();
  let calls = 0;
  let release;
  let received = 0;
  const pending = recoverChoices({ game: createInitialGame({ ...EMPTY_CHARACTER, name: "中止测试" }), action: "查看", narrative: "你停下来。", prompt: "", settings: { ...settings, nativeTools: true }, signal: controller.signal, initialResponse: {},
    request: () => { calls++; return new Promise(resolve => { release = resolve; }); }, onResponse: () => { received++; },
  });
  await nextTick();
  controller.abort();
  const result = await pending;
  assert.equal(result.choiceMeta.reason, "cancelled");
  release({ choices: [{ label: "旧选项" }] });
  await nextTick();
  assert.equal(calls, 1);
  assert.equal(received, 0);
});
