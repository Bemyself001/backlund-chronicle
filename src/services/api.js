import { DEFAULT_API_SETTINGS } from "../data/defaults.js";
import { createProviderProfile, inferApiProvider } from "./apiProviders.js";
import { normalizeAIResponse, textFromContent } from "./protocol.js";

const SETTINGS_KEY = "mist-api-settings-v1";
const LEGACY_SESSION_KEY = "mist-api-key";
const SESSION_KEY_PREFIX = "mist-api-key:";

function sessionKey(provider) {
  return `${SESSION_KEY_PREFIX}${provider}`;
}

function captureProfile(settings) {
  return {
    baseUrl: settings.baseUrl || "",
    model: settings.model || "",
    apiKey: settings.apiKey || "",
    persistKey: Boolean(settings.persistKey),
  };
}

export function loadApiSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch { saved = {}; }
  const provider = saved.provider || (saved.baseUrl ? inferApiProvider(saved.baseUrl) : DEFAULT_API_SETTINGS.provider);
  const legacyProfile = Object.fromEntries(Object.entries({
    baseUrl: saved.baseUrl,
    model: saved.model,
    apiKey: saved.apiKey,
    persistKey: saved.persistKey,
  }).filter(([, value]) => value !== undefined));
  const sourceProfiles = Object.keys(saved.profiles || {}).length ? saved.profiles : { [provider]: legacyProfile };
  const profiles = Object.fromEntries(Object.entries(sourceProfiles).map(([id, profile]) => {
    const persistedKey = profile.persistKey ? profile.apiKey || "" : "";
    const activeLegacyKey = id === provider ? sessionStorage.getItem(LEGACY_SESSION_KEY) || "" : "";
    const apiKey = sessionStorage.getItem(sessionKey(id)) || activeLegacyKey || persistedKey;
    return [id, { ...createProviderProfile(id), ...profile, apiKey }];
  }));
  const active = { ...createProviderProfile(provider), ...(profiles[provider] || {}) };
  return { ...DEFAULT_API_SETTINGS, ...saved, ...active, provider, profiles: { ...profiles, [provider]: active }, apiKey: active.apiKey || "" };
}

export function saveApiSettings(settings) {
  const provider = settings.provider || inferApiProvider(settings.baseUrl);
  const profiles = { ...(settings.profiles || {}), [provider]: captureProfile(settings) };
  const storedProfiles = {};
  for (const [id, profile] of Object.entries(profiles)) {
    if (profile.apiKey) sessionStorage.setItem(sessionKey(id), profile.apiKey);
    else sessionStorage.removeItem(sessionKey(id));
    storedProfiles[id] = { ...profile };
    if (!profile.persistKey) delete storedProfiles[id].apiKey;
  }
  sessionStorage.removeItem(LEGACY_SESSION_KEY);
  const stored = { ...settings, provider, profiles: storedProfiles };
  delete stored.apiKey;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored));
  return { ...settings, provider, profiles };
}

