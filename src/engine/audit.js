import { getAdvancement } from "../data/character.js";

const ITEM_FIELDS = ["name", "category", "description", "weight", "rarity", "condition", "equipped", "tags", "properties", "discoveredInfo"];

function equalValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function itemRecord(item, quantity) {
  return {
    instanceId: item.instanceId,
    itemId: item.itemId,
    name: item.name,
    quantity,
    condition: item.condition,
    equipped: Boolean(item.equipped),
    source: item.source,
  };
}

export function auditInventoryChanges(before = [], after = []) {
  const beforeById = new Map(before.filter((item) => item?.instanceId).map((item) => [item.instanceId, item]));
  const afterById = new Map(after.filter((item) => item?.instanceId).map((item) => [item.instanceId, item]));
  const gained = [];
  const lost = [];
  const updated = [];
  const equipped = [];
  const unequipped = [];

  afterById.forEach((current, instanceId) => {
    const previous = beforeById.get(instanceId);
    if (!previous) {
      gained.push(itemRecord(current, Number(current.quantity || 0)));
      if (current.equipped) equipped.push(itemRecord(current, Number(current.quantity || 0)));
      return;
    }
    const previousQuantity = Number(previous.quantity || 0);
    const currentQuantity = Number(current.quantity || 0);
    if (currentQuantity > previousQuantity) gained.push(itemRecord(current, currentQuantity - previousQuantity));
    if (currentQuantity < previousQuantity) lost.push(itemRecord(previous, previousQuantity - currentQuantity));
    if (!equalValue(previous.equipped, current.equipped)) {
      (current.equipped ? equipped : unequipped).push(itemRecord(current, currentQuantity));
    }
    const changedFields = ITEM_FIELDS.filter((field) => field !== "equipped" && field !== "quantity" && !equalValue(previous[field], current[field]));
    if (changedFields.length) updated.push({ ...itemRecord(current, currentQuantity), fields: changedFields });
  });

  beforeById.forEach((previous, instanceId) => {
    if (!afterById.has(instanceId)) lost.push(itemRecord(previous, Number(previous.quantity || 0)));
  });

  return { gained, lost, updated, equipped, unequipped, hasChanges: Boolean(gained.length || lost.length || updated.length || equipped.length || unequipped.length) };
}

export function createAuditBaseline(game, turn = game.turn + 1) {
  return { turn, inventory: structuredClone(game.inventory || []), character: structuredClone(game.character || {}) };
}

export function auditTurnChanges(baseline, game) {
  if (!baseline) return null;
  const beforeAdvancement = getAdvancement(baseline.character);
  const afterAdvancement = getAdvancement(game.character);
  const beforeStats = baseline.character?.stats || {};
  const afterStats = game.character?.stats || {};
  const stats = Object.fromEntries(["health", "sanity", "spirituality"].filter((key) => beforeStats[key] !== afterStats[key]).map((key) => [key, { before: beforeStats[key], after: afterStats[key], delta: afterStats[key] - beforeStats[key] }]));
  return {
    turn: baseline.turn,
    inventory: auditInventoryChanges(baseline.inventory, game.inventory || []),
    character: {
      stats,
      advancementChanged: !equalValue(beforeAdvancement, afterAdvancement),
      beforeAdvancement,
      afterAdvancement,
    },
    hasChanges: auditInventoryChanges(baseline.inventory, game.inventory || []).hasChanges || Object.keys(stats).length > 0 || !equalValue(beforeAdvancement, afterAdvancement),
    auditedAt: new Date().toISOString(),
  };
}
