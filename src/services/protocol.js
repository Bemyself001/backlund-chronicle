const FALLBACK_CHOICES = [
  { label: "留在原地继续观察", intent: "investigate", risk: "low" },
  { label: "向在场的人谨慎打听", intent: "social", risk: "medium" },
  { label: "冒险追查最异常的迹象", intent: "dangerous", risk: "high" },
];

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

function normalizeChoice(choice, index) {
  const fallback = FALLBACK_CHOICES[index];
  const label = typeof choice === "string" ? choice : choice?.label;
  return {
    label: String(label || fallback.label),
    intent: ["investigate", "social", "dangerous"].includes(choice?.intent) ? choice.intent : fallback.intent,
    risk: ["low", "medium", "high"].includes(choice?.risk) ? choice.risk : fallback.risk,
  };
}

export function normalizeAIResponse(raw, nativeToolCalls = []) {
  const parsed = responseObject(raw);
  const candidate = parsed.narrative ?? parsed.response ?? parsed.content ?? parsed.text ?? parsed.message;
  const narrativeText = textFromContent(candidate) || (typeof candidate === "string" ? candidate : "");
  const narrative = narrativeText.trim()
    || (nativeToolCalls.length ? "命运的齿轮轻轻转动。本轮状态提议正由本地规则校验。" : "雾中的细节暂时无法拼成完整叙述。你可以重试，或换一种行动方式。");
  const sourceChoices = parsed.choices ?? parsed.actions ?? parsed.options;
  const choices = Array.isArray(sourceChoices) ? sourceChoices.slice(0, 3).map(normalizeChoice) : [];
  while (choices.length < 3) choices.push({ ...FALLBACK_CHOICES[choices.length] });
  const protocolToolCalls = parsed.toolCalls ?? parsed.tool_calls;
  const memoryNotes = parsed.memoryNotes ?? parsed.memory_notes;
  const worldEvents = parsed.worldEvents ?? parsed.world_events;
  return {
    narrative,
    choices,
    toolCalls: [...(Array.isArray(protocolToolCalls) ? protocolToolCalls : []), ...nativeToolCalls],
    memoryNotes: Array.isArray(memoryNotes) ? memoryNotes.map(String).slice(0, 5) : [],
    worldEvents: Array.isArray(worldEvents) ? worldEvents.map(String).slice(0, 5) : [],
    protocolWarning: parsed.protocolWarning || "",
  };
}
