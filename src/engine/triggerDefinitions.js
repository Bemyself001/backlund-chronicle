import { PATHWAY_QUEST_DEFINITIONS } from "../content/backlund/pathwayQuests/index.js";
import { OCCULT_TRIGGER_DEFINITIONS } from "./occultTriggers.js";
import { WATCH_TRIGGER_DEFINITIONS } from "./watchTriggers.js";
import { SPECIAL_QUEST_DEFINITIONS } from "../content/backlund/specialQuests/index.js";

export const TRIGGER_DEFINITIONS = [
  ...OCCULT_TRIGGER_DEFINITIONS,
  ...WATCH_TRIGGER_DEFINITIONS,
  ...SPECIAL_QUEST_DEFINITIONS,
  ...PATHWAY_QUEST_DEFINITIONS,
];

const DEFINITIONS_BY_ID = new Map(TRIGGER_DEFINITIONS.map((definition) => [definition.id, definition]));

export function getTriggerDefinition(definitionId) {
  return DEFINITIONS_BY_ID.get(definitionId) || null;
}

export function validateTriggerDefinitions(definitions = TRIGGER_DEFINITIONS) {
  const errors = [];
  const ids = new Set();
  for (const definition of definitions) {
    if (!definition.id || !definition.category) errors.push("触发定义缺少 id 或 category");
    if (ids.has(definition.id)) errors.push(`触发定义 ID 重复：${definition.id}`);
    ids.add(definition.id);
    const stageIds = new Set((definition.stages || []).map((stage) => stage.id));
    for (const stage of definition.stages || []) {
      if (stage.nextStage && !stage.complete && !stageIds.has(stage.nextStage)) errors.push(`${definition.id} 引用了不存在的阶段 ${stage.nextStage}`);
      for (const transition of stage.transitions || []) {
        if (!transition.objectiveId) errors.push(`${definition.id} 的阶段 ${stage.id} 存在缺少 objectiveId 的分支`);
        if (transition.nextStage && !transition.complete && !transition.fail && !stageIds.has(transition.nextStage)) errors.push(`${definition.id} 引用了不存在的阶段 ${transition.nextStage}`);
      }
    }
  }
  return errors;
}

const definitionErrors = validateTriggerDefinitions();
if (definitionErrors.length) throw new Error(`触发定义校验失败：${definitionErrors.join("；")}`);
