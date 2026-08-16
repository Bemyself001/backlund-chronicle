import assert from "node:assert/strict";
import test from "node:test";
import { buildToolResultMessages, requestAI, requestAIWithReasoningFallback } from "../src/services/api.js";

const settings = {
  baseUrl: "https://example.test/v1",
  apiKey: "test-key",
  customHeaders: "",
  model: "compatible-model",
  temperature: 0.7,
  maxTokens: 800,
  reasoningMode: "auto",
  autoRetryReasoning: true,
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

test("auto Max Tokens fits the prompt inside the configured context", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"narrative":"自动预算已计算。","choices":[]}' } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  await requestAI({ ...settings, maxTokensMode: "auto", contextLength: 10000, maxTokens: 128 }, [{ role: "user", content: "观察东区车站" }]);
  assert.ok(requestBody.max_tokens > 8000);
  assert.ok(requestBody.max_tokens < 10000);
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
    /输出预算.*剧情正文/,
  );
});

test("DeepSeek can explicitly disable thinking in the request body", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"narrative":"雾气散开了一些。","choices":[]}' } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  await requestAI({ ...settings, provider: "deepseek", reasoningMode: "off" }, [{ role: "user", content: "继续" }]);
  assert.deepEqual(requestBody.thinking, { type: "disabled" });
  assert.equal(requestBody.reasoning_effort, undefined);
});

test("OpenAI reasoning models use the compatible output limit", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"narrative":"推理模型返回了正文。","choices":[]}' } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  await requestAI({ ...settings, provider: "openai", model: "gpt-5-mini", reasoningMode: "off" }, [{ role: "user", content: "继续" }]);
  assert.equal(requestBody.max_tokens, undefined);
  assert.equal(requestBody.max_completion_tokens, 800);
  assert.equal(requestBody.temperature, undefined);
  assert.equal(requestBody.reasoning_effort, "low");
});

test("reasoning exhaustion first retries with a larger budget before lowering thinking", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const requestBodies = [];
  let fallbackCount = 0;
  let recoveryCount = 0;
  globalThis.fetch = async (_url, init) => {
    requestBodies.push(JSON.parse(init.body));
    if (requestBodies.length < 3) {
      return new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "", reasoning_content: "仍在推理" } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"narrative":"自动恢复后，正文顺利返回。","choices":[]}' } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await requestAIWithReasoningFallback(
    { ...settings, provider: "deepseek" },
    [{ role: "user", content: "继续" }],
    undefined,
    undefined,
    { onReasoningRecovery: () => { recoveryCount += 1; }, onReasoningFallback: () => { fallbackCount += 1; } },
  );
  assert.equal(result.narrative, "自动恢复后，正文顺利返回。");
  assert.equal(requestBodies.length, 3);
  assert.equal(requestBodies[1].max_tokens, 2400);
  assert.equal(requestBodies[1].thinking, undefined);
  assert.equal(requestBodies[0].thinking, undefined);
  assert.deepEqual(requestBodies[2].thinking, { type: "disabled" });
  assert.equal(recoveryCount, 1);
  assert.equal(fallbackCount, 1);
});

test("stream parser accepts delta.text and text/plain bodies", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"text":"正文来自兼容字段。"},"finish_reason":"stop"}]}\n\n'));
      controller.close();
    },
  });
  globalThis.fetch = async () => new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  const result = await requestAI({ ...settings, stream: true }, [{ role: "user", content: "继续" }]);
  assert.match(result.narrative, /兼容字段/);
});

test("stream parser accepts a provider narrative delta", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"narrative":"叙事字段无需等待完整 JSON。"}}]}\n\n'));
      controller.close();
    },
  });
  globalThis.fetch = async () => new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  const result = await requestAI({ ...settings, stream: true }, [{ role: "user", content: "继续" }]);
  assert.match(result.narrative, /无需等待/);
});

test("stream request falls back to a plain text response body", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response("服务商没有开启 SSE，但返回了可读正文。", { status: 200, headers: { "Content-Type": "text/plain" } });
  const result = await requestAI({ ...settings, stream: true }, [{ role: "user", content: "继续" }]);
  assert.match(result.narrative, /没有开启 SSE/);
});

test("reasoning-only response is recovered without exposing reasoning as narrative", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const payload = calls === 1
      ? { choices: [{ message: { content: "", reasoning: "内部分析" } }] }
      : { choices: [{ message: { content: '{"narrative":"补全后的剧情正文。","choices":[]}' } }] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await requestAIWithReasoningFallback(settings, [{ role: "user", content: "继续" }]);
  assert.equal(result.narrative, "补全后的剧情正文。");
  assert.equal(calls, 2);
});

test("requestAI preserves native calls when content is null", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: {
    content: null,
    reasoning_content: "需要先提出一个状态变化。",
    tool_calls: [{ id: "call-1", function: { name: "status__add", arguments: '{"name":"警觉"}' } }],
  } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  const result = await requestAI({ ...settings, nativeTools: true }, [{ role: "user", content: "侧耳倾听" }]);
  assert.equal(result.toolCalls[0].name, "status.add");
  assert.equal(result.toolCalls[0].args.name, "警觉");
  assert.equal(result.requiresToolFollowUp, true);
  assert.match(result.reasoningContent, /状态变化/);
});

test("tool follow-up reports local validation and disables repeated native calls", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"narrative":"钥匙未能转动，门锁仍然完好。","choices":[]}' } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const resultMessages = buildToolResultMessages(
    [{ id: "call-1", name: "item.use", args: { instanceId: "missing-key" } }],
    [{ ok: false, log: "变更被拒绝：找不到要使用的物品", reason: "找不到要使用的物品" }],
    "先检查钥匙是否存在。",
  );
  const result = await requestAI({ ...settings, nativeTools: true }, resultMessages, undefined, undefined, { disableTools: true });

  assert.equal(requestBody.tools, undefined);
  assert.equal(requestBody.messages[0].reasoning_content, "先检查钥匙是否存在。");
  assert.equal(requestBody.messages[1].role, "tool");
  assert.match(requestBody.messages[1].content, /找不到要使用的物品/);
  assert.match(result.narrative, /门锁仍然完好/);
});