function endpoint(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function parseHeaders(raw) {
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("自定义请求头必须是 JSON 对象。");
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
}

function requestHeaders(settings, withContentType = false) {
  return {
    ...(withContentType ? { "Content-Type": "application/json" } : {}),
    ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    ...parseHeaders(settings.customHeaders),
  };
}

async function apiError(response, prefix) {
  let detail = "";
  try {
    const data = await response.json();
    detail = data?.error?.message || data?.message || "";
  } catch { /* response body is not JSON */ }
  throw new Error(`${prefix}：HTTP ${response.status}${detail ? ` · ${detail}` : ""}`);
}

export async function listApiModels(settings, signal) {
  if (settings.mockMode) return ["mock-narrator"];
  if (!settings.baseUrl) throw new Error("请先选择服务商或填写 Base URL。");
  let response;
  try {
    response = await fetch(endpoint(settings.baseUrl, "/models"), {
      signal,
      headers: requestHeaders(settings),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("无法读取模型：浏览器网络或跨域策略阻止了请求。仍可手动填写模型名称。");
  }
  if (!response.ok) await apiError(response, "读取模型失败");
  const data = await response.json();
  const models = [...new Set((Array.isArray(data?.data) ? data.data : []).map((model) => model?.id).filter(Boolean))];
  if (!models.length) throw new Error("接口连接成功，但没有返回可用模型。");
  return models.sort((a, b) => a.localeCompare(b));
}

export async function testApiConnection(settings, signal) {
  if (settings.mockMode) return "Mock 模式就绪：无需网络连接。";
  if (!settings.baseUrl || !settings.model) throw new Error("请填写 Base URL 和 Model。");
  const models = await listApiModels(settings, signal);
  const selected = models.includes(settings.model) ? "当前模型可用" : "当前模型未出现在列表中，请确认名称";
  return `连接成功：发现 ${models.length} 个模型，${selected}。`;
}

const TOOL_PARAMETER_SCHEMAS = {
  "inventory.add": {
    type: "object",
    additionalProperties: false,
    required: ["item", "reason"],
    properties: {
      item: {
        type: "object",
        additionalProperties: false,
        required: ["itemId", "name", "description"],
        properties: {
          itemId: { type: "string", description: "稳定且可去重的物品 ID" },
          name: { type: "string", description: "物品名称" },
          description: { type: "string", description: "物品描述" },
          category: { type: "string" },
          quantity: { type: "integer", minimum: 1, maximum: 10 },
          weight: { type: "number", minimum: 0 },
          rarity: { type: "string" },
          condition: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          properties: { type: "object" },
          source: { type: "string" },
        },
      },
      reason: { type: "string", description: "与本轮玩家行动对应的获得理由" },
    },
  },
  "inventory.remove": {
    type: "object",
    additionalProperties: false,
    required: ["quantity", "reason"],
    properties: {
      instanceId: { type: "string", description: "背包中的精确物品实例 ID；优先使用它" },
      itemId: { type: "string", description: "仅在能唯一匹配时使用" },
      name: { type: "string", description: "仅在能唯一匹配时使用" },
      quantity: { type: "integer", minimum: 1 },
      reason: { type: "string" },
    },
  },
  "inventory.update": {
    type: "object",
    additionalProperties: false,
    required: ["patch", "reason"],
    properties: {
      instanceId: { type: "string" },
      itemId: { type: "string" },
      name: { type: "string" },
      patch: { type: "object" },
      reason: { type: "string" },
    },
  },
  "item.inspect": {
    type: "object",
    additionalProperties: false,
    required: ["reason"],
    properties: {
      instanceId: { type: "string", description: "必须复制当前背包中的 instanceId" },
      itemId: { type: "string" },
      name: { type: "string" },
      reveal: { type: "boolean" },
      reason: { type: "string" },
    },
  },
  "item.use": {
    type: "object",
    additionalProperties: false,
    required: ["reason"],
    properties: {
      instanceId: { type: "string", description: "必须复制当前背包中的 instanceId" },
      itemId: { type: "string" },
      name: { type: "string" },
      reason: { type: "string" },
    },
  },
  "item.equip": {
    type: "object",
    additionalProperties: false,
    required: ["reason"],
    properties: {
      instanceId: { type: "string", description: "必须复制当前背包中的 instanceId" },
      itemId: { type: "string" },
      name: { type: "string" },
      reason: { type: "string" },
    },
  },
  "item.unequip": {
    type: "object",
    additionalProperties: false,
    required: ["reason"],
    properties: {
      instanceId: { type: "string", description: "必须复制当前背包中的 instanceId" },
      itemId: { type: "string" },
      name: { type: "string" },
      reason: { type: "string" },
    },
  },
  "occult.contact": {
    type: "object",
    additionalProperties: false,
    required: ["entryId", "reason"],
    properties: {
      entryId: { type: "string", description: "当前场景中明确出现的非凡入口 ID" },
      reason: { type: "string", description: "玩家主动接触入口的理由" },
    },
  },
  "occult.reveal": {
    type: "object",
    additionalProperties: false,
    required: ["topic", "evidence", "reason"],
    properties: {
      topic: { type: "string", description: "已经接触到的有限神秘主题" },
      evidence: { type: "string", description: "玩家已经获得或观察到的证据" },
      reason: { type: "string", description: "本轮行动为何足以揭示该信息" },
    },
  },
  "relationship.update": {
    type: "object",
    additionalProperties: false,
    required: ["npcId", "delta", "reason"],
    properties: {
      npcId: { type: "string", description: "当前上下文中已知 NPC 的精确 ID" },
      delta: { type: "number", minimum: -10, maximum: 10, description: "本轮关系变化，范围为 -10 到 10" },
      note: { type: "string", description: "可选的关系变化说明" },
      reason: { type: "string", description: "与本轮玩家行动对应的关系变化理由" },
    },
  },
  "clue.add": {
    type: "object",
    additionalProperties: false,
    required: ["clue", "reason"],
    properties: {
      clue: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title"],
        properties: {
          id: { type: "string", description: "稳定且可去重的线索 ID" },
          title: { type: "string", description: "线索标题" },
          detail: { type: "string", description: "玩家已经确认的线索细节" },
        },
      },
      reason: { type: "string", description: "与本轮玩家行动对应的发现理由" },
    },
  },
};

const STATE_TOOL_NAMES = ["inventory.add", "inventory.remove", "inventory.update", "money.add", "money.remove", "money.inspect", "item.inspect", "item.use", "item.equip", "item.unequip", "occult.contact", "occult.reveal", "character.update", "status.add", "status.remove", "relationship.update", "location.move", "clue.add", "quest.add", "quest.update", "dice.check"];

const CHOICE_TOOL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["choices"],
  properties: {
    choices: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "intent", "risk"],
        properties: {
          label: { type: "string", description: "与当前场景紧密相关的具体行动" },
          intent: { type: "string", enum: ["investigate", "social", "dangerous"] },
          risk: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
  },
};

function toolDefinitions(toolSet = "state", allowedToolNames = null) {
  if (toolSet === "choices") {
    return [{ type: "function", function: { name: "ui__present_choices", description: "提交本轮三个真正不同的玩家行动选项。", parameters: CHOICE_TOOL_SCHEMA } }];
  }
  const allowed = Array.isArray(allowedToolNames) && allowedToolNames.length ? new Set(allowedToolNames) : null;
  const names = STATE_TOOL_NAMES.filter((name) => !allowed || allowed.has(name));
  return names.map((name) => ({ type: "function", function: { name: name.replace(".", "__"), description: `提议执行 ${name}；本地引擎将验证。`, parameters: TOOL_PARAMETER_SCHEMAS[name] || { type: "object", additionalProperties: true } } }));
}

function nativeCallsFromMessage(message, context = {}) {
  return (message.tool_calls || []).map((call) => {
    const rawArguments = call.function?.arguments || "";
    let args = {};
    let argsInvalid = false;
    try { args = JSON.parse(rawArguments || "{}"); } catch {
      args = {};
      argsInvalid = rawArguments.trim().length > 0;
    }
    const rawName = call.function?.name || call.name || call.tool;
    const name = String(rawName || "").replace("__", ".").trim();
    if (!name) return null;
    const argsInvalidCause = argsInvalid
      ? context.finishReason === "length" ? "length" : context.streamed ? "stream" : "json"
      : "";
    return { id: call.id, name, args, rawArguments, argsInvalid, argsInvalidCause, reason: args.reason || "AI 原生工具调用", native: true };
  }).filter(Boolean);
}

export function buildToolResultMessages(toolCalls, results, reasoningContent = "") {
  const calls = toolCalls.map((call, index) => ({
    id: call.id || `local-call-${index + 1}`,
    type: "function",
    function: {
      name: String(call.name || "unknown").replace(".", "__"),
      arguments: JSON.stringify({ ...(call.args || {}), reason: call.reason || "AI 原生工具调用" }),
    },
  }));
  const assistantMessage = { role: "assistant", content: null, tool_calls: calls };
  if (reasoningContent) assistantMessage.reasoning_content = reasoningContent;
  return [
    assistantMessage,
    ...calls.map((call, index) => {
      const result = results[index] || { ok: false, reason: "本地引擎没有返回执行结果" };
      return {
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify({ ok: result.ok, log: result.log, reason: result.reason || "", data: result.data || {} }),
      };
    }),
  ];
}

function assistantPayload(data) {
  const choice = data?.choices?.[0] || {};
  const message = choice.message || {};
  const candidates = [
    message.content,
    message.output_text,
    message.text,
    message.refusal,
    message.narrative,
    choice.text,
    choice.content,
    choice.output_text,
    data?.output_text,
    data?.response,
    data?.narrative,
    data?.content,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (Array.isArray(candidate) && textFromContent(candidate).trim()) return candidate;
    if (candidate && typeof candidate === "object" && Object.keys(candidate).length) return candidate;
  }
  if (data?.narrative !== undefined) return data;
  return "";
}

function emptyResponseError(finishReason, hasReasoning = false, metadata = {}) {
  if (finishReason === "length" || hasReasoning) {
    const error = new Error("模型用完了输出预算，但还没有生成剧情正文。可以提高 Max Tokens；系统会优先保留推理并自动补全，必要时才降低推理模式。");
    error.code = "REASONING_EXHAUSTED";
    error.finishReason = finishReason;
    error.hasReasoning = hasReasoning;
    error.metadata = metadata;
    return error;
  }
  const error = new Error("API 请求成功，但模型没有返回剧情正文。系统将尝试兼容模式恢复；若仍失败，请检查模型的响应格式。");
  error.code = "EMPTY_RESPONSE";
  error.finishReason = finishReason;
  error.metadata = metadata;
  return error;
}

function normalizeChatCompletion(data, requestMaxTokens = 0) {
  const choice = data?.choices?.[0] || {};
  const message = choice.message || {};
  const nativeCalls = nativeCallsFromMessage(message, { finishReason: choice.finish_reason, streamed: false });
  const payload = assistantPayload(data);
  if (!textFromContent(payload).trim() && !(payload && typeof payload === "object" && !Array.isArray(payload)) && !nativeCalls.length) {
    throw emptyResponseError(choice.finish_reason, Boolean(reasoningFromMessage(message).trim()), { ...responseMetadata(data), requestMaxTokens });
  }
  return { ...normalizeAIResponse(payload, nativeCalls), reasoningContent: reasoningFromMessage(message), responseMetadata: { ...responseMetadata(data), requestMaxTokens } };
}

function reasoningFromMessage(message = {}) {
  return textFromContent(message.reasoning_content || message.reasoning || message.thinking);
}

function responseMetadata(data = {}) {
  return {
    id: data.id || "",
    finishReason: data.choices?.[0]?.finish_reason || "",
    usage: data.usage || null,
  };
}

function nextToolCallIndex(calls) {
  return Math.max(-1, ...Object.keys(calls).map(Number).filter(Number.isFinite)) + 1;
}

function appendNameFragment(current, fragment) {
  if (!fragment || current === fragment) return current;
  return `${current}${fragment}`;
}

function appendToolCallFragments(calls, fragments = [], state = null) {
  if (state && !state.toolCallPositions) state.toolCallPositions = {};
  fragments.forEach((call, position) => {
    let index = call.index;
    if (index === undefined || index === null) {
      const matchingId = call.id
        ? Object.keys(calls).find((key) => calls[key]?.id === call.id)
        : undefined;
      if (matchingId !== undefined) index = matchingId;
      else if (call.id) index = nextToolCallIndex(calls);
      else if (state?.toolCallPositions[position] !== undefined) index = state.toolCallPositions[position];
      else if (state?.lastToolCallIndex !== undefined) index = state.lastToolCallIndex;
      else index = nextToolCallIndex(calls);
    }
    calls[index] ||= { id: call.id, function: { name: "", arguments: "" } };
    if (call.id) calls[index].id = call.id;
    if (call.function?.name) calls[index].function.name = appendNameFragment(calls[index].function.name, call.function.name);
    if (call.function?.arguments) calls[index].function.arguments += call.function.arguments;
    if (state) {
      state.lastToolCallIndex = index;
      state.toolCallPositions[position] = index;
    }
  });
}

function isOpenAIReasoningModel(model = "") {
  return /^(?:o\d|gpt-5)/i.test(model);
}

function applyReasoningSettings(body, settings, options) {
  const provider = settings.provider || inferApiProvider(settings.baseUrl);
  const selectedMode = options.forceDisableReasoning ? "off" : settings.reasoningMode || "auto";
  if (selectedMode === "auto") return;
  if (provider === "deepseek") {
    body.thinking = { type: selectedMode === "off" ? "disabled" : "enabled" };
    if (selectedMode !== "off") body.reasoning_effort = selectedMode === "low" ? "low" : selectedMode === "max" ? "max" : "high";
    return;
  }
  if (provider === "openai" && !isOpenAIReasoningModel(settings.model)) return;
  body.reasoning_effort = selectedMode === "off" ? "low" : selectedMode;
}

function applyProviderCompatibility(body, settings) {
  const provider = settings.provider || inferApiProvider(settings.baseUrl);
  if (provider !== "openai" || !isOpenAIReasoningModel(settings.model)) return;
  body.max_completion_tokens = body.max_tokens;
  delete body.max_tokens;
  delete body.temperature;
}

function requestMessages(messages, forceDisableReasoning) {
  if (!forceDisableReasoning) return messages;
  return messages.map((message) => {
    if (!message.reasoning_content) return message;
    const cleaned = { ...message };
    delete cleaned.reasoning_content;
    return cleaned;
  });
}

function estimatePromptTokens(messages = []) {
  const serialized = JSON.stringify(messages);
  // Conservative estimate for mixed Chinese/Latin prompts; the provider remains authoritative.
  return Math.ceil(serialized.length / 3);
}

function availableMaxTokens(settings, messages = []) {
  const contextLength = Number(settings.contextLength);
  const contextLimit = Number.isFinite(contextLength) && contextLength > 0 ? contextLength : 12000;
  const promptTokens = estimatePromptTokens(messages);
  const safetyMargin = Math.max(512, Math.ceil(contextLimit * 0.08));
  return Math.max(128, contextLimit - promptTokens - safetyMargin);
}

function autoMaxTokens(settings, messages, options) {
  const available = availableMaxTokens(settings, messages);
  const requested = Number(options.maxTokensOverride);
  return Math.round(Math.min(Number.isFinite(requested) && requested > 0 ? requested : available, available));
}

function safeMaxTokens(settings, options, messages = []) {
  const auto = options.maxTokensModeOverride === "auto"
    || (options.maxTokensModeOverride !== "manual" && (settings.maxTokensMode === "auto" || settings.maxTokens === "auto"));
  if (auto) return autoMaxTokens(settings, messages, options);
  const requested = Number(options.maxTokensOverride ?? settings.maxTokens);
  const normalized = Number.isFinite(requested) && requested > 0 ? Math.round(requested) : 1200;
  return Math.min(normalized, availableMaxTokens(settings, messages));
}

function reasoningHeadroom(settings, options) {
  if (options.maxTokensOverride !== undefined && options.maxTokensOverride !== null) return 0;
  const provider = settings.provider || inferApiProvider(settings.baseUrl);
  const mode = options.forceDisableReasoning ? "off" : settings.reasoningMode || "auto";
  if (provider !== "deepseek" || mode === "off") return 0;
  return { low: 1024, medium: 2048, high: 4096, max: 8192, auto: 2048 }[mode] ?? 2048;
}

function requestMaxTokens(settings, options, messages = []) {
  const base = safeMaxTokens(settings, options, messages);
  return Math.min(base + reasoningHeadroom(settings, options), availableMaxTokens(settings, messages));
}

export function expandedMaxTokensForRetry(settings, messages = [], currentMax = 0) {
  const current = Number(currentMax);
  const baseline = Number.isFinite(current) && current > 0 ? Math.round(current) : requestMaxTokens(settings, {}, messages);
  return Math.min(Math.max(baseline + 1600, Math.ceil(baseline * 2)), availableMaxTokens(settings, messages));
}

function parseStreamEventData(eventData, state, onChunk, onReasoningChunk) {
  const trimmed = eventData.trim();
  if (!trimmed || trimmed === "[DONE]") return;
  try {
    const packet = JSON.parse(trimmed);
    const choice = packet?.choices?.[0] || {};
    const delta = choice.delta || choice.message || {};
    const chunk = textFromContent(delta.content || delta.output_text || delta.text || delta.narrative || packet.output_text || packet.text);
    if (chunk) {
      state.content += chunk;
      onChunk?.(state.content);
    }
    const reasoningChunk = reasoningFromMessage(delta);
    if (reasoningChunk) {
      state.reasoningContent += reasoningChunk;
      onReasoningChunk?.(state.reasoningContent);
    }
    if (choice.finish_reason) state.finishReason = choice.finish_reason;
    appendToolCallFragments(state.calls, delta.tool_calls, state);
    if (packet.id) state.responseId = packet.id;
    if (packet.usage) state.usage = packet.usage;
  } catch {
    // Keepalive lines and provider-specific non-JSON events are ignored.
  }
}

async function readStreamResponse(response, onChunk, onReasoningChunk) {
  const reader = response.body?.getReader();
  if (!reader) return { content: "", calls: {}, finishReason: "", reasoningContent: "", responseId: "", usage: null, rawResponse: "" };
  const decoder = new TextDecoder();
  let buffer = "";
  let rawResponse = "";
  let eventLines = [];
  const state = { content: "", calls: {}, finishReason: "", reasoningContent: "", responseId: "", usage: null };
  const consumeEvent = (event) => {
    const dataLines = event.split(/\r?\n/).filter((line) => line.trimStart().startsWith("data:"));
    if (dataLines.length) parseStreamEventData(dataLines.map((line) => line.slice(line.indexOf(":") + 1).trimStart()).join("\n"), state, onChunk, onReasoningChunk);
  };
  const consumeBuffer = (flush = false) => {
    const hasLineBreak = /\r?\n/.test(buffer);
    if (!flush && !hasLineBreak) return;
    const lines = buffer.split(/\r?\n/);
    buffer = flush ? "" : (lines.pop() || "");
    lines.forEach((line) => {
      if (!line.trim()) {
        consumeEvent(eventLines.join("\n"));
        eventLines = [];
      } else {
        eventLines.push(line);
      }
    });
    if (flush && buffer.trim()) eventLines.push(buffer);
    if (flush && eventLines.length) {
      consumeEvent(eventLines.join("\n"));
      eventLines = [];
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const decoded = decoder.decode(value, { stream: true });
    rawResponse += decoded;
    buffer += decoded;
    consumeBuffer();
  }
  const finalChunk = decoder.decode();
  rawResponse += finalChunk;
  buffer += finalChunk;
  consumeBuffer(true);
  return { ...state, rawResponse };
}

export async function requestAI(settings, messages, signal, onChunk, options = {}) {
  const maxTokens = requestMaxTokens(settings, options, messages);
  const body = {
    model: settings.model,
    messages: requestMessages(messages, options.forceDisableReasoning),
    temperature: Number(settings.temperature),
    max_tokens: maxTokens,
    stream: options.streamOverride ?? Boolean(settings.stream),
  };
  applyReasoningSettings(body, settings, options);
  applyProviderCompatibility(body, settings);
  if (settings.jsonMode && !options.disableJsonMode) body.response_format = { type: "json_object" };
  if (settings.nativeTools && !options.disableTools) {
    const definitions = toolDefinitions(options.toolSet || "state", options.allowedToolNames);
    if (definitions.length) body.tools = definitions;
  }
  const response = await fetch(endpoint(settings.baseUrl, "/chat/completions"), {
    method: "POST", signal,
    headers: requestHeaders(settings, true),
    body: JSON.stringify(body),
  });
  if (!response.ok) await apiError(response, "API 请求失败");
  const contentType = response.headers.get("content-type") || "";
  if (!body.stream || contentType.includes("application/json")) {
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch {
      if (raw.trim()) return { ...normalizeAIResponse(raw), responseMetadata: { contentType, rawLength: raw.length, requestMaxTokens: maxTokens } };
      throw emptyResponseError("", false, { contentType, rawLength: raw.length, requestMaxTokens: maxTokens });
    }
    return normalizeChatCompletion(data, maxTokens);
  }
  const streamed = await readStreamResponse(response, onChunk, options.onReasoningChunk);
  const nativeCalls = nativeCallsFromMessage({ tool_calls: Object.values(streamed.calls) }, { finishReason: streamed.finishReason, streamed: true });
  if (!streamed.content.trim() && !nativeCalls.length) {
    try {
      const parsed = JSON.parse(streamed.rawResponse.trim());
      return normalizeChatCompletion(parsed, maxTokens);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      const rawText = streamed.rawResponse.trim();
      const protocolOnly = rawText.split(/\r?\n/).every((line) => !line.trim() || /^(?:data:|event:|\[DONE\])/.test(line.trim()));
      if (rawText && !protocolOnly) return { ...normalizeAIResponse(rawText), responseMetadata: { finishReason: streamed.finishReason, id: streamed.responseId, usage: streamed.usage, contentType, rawLength: streamed.rawResponse.length, requestMaxTokens: maxTokens } };
      throw emptyResponseError(streamed.finishReason, Boolean(streamed.reasoningContent.trim()), { finishReason: streamed.finishReason, id: streamed.responseId, usage: streamed.usage, contentType, requestMaxTokens: maxTokens });
    }
  }
  return { ...normalizeAIResponse(streamed.content, nativeCalls), reasoningContent: streamed.reasoningContent, responseMetadata: { finishReason: streamed.finishReason, id: streamed.responseId, usage: streamed.usage, contentType, requestMaxTokens: maxTokens } };
}

export async function requestAIWithReasoningFallback(settings, messages, signal, onChunk, options = {}) {
  try {
    return await requestAI(settings, messages, signal, onChunk, options);
  } catch (error) {
    const shouldRetry = ["REASONING_EXHAUSTED", "EMPTY_RESPONSE"].includes(error.code)
      && settings.autoRetryReasoning !== false
      && !options.forceDisableReasoning;
    if (!shouldRetry) throw error;
    const currentMax = error.metadata?.requestMaxTokens || requestMaxTokens(settings, options, messages);
    const expandedMax = expandedMaxTokensForRetry(settings, messages, currentMax);
    options.onReasoningRecovery?.({ error, maxTokens: expandedMax });
    onChunk?.("");
    try {
      return await requestAI(settings, messages, signal, onChunk, { ...options, maxTokensOverride: expandedMax, recoveryAttempt: 1 });
    } catch (retryError) {
      if (retryError.name === "AbortError") throw retryError;
      options.onReasoningFallback?.();
      onChunk?.("");
      try {
        return await requestAI(settings, messages, signal, onChunk, { ...options, forceDisableReasoning: true, disableTools: true, disableJsonMode: true, recoveryAttempt: 2 });
      } catch (finalError) {
        if (finalError.name !== "AbortError") {
          finalError.message = `保留推理并自动补全后仍未完成：${finalError.message}`;
          finalError.autoFallbackAttempted = true;
        }
        throw finalError;
      }
    }
  }
}
