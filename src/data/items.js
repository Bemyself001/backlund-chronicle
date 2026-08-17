export const ITEM_IMPORTANCE = {
  NORMAL: "normal",
  IMPORTANT: "important",
};

export const IMPORTANT_ITEM_TAGS = new Set(["重要物品", "关键物品", "任务物品", "关键证据", "非凡物品"]);

export function isMoneyItem(item = {}) {
  return item.itemId === "copper-coins" || item.category === "货币";
}

export function normalizeItemImportance(item = {}) {
  if (isMoneyItem(item)) return ITEM_IMPORTANCE.NORMAL;
  const tags = Array.isArray(item.tags) ? item.tags : [];
  return item.importance === ITEM_IMPORTANCE.IMPORTANT || tags.some((tag) => IMPORTANT_ITEM_TAGS.has(tag))
    ? ITEM_IMPORTANCE.IMPORTANT
    : ITEM_IMPORTANCE.NORMAL;
}

export function normalizeInventoryItem(item = {}) {
  return { ...item, importance: normalizeItemImportance(item) };
}

export function isImportantNonMoneyItem(item = {}) {
  return !isMoneyItem(item) && normalizeItemImportance(item) === ITEM_IMPORTANCE.IMPORTANT;
}
