import { SPECIAL_CONTACTS } from "../content/index.js";

export function medicinePurchaseGate(game) {
  const rule = SPECIAL_CONTACTS.medicinePurchaseUnlock;
  const state = game.triggerState || {};
  const completed = state.facts?.[rule.completedFact];
  if ((completed?.value ?? completed) === true) return "";
  const started = [...(state.active || []), ...(state.history || [])].some((entry) =>
    entry.definitionId === rule.triggerId
    && (entry.status === "engaged" || entry.status === "completed" || Number.isInteger(entry.engagedTurn)));
  return started ? "" : `开始追查「${rule.title}」后可购买药剂`;
}
