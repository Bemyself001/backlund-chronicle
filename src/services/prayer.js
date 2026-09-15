import { requestAIWithReasoningFallback } from "./api.js";

export function validatePrayer(text) {
  const prayer = String(text || "").trim();
  if (!prayer || Array.from(prayer).length > 200) throw new Error("祷文为空或超过 200 字，请重新祷告。");
  return prayer;
}

export async function generatePrayer(church, settings, signal) {
  if (signal?.aborted) throw new DOMException("祷告已取消", "AbortError");
  if (settings.mockMode) {
    const wishes = ["愿我在纷扰中守住内心的安宁", "愿我能以清醒的心面对未知", "愿我记住今日所得的平静"];
    return `${church.deity}啊，${wishes[Math.floor(Math.random() * wishes.length)]}。我在此献上诚挚的祈愿，默念${church.themes}。`;
  }
  const response = await requestAIWithReasoningFallback(settings, [
    { role: "system", content: "为文字游戏创作一段第一人称中文祷文，50至180字，绝不超过200字。每次独立创作措辞。只输出祷文正文，不要标题、JSON、环境描写、工具调用、属性变化或神明回应。严格围绕指定神明及信仰主题，不混用其他神明。" },
    { role: "user", content: JSON.stringify(church) },
  ], signal, undefined, { rawContent: true, disableTools: true, disableJsonMode: true, streamOverride: false, forceDisableReasoning: true, maxTokensModeOverride: "manual", maxTokensOverride: 800 });
  if (signal?.aborted) throw new DOMException("祷告已取消", "AbortError");
  return validatePrayer(response.content);
}
