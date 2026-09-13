import { makeId } from "../utils/id.js";
import { ACTIVE_CONTENT, CONTENT_SCHEMA_VERSION, CONTENT_VERSION, DEFAULT_CHARACTER, PATHWAYS, RANDOM_CHARACTERS } from "../content/index.js";
import { GAME_SYSTEM_VERSION, SAVE_VERSION } from "./version.js";
import { applyTalent, talentItemSpec, talentMoneyBonus } from "./talents.js";
import { withAdvancement } from "./character.js";
import { MAX_STARTING_MONEY_PENCE, moneyFromPence } from "./money.js";
import { getMapLocation } from "./map.js";
import { getOpening, openingChoices, openingMapState } from "./openings.js";
import { buildWorld } from "./hexworld.js";
import { ITEM_IMPORTANCE } from "./items.js";
import { equipmentSlot, loadoutInventory, localLoadout, validateLoadout } from "./loadout.js";

export { SAVE_VERSION, GAME_SYSTEM_VERSION };
export const AI_SETTINGS_VERSION = "1.5";

export const LOW_SEQUENCE_PATHWAYS = PATHWAYS.map((pathway) => `${pathway.name}（序列9）`);

const PREVIOUS_CHOICE_RULE = "每轮给出三个在当前情境下真实可行、目的明显不同的行动方向，同时允许自由输入。选项必须依据当前人物、地点、线索和局势生成，不得固定套用调查、交涉、冒险三种模板。risk 只表示后果的不确定性与代价，允许重复；只有场景中确实存在合理危险时才使用 high，不得为了凑风险等级凭空制造异常、敌意或灾难。";
const PREVIOUS_NARRATIVE_RULE = "narrative 使用成熟、富有吸引力的中文小说笔法，以白金级商业小说的完成度为目标：场景有画面，人物有辨识度，对话有目的，情节有推进，信息有伏笔与回收，每轮结尾形成自然的期待感。文风可以细腻、浓郁或凌厉，但不得为了华丽堆砌比喻、形容词和无关环境描写。简单观察、购买、移动或简短交谈约 120—250 字；交涉、调查、冲突或重要发现约 250—500 字；重大转折、仪式、战斗、晋升或章节高潮可写 500—800 字。内容完整后立即结束，不为达到字数重复环境、心理或已知信息。环境描写必须服务于本轮行动、人物状态、信息揭示或气氛变化；已经建立过的煤烟、雾气、钟声、蒸汽等城市印象，只有发生变化、影响行动或承载新线索时才再次描写。每轮先回应玩家行动，再呈现具体过程、阻力与反馈，至少推进一项行动结果、人物关系、有效信息、局势变化、现实阻力或可选方向，最后停在适合玩家继续决定的位置。NPC 应有符合身份、利益和经历的语言节奏，可以隐瞒、拒绝或讨价还价。悬念来自信息差、因果关系和人物动机；允许生活化、温暖、幽默、平静和失败后的余韵，不要求每轮都阴森、紧张或出现异常。不要反复使用“选择权仍在你手中”“贝克兰德等待你的决定”“这一切也许只是巧合”“没有人要求你负责”等总结式套话，不要每轮都以“就在这时”式突发悬念收尾。不复述原著段落，不让原作角色抢占玩家中心位置。";
const CHOICE_RULE = "【行动选项】每轮提供恰好三个符合当前情境、具体可执行、目的明显不同的行动选项，同时允许玩家自由输入。选项必须根据当前人物、地点、线索和局势即时生成，不得固定套用调查、交涉、冒险三种模板，也不得用不同措辞表达同一个目标。risk 只表示行动后果的不确定性和代价，可以重复；只有当前情境确实存在合理危险时才能使用 high，不得为了凑齐风险等级凭空制造敌意、异常或灾难。";
const NARRATIVE_RULE = "【叙事目标】narrative 以白金级商业小说作家的完成度写作。文字应当成熟、有吸引力，场景有画面，人物有辨识度，对话有目的，情节持续推进，信息能够形成伏笔与回收。文风可以细腻、浓郁、冷峻或凌厉，但不要为显得华丽而堆砌比喻、形容词和无关环境描写。每轮必须先回应玩家刚刚采取的行动，再描写具体过程、遇到的阻力和可以感知的反馈，并至少推进一项行动结果、人物关系、有效信息、局势变化、现实阻力或新的行动方向。NPC 应拥有符合身份、利益和经历的语言习惯与行为逻辑，可以隐瞒、误解、拒绝、试探、讨价还价或改变主意，但不得为了推动剧情突然失去判断力。【篇幅控制】简单观察、购物、移动或简短交谈约 120—250 字；交涉、调查、冲突或重要发现约 250—500 字；重大转折、仪式、战斗、晋升或章节高潮约 500—800 字。内容完整后立即结束，不为达到字数重复环境、心理活动、人物表情或已经确认的信息。【避免重复】环境描写必须服务于玩家行动、人物状态、信息揭示或气氛变化。已经建立过的煤烟、雾气、钟声、蒸汽、雨水、煤气灯等城市印象，只有发生变化、影响行动或承载新线索时才能再次描写。悬念应来自信息差、因果关系和人物动机；允许生活化、温暖、幽默、平静、尴尬、疲惫以及失败后的余韵，不要求每轮都阴森、紧张或出现异常。不要反复使用“选择权仍在你手中”“贝克兰德等待你的决定”“这一切也许只是巧合”“没有人要求你负责”等总结式套话，不要每轮都制造异常、敌意、追踪者或突发灾难，也不要总以“就在这时”式悬念收尾。不复述原著段落，不让原作角色抢占玩家中心位置，最后停在适合玩家继续作出决定的位置。";

