import { DEFAULT_API_SETTINGS } from "../data/defaults.js";
import { normalizeAIResponse } from "./protocol.js";

const SETTINGS_KEY = "mist-api-settings-v1";
const SESSION_KEY = "mist-api-key";

export function loadApiSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch { saved = {}; }
  const apiKey = sessionStorage.getItem(SESSION_KEY) || (saved.persistKey ? saved.apiKey || "" : "");
  return { ...DEFAULT_API_SETTINGS, ...saved, apiKey };
}

export function saveApiSettings(settings) {
  if (settings.apiKey) sessionStorage.setItem(SESSION_KEY, settings.apiKey);
  else sessionStorage.removeItem(SESSION_KEY);
  const stored = { ...settings };
  if (!settings.persistKey) delete stored.apiKey;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored));
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

export async function testApiConnection(settings, signal) {
  if (settings.mockMode) return "Mock 模式就绪：无需网络连接。";
  if (!settings.baseUrl || !settings.model) throw new Error("请填写 Base URL 和 Model。");
  const response = await fetch(endpoint(settings.baseUrl, "/models"), {
    signal,
    headers: { Authorization: `Bearer ${settings.apiKey}`, ...parseHeaders(settings.customHeaders) },
  });
  if (!response.ok) throw new Error(`连接失败：HTTP ${response.status}`);
  return "连接成功，接口可以访问。";
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
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}`, ...parseHeaders(settings.customHeaders) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`API 请求失败：HTTP ${response.status}`);
  if (!settings.stream) {
    const data = await response.json();
    const message = data.choices?.[0]?.message || {};
    return normalizeAIResponse(message.content || "{}", nativeCallsFromMessage(message));
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const calls = {};
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:") || line.includes("[DONE]")) continue;
      try {
        const delta = JSON.parse(line.slice(5)).choices?.[0]?.delta || {};
        if (delta.content) { content += delta.content; onChunk?.(content); }
        for (const call of delta.tool_calls || []) {
          calls[call.index] ||= { id: call.id, function: { name: "", arguments: "" } };
          if (call.function?.name) calls[call.index].function.name += call.function.name;
          if (call.function?.arguments) calls[call.index].function.arguments += call.function.arguments;
        }
      } catch { /* ignore non-JSON keepalive chunks */ }
    }
  }
  return normalizeAIResponse(content || "{}", nativeCallsFromMessage({ tool_calls: Object.values(calls) }));
}

