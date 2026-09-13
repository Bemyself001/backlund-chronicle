export const OCCULT_TRIGGER_DEFINITIONS = [
  {
    id: "occult.entry.hidden-receipt",
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
    stages: [],
  },
  {
    id: "occult.entry.midnight-employer",
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
    stages: [],
  },
  {
    id: "occult.entry.seer.reversed-reflection",
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
    stages: [],
  },
];

export function canReceiveNewOccultEntry(game) {
  const advancement = game.character?.advancement;
  if (advancement?.type !== "extraordinary") return true;
  return Number(advancement.sequence) === 9;
}
