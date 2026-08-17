import { makeId } from "../utils/id.js";
import { withAdvancement } from "./character.js";
import { MAX_STARTING_MONEY_PENCE, moneyFromPence } from "./money.js";
import { initialDiscoveredLocations, normalizeLocationKnowledge } from "./map.js";

export const SAVE_VERSION = 6;
export const AI_SETTINGS_VERSION = "1.4";

export const LOW_SEQUENCE_PATHWAYS = [
  "占卜家（序列9）",
  "学徒（序列9）",
  "观众（序列9）",
  "水手（序列9）",
  "歌颂者（序列9）",
  "阅读者（序列9）",
  "不眠者（序列9）",
  "收尸人（序列9）",
  "战士（序列9）",
  "窥秘人（序列9）",
  "通识者（序列9）",
  "猎人（序列9）",
];

export const DEFAULT_SYSTEM_PROMPT = `你是《贝克兰德纪事》的叙事者与世界模拟器。故事发生在鲁恩王国首都贝克兰德，以原创街巷、人物、案件与剧情为中心；原作主线和重要人物仅作为遥远背景，不得取代玩家成为故事中心。

核心规则：
1. 维持维多利亚时代工业社会、教会秩序、隐秘组织、非凡途径、失控风险与信息差。神秘知识必须经调查、仪式、晋升、线索或代价获得。
2. 不替玩家决定思想、情绪或关键行动；只描述玩家可感知的世界反馈。
3. NPC 只能依据其身份、经历、观察与被告知的内容行动，不得全知。
4. 保持悬疑、因果与资源约束；不随意赠送强力物品、能力或无代价解决危险。
5. 这是开放世界沙盒。玩家可以无视、拒绝或离开任何案件与剧情钩子；不得用巧合、NPC 催促或突发灾难强迫玩家回到预设主线。未被玩家明确接受的委托不得添加为进行中任务。
6. 尊重地点连续性和旅行时间。玩家可在贝克兰德各区寻找工作、居所、人脉、知识与个人目标，世界事件会继续发展，但不应围绕玩家一人运转。
7. 普通人的 occult.contact 初始为 0；在第 5、10、15 轮等每五轮节点，可出现一次非强制的非凡入口，直到玩家主动接触后变为 1。开局选择低序列非凡者的角色 occult.contact 初始为 1。contact=1 只代表接触过非凡世界，不代表获得力量。
8. 只有 occult.contact=1 后，才允许通过 occult.reveal 揭示神秘知识，或提出带有非凡依据的 character.update；普通人可以拒绝、推迟或离开入口。任何晋升仍必须经过知识、材料、引导、地点和代价的本地验证。
9. 每轮给出三个真正不同的行动选项：谨慎调查、社交交涉、高风险行动，同时允许自由输入；选项应包含当前场景的多种可能，而非三个措辞不同的同一目标。
10. 所有状态变化必须作为工具调用提议。不要在正文中伪造工具已经成功执行；等待本地引擎验证后再在后续叙事中确认。物品和资金是否获得或失去以本地审计结果为准，而不是以正文宣称为准。资金使用 money.add、money.remove，金额必须拆分为 pounds（镑）、solers（苏勒）、pence（便士）。
11. 支持原生工具时，状态变化只使用原生 tool calling，最终剧情放在 assistant.content，行动选项使用 ui.present_choices；只有不支持原生工具时才使用当前阶段指定的精简 JSON 兼容协议。
12. narrative 使用克制、可读的中文，每轮约 250—600 字，不复述原著段落，不让原作角色抢占玩家中心位置。`;

export function migrateSystemPrompt(prompt = "") {
  const legacyIntro = "你是《雾中纪事》的叙事者与世界模拟器。故事运行在一个受《诡秘之主》启发、但城市、人物、案件与主线均为原创的蒸汽时代神秘世界。";
  const nextIntro = "你是《贝克兰德纪事》的叙事者与世界模拟器。故事发生在鲁恩王国首都贝克兰德，以原创街巷、人物、案件与剧情为中心；原作主线和重要人物仅作为遥远背景，不得取代玩家成为故事中心。";
  const legacyProtocol = "11. 优先使用原生 tool calling；若使用 JSON 协议，返回 narrative、choices、toolCalls、memoryNotes、worldEvents。";
  const nextProtocol = "11. 支持原生工具时，状态变化只使用原生 tool calling，最终剧情放在 assistant.content，行动选项使用 ui.present_choices；只有不支持原生工具时才使用当前阶段指定的精简 JSON 兼容协议。";
  return String(prompt).replace(legacyIntro, nextIntro).replace(legacyProtocol, nextProtocol).replaceAll("《雾中纪事》", "《贝克兰德纪事》").replaceAll("灰檐港", "贝克兰德");
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
  persistKey: false,
  profiles: {},
  savedModels: {},
  modelCatalogs: {},
};

