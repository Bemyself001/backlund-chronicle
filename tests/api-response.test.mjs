import assert from "node:assert/strict";
import test from "node:test";
import { requestAI } from "../src/services/api.js";

const settings = {
  baseUrl: "https://example.test/v1",
  apiKey: "test-key",
  customHeaders: "",
  model: "compatible-model",
  temperature: 0.7,
  maxTokens: 800,
  jsonMode: true,
  nativeTools: false,
  stream: false,
};

test("requestAI accepts a non-stream plain-text compatible response", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: "雨水正沿着铜制招牌滴落。" } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  const result = await requestAI(settings, [{ role: "user", content: "观察街道" }]);
  assert.match(result.narrative, /铜制招牌/);
  assert.equal(result.choices.length, 3);
});

test("requestAI flushes a final SSE event without a trailing newline", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"最后一盏灯熄灭了。"}}]}'));
      controller.close();
    },
  });
  globalThis.fetch = async () => new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  const result = await requestAI({ ...settings, stream: true }, [{ role: "user", content: "等待" }]);
  assert.match(result.narrative, /最后一盏灯/);
});

test("requestAI accepts full JSON when streaming was requested but not honored", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: '{"narrative":"接口返回了完整响应。","choices":[]}' } }],
  }), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
  const result = await requestAI({ ...settings, stream: true }, [{ role: "user", content: "检查接口" }]);
  assert.equal(result.narrative, "接口返回了完整响应。");
});

test("requestAI reports an actionable error when reasoning exhausts output tokens", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{
    finish_reason: "length",
    message: { content: "", reasoning_content: "仍在推理" },
  }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(
    requestAI(settings, [{ role: "user", content: "继续" }]),
    /Max Tokens.*4000/,
  );
});

test("requestAI preserves native calls when content is null", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: {
    content: null,
    tool_calls: [{ id: "call-1", function: { name: "status__add", arguments: '{"name":"警觉"}' } }],
  } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  const result = await requestAI({ ...settings, nativeTools: true }, [{ role: "user", content: "侧耳倾听" }]);
  assert.equal(result.toolCalls[0].name, "status.add");
  assert.equal(result.toolCalls[0].args.name, "警觉");
});
