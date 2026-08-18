import { PATHWAYS, getPathway, pathwayIdForName } from "./pathways.js";

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
  if (normalizePotion(item)) return ITEM_IMPORTANCE.IMPORTANT;
  const tags = Array.isArray(item.tags) ? item.tags : [];
  return item.importance === ITEM_IMPORTANCE.IMPORTANT || tags.some((tag) => IMPORTANT_ITEM_TAGS.has(tag))
    ? ITEM_IMPORTANCE.IMPORTANT
    : ITEM_IMPORTANCE.NORMAL;
}

export function normalizeInventoryItem(item = {}) {
  const { potion: _discardedPotion, ...base } = item;
  const potion = normalizePotion(item) || parseLegacyPotion(item);
  return { ...base, ...(potion ? { potion } : {}), importance: normalizeItemImportance({ ...item, potion }) };
}

export function isImportantNonMoneyItem(item = {}) {
  return !isMoneyItem(item) && normalizeItemImportance(item) === ITEM_IMPORTANCE.IMPORTANT;
}

export function normalizePotion(item = {}) {
  const raw = item?.potion;
  if (!raw || typeof raw !== "object") return null;
  const pathwayId = String(raw.pathwayId || pathwayIdForName(raw.pathwayName) || "").trim();
  const pathway = getPathway(pathwayId);
  const sequence = Number(raw.sequence);
  if (!pathway || !Number.isInteger(sequence) || sequence < 0 || sequence > 9) return null;
  return { pathwayId, pathwayName: pathway.name, sequence, identified: raw.identified === true };
}

function parseLegacyPotion(item = {}) {
  const name = String(item.name || "");
  if (!name.includes("魔药")) return null;
  const pathway = PATHWAYS.find((entry) => name.includes(entry.name));
  const sequenceMatch = name.match(/序列\s*([0-9])/);
  if (!pathway || !sequenceMatch) return null;
  return { pathwayId: pathway.id, pathwayName: pathway.name, sequence: Number(sequenceMatch[1]), identified: true };
}

export function isPotion(item = {}) {
  return Boolean(normalizePotion(item) || parseLegacyPotion(item));
}

export function playerVisibleItem(item = {}) {
  const visible = { ...item };
  delete visible.hiddenInfo;
  const potion = normalizePotion(item);
  if (potion?.identified) visible.potion = potion;
  else if (potion) {
    delete visible.potion;
    visible.potionStatus = "unidentified";
  }
  return visible;
}
