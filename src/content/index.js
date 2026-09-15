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
export const ORGANIZATIONS = ACTIVE_CONTENT.organizations;
export const ITEM_BEHAVIORS = ACTIVE_CONTENT.itemBehaviors;
export const TRIGGER_DEFINITIONS = ACTIVE_CONTENT.triggers;
export const LORE_ENTRIES = ACTIVE_CONTENT.lore;
export const CONTENT_MIGRATIONS = ACTIVE_CONTENT.migrations;
export const SCENARIO_RULES = ACTIVE_CONTENT.narrative.scenarioRules;
export const SPECIAL_ACTIONS = ACTIVE_CONTENT.specialActions;
export const SPECIAL_RECIPES = ACTIVE_CONTENT.specialRecipes;
export const SPECIAL_CONTACTS = ACTIVE_CONTENT.specialContacts;

const ORGANIZATIONS_BY_ID = new Map(ORGANIZATIONS.map((entry) => [entry.id, entry]));
const ITEM_BEHAVIORS_BY_ID = new Map(ITEM_BEHAVIORS.map((entry) => [entry.itemId, entry]));
const TRIGGERS_BY_ID = new Map(TRIGGER_DEFINITIONS.map((entry) => [entry.id, entry]));
const LORE_BY_ID = new Map(LORE_ENTRIES.map((entry) => [entry.id, entry]));

export function getOpening(district) {
  return OPENINGS.find((opening) => opening.district === district) || OPENINGS[0];
}

export function getTalent(id) {
  return TALENTS.find((talent) => talent.id === id) || TALENTS[0];
}

export function getPathway(pathwayId) {
  return PATHWAYS.find((pathway) => pathway.id === pathwayId) || null;
}

export function getOrganization(organizationId) {
  return ORGANIZATIONS_BY_ID.get(String(organizationId || "").trim()) || null;
}

export function getItemBehavior(itemId) {
  return ITEM_BEHAVIORS_BY_ID.get(String(itemId || "").trim()) || null;
}

export function getContentTrigger(definitionId) {
  return TRIGGERS_BY_ID.get(String(definitionId || "").trim()) || null;
}