export const EMPTY_CHARACTER = {
  name: "",
  gender: "女",
  age: 24,
  appearance: "",
  origin: "贝克兰德桥区",
  occupation: "报社校对员",
  personality: "谨慎、敏锐，对权威保留怀疑",
  desire: "找到足以改变自己命运的真相",
  fear: "在不知情时成为某种仪式的一部分",
  secret: "曾从一封无人认领的遗书上抄下异常符号",
  background: "在贝克兰德生活三年，靠处理夜班稿件维持体面的贫穷。",
  extraordinary: "ordinary",
  pathway: "无",
  startingMoneyPence: 240,
};

const RANDOM_CHARACTERS = [
  {
    name: "伊芙琳·沃德",
    gender: "女",
    age: 26,
    appearance: "深褐短发，灰绿色眼睛，常穿改窄的旧旅行外套。",
    origin: "间海郡",
    occupation: "私人信件抄写员",
    personality: "冷静、好奇，习惯记录细节",
    desire: "证明父亲留下的航海日志并非疯话",
    fear: "镜中的自己比现实慢半拍",
    secret: "她能偶尔听见旧物主人残留的低语",
    background: "替桥区商人誊写账目与私人函件，熟悉贝克兰德不同阶层的说话方式。",
    extraordinary: "low",
    pathway: "窥秘人（序列9）",
  },
  {
    name: "西奥多·兰恩",
    gender: "男",
    age: 31,
    appearance: "瘦高，金边眼镜后有一双睡眠不足的蓝眼睛。",
    origin: "东切斯特郡",
    occupation: "保险调查员",
    personality: "礼貌、固执，对数字异常极其敏感",
    desire: "攒够钱离开终年笼罩煤烟的贝克兰德",
    fear: "无法解释的巧合",
    secret: "三年前曾伪造一次火灾勘验结果",
    background: "受雇调查货栈损失，凭职业便利出入码头、警署与商会。",
    extraordinary: "ordinary",
    pathway: "无",
  },
  {
    name: "诺拉·贝尔",
    gender: "女",
    age: 22,
    appearance: "黑卷发束在脑后，左手虎口有淡白色灼痕。",
    origin: "贝克兰德桥区·旧钟街",
    occupation: "钟表匠学徒",
    personality: "直率、耐心，对机械声有近乎苛刻的记忆",
    desire: "拥有一间不受行会控制的修表铺",
    fear: "密闭且完全安静的房间",
    secret: "她修好的一只怀表会在有人撒谎时停摆",
    background: "在煤烟巷的钟表铺长大，认识巡夜人、典当商和大多数跑腿孩子。",
    extraordinary: "ordinary",
    pathway: "无",
  },
];

export function randomCharacter() {
  return { ...RANDOM_CHARACTERS[Math.floor(Math.random() * RANDOM_CHARACTERS.length)] };
}

function item(itemId, name, category, description, quantity, weight, rarity, tags = []) {
  return {
    instanceId: makeId("item"), itemId, name, category, description, quantity, weight, rarity,
    condition: "良好", equipped: false, tags, properties: {}, acquiredAt: "第 0 轮",
    source: "角色随身物品", hiddenInfo: "", discoveredInfo: description, isNew: false,
  };
}

