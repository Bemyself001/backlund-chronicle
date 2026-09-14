export const LORE_ENTRIES = [
  {
    id: "lore.occult.local-authority",
    type: "loreFact",
    revealWhen: [{ type: "fact", key: "occult.contact", value: true }],
    relevance: { terms: ["非凡", "序列", "魔药", "隐秘组织", "神秘学"] },
    text: "非凡知识必须来自角色已经取得的线索、经历或可靠资料；不知道的途径能力、配方与组织内幕应保持未知。",
  },
  {
    id: "lore.watch.recovered-note",
    type: "loreFact",
    revealWhen: [{ type: "fact", key: "watch.note-recovered", value: true }],
    relevance: { terms: ["怀表", "纸条", "速记", "R.A."], itemIds: ["heirloom-watch"] },
    text: "怀表夹层纸条已经被取出，但在译出之前只能确认其使用陌生速记符号，并带有缩写 R.A.；不得提前透露译文。",
  },
  {
    id: "lore.watch.white-iris-confrontation",
    type: "loreFact",
    revealWhen: [{ type: "trigger", definitionId: "watch.heirloom.late-hour", status: "engaged", stage: "white-iris-confrontation" }],
    relevance: { terms: ["白鸢尾", "魔女", "交手", "逃", "支援"], definitionIds: ["watch.heirloom.late-hour"] },
    text: "白鸢尾是明显强于当前主角的序列7魔女，本次只会短暂交手。官方组织成员可以坚持到所属组织支援抵达；没有官方支援时必须逃生。白鸢尾不会在此战死亡。",
  },
  {
    id: "lore.azik-copper-whistle.known-use",
    type: "loreFact",
    revealWhen: [{ type: "item", itemId: "azik-copper-whistle" }],
    relevance: { terms: ["铜哨", "阿兹克", "信使", "送信"], itemIds: ["azik-copper-whistle"] },
    text: "阿兹克铜哨只能召来负责送信的骸骨信使。信使不参与战斗；铜哨的死亡气息可能吸引亡灵并令附近尸体异动。",
  },
];
