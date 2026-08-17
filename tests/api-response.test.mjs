import assert from "node:assert/strict";
import test from "node:test";
import { buildToolResultMessages, expandedMaxTokensForRetry, requestAI, requestAIWithReasoningFallback } from "../src/services/api.js";

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
  assert.ok(requestBodies[1].max_tokens > requestBodies[0].max_tokens);
  assert.equal(requestBodies[1].thinking, undefined);
  assert.equal(requestBodies[0].thinking, undefined);
  assert.deepEqual(requestBodies[2].thinking, { type: "disabled" });
  assert.equal(recoveryCount, 1);
  assert.equal(fallbackCount, 1);
});

test("DeepSeek preserves low effort and safely maps medium effort to high", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const requestBodies = [];
  globalThis.fetch = async (_url, init) => {
    requestBodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"narrative":"思考档位已应用。","choices":[]}' } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  await requestAI({ ...settings, provider: "deepseek", reasoningMode: "low", contextLength: 10000 }, [{ role: "user", content: "继续" }]);
  await requestAI({ ...settings, provider: "deepseek", reasoningMode: "medium", contextLength: 10000 }, [{ role: "user", content: "继续" }]);

  assert.equal(requestBodies[0].reasoning_effort, "low");
  assert.equal(requestBodies[0].max_tokens, 1824);
  assert.equal(requestBodies[1].reasoning_effort, "high");
  assert.equal(requestBodies[1].max_tokens, 2848);
});

test("stream parser joins no-index tool fragments by repeated id and reports reasoning progress", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode([
        'data: {"choices":[{"delta":{"reasoning_content":"正在分析"}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call-1","function":{"name":"status__add","arguments":"{\\"name\\":\\"警"}}]}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call-1","function":{"name":"status__add","arguments":"觉\\"}"}}]},"finish_reason":"tool_calls"}]}',
        "data: [DONE]",
        "",
      ].join("\n\n")));
      controller.close();
    },
  });
  globalThis.fetch = async () => new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  const reasoningUpdates = [];
  const result = await requestAI(
    { ...settings, stream: true, nativeTools: true },
    [{ role: "user", content: "侧耳倾听" }],
    undefined,
    undefined,
    { onReasoningChunk: (content) => reasoningUpdates.push(content) },
  );

  assert.deepEqual(reasoningUpdates, ["正在分析"]);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, "status.add");
  assert.equal(result.toolCalls[0].args.name, "警觉");
});

test("stream parser keeps parallel no-index tool fragments separated by position", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode([
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call-a","function":{"name":"status__add","arguments":"{\\"name\\":\\"警"}},{"id":"call-b","function":{"name":"money__add","arguments":"{\\"amount\\":{\\"pounds\\":"}}]}}]}',
        'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"觉\\"}"}},{"function":{"arguments":"1}}"}}]},"finish_reason":"tool_calls"}]}',
        "data: [DONE]",
        "",
      ].join("\n\n")));
      controller.close();
    },
  });
  globalThis.fetch = async () => new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  const result = await requestAI({ ...settings, stream: true, nativeTools: true }, [{ role: "user", content: "继续" }]);

  assert.deepEqual(result.toolCalls.map((call) => call.name), ["status.add", "money.add"]);
  assert.equal(result.toolCalls[0].args.name, "警觉");
  assert.equal(result.toolCalls[1].args.amount.pounds, 1);
});

test("invalid native arguments retain a diagnostic cause instead of becoming silent empty args", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{
    finish_reason: "length",
    message: { content: null, tool_calls: [{ id: "broken", function: { name: "status__add", arguments: '{"name":"警' } }] },
  }] }), { status: 200, headers: { "Content-Type": "application/json" } });

  const result = await requestAI({ ...settings, nativeTools: true }, [{ role: "user", content: "继续" }]);
  assert.equal(result.toolCalls[0].argsInvalid, true);
  assert.equal(result.toolCalls[0].argsInvalidCause, "length");
});

