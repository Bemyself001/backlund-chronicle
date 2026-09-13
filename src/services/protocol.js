import { choiceResult, normalizeChoices } from "./choices.js";

function firstBalancedObject(text) {
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, index + 1)); } catch { break; }
        }
      }
    }
  }
  return null;
}

export function textFromContent(content) {
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && !Array.isArray(content)) {
    if (typeof content.text === "string") return content.text;
    if (typeof content.text?.value === "string") return content.text.value;
    if (typeof content.content === "string") return content.content;
    if (typeof content.value === "string") return content.value;
    return "";
  }
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (typeof part?.text === "string") return part.text;
    if (typeof part?.text?.value === "string") return part.text.value;
    if (typeof part?.content === "string") return part.content;
    return "";
  }).filter(Boolean).join("\n");
}

export function extractJson(text = "") {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(cleaned); } catch { /* scan for an embedded object */ }
  const parsed = firstBalancedObject(cleaned);
  if (parsed) return parsed;
  throw new Error("AI 返回中没有可解析的 JSON 对象。可重试本轮或切换 Mock 模式。");
}

function responseObject(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  const responseText = textFromContent(raw).trim();
  if (!responseText) return {};
  try {
    return extractJson(responseText);
  } catch {
    return { narrative: responseText, protocolWarning: "接口返回了普通文本，已按兼容模式继续。" };
  }
}

function hasToolName(call) {
  const name = call?.name || call?.tool || call?.function?.name;
  return typeof name === "string" && name.trim().length > 0;
}

export function normalizeAIResponse(raw, nativeToolCalls = []) {
  const parsed = responseObject(raw);
  const candidate = parsed.narrative ?? parsed.response ?? parsed.content ?? parsed.text ?? parsed.message;
  const narrativeText = textFromContent(candidate) || (typeof candidate === "string" ? candidate : "");
  const hasNarrative = Boolean(narrativeText.trim());
  const narrative = narrativeText.trim()
    || (nativeToolCalls.length ? "命运的齿轮轻轻转动。本轮状态提议正由本地规则校验。" : "雾中的细节暂时无法拼成完整叙述。你可以重试，或换一种行动方式。");
  const choiceToolCalls = nativeToolCalls.filter((call) => call.name === "ui.present_choices");
  const nativeStateCalls = nativeToolCalls.filter((call) => call.name !== "ui.present_choices");
  const candidates = [...choiceToolCalls.map((call) => call.args?.choices), parsed.choices, parsed.actions, parsed.options, parsed.nextActions, parsed.next_actions, parsed.suggestions].filter(Array.isArray);
  const rawChoices = candidates.flat();
  const choices = normalizeChoices(rawChoices);
  const invalidCall = choiceToolCalls.find((call) => call.argsInvalid);
  const reason = invalidCall ? (invalidCall.argsInvalidCause === "length" ? "tool_arguments_truncated" : "invalid_tool_arguments")
    : !rawChoices.length ? "missing_choices" : choices.length < Math.min(3, rawChoices.length) ? "invalid_or_duplicate_labels" : "choice_count";
  const { choiceMeta } = choiceResult(choices, reason);
  const rawProtocolToolCalls = parsed.toolCalls ?? parsed.tool_calls;
  const protocolToolCalls = Array.isArray(rawProtocolToolCalls) ? rawProtocolToolCalls.filter(hasToolName) : [];
  const ignoredToolCalls = Array.isArray(rawProtocolToolCalls) ? rawProtocolToolCalls.length - protocolToolCalls.length : 0;
  const memoryNotes = parsed.memoryNotes ?? parsed.memory_notes;
  const worldEvents = parsed.worldEvents ?? parsed.world_events;
  const baseProtocolWarning = parsed.protocolWarning || (choices.length < 3 ? "行动建议未完整返回，已保留收到的有效选项。" : "");
  const protocolWarning = [baseProtocolWarning, ignoredToolCalls ? `模型返回了 ${ignoredToolCalls} 条不完整工具调用，已忽略。` : ""].filter(Boolean).join(" ");
  return {
    narrative,
    choices,
    toolCalls: [...(Array.isArray(protocolToolCalls) ? protocolToolCalls : []), ...nativeStateCalls],
    memoryNotes: Array.isArray(memoryNotes) ? memoryNotes.map(String).slice(0, 5) : [],
    worldEvents: Array.isArray(worldEvents) ? worldEvents.map(String).slice(0, 5) : [],
    protocolWarning,
    choiceMeta,
    hasNarrative,
    requiresToolFollowUp: nativeStateCalls.length > 0,
  };
}
