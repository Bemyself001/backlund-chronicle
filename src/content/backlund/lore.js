import { WATCH_NOTE_RULE } from "./watchNote.js";

export const LORE_ENTRIES = [
  {
    id: "lore.watch.fixed-note", type: "loreFact", alwaysInclude: true,
    revealWhen: [{ type: "fact", key: "watch.formal-quest-unlocked", value: true }],
    relevance: { terms: ["纸条", "译文", "雷金纳德", "白蔷薇", "账本", "南岸"] },
    text: WATCH_NOTE_RULE,
  },
  {
    id: "lore.renard.deep-control", type: "loreFact",
    revealWhen: [{ type: "fact", key: "knowledge.deep-control-irreversible", value: true }],
    relevance: { terms: ["药师", "治疗", "救治", "用药", "舅舅", "雷金纳德", "控制", "唤醒", "埃德蒙"] },
    text: "本任务特定的长期深度控制可能摧毁记忆与自我，不泛指所有魅惑。若主角是药师，由主角自述；否则由埃德蒙·维尔说明：‘让一个人继续呼吸，和让他重新认得自己的家人，是两回事。有些人，我们救得活，却带不回来。’不要因此认定富家小姐也被深度控制。",
  },
  {
    id: "lore.occult.local-authority",
    type: "loreFact",
    revealWhen: [{ type: "fact", key: "occult.contact", value: true }],
    relevance: { terms: ["非凡", "序列", "魔药", "隐秘组织", "神秘学"] },
    text: "非凡知识必须来自角色已经取得的线索、经历或可靠资料；不知道的途径能力、配方与组织内幕应保持未知。",
  },
  {
    id: "lore.watch.recovered-note", alwaysInclude: true,
    type: "loreFact",
    revealWhen: [{ type: "fact", key: "watch.note-recovered", value: true }, { type: "fact", key: "watch.formal-quest-unlocked", not: true }],
    relevance: { terms: ["怀表", "纸条", "速记", "羽毛笔记号"], itemIds: ["heirloom-watch"] },
    text: "怀表夹层纸条已经被取出，但在译出之前只能确认其使用陌生速记符号，并带有羽毛笔形记号；不得提前透露或编造译文、可辨认的词语、额外字迹或暗号；只有本地解读成功后才能引用固定译文。",
  },
  {
    id: "lore.watch.missing-uncle-memory",
    type: "loreFact",
    revealWhen: [{ type: "fact", key: "watch.uncle-missing-remembered", value: true }],
    relevance: { terms: ["怀表", "舅舅", "失踪", "家人", "回忆"], itemIds: ["heirloom-watch"], definitionIds: ["watch.heirloom.hidden-note", "watch.heirloom.late-hour"] },
    text: "主角已经回忆起：怀表最后属于舅舅雷金纳德{characterSurnameSuffix}。他数年前失踪，怀表随后被身份不明的人送回。雷金纳德的姓氏必须与主角姓名中可明确解析出的姓氏相同；无法解析时只称“雷金纳德”，不得另造姓氏。",
  },
  {
    id: "lore.watch.white-iris-confrontation",
    type: "loreFact",
    revealWhen: [{ type: "trigger", definitionId: "watch.heirloom.late-hour", status: "engaged", stage: "white-iris-confrontation" }],
    relevance: { terms: ["白鸢尾", "魔女", "交手", "逃", "支援"], definitionIds: ["watch.heirloom.late-hour"] },
    text: "白鸢尾是序列7魔女。官方已锁定货栈并按自身计划突入，排水道撬痕来自其先遣人员。组织身份有助接应，但不保证撑到救援。之后官方可能击退白鸢尾，由他们处理，不要求玩家参战，也不计为玩家战绩。白鸢尾不在此战死亡。",
  },
  {
    id: "lore.azik-copper-whistle.known-use",
    type: "loreFact",
    revealWhen: [{ type: "item", itemId: "azik-copper-whistle" }],
    relevance: { terms: ["铜哨", "阿兹克", "信使", "送信"], itemIds: ["azik-copper-whistle"] },
    text: "阿兹克铜哨只能召来负责送信的骸骨信使。信使不参与战斗；铜哨的死亡气息可能吸引亡灵并令附近尸体异动。",
  },
];
