import { STAT_LABELS } from "../engine/statChanges.js";
import { formatSignedMoney } from "../system/money.js";

export const READING_KEY = "mist-reading-preferences";
export const RISK_LABELS = { low: "低风险", medium: "中风险", high: "高风险", unknown: "风险未标注" };

export function choiceStatusMessage(meta) {
  const reason = {
    timeout: "行动建议补全超时",
    cancelled: "行动建议补全已中止",
    request_failed: "行动建议请求失败",
    response_truncated: "行动建议响应被截断",
    tool_arguments_truncated: "行动建议响应被截断",
    invalid_tool_arguments: "行动建议格式未能解析",
  }[meta?.reason] || "行动建议未完整返回";
  return `本轮剧情已保存。${reason}，你可以使用已有建议、重新补全或自由输入行动。`;
}

export function normalizeReadingPreferences(value) {
  return {
    theme: value?.theme === "night" ? "night" : "paper",
    fontSize: Math.max(16, Math.min(22, Number(value?.fontSize) || 18)),
  };
}

export function shouldSubmitAction(event) {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing
    && !event.nativeEvent?.isComposing && event.keyCode !== 229;
}

// Display only locally confirmed changes. Never extract state from narrative text.
export function getAuditRows(audit) {
  if (!audit) return [];
  const inventory = audit.inventory || {};
  return [
    ...Object.entries(audit.character?.stats || {}).map(([key, value]) => ({
      tone: value.delta < 0 ? "loss" : "gain",
      text: `${STAT_LABELS[key] || key} ${value.before} → ${value.after}（${value.delta > 0 ? "+" : ""}${value.delta}）`,
    })),
    ...(audit.money?.hasChanges ? [{ tone: audit.money.deltaPence < 0 ? "loss" : "gain", text: `资金 ${formatSignedMoney(audit.money.deltaPence)}` }] : []),
    ...(inventory.gained || []).map(item => ({ tone: "gain", text: `获得「${item.name}」×${item.quantity}` })),
    ...(inventory.lost || []).map(item => ({ tone: "loss", text: `失去「${item.name}」×${item.quantity}` })),
    ...(inventory.equipped || []).map(item => ({ tone: "update", text: `装备「${item.name}」` })),
    ...(inventory.unequipped || []).map(item => ({ tone: "update", text: `卸下「${item.name}」` })),
    ...(inventory.updated || []).map(item => ({ tone: "update", text: `更新「${item.name}」` })),
    ...(audit.character?.advancementChanged ? [{ tone: "gain", text: `非凡档案：${audit.character.beforeAdvancement.sequenceLabel} → ${audit.character.afterAdvancement.pathwayName || ""}${audit.character.afterAdvancement.sequenceLabel}` }] : []),
  ];
}
