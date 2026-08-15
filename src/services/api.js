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

function assistantPayload(data) {
  const choice = data?.choices?.[0] || {};
  const message = choice.message || {};
  if (message.content !== undefined && message.content !== null) return message.content;
  if (choice.text !== undefined && choice.text !== null) return choice.text;
  if (data?.output_text !== undefined && data.output_text !== null) return data.output_text;
  if (data?.narrative !== undefined) return data;
  return "";
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

export async function requestAI(settings, messages, signal, onChunk) {
  const body = {
    model: settings.model,
    messages,
    temperature: Number(settings.temperature),
    max_tokens: Number(settings.maxTokens),
    stream: Boolean(settings.stream),
  };
  if (settings.jsonMode) body.response_format = { type: "json_object" };
  if (settings.nativeTools) body.tools = toolDefinitions();
  const response = await fetch(endpoint(settings.baseUrl, "/chat/completions"), {
    method: "POST", signal,
    headers: requestHeaders(settings, true),
    body: JSON.stringify(body),
  });
  if (!response.ok) await apiError(response, "API 请求失败");
  if (!settings.stream) {
    const data = await response.json();
    const message = data.choices?.[0]?.message || {};
    return normalizeAIResponse(assistantPayload(data), nativeCallsFromMessage(message));
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const calls = {};
  const consumeLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:") || trimmed.includes("[DONE]")) return;
    try {
      const delta = JSON.parse(trimmed.slice(5).trim()).choices?.[0]?.delta || {};
      const chunk = textFromContent(delta.content);
      if (chunk) { content += chunk; onChunk?.(content); }
      appendToolCallFragments(calls, delta.tool_calls);
    } catch { /* ignore non-JSON keepalive chunks */ }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    lines.forEach(consumeLine);
  }
  buffer += decoder.decode();
  buffer.split("\n").forEach(consumeLine);
  return normalizeAIResponse(content, nativeCallsFromMessage({ tool_calls: Object.values(calls) }));
}