export function getLoreEntry(loreId) {
  return LORE_BY_ID.get(String(loreId || "").trim()) || null;
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
const CONDITION_TYPES = new Set(["always", "all", "any", "character", "item", "fact", "action", "signal", "location", "time", "weather", "relationship", "organization", "clue", "trigger", "turn", "available-slot"]);
const REWARD_TYPES = new Set(["fact", "clue", "item", "item-remove", "item-update", "money", "relationship"]);
const ITEM_EFFECT_TYPES = new Set(["discover-fact", "signal"]);

function validateConditions(conditions, label, errors) {
  for (const condition of asArray(conditions)) {
    if (!condition || !CONDITION_TYPES.has(condition.type)) errors.push(`${label} 使用了未知条件类型：${condition?.type || "未填写"}`);
    if (["all", "any"].includes(condition?.type)) validateConditions(condition.conditions, label, errors);
  }
}

function definitionRewards(definition) {
  return [
    ...asArray(definition.rewards),
    ...asArray(definition.stages).flatMap((stage) => [
      ...asArray(stage.rewards),
      ...asArray(stage.transitions).flatMap((transition) => asArray(transition.rewards)),
    ]),
  ];
}

function validateTriggerContent(triggers, errors) {
  const ids = new Set();
  const rewardOwners = new Map();
  for (const definition of asArray(triggers)) {
    if (!definition?.id || !definition?.category) errors.push("触发定义缺少 id 或 category");
    if (ids.has(definition?.id)) errors.push(`触发定义 ID 重复：${definition.id}`);
    ids.add(definition?.id);
    validateConditions(definition?.eligibility, `触发 ${definition?.id}`, errors);
    validateConditions(definition?.appearWhen, `触发 ${definition?.id}`, errors);
    validateConditions(definition?.autoEngageWhen, `触发 ${definition?.id}`, errors);
    validateConditions(definition?.failWhen, `触发 ${definition?.id}`, errors);
    const stages = asArray(definition?.stages);
    const stageIds = new Set(stages.map((stage) => stage?.id));
    if (definition?.engagedStage && !stageIds.has(definition.engagedStage)) errors.push(`${definition.id} 的 engagedStage 不存在：${definition.engagedStage}`);
    for (const stage of stages) {
      if (!stage?.id) errors.push(`${definition.id} 存在缺少 ID 的阶段`);
      validateConditions(stage?.advanceWhen, `阶段 ${definition.id}/${stage?.id}`, errors);
      validateConditions(stage?.failWhen, `阶段 ${definition.id}/${stage?.id}`, errors);
      if (stage?.nextStage && !stage.complete && !stageIds.has(stage.nextStage)) errors.push(`${definition.id} 引用了不存在的阶段：${stage.nextStage}`);
      for (const transition of asArray(stage?.transitions)) {
        if (!transition?.objectiveId) errors.push(`${definition.id}/${stage?.id} 存在缺少 objectiveId 的分支`);
        validateConditions(transition?.when, `分支 ${definition.id}/${transition?.objectiveId}`, errors);
        validateConditions(transition?.requirements, `分支 ${definition.id}/${transition?.objectiveId}`, errors);
        if (transition?.nextStage && !transition.complete && !transition.fail && !stageIds.has(transition.nextStage)) errors.push(`${definition.id} 引用了不存在的阶段：${transition.nextStage}`);
      }
    }
    for (const reward of definitionRewards(definition)) {
      if (!reward?.id || !REWARD_TYPES.has(reward?.type)) errors.push(`${definition.id} 使用了无效奖励：${reward?.id || "未填写"}`);
      const previous = rewardOwners.get(reward?.id);
      if (previous) errors.push(`奖励 ID 重复：${reward.id}（${previous}、${definition.id}）`);
      else if (reward?.id) rewardOwners.set(reward.id, definition.id);
    }
  }
}

function validateItemBehaviors(behaviors, errors) {
  const ids = new Set();
  for (const behavior of asArray(behaviors)) {
    if (!behavior?.itemId || ids.has(behavior.itemId)) errors.push(`特殊物品存在空或重复 ID：${behavior?.itemId || "未填写"}`);
    ids.add(behavior?.itemId);
    for (const [actionName, actions] of Object.entries(behavior?.actions || {})) {
      if (!["inspect", "use"].includes(actionName) || !Array.isArray(actions) || !actions.length) errors.push(`特殊物品 ${behavior.itemId} 的动作 ${actionName} 无效`);
      const actionIds = new Set();
      for (const action of asArray(actions)) {
        if (!action?.id || actionIds.has(action.id)) errors.push(`特殊物品 ${behavior.itemId} 存在空或重复动作 ID：${action?.id || "未填写"}`);
        actionIds.add(action?.id);
        validateConditions(action?.when, `物品动作 ${action?.id}`, errors);
        validateConditions(action?.denyWhen, `物品动作 ${action?.id}`, errors);
        for (const effect of asArray(action?.result?.effects)) if (!ITEM_EFFECT_TYPES.has(effect?.type)) errors.push(`物品动作 ${action?.id} 使用了未知效果：${effect?.type || "未填写"}`);
      }
    }
  }
}

export function validateContentPack(pack = ACTIVE_CONTENT) {
  const errors = [];
  if (!pack?.id || !pack?.name) errors.push("内容包缺少 id 或 name");
  if (pack?.schemaVersion !== 2) errors.push(`不支持的内容格式版本：${pack?.schemaVersion ?? "未填写"}`);
  if (containsRuntimeValue(pack)) errors.push("内容包只能包含可序列化数据，不能包含函数、类实例或循环引用");
  for (const [label, entries, key] of [["开局", pack?.openings, "district"], ["天赋", pack?.talents, "id"], ["途径", pack?.pathways, "id"], ["地点", pack?.map?.locations, "id"]]) {
    if (!Array.isArray(entries) || !entries.length) errors.push(`${label}数据为空`);
    const duplicates = duplicateIds(entries, key);
    if (duplicates.length) errors.push(`${label}存在空或重复 ID：${duplicates.join("、")}`);
  }
  if (!pack?.characters?.default || !Array.isArray(pack?.characters?.random) || !pack.characters.random.length) errors.push("角色模板数据为空");
  for (const [label, entries, key] of [["组织", pack?.organizations, "id"], ["特殊物品", pack?.itemBehaviors, "itemId"], ["触发定义", pack?.triggers, "id"], ["设定条目", pack?.lore, "id"], ["内容迁移", pack?.migrations, "id"]]) {
    if (!Array.isArray(entries)) errors.push(`${label}数据不是数组`);
    const duplicates = duplicateIds(entries, key);
    if (duplicates.length) errors.push(`${label}存在空或重复 ID：${duplicates.join("、")}`);
  }
  validateTriggerContent(pack?.triggers, errors);
  validateItemBehaviors(pack?.itemBehaviors, errors);
  for (const lore of asArray(pack?.lore)) {
    if (lore?.type !== "loreFact" || !String(lore?.text || "").trim()) errors.push(`设定条目 ${lore?.id || "未填写"} 缺少 loreFact 文本`);
    validateConditions(lore?.revealWhen, `设定条目 ${lore?.id}`, errors);
  }
  if (!String(pack?.narrative?.scenarioRules || "").trim()) errors.push("内容包缺少场景规则");
  const locations = new Set(asArray(pack?.map?.locations).map((entry) => entry?.id));
  const pathways = new Set(asArray(pack?.pathways).map((entry) => entry?.id));
  const organizations = new Set(asArray(pack?.organizations).map((entry) => entry?.id));
  for (const [label, entries] of [["特殊行动", pack?.specialActions], ["制作配方", pack?.specialRecipes]]) {
    if (!Array.isArray(entries)) { errors.push(`${label}数据不是数组`); continue; }
    if (duplicateIds(entries, "id").length) errors.push(`${label}存在空或重复ID`);
    for (const entry of entries) {
      if (!pathways.has(entry?.pathwayId)) errors.push(`${label}引用未知途径`);
      if (!Number.isInteger(entry?.maxSequence) || entry.maxSequence < 0 || entry.maxSequence > 9) errors.push(`${label}序列要求无效`);
      if (entry?.locationId && !locations.has(entry.locationId)) errors.push(`${label}引用未知地点`);
      if (entry?.organizationId && !organizations.has(entry.organizationId)) errors.push(`${label}引用未知组织`);
      if (!Number.isInteger(entry?.cost) || entry.cost < 0) errors.push(`${label}成本无效`);
      if (label === "制作配方" && (!Number.isInteger(entry?.sale) || entry.sale < 0)) errors.push("制作配方售价无效");
      if (label === "特殊行动") {
        if (!Array.isArray(entry?.pool) || entry.pool.length < 3) errors.push("特殊行动至少需要三则固定剧情");
        for (const scene of asArray(entry?.pool)) {
          if (!scene?.id || !scene?.title || !scene?.scene || !Array.isArray(scene?.options) || scene.options.length < 2) errors.push("特殊行动剧情不完整");
          for (const option of asArray(scene?.options)) if (!option?.label || !option?.ending || !Number.isInteger(option?.reward) || option.reward < 0) errors.push("特殊行动选项无效");
        }
      }
    }
  }
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
