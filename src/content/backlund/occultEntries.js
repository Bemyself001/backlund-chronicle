import { GATHERING } from "./gatherings.js";

const addressReward = prefix => ({ id: `${prefix}.address`, type: "location-discover", locationId: GATHERING.locationId, note: "线索指向雾鸦旅店：灰手套在那里接受联络。" });
const clueReward = (prefix, title, detail) => ({ id: `${prefix}.clue`, type: "clue", clue: { id: `clue-${prefix}`, title, detail, kind: "occult_entry" } });
const invitationRewards = prefix => [
  { id: `${prefix}.contact`, type: "fact", key: GATHERING.contactFact, value: true },
  { id: `${prefix}.access`, type: "fact", key: GATHERING.accessFact, value: true },
  clueReward(`${prefix}.invitation`, "雾灯聚会的介绍卡", `${GATHERING.room}，${GATHERING.scheduleText}。凭介绍卡入场；平时可向灰手套留言。资格持续有效，交易需另行确认。`),
];
const localMeeting = [{ type: "location", locationId: GATHERING.locationId }];

export const OCCULT_ENTRY_DEFINITIONS = [
  {
    id: "occult.entry.hidden-receipt",
    version: 2,
    category: "occult-entry",
    priority: 50,
    oncePerSave: true,
    occultScope: "general",
    initialStage: "discovered",
    expiresAfterTurns: 10,
    presentation: {
      title: "非凡入口：灰手套的收据",
      text: "一名戴灰手套的陌生人把写有陌生符号的收据压在附近公告栏下方。他没有拦你，也没有解释。这个机会不会一直留在原处；你可以追查，也可以忽略。",
      choice: { label: "追查灰手套留下的异常收据（可选）", intent: "occult", risk: "medium" },
    },
    engagedStage: "read-receipt",
    stages: [
      { id: "read-receipt", guidance: "检查收据背面的暗记，确认可核实的地址。", transitions: [{ objectiveId: "decode-receipt", description: "检查收据背面的暗记", actionTerms: ["收据", "暗记"], elapsedMinutes: 10, nextStage: "meet-contact", rewards: [addressReward("entry.receipt"), clueReward("entry.receipt", "收据背面的旅店地址", "灯形水印旁写着雾鸦旅店的地址和暗语：灯还亮着吗？联络人灰手套可在那里找到。下一步是当面核对暗语，无须再找另一张收据。")] }] },
      { id: "meet-contact", locationId: GATHERING.locationId, guidance: "到雾鸦旅店向灰手套出示收据，核对暗语并领取介绍卡。", transitions: [{ objectiveId: "verify-contact", description: "向灰手套出示收据并核对暗语", actionTerms: ["灰手套", "收据", "暗语"], requirements: localMeeting, elapsedMinutes: 10, nextStage: "completed", complete: true, rewards: invitationRewards("entry.receipt") }] },
    ],
  },
  {
    id: "occult.entry.midnight-employer",
    version: 2,
    category: "occult-entry",
    priority: 52,
    oncePerSave: true,
    occultScope: "general",
    eligibility: [{ type: "time", period: "night" }],
    initialStage: "discovered",
    expiresAfterTurns: 10,
    presentation: {
      title: "非凡入口：不存在的商号",
      text: "一则不起眼的夜间招工启事使用了不合常规的暗语，落款属于一个查无登记的商号。纸角已经受潮，这个机会显然不会久留。",
      choice: { label: "查证夜间启事上的陌生商号（可选）", intent: "occult", risk: "medium" },
    },
    engagedStage: "check-advertisement",
    stages: [
      { id: "check-advertisement", guidance: "核对招工启事的地址与纸角上的灯形水印。", transitions: [{ objectiveId: "verify-address", description: "核对招工启事的地址与灯形水印", actionTerms: ["启事", "商号", "水印"], elapsedMinutes: 10, nextStage: "verify-employer", rewards: [addressReward("entry.employer"), clueReward("entry.employer", "商号的真正联络地址", "所谓商号并未登记营业，启事其实是寻找外围帮手的联络纸。灯形水印指向雾鸦旅店；灰手套负责核对来意。这不是必须接受的雇佣契约。")] }] },
      { id: "verify-employer", locationId: GATHERING.locationId, guidance: "到雾鸦旅店当面询问灰手套，确认商号是否真的存在。", transitions: [{ objectiveId: "speak-to-contact", description: "当面询问灰手套关于商号的来历", actionTerms: ["灰手套", "商号"], requirements: localMeeting, elapsedMinutes: 10, nextStage: "receive-introduction", rewards: [clueReward("entry.employer.verified", "非凡交易圈的邀请", "灰手套坦言，招工启事只是接触隐秘世界的试探。他提供一个固定聚会渠道，不要求加入组织。你已通过核对，可以直接领取介绍卡。")] }] },
      { id: "receive-introduction", locationId: GATHERING.locationId, guidance: "向灰手套领取已确认的雾灯介绍卡，结束这次调查。", transitions: [{ objectiveId: "receive-card", description: "领取雾灯介绍卡", actionTerms: ["领取", "介绍卡"], requirements: localMeeting, elapsedMinutes: 5, nextStage: "completed", complete: true, rewards: invitationRewards("entry.employer") }] },
    ],
  },
  {
    id: "occult.entry.seer.reversed-reflection",
    version: 2,
    category: "occult-entry",
    priority: 72,
    oncePerSave: true,
    occultScope: "pathway",
    pathwayId: "seer",
    eligibility: [{ type: "character", kind: "extraordinary", pathwayId: "seer", sequenceRange: [9, 9] }],
    initialStage: "discovered",
    expiresAfterTurns: 10,
    presentation: {
      title: "非凡机会：逆位的倒影",
      text: "你的灵性直觉在一块旧橱窗前短促收紧：倒影中的一枚符号与现实方向相反，像是某位占卜家留下的识别记号。痕迹正在变淡，你可以追索，也可以离开。",
      choice: { label: "用占卜家知识追索逆位倒影（可选）", intent: "occult", risk: "medium" },
    },
    engagedStage: "read-reflection",
    stages: [
      { id: "read-reflection", guidance: "用占卜家知识辨读逆位符号，记录留下的联络地点。", transitions: [{ objectiveId: "read-sigil", description: "辨读倒影中的逆位符号", actionTerms: ["符号", "倒影", "占卜"], elapsedMinutes: 10, nextStage: "verify-sigil", rewards: [addressReward("entry.reflection"), clueReward("entry.reflection", "逆位符号的含义", "逆位符号并非新的危险预兆，而是占卜家之间的联络记号。中心的灯纹指向雾鸦旅店；带上这份记录即可找灰手套核对，不必再追索新的倒影。")] }] },
      { id: "verify-sigil", locationId: GATHERING.locationId, guidance: "到雾鸦旅店向灰手套展示符号记录，领取小丑配方抄本与聚会介绍卡。", transitions: [{ objectiveId: "verify-record", description: "向灰手套展示逆位符号记录", actionTerms: ["灰手套", "符号", "记录"], requirements: localMeeting, elapsedMinutes: 10, nextStage: "completed", complete: true, rewards: [
        ...invitationRewards("entry.reflection"),
        { id: "entry.reflection.recipe", type: "item", item: { instanceId: "entry-reflection-clown-recipe", itemId: "gathering-recipe-seer-8", name: "小丑魔药配方抄本", category: "书籍", quantity: 1, weight: 0.1, tags: ["魔药配方", "重要物品"], importance: "important", description: "已核对的小丑魔药配方资料。材料与调制须另外筹备，持有抄本不会自动获得魔药或晋升。", recipe: { pathwayId: "seer", sequence: 8, identified: true } } },
      ] }] },
    ],
  },
];