export function createInitialGame(character) {
  const normalizedCharacter = withAdvancement(character);
  const { startingMoneyPence = 240, ...characterProfile } = normalizedCharacter;
  const initialMoneyPence = Math.max(0, Math.min(MAX_STARTING_MONEY_PENCE, Number(startingMoneyPence) || 0));
  return {
    version: SAVE_VERSION,
    id: makeId("game"),
    title: `${character.name}的贝克兰德档案`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    turn: 0,
    character: {
      ...characterProfile,
      portraitSeed: Math.floor(Math.random() * 4),
      stats: { health: 10, maxHealth: 10, sanity: 9, maxSanity: 10, spirituality: normalizedCharacter.extraordinary === "low" ? 7 : 4, maxSpirituality: normalizedCharacter.extraordinary === "low" ? 8 : 5 },
    },
    location: { id: "east-station", name: "东区·贝克兰德火车站", district: "贝克兰德东区" },
    worldTime: "1349年 10月17日 · 周二 · 18:20",
    chapter: { number: 1, title: "雾都来客" },
    occult: {
      contact: normalizedCharacter.extraordinary === "low" ? 1 : 0,
      revealLevel: 0,
      entryAvailable: false,
      currentEntry: null,
      lastEntryTurn: null,
      entryHistory: [],
    },
    inventory: [
      item("worn-coat", "旧呢外套", "服装", "内衬缝有两个不易察觉的暗袋。", 1, 1.8, "普通", ["装备"]),
      item("brass-compass", "黄铜罗盘", "工具", "指针偶尔会避开正北方，原因未知。", 1, 0.3, "少见", ["可检查"]),
      item("pocket-notebook", "袖珍笔记本", "文书", "夹着几张速记纸，尚有二十余页空白。", 1, 0.2, "普通", ["线索工具"]),
      item("matchbox", "防潮火柴", "消耗品", "还剩十二根，硫磺气味明显。", 1, 0.1, "普通", ["消耗品"]),
    ],
    money: moneyFromPence(initialMoneyPence),
    capacity: { maxWeight: 12 },
    equipment: {},
    statusEffects: [{ id: "rain-chill", name: "雨夜寒意", kind: "neutral", description: "手指略显僵硬，离开雨水后会逐渐恢复。" }],
    quests: [],
    clues: [],
    availableClues: [
      { id: "crossed-platform", title: "被划去的站台", detail: "旧时刻表上有一行被墨水反复涂抹，仍能辨出“十一点零七分”。" },
      { id: "unclaimed-case", title: "无人认领的黑色皮箱", detail: "行李牌上的姓名与三日前报纸失踪启事中的文员相同。" },
      { id: "duplicate-tag", title: "重复的行李牌", detail: "两件来自不同列车的行李使用了完全相同的黄铜编号牌。" },
    ],
    relationships: [],
    discoveredLocations: initialDiscoveredLocations(),
    locationKnowledge: normalizeLocationKnowledge({}, initialDiscoveredLocations(), "east-station"),
    worldEvents: [{ id: makeId("event"), turn: 0, text: "贝克兰德连续第九日降雨；东区铁路因浓雾出现大面积晚点。" }],
    recentDialogues: [{ id: makeId("msg"), role: "assistant", turn: 0, content: "列车在一阵尖锐的刹车声中驶入贝克兰德东区火车站。铸铁穹顶下，煤烟、湿羊毛和热蒸汽混成一层低垂的雾；搬运工推着行李车穿过人群，报童高声兜售晚报，远处的马车夫则为最后几位体面乘客争吵。\n\n你带着自己的行李踏上站台。没有人在这里等你，也没有一封命令替你安排未来。售票厅外的城市地图标出通往桥区、皇后区与北区的线路；公告栏上同时贴着廉价房间、短工招聘、教会布告和几张边角卷起的失踪启事。若你愿意，今夜可以先找住处、谋一份工作、认识这座城市，或登上下一班车离开东区。\n\n只有一件小事略显不协调：封闭的第七码头旁停着一辆无人看管的行李车，最上方那只黑色皮箱正以稳定的七秒间隔，发出极轻的金属碰撞声。它没有拦住你的路。贝克兰德向四面八方展开，等待你自己决定第一步。" }],
    longTermSummary: "玩家刚刚抵达鲁恩王国首都贝克兰德，身处东区火车站，尚未接受任何委托或选定目标，可以自由探索城市。",
    memoryNotes: [],
    choices: [
      { label: "查看城市地图、招工与租房公告", intent: "investigate", risk: "low" },
      { label: "向搬运工打听各区近况与落脚处", intent: "social", risk: "medium" },
      { label: "跟随异常声响靠近封闭的第七码头", intent: "dangerous", risk: "high" },
    ],
    choiceMeta: { source: "initial", fallback: false, reason: "opening" },
    changeLog: [{ id: makeId("log"), turn: 0, text: "档案建立：你抵达贝克兰德东区火车站，尚未接受任何委托。", tone: "neutral" }],
    processedToolCalls: [],
    aiSettingsVersion: AI_SETTINGS_VERSION,
    hiddenDanger: { id: "hollow-chime", name: "空鸣者的回声", stage: 0, revealed: false },
    lastTurnBaseline: null,
    lastTurnAudit: null,
  };
}
