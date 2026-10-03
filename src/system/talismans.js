import { CHURCH_TALISMANS, getOrganization } from "../content/index.js";

export function getChurchTalisman(itemOrId) {
  const item = typeof itemOrId === "string" ? { itemId: itemOrId } : itemOrId;
  return CHURCH_TALISMANS.find(entry => entry.itemId === item?.itemId)
    || CHURCH_TALISMANS.find(entry => entry.name === item?.name) || null;
}

export function organizationTalisman(organizationId) {
  return CHURCH_TALISMANS.find(entry => entry.organizationId === organizationId) || null;
}

// Canonical content owns the effect; AI-supplied properties cannot strengthen it.
export function normalizeTalismanItem(item) {
  const definition = getChurchTalisman(item);
  if (!definition) return item;
  const { potion: _potion, ...base } = item;
  return { ...base, itemId: definition.itemId, name: definition.name,
    category: "符咒", description: definition.description, discoveredInfo: definition.description,
    importance: "normal", weight: 0, rarity: "非凡", equipped: false,
    tags: ["消耗品", "教会符咒"], properties: { effect: definition.effect, organizationId: definition.organizationId },
  };
}

export function talismanCatalog() {
  return CHURCH_TALISMANS.map(definition => ({ ...definition, organizationName: getOrganization(definition.organizationId)?.name }));
}
