import { isConsumable } from "./items.js";
import { normalizeCharacteristic } from "./characteristics.js";
import { equipmentSlot } from "./loadout.js";
import { normalizeWeaponEquipment } from "./weapons.js";
import { BEYONDER_EQUIPMENT_SLOTS, BEYONDER_ITEM_TAG, isBeyonderEquipment } from "./beyonderItems.js";

export function canEquipItem(item = {}) {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  return !isConsumable(item) && !normalizeCharacteristic(item) && !item.talisman
    && !["货币", "符咒", "弹药"].includes(item.category) && !String(item.category || "").endsWith("材料")
    && !tags.some(tag => ["魔药", "非凡特性", "符咒", "教会符咒", "材料", "非凡材料", "原料"].includes(tag))
    && (isBeyonderEquipment(item) || tags.includes("装备"));
}

export function beyonderEquipmentSlots(game) {
  const items = (game.inventory || []).filter(item => item.equipped && item.quantity > 0 && isBeyonderEquipment(item));
  const used = new Set();
  const slots = BEYONDER_EQUIPMENT_SLOTS.map(slot => {
    const item = items.find(entry => entry.instanceId === game.equipment?.[slot] && !used.has(entry.instanceId));
    if (item) used.add(item.instanceId);
    return { slot, item: item || null };
  });
  for (const entry of slots) if (!entry.item) {
    entry.item = items.find(item => !used.has(item.instanceId)) || null;
    if (entry.item) used.add(entry.item.instanceId);
  }
  return slots;
}

export function equipmentGate(game, item) {
  if (!item || !(item.quantity > 0)) return "找不到要装备的物品";
  if (!canEquipItem(item)) return "该物品不允许装备";
  if (isBeyonderEquipment(item) && !item.equipped
    && (game.inventory || []).filter(entry => entry.equipped && entry.quantity > 0 && isBeyonderEquipment(entry)).length >= BEYONDER_EQUIPMENT_SLOTS.length) {
    return "非凡物品最多同时装备两件，请先卸下一件。";
  }
  return "";
}

export function unequipItem(game, item) {
  item.equipped = false;
  for (const [slot, id] of Object.entries(game.equipment || {})) if (id === item.instanceId) delete game.equipment[slot];
}

export function equipItem(game, item) {
  const gate = equipmentGate(game, item);
  if (gate) return { ok: false, reason: gate };
  game.equipment ||= {};
  let slot;
  if (isBeyonderEquipment(item)) {
    const slots = beyonderEquipmentSlots(game);
    slot = (slots.find(entry => entry.item?.instanceId === item.instanceId) || slots.find(entry => !entry.item))?.slot;
    if (!slot) return { ok: false, reason: "非凡物品最多同时装备两件，请先卸下一件。" };
  } else {
    slot = equipmentSlot(item);
    for (const old of game.inventory) if (old.instanceId !== item.instanceId && old.equipped
      && !isBeyonderEquipment(old) && equipmentSlot(old) === slot) unequipItem(game, old);
  }
  unequipItem(game, item);
  item.equipped = true;
  game.equipment[slot] = item.instanceId;
  return { ok: true, slot };
}

export function normalizeEquipment(game) {
  game.equipment = { ...game.equipment };
  for (const item of game.inventory || []) if (!(item.quantity > 0) || !canEquipItem(item)) item.equipped = false;
  const equippedIds = new Set((game.inventory || []).filter(item => item.equipped).map(item => item.instanceId));
  for (const [slot, id] of Object.entries(game.equipment)) if (!equippedIds.has(id)) delete game.equipment[slot];
  normalizeWeaponEquipment(game);
  const slots = beyonderEquipmentSlots(game);
  const beyonderIds = new Set((game.inventory || []).filter(isBeyonderEquipment).map(item => item.instanceId));
  for (const [slot, id] of Object.entries(game.equipment)) {
    if (BEYONDER_EQUIPMENT_SLOTS.includes(slot) || slot === BEYONDER_ITEM_TAG || beyonderIds.has(id)) delete game.equipment[slot];
  }
  const retainedIds = new Set(slots.filter(entry => entry.item).map(entry => entry.item.instanceId));
  for (const item of game.inventory || []) if (beyonderIds.has(item.instanceId)) item.equipped = retainedIds.has(item.instanceId);
  for (const { slot, item } of slots) if (item) game.equipment[slot] = item.instanceId;
}
