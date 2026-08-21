export const PATHWAYS = [
  ["seer", "占卜家", [["spirit_vision", "灵视", "观察灵性痕迹与异常气场。"], ["ritual_divination", "仪式占卜", "借助媒介对有限问题进行占卜。"], ["danger_intuition", "危险直觉", "对临近的异常危险产生模糊预感。"]]],
  ["apprentice", "学徒", [["spiritual_intuition", "灵性直觉", "感知附近不自然的灵性波动。"], ["lockcraft", "封锁技巧", "理解常见锁具、封闭结构与脱困方法。"], ["agile_movement", "灵巧身手", "在攀爬、潜入与狭窄空间行动时更加灵活。"]]],
  ["spectator", "观众", [["keen_observation", "敏锐观察", "更容易捕捉表情、动作和环境细节。"], ["emotion_reading", "情绪辨识", "从细微反应判断他人的表层情绪。"], ["enhanced_memory", "记忆强化", "更稳定地记住观察过的场景与对话。"]]],
  ["sailor", "水手", [["aquatic_adaptation", "水中适应", "提升水下活动与恶劣天气中的耐受。"], ["balance", "平衡强化", "在摇晃、湿滑和高速移动的环境中保持平衡。"], ["storm_sense", "风浪直觉", "对天气、水流与风向变化更加敏感。"]]],
  ["bard", "歌颂者", [["inspiring_voice", "鼓舞歌声", "以歌声与言辞稳定同伴的精神。"], ["ritual_knowledge", "仪式知识", "掌握基础仪式与象征对应关系。"], ["sacred_perception", "神圣感知", "对具有神圣或净化性质的力量更加敏感。"]]],
  ["reader", "阅读者", [["rapid_reading", "快速阅读", "更快理解和整理复杂文字资料。"], ["structured_memory", "结构记忆", "以清晰结构保存阅读所得的知识。"], ["logical_analysis", "逻辑分析", "更容易发现论证、记录与证据之间的矛盾。"]]],
  ["sleepless", "不眠者", [["reduced_sleep", "减少睡眠", "只需较短休息便能维持清醒。"], ["night_vision", "夜视增强", "在昏暗环境中保留更好的视觉。"], ["night_alertness", "夜间警觉", "夜晚行动时拥有更稳定的注意力。"]]],
  ["corpse_collector", "收尸人", [["spirit_sense", "亡灵感知", "察觉尸体与亡灵附近的异常反应。"], ["corpse_tolerance", "尸体耐受", "降低面对尸体、腐败和死亡现场时的不适。"], ["death_trace", "死亡痕迹辨识", "从现场迹象判断死亡留下的异常气息。"]]],
  ["warrior", "战士", [["physical_enhancement", "体魄强化", "提升力量、耐力与身体协调。"], ["weapon_handling", "武器掌握", "更快熟悉常见近战武器的使用。"], ["combat_intuition", "战斗直觉", "在正面冲突中更快判断攻击与防御时机。"]]],
  ["mystery_pryer", "窥秘人", [["spirit_vision", "灵视", "观察灵性痕迹与异常气场。"], ["mysticism", "神秘学知识", "理解基础象征、材料与仪式规则。"], ["ritual_perception", "仪式感知", "辨认正在运作或近期残留的仪式迹象。"]]],
  ["generalist", "通识者", [["mechanical_intuition", "机械直觉", "理解常见机械结构与故障规律。"], ["technical_memory", "技术记忆", "快速记住工艺步骤、图纸与操作细节。"], ["craft_analysis", "工艺分析", "判断物品的制作方式、材料与薄弱环节。"]]],
  ["hunter", "猎人", [["tracking", "追踪", "从足迹、气味和环境变化追查目标。"], ["trapmaking", "陷阱制作", "利用现场材料布置或识别基础陷阱。"], ["environment_sense", "环境感知", "在野外和复杂街区中更快发现异常动静。"]]],
].map(([id, name, sequence9]) => ({
  id,
  name,
  abilities: sequence9.map(([abilityId, abilityName, description]) => ({ id: `${id}:${abilityId}`, name: abilityName, description, sequence: 9 })),
}));

export const PATHWAY_IDS = Object.fromEntries(PATHWAYS.map((pathway) => [pathway.name, pathway.id]));
export const PATHWAY_NAMES = Object.fromEntries(PATHWAYS.map((pathway) => [pathway.id, pathway.name]));

export function getPathway(pathwayId) {
  return PATHWAYS.find((pathway) => pathway.id === pathwayId) || null;
}

export function pathwayIdForName(pathwayName) {
  return PATHWAY_IDS[String(pathwayName || "").trim()] || null;
}

export function pathwayNameForId(pathwayId) {
  return PATHWAY_NAMES[String(pathwayId || "").trim()] || null;
}

export function getUnlockedAbilities(pathwayId, currentSequence) {
  const pathway = getPathway(pathwayId);
  const sequence = Number(currentSequence);
  if (!pathway || !Number.isInteger(sequence)) return [];
  return pathway.abilities.filter((ability) => ability.sequence >= sequence).map((ability) => ({ ...ability }));
}
