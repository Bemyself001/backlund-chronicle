import { PATHWAYS, getPathway, pathwayIdForName } from "../content/index.js";
import { normalizeTalismanItem } from "./talismans.js";

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
  return normalizeTalismanItem({ ...base, ...(potion ? { potion, tags: [...new Set([...(Array.isArray(item.tags) ? item.tags : []), "魔药", "消耗品"])] } : {}), importance: normalizeItemImportance({ ...item, potion }) });
}

export function isImportantNonMoneyItem(item = {}) {
  return !isMoneyItem(item) && normalizeItemImportance(item) === ITEM_IMPORTANCE.IMPORTANT;
}

export function normalizePotion(item = {}) {
  if (excludedPotionName(item.name)) return null;
  const raw = item?.potion;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return parseLegacyPotion(item);
  const pathwayId = String(raw.pathwayId || pathwayIdForName(raw.pathwayName) || "").trim();
  const pathway = getPathway(pathwayId);
  const sequence = raw.sequence === null || raw.sequence === "" ? NaN : Number(raw.sequence);
  if (!pathway || !Number.isInteger(sequence) || sequence < 0 || sequence > 9) return { identified: false };
  return { pathwayId, pathwayName: pathway.name, sequence, identified: raw.identified === true };
}

function excludedPotionName(name) {
  return /配方|材料|原料|空瓶|药膏|药剂|笔记|书籍|残渣/.test(String(name || ""));
}

export function parseLegacyPotion(item = {}) {
  const name = String(item.name || "").replace(/\s|[「」“”"']/g, "").replace(/^(?:一瓶|一份|成品)/, "");
  if (!name.includes("魔药") || excludedPotionName(name)) return null;
  if (item.potion && typeof item.potion === "object") return null;
  for (const pathway of PATHWAYS) {
    for (let sequence = 0; sequence <= 9; sequence += 1) {
      const rank = pathway.sequences[9 - sequence];
      const accepted = [`${rank}魔药`, `魔药（${rank}）`, `魔药(${rank})`, `${pathway.name}序列${sequence}魔药`, `${pathway.name}途径序列${sequence}魔药`, `${pathway.name}（序列${sequence}）魔药`, `${rank}（序列${sequence}）魔药`];
      if (accepted.includes(name)) return { pathwayId: pathway.id, pathwayName: pathway.name, sequence, identified: true };
    }
  }
  // Recognition and identification are separate: an unknown bottle is still a potion.
  return /魔药(?:[（(][^）)]*[）)])?$/.test(name) ? { identified: false } : null;
}

export function isPotion(item = {}) {
  return Boolean(normalizePotion(item) || parseLegacyPotion(item));
}

export function isConsumable(item = {}) {
  return isPotion(item) || (Array.isArray(item.tags) && item.tags.includes("消耗品"))
    || ["消耗品", "药剂", "食物", "饮品"].includes(item.category) || item.properties?.consumable === true;
}

export function playerVisibleItem(item = {}) {
  const visible = { ...item };
  delete visible.hiddenInfo;
  const potion = normalizePotion(item);
  if (potion?.identified) {
    visible.potion = potion;
    // Identifying a bottle reveals its pathway/rank, not arbitrary hidden payloads.
    delete visible.properties;
    delete visible.identificationLastTurn;
  }
  else if (potion) {
    // Descriptions, IDs, nested properties and tags may themselves contain the hidden identity.
    return { instanceId: item.instanceId, name: "未鉴定魔药", category: "魔药", quantity: item.quantity,
      ...(Number.isFinite(item.delta) ? { delta: item.delta } : {}),
      weight: item.weight, equipped: false, importance: "important", tags: ["魔药", "未鉴定"],
      description: "尚未确认途径和序列的魔药，可请夏洛克·莫里亚蒂鉴定。", potionStatus: "unidentified" };
  }
  return visible;
}
