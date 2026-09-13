export const SEER_PATHWAY_QUESTS = [{
  id: "pathway.seer.first-omen",
  category: "pathway-quest",
  pathwayId: "seer",
  sequenceRange: [9, 9],
  priority: 70,
  oncePerSave: true,
  cooldown: null,
  eligibility: [
    { type: "character", kind: "extraordinary", pathwayId: "seer", sequenceRange: [9, 9] },
    { type: "fact", key: "occult.contact", value: true },
  ],
  appearWhen: [{ type: "action", terms: ["占卜", "灵视", "预兆", "征兆"] }],
  initialStage: "omen-seen",
  expiresAfterTurns: 10,
  presentation: {
    title: "占卜家特殊任务：第一次应验",
    text: "你捕捉到一组会在现实中重复出现的细小征兆。现在它只是一条可忽略的线索；只有主动验证，才会成为你的途径任务。",
    choice: { label: "主动验证这组反复出现的征兆（可选）", intent: "trigger", risk: "medium" },
  },
  engagedStage: "trace-the-omen",
  stages: [
    { id: "trace-the-omen", advanceWhen: [{ type: "signal", kind: "clue.added", terms: ["预兆", "征兆", "占卜"] }], nextStage: "record-fulfilment" },
    { id: "record-fulfilment", advanceWhen: [{ type: "signal", kind: "clue.added", terms: ["应验", "结果", "印证"] }], nextStage: "completed", complete: true },
  ],
  rewards: [
    { id: "pathway.seer.first-omen.fact", type: "fact", key: "pathway.seer.first-omen.completed", value: true },
    { id: "pathway.seer.first-omen.clue", type: "clue", clue: { id: "clue-seer-first-omen", title: "第一份应验记录", detail: "你完成了一次从征兆、追踪到结果印证的完整记录，可以把它作为后续占卜实践的可靠参照。", kind: "pathway_quest", pathwayId: "seer" } },
  ],
}];
