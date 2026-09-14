const CHARACTERISTIC_REWARD = { id: "watch.late-hour.characteristic", type: "item", item: {
    instanceId: "reward-watch-archaeologist-characteristic",
    itemId: "archaeologist-characteristic",
    name: "考古学家非凡特性",
    category: "非凡材料",
    description: "雷金纳德死后析出的序列8“考古学家”非凡特性。它不是可直接服用的魔药；通识者仍需配方、消化与调制，其他途径贸然使用极其危险。",
    quantity: 1,
    weight: 0.1,
    rarity: "珍贵",
    condition: "稳定封存",
    tags: ["重要物品", "非凡物品", "任务奖励"],
    importance: "important",
    properties: { pathwayId: "generalist", sequence: 8, consumableAsPotion: false },
    source: "雷金纳德·阿博特的遗留",
  } };

const AZIK_WHISTLE_REWARD = { id: "watch.late-hour.azik-whistle", type: "item", item: {
    instanceId: "reward-watch-azik-copper-whistle",
    itemId: "azik-copper-whistle",
    name: "阿兹克铜哨",
    category: "非凡物品",
    description: "一枚古老铜哨。吹响后可召来阿兹克·艾格斯的巨大骸骨信使，将写给他的信交给信使后再次吹响即可送出。信使不会参与战斗；铜哨的死亡气息可能吸引亡灵并令附近尸体异动。",
    quantity: 1,
    weight: 0.05,
    rarity: "唯一",
    condition: "古旧但完好",
    tags: ["重要物品", "非凡物品", "可使用", "信使"],
    importance: "important",
    properties: { recipient: "阿兹克·艾格斯", messengerCombatCapable: false, attractsUndead: true, alternateHistory: "阿兹克在一次记忆空白期遗失，后落入魔女会收藏" },
    source: "魔女会南岸货栈藏品",
  } };

const MAIN_REWARDS = [
  { id: "watch.late-hour.fact-completed", type: "fact", key: "watch.late-hour.completed", value: true },
  { id: "watch.late-hour.ra-released", type: "fact", key: "watch.ra-released", value: true },
  { id: "watch.late-hour.white-iris-identity", type: "fact", key: "demoness.white-iris.true-name", value: "塞西莉亚·沃恩" },
  CHARACTERISTIC_REWARD,
  AZIK_WHISTLE_REWARD,
  { id: "watch.late-hour.ledger", type: "clue", clue: {
    id: "clue-demoness-south-bank-ledger",
    title: "魔女会南岸账册",
    detail: "账册确认“白鸢尾”真名为塞西莉亚·沃恩，是序列7“魔女”；她服从一名代号“红夫人”的序列6“欢愉”，后者真名仍被严密遮蔽。",
    kind: "organization_ledger",
  } },
  { id: "watch.late-hour.memorial", type: "item-update", itemId: "heirloom-watch", patch: {
    condition: "停止走动",
    description: "雷金纳德·阿博特留下的家传怀表。它已经停止走动，成为一件被查明来历的纪念物。",
    tags: ["重要物品", "纪念物", "已查明"],
    importance: "important",
  } },
];

