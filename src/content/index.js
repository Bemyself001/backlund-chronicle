import { BACKLUND_CONTENT } from "./backlund/manifest.js";

function freezeContent(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeContent);
  return Object.freeze(value);
}

export const ACTIVE_CONTENT = freezeContent(BACKLUND_CONTENT);
export const CONTENT_SCHEMA_VERSION = ACTIVE_CONTENT.schemaVersion;
export const CONTENT_VERSION = ACTIVE_CONTENT.contentVersion;

export const OPENINGS = ACTIVE_CONTENT.openings;
export const TALENTS = ACTIVE_CONTENT.talents;
export const PATHWAYS = ACTIVE_CONTENT.pathways;
export const DEFAULT_CHARACTER = ACTIVE_CONTENT.characters.default;
export const RANDOM_CHARACTERS = ACTIVE_CONTENT.characters.random;
export const MAP_LOCATIONS = ACTIVE_CONTENT.map.locations;
export const MAP_ROUTES = ACTIVE_CONTENT.map.routes;
export const MAP_DISTRICTS = ACTIVE_CONTENT.map.districts;
export const DISTRICT_LAYOUT = ACTIVE_CONTENT.map.districtLayout;
export const INITIAL_DISCOVERED_LOCATION_IDS = ACTIVE_CONTENT.map.initialDiscoveredLocationIds;
export const INITIAL_RUMORED_LOCATION_IDS = ACTIVE_CONTENT.map.initialRumoredLocationIds;
export const LOCATION_KNOWLEDGE_STATUSES = ACTIVE_CONTENT.map.locationKnowledgeStatuses;
export const DYNAMIC_LOCATION_SCOPES = ACTIVE_CONTENT.map.dynamicLocationScopes;
export const DYNAMIC_LOCATION_KINDS = ACTIVE_CONTENT.map.dynamicLocationKinds;

export function getOpening(district) {
  return OPENINGS.find((opening) => opening.district === district) || OPENINGS[0];
}

export function getTalent(id) {
  return TALENTS.find((talent) => talent.id === id) || TALENTS[0];
}

export function getPathway(pathwayId) {
  return PATHWAYS.find((pathway) => pathway.id === pathwayId) || null;
}

export function pathwayIdForName(pathwayName) {
  return PATHWAYS.find((pathway) => pathway.name === String(pathwayName || "").trim())?.id || null;
}

export function pathwayNameForId(pathwayId) {
  return getPathway(String(pathwayId || "").trim())?.name || null;
}

export function getUnlockedAbilities(pathwayId, currentSequence) {
  const pathway = getPathway(pathwayId);
  const sequence = Number(currentSequence);
  if (!pathway || !Number.isInteger(sequence)) return [];
  return pathway.abilities.filter((ability) => ability.sequence >= sequence).map((ability) => ({ ...ability }));
}

function duplicateIds(entries = [], key = "id") {
  if (!Array.isArray(entries)) return [];
  const seen = new Set();
  return entries.map((entry) => entry?.[key]).filter((id) => !id || seen.has(id) || !seen.add(id));
}

function containsRuntimeValue(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return false;
  if (typeof value === "number") return !Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return true;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return true;
  ancestors.add(value);
  const invalid = Object.values(value).some((entry) => containsRuntimeValue(entry, ancestors));
  ancestors.delete(value);
  return invalid;
}

const asArray = (value) => Array.isArray(value) ? value : [];

export function validateContentPack(pack = ACTIVE_CONTENT) {
  const errors = [];
  if (!pack?.id || !pack?.name) errors.push("内容包缺少 id 或 name");
  if (pack?.schemaVersion !== 1) errors.push(`不支持的内容格式版本：${pack?.schemaVersion ?? "未填写"}`);
  if (containsRuntimeValue(pack)) errors.push("内容包只能包含可序列化数据，不能包含函数、类实例或循环引用");
  for (const [label, entries, key] of [["开局", pack?.openings, "district"], ["天赋", pack?.talents, "id"], ["途径", pack?.pathways, "id"], ["地点", pack?.map?.locations, "id"]]) {
    if (!Array.isArray(entries) || !entries.length) errors.push(`${label}数据为空`);
    const duplicates = duplicateIds(entries, key);
    if (duplicates.length) errors.push(`${label}存在空或重复 ID：${duplicates.join("、")}`);
  }
  if (!pack?.characters?.default || !Array.isArray(pack?.characters?.random) || !pack.characters.random.length) errors.push("角色模板数据为空");
  const locations = new Set(asArray(pack?.map?.locations).map((entry) => entry?.id));
  for (const route of asArray(pack?.map?.routes)) {
    if (!locations.has(route?.from) || !locations.has(route?.to)) errors.push(`路线引用不存在的地点：${route?.from} → ${route?.to}`);
  }
  for (const opening of asArray(pack?.openings).filter(Boolean)) {
    if (!locations.has(opening.locationId)) errors.push(`开局 ${opening.id || opening.district} 的起点不存在：${opening.locationId}`);
    if (!Array.isArray(opening.actions) || opening.actions.length !== 3) errors.push(`开局 ${opening.id || opening.district} 必须提供三个行动`);
    for (const locationId of asArray(opening.knownIds)) if (!locations.has(locationId)) errors.push(`开局 ${opening.id || opening.district} 引用了不存在的地点：${locationId}`);
  }
  return errors;
}

export function assertContentPack(pack = ACTIVE_CONTENT) {
  const errors = validateContentPack(pack);
  if (errors.length) throw new Error(`内容包校验失败：${errors.join("；")}`);
  return pack;
}

assertContentPack();