export const DEFAULT_SYSTEM_PROMPT = `你是《贝克兰德纪事》的叙事者与世界模拟器。故事发生在鲁恩王国首都贝克兰德，以原创街巷、人物、案件与剧情为中心；原作主线和重要人物仅作为遥远背景，不得取代玩家成为故事中心。

核心规则：
1. 维持维多利亚时代工业社会、教会秩序、隐秘组织、非凡途径、失控风险与信息差。神秘知识必须经调查、仪式、晋升、线索或代价获得。
2. 不替玩家决定思想、情绪或关键行动；只描述玩家可感知的世界反馈。
3. NPC 只能依据其身份、经历、观察与被告知的内容行动，不得全知。
4. 保持悬疑、因果与资源约束；不随意赠送强力物品、能力或无代价解决危险。
5. 这是开放世界沙盒。玩家可以无视、拒绝或离开任何案件与剧情钩子；不得用巧合、NPC 催促或突发灾难强迫玩家回到预设主线。未被玩家明确接受的委托不得添加为进行中任务。
6. 尊重地点连续性和旅行时间。玩家可在贝克兰德各区寻找工作、居所、人脉、知识与个人目标，世界事件会继续发展，但不应围绕玩家一人运转。剧情首次产生会长期复用的街道、建筑或室内地点时，使用 location.grow 将它连接到一个已发现的锚点；只有听闻时登记为 rumored，取得可靠地址或亲自确认时登记为 discovered。不要为一次性背景、重复地点或没有剧情依据的装饰创建地图节点。仅当 temporary=true 的地点在剧情中确认失效且没有关联档案时，才使用 location.archive。
7. 普通人的 occult.contact 初始为 0；在第 5、10、15 轮等每五轮节点，可出现一次非强制的非凡入口，直到玩家主动接触后变为 1。开局选择低序列非凡者的角色 occult.contact 初始为 1。contact=1 只代表接触过非凡世界，不代表获得力量。
8. 只有 occult.contact=1 后，才允许登记非凡知识。获得可靠魔药配方时用 clue.add 并填写 kind=potion_recipe、pathwayId 和 sequence；获得魔药时用 inventory.add 的 potion 字段保存真实途径、序列与鉴定状态，未鉴定时 name 和 description 只能描述外观。普通人只有在剧情中主动接触非凡世界、持有对应配方和已鉴定的序列9魔药，并在本轮明确决定服用魔药时，才能调用 advancement.promote 正式成为非凡者；后续晋升也必须沿当前途径逐级验证，不能用 character.update、item.use 或 inventory.remove 代替晋升。晋升结果必须等待本地确认后才能写成既成事实。
9. ${CHOICE_RULE}
10. 所有状态变化必须作为工具调用提议。不要在正文中伪造工具已经成功执行；等待本地引擎验证后再在后续叙事中确认。物品和资金是否获得或失去以本地审计结果为准，而不是以正文宣称为准。新增物品只有在会影响任务、案件证据、身份、非凡能力或后续剧情入口时，才将 importance 设为 important；普通消耗品、生活用品、材料和货币必须使用 normal。资金使用 money.add、money.remove，金额必须放在 amount 对象中并拆分为 pounds（镑）、solers（苏勒）、pence（便士），例如 {"amount":{"solers":2,"pence":6}}。角色数值使用 character.update 调整，patch 填写增减量而非目标值（例如 {"sanity":-2} 表示理智减少 2 点），本地引擎会把结果截断到 0 至上限，并在数值归零或恢复时自动维护对应状态。status.add 可通过 tick 字段声明该状态存在期间每轮的数值增减（例如持续伤害 {"health":-1}，单项 ±3），由本地引擎逐轮结算。
11. 支持原生工具时，状态变化只使用原生 tool calling，最终剧情放在 assistant.content，行动选项使用 ui.present_choices；只有不支持原生工具时才使用当前阶段指定的精简 JSON 兼容协议。
12. ${NARRATIVE_RULE}`;

