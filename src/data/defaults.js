import { makeId } from "../utils/id.js";

export const SAVE_VERSION = 1;
export const AI_SETTINGS_VERSION = "1.0";

export const DEFAULT_SYSTEM_PROMPT = `你是《雾中纪事》的叙事者与世界模拟器。故事运行在一个受《诡秘之主》启发、但城市、人物、案件与主线均为原创的蒸汽时代神秘世界。

核心规则：
1. 维持维多利亚时代工业社会、教会秩序、隐秘组织、非凡途径、失控风险与信息差。神秘知识必须经调查、仪式、晋升、线索或代价获得。
2. 不替玩家决定思想、情绪或关键行动；只描述玩家可感知的世界反馈。
3. NPC 只能依据其身份、经历、观察与被告知的内容行动，不得全知。
4. 保持悬疑、因果与资源约束；不随意赠送强力物品、能力或无代价解决危险。
5. 每轮给出三个真正不同的行动选项：谨慎调查、社交交涉、高风险行动，同时允许自由输入。
6. 所有状态变化必须作为工具调用提议。不要在正文中伪造工具已经成功执行；等待本地引擎验证后再在后续叙事中确认。
7. 优先使用原生 tool calling；若使用 JSON 协议，返回 narrative、choices、toolCalls、memoryNotes、worldEvents。
8. narrative 使用克制、可读的中文，每轮约 250—600 字，不复述原著段落，不让原作角色抢占玩家中心位置。`;

export const DEFAULT_API_SETTINGS = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4.1-mini",
  temperature: 0.8,
  maxTokens: 1200,
  contextLength: 12000,
  customHeaders: "{}",
  stream: true,
  nativeTools: true,
  jsonMode: true,
  mockMode: true,
  persistKey: false,
};

export const EMPTY_CHARACTER = {
  name: "",
  gender: "女",
  age: 24,
  appearance: "",
  origin: "鲁恩北岸",
  occupation: "报社校对员",
  personality: "谨慎、敏锐，对权威保留怀疑",
  desire: "找到足以改变自己命运的真相",
  fear: "在不知情时成为某种仪式的一部分",
  secret: "曾从一封无人认领的遗书上抄下异常符号",
  background: "在灰檐港生活三年，靠处理夜班稿件维持体面的贫穷。",
  extraordinary: "ordinary",
  pathway: "无",
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
    background: "替港口商人誊写账目与私人函件，熟悉灰檐港各阶层的说话方式。",
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
    desire: "攒够钱离开雨季漫长的北岸",
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
    origin: "灰檐港旧钟区",
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
  return {
    version: SAVE_VERSION,
    id: makeId("game"),
    title: `${character.name}的灰檐港档案`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    turn: 0,
    character: {
      ...character,
      portraitSeed: Math.floor(Math.random() * 4),
      stats: { health: 10, maxHealth: 10, sanity: 9, maxSanity: 10, spirituality: character.extraordinary === "low" ? 7 : 4, maxSpirituality: character.extraordinary === "low" ? 8 : 5 },
    },
    location: { id: "soot-lamp", name: "煤灯街·雾鸦旅店", district: "灰檐港旧钟区" },
    worldTime: "1349年 10月17日 · 周二 · 21:40",
    chapter: { number: 1, title: "没有寄件人的黑函" },
    inventory: [
      item("worn-coat", "旧呢外套", "服装", "内衬缝有两个不易察觉的暗袋。", 1, 1.8, "普通", ["装备"]),
      item("brass-compass", "黄铜罗盘", "工具", "指针偶尔会避开正北方，原因未知。", 1, 0.3, "少见", ["可检查"]),
      item("pocket-notebook", "袖珍笔记本", "文书", "夹着几张速记纸，尚有二十余页空白。", 1, 0.2, "普通", ["线索工具"]),
      item("matchbox", "防潮火柴", "消耗品", "还剩十二根，硫磺气味明显。", 1, 0.1, "普通", ["消耗品"]),
      item("copper-coins", "铜便士", "货币", "足够支付一顿简餐或两次短程马车。", 18, 0.18, "普通", ["货币"]),
    ],
    capacity: { maxWeight: 12 },
    equipment: {},
    statusEffects: [{ id: "rain-chill", name: "雨夜寒意", kind: "neutral", description: "手指略显僵硬，离开雨水后会逐渐恢复。" }],
    quests: [{ id: "missing-clerk", title: "寻找失踪的夜班文员", status: "进行中", summary: "查明市档案馆文员埃利奥特·芬失踪的原因。", hidden: false }],
    clues: [],
    availableClues: [
      { id: "black-wax", title: "黑色封蜡", detail: "封蜡里掺着细小的蓝灰色骨粉。" },
      { id: "wrong-bell", title: "错误的钟声", detail: "旧钟塔在停用多年后，于每晚十一点零七分响一次。" },
      { id: "ledger-gap", title: "被裁去的登记页", detail: "档案馆访客簿缺少与失踪当日对应的一页。" },
    ],
    relationships: [{ id: "mara", name: "玛拉·维恩", role: "雾鸦旅店老板", value: 12, note: "谨慎地把你视作能办事的人。" }],
    discoveredLocations: [
      { id: "soot-lamp", name: "煤灯街·雾鸦旅店", note: "调查起点；二楼有一间长期上锁的客房。" },
      { id: "archive", name: "灰檐港市档案馆", note: "失踪者的工作地点，夜间封闭。" },
      { id: "clock-yard", name: "旧钟区废车场", note: "毗邻停摆钟塔，巡夜人很少靠近。" },
    ],
    worldEvents: [{ id: makeId("event"), turn: 0, text: "灰檐港连续第九日降雨，煤价在晚间突然上涨。" }],
    recentDialogues: [{ id: makeId("msg"), role: "assistant", turn: 0, content: "雨水沿着雾鸦旅店的铅框窗缓慢爬下。老板玛拉把一封没有邮戳的黑色信函推到你面前，封蜡上压着一枚倒置的钟。\n\n“埃利奥特失踪前来过这里，”她压低声音，“他留下这封信，说只有愿意相信钟会撒谎的人才能打开。”\n\n壁炉里的煤块轻轻爆裂。远处那座停摆七年的旧钟塔，在浓雾里传来一声不合时宜的金属震颤。" }],
    longTermSummary: "玩家刚抵达原创港城灰檐港，接受了调查档案馆夜班文员埃利奥特·芬失踪案的委托。",
    memoryNotes: [],
    choices: [
      { label: "检查信封与封蜡", intent: "investigate", risk: "low" },
      { label: "请玛拉讲清埃利奥特来访时的言行", intent: "social", risk: "medium" },
      { label: "立刻前往雾中的旧钟塔", intent: "dangerous", risk: "high" },
    ],
    changeLog: [{ id: makeId("log"), turn: 0, text: "档案建立：你在雾鸦旅店接下了第一桩委托。", tone: "neutral" }],
    processedToolCalls: [],
    aiSettingsVersion: AI_SETTINGS_VERSION,
    hiddenDanger: { id: "hollow-chime", name: "空鸣者的回声", stage: 0, revealed: false },
  };
}