test("automatic reasoning recovery keeps the configured streaming mode", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const requestBodies = [];
  globalThis.fetch = async (_url, init) => {
    requestBodies.push(JSON.parse(init.body));
    const payload = requestBodies.length < 3
      ? { choices: [{ finish_reason: "length", message: { content: "", reasoning_content: "仍在推理" } }] }
      : { choices: [{ message: { content: '{"narrative":"流式恢复完成。","choices":[]}' } }] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  await requestAIWithReasoningFallback({ ...settings, provider: "deepseek", stream: true }, [{ role: "user", content: "继续" }]);
  assert.deepEqual(requestBodies.map((body) => body.stream), [true, true, true]);
});

test("retry budget expands from the actual request without exceeding context capacity", () => {
  const messages = [{ role: "user", content: "继续" }];
  const expanded = expandedMaxTokensForRetry({ ...settings, contextLength: 5000 }, messages, 3000);
  assert.ok(expanded > 3000);
  assert.ok(expanded < 5000);
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

test("requestAI ignores native tool fragments without a function name", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: {
    content: '{"narrative":"钟声在雨幕后逐渐远去。","choices":[]}',
    tool_calls: [
      { id: "empty-call", function: { arguments: "{}" } },
      { id: "valid-call", function: { name: "status__add", arguments: '{"name":"警觉"}' } },
    ],
  } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  const result = await requestAI({ ...settings, nativeTools: true }, [{ role: "user", content: "观察雨夜" }]);
  assert.deepEqual(result.toolCalls.map((call) => call.name), ["status.add"]);
  assert.doesNotMatch(result.narrative, /未知工具「」/);
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

test("choice-only requests expose only the ui choice tool", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: {
      content: "煤气灯下的影子缩回了巷口。",
      tool_calls: [{ id: "choice-1", function: { name: "ui__present_choices", arguments: JSON.stringify({ choices: [
        { label: "检查巷口遗留的鞋印", intent: "investigate", risk: "low" },
        { label: "向巡夜人询问黑影来路", intent: "social", risk: "medium" },
        { label: "立刻追入没有灯光的窄巷", intent: "dangerous", risk: "high" },
      ] }) } }],
    } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await requestAI({ ...settings, nativeTools: true }, [{ role: "user", content: "继续" }], undefined, undefined, { toolSet: "choices", disableJsonMode: true });
  assert.deepEqual(requestBody.tools.map((tool) => tool.function.name), ["ui__present_choices"]);
  assert.equal(requestBody.response_format, undefined);
  assert.equal(result.choices.length, 3);
  assert.deepEqual(result.toolCalls, []);
});

test("targeted tool repair sends only the failing state tool schema", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: {
      content: null,
      tool_calls: [{ id: "repair-1", function: { name: "status__add", arguments: '{"status":{"id":"alert","name":"警觉"},"reason":"发现异常声响"}' } }],
    } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  await requestAI({ ...settings, nativeTools: true }, [{ role: "user", content: "修复参数" }], undefined, undefined, { toolSet: "state", allowedToolNames: ["status.add"] });
  assert.deepEqual(requestBody.tools.map((tool) => tool.function.name), ["status__add"]);
});

test("map state tools expose strict discovery and movement parameters", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "NO_STATE_CHANGE" } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  await requestAI({ ...settings, nativeTools: true }, [{ role: "user", content: "检查地图工具" }], undefined, undefined, { toolSet: "state", allowedToolNames: ["location.discover", "location.move"] });
  const definitions = Object.fromEntries(requestBody.tools.map((tool) => [tool.function.name, tool.function.parameters]));
  assert.deepEqual(definitions.location__discover.required, ["locationId", "status", "note", "reason"]);
  assert.equal(definitions.location__discover.properties.status.additionalProperties, undefined);
  assert.deepEqual(definitions.location__discover.properties.status.enum, ["rumored", "discovered"]);
  assert.deepEqual(definitions.location__move.required, ["locationId", "reason"]);
  assert.equal(definitions.location__move.additionalProperties, false);
});