export function migrateSystemPrompt(prompt = "") {
  const legacyIntro = "你是《雾中纪事》的叙事者与世界模拟器。故事运行在一个受《诡秘之主》启发、但城市、人物、案件与主线均为原创的蒸汽时代神秘世界。";
  const nextIntro = "你是《贝克兰德纪事》的叙事者与世界模拟器。故事发生在鲁恩王国首都贝克兰德，以原创街巷、人物、案件与剧情为中心；原作主线和重要人物仅作为遥远背景，不得取代玩家成为故事中心。";
  const legacyProtocol = "11. 优先使用原生 tool calling；若使用 JSON 协议，返回 narrative、choices、toolCalls、memoryNotes、worldEvents。";
  const nextProtocol = "11. 支持原生工具时，状态变化只使用原生 tool calling，最终剧情放在 assistant.content，行动选项使用 ui.present_choices；只有不支持原生工具时才使用当前阶段指定的精简 JSON 兼容协议。";
  const legacyAdvancement = "8. 只有 occult.contact=1 后，才允许通过 occult.reveal 揭示神秘知识，或提出带有非凡依据的 character.update；普通人可以拒绝、推迟或离开入口。任何晋升仍必须经过知识、材料、引导、地点和代价的本地验证。";
  const previousAdvancement = "8. 只有 occult.contact=1 后，才允许登记非凡知识。获得可靠魔药配方时用 clue.add 并填写 kind=potion_recipe、pathwayId 和 sequence；获得魔药时用 inventory.add 的 potion 字段保存真实途径、序列与鉴定状态，未鉴定时 name 和 description 只能描述外观。普通人只有在剧情中主动接触非凡世界、持有对应配方和已鉴定的序列9魔药，并实际决定服用时，才能调用 advancement.promote 正式成为非凡者；后续晋升也必须沿当前途径逐级验证，不能用 character.update 代替晋升。";
  const nextAdvancement = "8. 只有 occult.contact=1 后，才允许登记非凡知识。获得可靠魔药配方时用 clue.add 并填写 kind=potion_recipe、pathwayId 和 sequence；获得魔药时用 inventory.add 的 potion 字段保存真实途径、序列与鉴定状态，未鉴定时 name 和 description 只能描述外观。普通人只有在剧情中主动接触非凡世界、持有对应配方和已鉴定的序列9魔药，并在本轮明确决定服用魔药时，才能调用 advancement.promote 正式成为非凡者；后续晋升也必须沿当前途径逐级验证，不能用 character.update、item.use 或 inventory.remove 代替晋升。晋升结果必须等待本地确认后才能写成既成事实。";
  const legacyMoney = "金额必须拆分为 pounds（镑）、solers（苏勒）、pence（便士）。";
  const nextMoney = "金额必须放在 amount 对象中并拆分为 pounds（镑）、solers（苏勒）、pence（便士），例如 {\"amount\":{\"solers\":2,\"pence\":6}}。";
  const legacyMap = "6. 尊重地点连续性和旅行时间。玩家可在贝克兰德各区寻找工作、居所、人脉、知识与个人目标，世界事件会继续发展，但不应围绕玩家一人运转。";
  const previousMap = "6. 尊重地点连续性和旅行时间。玩家可在贝克兰德各区寻找工作、居所、人脉、知识与个人目标，世界事件会继续发展，但不应围绕玩家一人运转。剧情首次产生会长期复用的街道、建筑或室内地点时，使用 location.grow 将它连接到一个已发现的锚点；只有听闻时登记为 rumored，取得可靠地址或亲自确认时登记为 discovered。不要为一次性背景、重复地点或没有剧情依据的装饰创建地图节点。";
  const nextMap = "6. 尊重地点连续性和旅行时间。玩家可在贝克兰德各区寻找工作、居所、人脉、知识与个人目标，世界事件会继续发展，但不应围绕玩家一人运转。剧情首次产生会长期复用的街道、建筑或室内地点时，使用 location.grow 将它连接到一个已发现的锚点；只有听闻时登记为 rumored，取得可靠地址或亲自确认时登记为 discovered。不要为一次性背景、重复地点或没有剧情依据的装饰创建地图节点。仅当 temporary=true 的地点在剧情中确认失效且没有关联档案时，才使用 location.archive。";
  const legacyChoiceRule = "9. 每轮给出三个真正不同的行动选项：谨慎调查、社交交涉、高风险行动，同时允许自由输入；选项应包含当前场景的多种可能，而非三个措辞不同的同一目标。";
  const previousChoiceRule = `9. ${PREVIOUS_CHOICE_RULE}`;
  const nextChoiceRule = `9. ${CHOICE_RULE}`;
  const legacyNarrativeRule = "12. narrative 使用克制、可读的中文，每轮约 250—600 字，不复述原著段落，不让原作角色抢占玩家中心位置。";
  const previousNarrativeRule = `12. ${PREVIOUS_NARRATIVE_RULE}`;
  const nextNarrativeRule = `12. ${NARRATIVE_RULE}`;
  let migrated = String(prompt).replace(legacyIntro, nextIntro).replace(legacyProtocol, nextProtocol).replace(legacyMoney, nextMoney).replaceAll("《雾中纪事》", "《贝克兰德纪事》").replaceAll("灰檐港", "贝克兰德");
  if (!migrated.includes("本轮明确决定服用魔药")) migrated = migrated.includes(previousAdvancement) ? migrated.replace(previousAdvancement, nextAdvancement) : migrated.replace(legacyAdvancement, nextAdvancement);
  if (!migrated.includes("location.archive")) migrated = migrated.includes(previousMap) ? migrated.replace(previousMap, nextMap) : migrated.replace(legacyMap, nextMap);
  if (!migrated.includes("importance 设为 important")) migrated = migrated.replace("资金使用 money.add、money.remove", "新增物品只有在会影响任务、案件证据、身份、非凡能力或后续剧情入口时，才将 importance 设为 important；普通消耗品、生活用品、材料和货币必须使用 normal。资金使用 money.add、money.remove");
  if (!migrated.includes("增减量而非目标值")) migrated = migrated.replace("例如 {\"amount\":{\"solers\":2,\"pence\":6}}。", "例如 {\"amount\":{\"solers\":2,\"pence\":6}}。角色数值使用 character.update 调整，patch 填写增减量而非目标值（例如 {\"sanity\":-2} 表示理智减少 2 点），本地引擎会把结果截断到 0 至上限，并在数值归零或恢复时自动维护对应状态。status.add 可通过 tick 字段声明该状态存在期间每轮的数值增减（例如持续伤害 {\"health\":-1}，单项 ±3），由本地引擎逐轮结算。");
  if (!migrated.includes("status.add 可通过 tick 字段")) migrated = migrated.replace("并在数值归零或恢复时自动维护对应状态。", "并在数值归零或恢复时自动维护对应状态。status.add 可通过 tick 字段声明该状态存在期间每轮的数值增减（例如持续伤害 {\"health\":-1}，单项 ±3），由本地引擎逐轮结算。");
  if (!migrated.includes("【行动选项】")) migrated = migrated.includes(previousChoiceRule) ? migrated.replace(previousChoiceRule, nextChoiceRule) : migrated.replace(legacyChoiceRule, nextChoiceRule);
  if (!migrated.includes("【叙事目标】")) migrated = migrated.includes(previousNarrativeRule) ? migrated.replace(previousNarrativeRule, nextNarrativeRule) : migrated.replace(legacyNarrativeRule, nextNarrativeRule);
  return migrated;
}

