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

function toolDefinitions() {
  const names = ["inventory.add", "inventory.remove", "inventory.update", "item.inspect", "item.use", "item.equip", "item.unequip", "character.update", "status.add", "status.remove", "relationship.update", "location.move", "clue.add", "quest.add", "quest.update", "dice.check"];
  return names.map((name) => ({ type: "function", function: { name: name.replace(".", "__"), description: `提议执行 ${name}；本地引擎将验证。`, parameters: { type: "object", additionalProperties: true } } }));
}

function nativeCallsFromMessage(message) {
  return (message.tool_calls || []).map((call) => {
    let args = {};
    try { args = JSON.parse(call.function?.arguments || "{}"); } catch { args = {}; }
    return { id: call.id, name: call.function?.name?.replace("__", "."), args, reason: args.reason || "AI 原生工具调用" };
  });
}

export function buildToolResultMessages(toolCalls, results, reasoningContent = "") {
  const calls = toolCalls.map((call, index) => ({
    id: call.id || `local-call-${index + 1}`,
    type: "function",
    function: {
      name: String(call.name || "unknown").replace(".", "__"),
      arguments: JSON.stringify(call.args || {}),
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
    { role: "system", content: "【本地工具结果已返回】现在生成本轮最终剧情正文与恰好三个差异化行动选项。只确认 ok=true 的变化；对失败结果可自然描述为行动受阻，但不要重复工具调用。必须返回约定的合法 JSON 对象。" },
  ];
}

function assistantPayload(data) {
  const choice = data?.choices?.[0] || {};
  const message = choice.message || {};
  const candidates = [message.content, message.output_text, message.text, message.refusal, choice.text, choice.content, data?.output_text, data?.response, data?.content];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (Array.isArray(candidate) && textFromContent(candidate).trim()) return candidate;
    if (candidate && typeof candidate === "object" && Object.keys(candidate).length) return candidate;
  }
  if (data?.narrative !== undefined) return data;
  return "";
}

function emptyResponseError(finishReason, hasReasoning = false) {
  if (finishReason === "length" || hasReasoning) {
    const error = new Error("模型用完了输出预算，但还没有生成剧情正文。请关闭或降低推理模式、提高 Max Tokens，或改用非推理模型后重试本轮。");
    error.code = "REASONING_EXHAUSTED";
    error.finishReason = finishReason;
    return error;
  }
  return new Error("API 请求成功，但模型没有返回剧情正文。请先关闭“流式输出”后重试；若仍为空，再关闭“原生 Tool Calling”或更换模型。");
}

function normalizeChatCompletion(data) {
  const choice = data?.choices?.[0] || {};
  const message = choice.message || {};
  const nativeCalls = nativeCallsFromMessage(message);
  const payload = assistantPayload(data);
  if (!textFromContent(payload).trim() && !(payload && typeof payload === "object" && !Array.isArray(payload)) && !nativeCalls.length) {
    throw emptyResponseError(choice.finish_reason, Boolean(textFromContent(message.reasoning_content).trim()));
  }
  return { ...normalizeAIResponse(payload, nativeCalls), reasoningContent: textFromContent(message.reasoning_content) };
}

function appendToolCallFragments(calls, fragments = []) {
  for (const call of fragments) {
    const index = call.index ?? Object.keys(calls).length;
    calls[index] ||= { id: call.id, function: { name: "", arguments: "" } };
    if (call.id) calls[index].id = call.id;
    if (call.function?.name) calls[index].function.name += call.function.name;
    if (call.function?.arguments) calls[index].function.arguments += call.function.arguments;
  }
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
    if (selectedMode !== "off") body.reasoning_effort = "high";
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

export async function requestAI(settings, messages, signal, onChunk, options = {}) {
  const body = {
    model: settings.model,
    messages: requestMessages(messages, options.forceDisableReasoning),
    temperature: Number(settings.temperature),
    max_tokens: Number(settings.maxTokens),
    stream: Boolean(settings.stream),
  };
  applyReasoningSettings(body, settings, options);
  applyProviderCompatibility(body, settings);
  if (settings.jsonMode) body.response_format = { type: "json_object" };
  if (settings.nativeTools && !options.disableTools) body.tools = toolDefinitions();
  const response = await fetch(endpoint(settings.baseUrl, "/chat/completions"), {
    method: "POST", signal,
    headers: requestHeaders(settings, true),
    body: JSON.stringify(body),
  });
  if (!response.ok) await apiError(response, "API 请求失败");
  const contentType = response.headers.get("content-type") || "";
  if (!settings.stream || contentType.includes("application/json")) {
    const data = await response.json();
    return normalizeChatCompletion(data);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawResponse = "";
  let content = "";
  const calls = {};
  let finishReason = "";
  let reasoningContent = "";
  const consumeLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:") || trimmed.includes("[DONE]")) return;
    try {
      const choice = JSON.parse(trimmed.slice(5).trim()).choices?.[0] || {};
      const delta = choice.delta || choice.message || {};
      const chunk = textFromContent(delta.content);
      if (chunk) { content += chunk; onChunk?.(content); }
      reasoningContent += textFromContent(delta.reasoning_content);
      if (choice.finish_reason) finishReason = choice.finish_reason;
      appendToolCallFragments(calls, delta.tool_calls);
    } catch { /* ignore non-JSON keepalive chunks */ }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const decoded = decoder.decode(value, { stream: true });
    rawResponse += decoded;
    buffer += decoded;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    lines.forEach(consumeLine);
  }
  const finalChunk = decoder.decode();
  rawResponse += finalChunk;
  buffer += finalChunk;
  buffer.split("\n").forEach(consumeLine);
  const nativeCalls = nativeCallsFromMessage({ tool_calls: Object.values(calls) });
  if (!content.trim() && !nativeCalls.length) {
    try { return normalizeChatCompletion(JSON.parse(rawResponse.trim())); } catch (error) {
      if (error instanceof SyntaxError) throw emptyResponseError(finishReason, Boolean(reasoningContent.trim()));
      throw error;
    }
  }
  return { ...normalizeAIResponse(content, nativeCalls), reasoningContent };
}

export async function requestAIWithReasoningFallback(settings, messages, signal, onChunk, options = {}) {
  try {
    return await requestAI(settings, messages, signal, onChunk, options);
  } catch (error) {
    const shouldRetry = error.code === "REASONING_EXHAUSTED"
      && settings.autoRetryReasoning !== false
      && (settings.reasoningMode || "auto") !== "off"
      && !options.forceDisableReasoning;
    if (!shouldRetry) throw error;
    options.onReasoningFallback?.();
    onChunk?.("");
    try {
      return await requestAI(settings, messages, signal, onChunk, { ...options, forceDisableReasoning: true });
    } catch (retryError) {
      if (retryError.name !== "AbortError") {
        retryError.message = `自动降低推理后仍未完成：${retryError.message}`;
        retryError.autoFallbackAttempted = true;
      }
      throw retryError;
    }
  }
}