export const WATCH_MAIN_QUESTS = [{
  id: "watch.heirloom.late-hour",
  category: "personal-story",
  priority: 120,
  oncePerSave: true,
  eligibility: [
    { type: "item", itemId: "heirloom-watch" },
    { type: "fact", key: "watch.formal-quest-unlocked", value: true },
  ],
  appearWhen: [{ type: "fact", key: "watch.formal-quest-unlocked", value: true }],
  initialStage: "decoded-lead",
  expiresAfterTurns: null,
  presentation: {
    title: "家传怀表：迟到的整点",
    text: "译文把 R.A. 指向雷金纳德·阿博特，也把他的最后活动地点指向桥区南岸货栈。这是一条可以搁置的家族旧事；只有你主动追查，正式任务才会开始。",
    choice: { label: "追查雷金纳德与南岸货栈（可选）", intent: "trigger", risk: "high" },
  },
  engagedStage: "trace-reginald",
  stages: [
    { id: "trace-reginald", transitions: [{ objectiveId: "trace-reginald", description: "核对雷金纳德·阿博特的经历与南岸记录", actionTerms: ["雷金纳德", "档案", "记录", "打听", "追查"], nextStage: "enter-south-warehouse", rewards: [
      { id: "watch.late-hour.ra-history", type: "clue", clue: { id: "clue-reginald-abbott-history", title: "雷金纳德·阿博特的旧档", detail: "雷金纳德曾是通识者途径序列9，失踪前在南岸货栈追查魔女会的军火与文物交接。", kind: "personal_story" } },
    ] }] },
    { id: "enter-south-warehouse", transitions: [{ objectiveId: "enter-south-warehouse", description: "前往桥区南岸货栈并进入仓库", actionTerms: ["南岸", "货栈", "仓库", "潜入", "进入"], requirements: [{ type: "location", locationId: "bridge-docks" }], requirementMessage: "必须先实际到达桥区南岸货栈", nextStage: "warehouse-bomb" }] },
    { id: "warehouse-bomb", transitions: [
      {
        objectiveId: "disarm-with-dual-safety-knowledge",
        description: "凭双保险雷管知识快速拆除仓库炸弹；工具包提供一次操作失误保护，但仍需亲自动手",
        actionTerms: ["拆除", "雷管", "炸弹", "双保险", "工具包"],
        requirements: [{ type: "fact", key: "knowledge.dual-safety-detonator", value: true }],
        requirementMessage: "尚未掌握双保险雷管知识，不能使用准备奖励分支",
        nextStage: "find-reginald",
        rewards: [{ id: "watch.late-hour.bomb-prepared", type: "fact", key: "watch.warehouse-bomb-outcome", value: "disarmed-with-error-protection" }],
      },
      {
        objectiveId: "survive-warehouse-bomb",
        description: "在没有专门准备的情况下辨认、绕开或拆除仓库炸弹",
        actionTerms: ["拆除", "绕开", "炸弹", "引线", "雷管"],
        nextStage: "find-reginald",
        rewards: [{ id: "watch.late-hour.bomb-unprepared", type: "fact", key: "watch.warehouse-bomb-outcome", value: "survived-without-preparation" }],
      },
    ] },
    { id: "find-reginald", transitions: [{ objectiveId: "find-reginald-alive", description: "在货栈内找到仍然活着的雷金纳德", actionTerms: ["寻找", "找到", "雷金纳德", "搜查"], nextStage: "identify-sequence", rewards: [
      { id: "watch.late-hour.ra-found", type: "fact", key: "watch.ra-found-alive", value: true },
    ] }] },
    { id: "identify-sequence", transitions: [{ objectiveId: "identify-reginald-sequence", description: "确认雷金纳德被强制晋升为序列8考古学家", actionTerms: ["确认", "辨认", "检查", "序列", "考古学家"], nextStage: "confirm-control", rewards: [
      { id: "watch.late-hour.ra-sequence", type: "fact", key: "watch.ra-sequence-confirmed", value: true },
      { id: "watch.late-hour.ra-sequence-clue", type: "clue", clue: { id: "clue-reginald-forced-advancement", title: "被强制晋升的考古学家", detail: "雷金纳德已被魔女会强行从序列9通识者晋升为序列8考古学家；他仍会使用机械、枪械与炸药，却已失去自主行动能力。", kind: "personal_story", pathwayId: "generalist", sequence: 8 } },
    ] }] },
    { id: "confirm-control", transitions: [{ objectiveId: "confirm-reginald-control", description: "查明雷金纳德已经成为魔女会操控的傀儡", actionTerms: ["傀儡", "控制", "查明", "试探", "唤醒"], nextStage: "mercy-decision", rewards: [
      { id: "watch.late-hour.control", type: "fact", key: "watch.control-confirmed", value: true },
    ] }] },
    { id: "mercy-decision", transitions: [{ objectiveId: "release-reginald", description: "由玩家明确决定结束雷金纳德的生命，让他解脱", actionTerms: ["让他解脱", "结束生命", "结束他的生命", "杀死", "开枪", "致命"], nextStage: "white-iris-confrontation", rewards: [
      { id: "watch.late-hour.release-moment", type: "fact", key: "watch.ra-release-chosen", value: true },
      { id: "watch.late-hour.ra-released", type: "fact", key: "watch.ra-released", value: true },
      CHARACTERISTIC_REWARD,
      AZIK_WHISTLE_REWARD,
    ] }] },
    { id: "white-iris-confrontation", transitions: [
      {
        objectiveId: "accelerate-official-support-with-renard",
        description: "以雷纳德子爵的人情加速所属官方组织的支援；仍须先在白鸢尾手下坚持",
        actionTerms: ["雷纳德", "人情", "支援", "坚持", "求援"],
        requirements: [
          { type: "organization", kind: "official", status: "active" },
          { type: "fact", key: "noble.renard-favor", value: true },
        ],
        requirementMessage: "需要同时是官方组织成员并拥有雷纳德子爵的人情",
        nextStage: "completed-official",
        complete: true,
        rewards: [
          { id: "watch.late-hour.renard-support-outcome", type: "fact", key: "watch.white-iris-outcome", value: "accelerated-official-support-forced-retreat" },
          { id: "watch.late-hour.white-iris-survives-renard", type: "fact", key: "watch.white-iris-survived", value: true },
        ],
      },
      {
        objectiveId: "survive-until-official-support",
        description: "官方成员坚持到所属组织支援赶到，迫使白鸢尾撤退",
        actionTerms: ["支援", "坚持", "拖延", "求援", "信号"],
        requirements: [{ type: "organization", kind: "official", status: "active" }],
        requirementMessage: "只有已登记的官方组织成员能走支援分支；支援来自所属组织而非铜哨",
        nextStage: "completed-official",
        complete: true,
        rewards: [
          { id: "watch.late-hour.official-outcome", type: "fact", key: "watch.white-iris-outcome", value: "official-support-forced-retreat" },
          { id: "watch.late-hour.white-iris-survives-official", type: "fact", key: "watch.white-iris-survived", value: true },
        ],
      },
      {
        objectiveId: "escape-via-south-drain",
        description: "利用预先查明的南岸排水道安全撤离；白鸢尾仍然存活",
        actionTerms: ["排水道", "铁门", "逃", "撤离", "退潮"],
        requirements: [
          { type: "organization", kind: "official", status: "active", not: true },
          { type: "fact", key: "route.south-warehouse-drain", value: true },
        ],
        requirementMessage: "需要事先查明南岸货栈排水道路线，且当前没有官方组织支援",
        nextStage: "completed-escape",
        complete: true,
        rewards: [
          { id: "watch.late-hour.drain-outcome", type: "fact", key: "watch.white-iris-outcome", value: "escaped-via-known-drain" },
          { id: "watch.late-hour.white-iris-survives-drain", type: "fact", key: "watch.white-iris-survived", value: true },
        ],
      },
      {
        objectiveId: "escape-white-iris",
        description: "没有官方支援时从白鸢尾手中逃生；不能击败她，铜哨信使也不会战斗",
        actionTerms: ["逃", "撤退", "脱身", "排水道", "制造混乱"],
        requirements: [{ type: "organization", kind: "official", status: "active", not: true }],
        nextStage: "completed-escape",
        complete: true,
        rewards: [
          { id: "watch.late-hour.escape-outcome", type: "fact", key: "watch.white-iris-outcome", value: "escaped-without-support" },
          { id: "watch.late-hour.white-iris-survives-escape", type: "fact", key: "watch.white-iris-survived", value: true },
        ],
      },
    ] },
  ],
  rewards: MAIN_REWARDS,
}];