export const DEFAULT_API_SETTINGS = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4.1-mini",
  temperature: 0.8,
  maxTokens: 4096,
  maxTokensMode: "auto",
  contextLength: 12000,
  reasoningMode: "auto",
  autoRetryReasoning: true,
  customHeaders: "{}",
  stream: true,
  nativeTools: true,
  jsonMode: true,
  mockMode: true,
  fastMode: false,
  persistKey: false,
  profiles: {},
  savedModels: {},
  modelCatalogs: {},
};

export const EMPTY_CHARACTER = DEFAULT_CHARACTER;

export function randomCharacter() {
  return { ...RANDOM_CHARACTERS[Math.floor(Math.random() * RANDOM_CHARACTERS.length)] };
}

function item(itemId, name, category, description, quantity, weight, rarity, tags = []) {
  return {
    instanceId: makeId("item"), itemId, name, category, description, quantity, weight, rarity,
    condition: "良好", equipped: false, tags, importance: ITEM_IMPORTANCE.NORMAL, properties: {}, acquiredAt: "第 0 轮",
    source: "角色随身物品", hiddenInfo: "", discoveredInfo: description, isNew: false,
  };
}

export function createInitialGame(character, confirmedLoadout) {
  const normalizedCharacter = withAdvancement(character);
  const opening = getOpening(character.startingDistrict);
  const startingLocation = getMapLocation(opening.locationId);
  const loadout = confirmedLoadout ? validateLoadout(confirmedLoadout, character) : localLoadout(character);
  const startingInventory = loadoutInventory(loadout);
  const { startingMoneyPence = 240, ...characterProfile } = normalizedCharacter;
  const initialMoneyPence = Math.max(0, Math.min(MAX_STARTING_MONEY_PENCE, Number(startingMoneyPence) || 0)) + talentMoneyBonus(normalizedCharacter.talent);
  const baseStats = { health: 10, maxHealth: 10, sanity: 9, maxSanity: 10, spirituality: normalizedCharacter.extraordinary === "low" ? 7 : 4, maxSpirituality: normalizedCharacter.extraordinary === "low" ? 8 : 5 };
  const talentSpec = talentItemSpec(normalizedCharacter.talent);
  const talentItem = talentSpec ? { ...item(talentSpec.itemId, talentSpec.name, talentSpec.category, talentSpec.description, 1, talentSpec.weight, talentSpec.rarity, talentSpec.tags), hiddenInfo: talentSpec.hiddenInfo || "" } : null;
  const game = {
    version: SAVE_VERSION,
    systemVersion: GAME_SYSTEM_VERSION,
    content: { packId: ACTIVE_CONTENT.id, schemaVersion: CONTENT_SCHEMA_VERSION, contentVersion: CONTENT_VERSION },
    id: makeId("game"),
    title: `${character.name}的贝克兰德档案`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    turn: 0,
    character: {
      ...characterProfile,
      startingDistrict: opening.district,
      portraitSeed: Math.floor(Math.random() * 4),
      stats: applyTalent(baseStats, normalizedCharacter.talent),
    },
    opening: { district: opening.district, locationId: opening.locationId, title: opening.title, summary: opening.summary },
    location: { id: startingLocation.id, name: startingLocation.name, district: `贝克兰德${opening.district}` },
    worldTime: `1349年 10月17日 · 周二 · ${opening.time}`,
    chapter: { number: 1, title: opening.title },
    occult: {
      contact: normalizedCharacter.extraordinary === "low" ? 1 : 0,
      revealLevel: 0,
      entryAvailable: false,
      currentEntry: null,
      lastEntryTurn: null,
      entryHistory: [],
    },
    inventory: [
      ...startingInventory,
      ...(talentItem ? [talentItem] : []),
    ],
    money: moneyFromPence(initialMoneyPence),
    capacity: { maxWeight: 12 },
    equipment: Object.fromEntries(startingInventory.filter((entry) => entry.equipped).map((entry) => [equipmentSlot(entry), entry.instanceId])),
    statusEffects: [],
    quests: [],
    clues: [],
    availableClues: structuredClone(opening.clues),
    relationships: [],
    mapExtensions: { locations: [], routes: [] },
    ...openingMapState(opening),
    worldEvents: [{ id: makeId("event"), turn: 0, text: opening.event }],
    recentDialogues: [{ id: makeId("msg"), role: "assistant", turn: 0, content: opening.narrative }],
    longTermSummary: opening.summary,
    memoryNotes: [],
    choices: openingChoices(opening),
    choiceMeta: { source: "initial", fallback: false, reason: "opening" },
    changeLog: [{ id: makeId("log"), turn: 0, text: `档案建立：故事从${startingLocation.name}开始，尚未接受任何委托。`, tone: "neutral" }],
    processedToolCalls: [],
    aiSettingsVersion: AI_SETTINGS_VERSION,
    hiddenDanger: { ...opening.danger, stage: 0, revealed: false },
    lastTurnBaseline: null,
    lastTurnAudit: null,
    lastTurnMetrics: null,
  };
  game.world = buildWorld(game);
  return game;
}
