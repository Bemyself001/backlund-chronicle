export const BEYONDER_ITEM_TAG = "非凡物品";
export const BEYONDER_EQUIPMENT_SLOTS = ["非凡物品:1", "非凡物品:2"];

// Equipment classification comes from registered metadata, never descriptive prose.
export function isBeyonderEquipment(item = {}) {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  if (item.potion || item.characteristic || item.talisman || item.properties?.consumable === true
    || /非凡特性/.test(String(item.name || ""))
    || ["货币", "魔药", "非凡特性", "消耗品", "药剂", "食物", "饮品", "符咒", "弹药"].includes(item.category)
    || String(item.category || "").endsWith("材料")
    || tags.some(tag => ["魔药", "非凡特性", "消耗品", "符咒", "教会符咒", "材料", "非凡材料", "原料"].includes(tag))) return false;
  return item.beyonder === true || [BEYONDER_ITEM_TAG, "神奇物品", "封印物"].includes(item.category)
    || tags.some(tag => [BEYONDER_ITEM_TAG, "神奇物品", "封印物"].includes(tag))
    || item.weapon?.quality === "extraordinary" || item.rarity === "非凡";
}

export function normalizeBeyonderItem(item) {
  return isBeyonderEquipment(item)
    ? { ...item, beyonder: true, tags: [...new Set([...(Array.isArray(item.tags) ? item.tags : []), BEYONDER_ITEM_TAG, "装备"])] }
    : item;
}

export const BEYONDER_EQUIPMENT_RULE = "【非凡物品装备】已确认的非凡道具、神奇物品与封印物登记独立的非凡物品标签，共用item.equip与item.unequip；拥有非凡物品:1和非凡物品:2两个专属栏位，最多同时装备两件，不占用衣物部位或普通武器栏。获得物品只放入背包，不自动装备。满两件时须先卸下一件，不能自动替换、凭叙事装备第三件或删除标签绕过限制。魔药、非凡特性、符咒与原料不是这两个栏位的装备。拥有或装备道具不会凭空解锁未登记能力，也不得借换装重置物品成本、副作用或伤害。非凡武器计入非凡栏位，普通武器栏优先用于武器攻击，否则使用非凡栏位顺序中的第一件武器；多把武器的伤害不叠加。以equipment与beyonderEquipment的本地记录为准。";
