const FALLBACK_CHOICES = [
  { label: "留在原地继续观察", intent: "investigate", risk: "low" },
  { label: "向在场的人谨慎打听", intent: "social", risk: "medium" },
  { label: "冒险追查最异常的迹象", intent: "dangerous", risk: "high" },
];

export function extractJson(text = "") {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(cleaned); } catch { /* extract the first object */ }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error("AI 返回中没有可解析的 JSON 对象。可重试本轮或切换 Mock 模式。");
}

export function normalizeAIResponse(raw, nativeToolCalls = []) {
  const parsed = typeof raw === "string" ? extractJson(raw) : raw;
  if (!parsed || typeof parsed !== "object") throw new Error("AI 返回格式不是对象。");
  const narrative = typeof parsed.narrative === "string" && parsed.narrative.trim()
    ? parsed.narrative.trim()
    : "雾中的细节暂时无法拼成完整叙述。你可以重试，或换一种行动方式。";
  const choices = Array.isArray(parsed.choices) ? parsed.choices.slice(0, 3).map((choice, index) => ({
    label: String(choice?.label || FALLBACK_CHOICES[index].label),
    intent: ["investigate", "social", "dangerous"].includes(choice?.intent) ? choice.intent : FALLBACK_CHOICES[index].intent,
    risk: ["low", "medium", "high"].includes(choice?.risk) ? choice.risk : FALLBACK_CHOICES[index].risk,
  })) : [];
  while (choices.length < 3) choices.push(FALLBACK_CHOICES[choices.length]);
  return {
    narrative,
    choices,
    toolCalls: [...(Array.isArray(parsed.toolCalls) ? parsed.toolCalls : []), ...nativeToolCalls],
    memoryNotes: Array.isArray(parsed.memoryNotes) ? parsed.memoryNotes.map(String).slice(0, 5) : [],
    worldEvents: Array.isArray(parsed.worldEvents) ? parsed.worldEvents.map(String).slice(0, 5) : [],
  };
}

