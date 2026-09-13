import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, DEFAULT_SYSTEM_PROMPT, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { applyChoiceRecovery, recoverChoices } from "../src/services/choiceRecovery.js";
import { choiceResult, hasValidModelChoices } from "../src/services/choices.js";
import { normalizeAIResponse } from "../src/services/protocol.js";
import { choiceStatusMessage } from "../src/components/gameUi.js";

const game = createInitialGame({ ...EMPTY_CHARACTER, name: "选项恢复测试员" });
const settings = { baseUrl: "https://example.test/v1", apiKey: "test-key", customHeaders: "", model: "compatible-model",
  temperature: 0.7, maxTokens: 800, nativeTools: true, jsonMode: false, stream: true };
const actions = ["等待", "敲门", "离开"].map(label => ({ label, risk: "low", intent: "action" }));
const params = { game, action: "检查门锁", narrative: "门没有打开。", prompt: DEFAULT_SYSTEM_PROMPT,
  settings, initialResponse: choiceResult([]) };

test("dedicated tool recovery falls back to JSON through actual API transport", async context => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    const content = bodies.length === 1 ? "门仍然关着。" : JSON.stringify({ choices: actions });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  };
  const result = await recoverChoices(params);
  assert.equal(hasValidModelChoices(result), true);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0].tools.map(tool => tool.function.name), ["ui__present_choices"]);
  assert.deepEqual(bodies[0].tool_choice, { type: "function", function: { name: "ui__present_choices" } });
  assert.equal(bodies[0].response_format, undefined);
  assert.equal(bodies[1].tools, undefined);
  assert.equal(bodies[1].tool_choice, undefined);
  assert.deepEqual(bodies[1].response_format, { type: "json_object" });
  assert.ok(bodies.every(body => body.stream === false && body.max_tokens === 1200));
  assert.deepEqual(result.choiceMeta.attempts.map(attempt => attempt.mode), ["tool", "json"]);
});

test("partial choices are passed into the prompt and preserved during supplement", async () => {
  const initialResponse = choiceResult(actions.slice(0, 2));
  let calls = 0;
  const result = await recoverChoices({ ...params, initialResponse, request: async (_settings, messages) => {
    calls++;
    assert.match(messages.at(-1).content, /existingChoices/);
    assert.match(messages.at(-1).content, /敲门/);
    return normalizeAIResponse({ choices: [actions[1], actions[2]] });
  } });
  assert.deepEqual(result.choices, actions);
  assert.equal(calls, 1);
});

test("complete choices skip recovery entirely", async () => {
  const result = await recoverChoices({ ...params, initialResponse: choiceResult(actions),
    request: async () => assert.fail("must not request") });
  assert.equal(result.choices.length, 3);
});

test("errors remain bounded and preserve received choices without state changes", async () => {
  const before = structuredClone(game);
  let calls = 0;
  const result = await recoverChoices({ ...params, initialResponse: choiceResult(actions.slice(0, 1)),
    request: async () => { calls++; throw new Error("provider failure"); } });
  assert.equal(calls, 2);
  assert.equal(result.choiceMeta.reason, "request_failed");
  assert.deepEqual(result.choices, actions.slice(0, 1));
  assert.deepEqual(game, before);
  assert.match(choiceStatusMessage(result.choiceMeta), /本轮剧情已保存/);
  assert.match(choiceStatusMessage(result.choiceMeta), /请求失败/);
});

test("JSON-only settings make only one attempt", async () => {
  let calls = 0;
  const result = await recoverChoices({ ...params, settings: { ...settings, nativeTools: false },
    request: async () => { calls++; return normalizeAIResponse("没有选项"); } });
  assert.equal(calls, 1);
  assert.equal(result.choices.length, 0);
  assert.equal(result.choiceMeta.source, "unavailable");
});

test("user cancellation aborts recovery without starting a fallback", async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = await recoverChoices({ ...params, signal: controller.signal, initialResponse: choiceResult(actions.slice(0, 2)),
    request: async (_settings, _messages, signal) => {
      calls++;
      controller.abort();
      signal.throwIfAborted();
    } });
  assert.equal(calls, 1);
  assert.equal(result.choiceMeta.reason, "cancelled");
  assert.equal(result.choices.length, 2);
});

test("a timed out attempt switches to the bounded compatibility attempt", async () => {
  let calls = 0;
  const result = await recoverChoices({ ...params, timeoutMs: 5, request: async (_settings, _messages, signal) => {
    if (++calls === 2) return normalizeAIResponse({ choices: actions });
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  } });
  assert.equal(calls, 2);
  assert.equal(result.choiceMeta.attempts[0].reason, "timeout");
  assert.equal(hasValidModelChoices(result), true);
});

test("late recovery only changes choices on its own saved turn", () => {
  const current = { ...game, longTermSummary: "摘要已更新", turn: 4 };
  const target = { ...game, turn: 4 };
  const result = applyChoiceRecovery(current, target, choiceResult(actions));
  assert.deepEqual(result, { ...current, ...choiceResult(actions) });
  assert.equal(result.character, current.character);
  assert.equal(result.recentDialogues, current.recentDialogues);
  assert.equal(applyChoiceRecovery(current, { ...target, turn: 3 }, choiceResult(actions)), current);
  assert.equal(applyChoiceRecovery(current, { ...target, id: "other-save" }, choiceResult(actions)), current);
});
