// 序列四职业名称沿用原著；摘要为职业特色的游戏改编，不是晋升配方。
// 研究索引：各途径页面引用原著章节与作者补充设定。
// https://lordofthemysteries.fandom.com/wiki/Sequence/List_of_Sequence_Names
const PROFILE_DATA = {
  seer: ["诡法师", "以灵体之线协调秘偶和诡术，擅长能力传递、诡异换位与难以捉摸的战斗。"],
  apprentice: ["秘法师", "掌握空间隐秘，能将区域隔绝为隐藏空间，并强化星象感知与对幻象的辨别。"],
  spectator: ["操纵师", "深入集体潜意识与心灵岛屿，以心理暗示操纵念头，并施展精神瘟疫。"],
  sailor: ["灾难主祭", "驱使猛烈飓风与风暴，在海洋和恶劣天气中发挥强大的半神力量。"],
  bard: ["无暗者", "以无暗光辉净化污秽和堕落，兼具太阳领域的战斗力量与精神安抚。"],
  reader: ["预言家", "研究命运领域的预言和星界秘术，以知识、分析与推演寻找局势的关键。"],
  sleepless: ["守夜人", "展开黑夜领域，驱使灵体并安抚灵魂，借幽暗环境限制敌人的行动。"],
  corpse_collector: ["不死者", "在肉体与灵体的交界维持不死韧性，并借冥界力量施加封印与凋零。"],
  warrior: ["猎魔者", "以猎魔之眼识别腐化、异常和弱点，用强健体魄与曙光武器迎击敌人。"],
  mystery_pryer: ["神秘学家", "从神秘知识与传说中汲取力量，通过神秘再现施展独特法术。"],
  generalist: ["炼金术士", "融合机械、炼金术与灵性，赋予造物有限生命，并制作追索关联的器具。"],
  hunter: ["铁血骑士", "具备钢铁般勇气，能将物品武器化，并与队伍建立力量和感官的联系。"],
  marauder: ["寄生者", "以时之虫寄生灵体，窃取生命、恢复伤势，并逐步侵入宿主的意识。"],
  assassin: ["绝望", "强化瘟疫、诅咒、黑焰与镜面力量，利用疾病和镜中迷宫制造绝望。"],
  arbiter: ["律令法师", "以律令设置限制、维系秩序，并通过禁锢、剥夺和处刑裁决压制目标。"],
  lawyer: ["堕落伯爵", "利用规则漏洞，放大行为的影响，并向目标赐予迟缓与丧失斗志等不利状态。"],
  prisoner: ["木偶", "作为诅咒之源活化死物，以木偶化束缚自身欲望，强化怨魂与控制力量。"],
  criminal: ["魔鬼", "兼具强悍体魄与阴险心智，施展地狱火等法术，并悄然干扰目标的思考。"],
  planter: ["古代炼金师", "通过生命炼成创造人工生命，以生命畸变、大地法术与治疗干预战场。"],
  apothecary: ["巫王", "精通月亮与黑暗领域的咒术，强化血月之箭、深渊枷锁与血族再生。"],
  monster: ["厄运法师", "塑造厄运场、施加幸运祝福，并敏锐感知命运变化和危险征兆。"],
  secret_suppliant: ["黑骑士", "以堕落之力凝成黑甲和灵肉之刃，并操纵影子束缚目标。"],
};

export const SEQUENCE_FOUR_PROFILES = Object.fromEntries(
  Object.entries(PROFILE_DATA).map(([pathwayId, [sequenceName, summary]]) => [pathwayId, {
    sequenceName,
    potionName: `${sequenceName}魔药`,
    summary,
  }]),
);

// 无固定 instanceId：加入行囊时由 inventory.add 分配独立实例。
export const SEQUENCE_FOUR_POTIONS = Object.entries(SEQUENCE_FOUR_PROFILES).map(([pathwayId, profile]) => ({
  itemId: `potion-${pathwayId}-4`,
  name: profile.potionName,
  category: "魔药",
  rarity: "半神",
  importance: "important",
  quantity: 1,
  weight: 0.2,
  tags: ["魔药", "消耗品", "非凡物品"],
  potion: { pathwayId, sequence: 4, identified: true },
  description: `序列4「${profile.sequenceName}」的成品魔药，只供同途径序列5非凡者服用晋升。${profile.summary}`,
}));

export const SEQUENCE_FOUR_RESEARCH_SOURCES = {
  seer: "https://lordofthemysteries.fandom.com/wiki/Fool_Pathway/Abilities",
  apprentice: "https://lordofthemysteries.fandom.com/wiki/Door_Pathway/Abilities",
  spectator: "https://lordofthemysteries.fandom.com/wiki/Visionary_Pathway/Abilities",
  sailor: "https://lordofthemysteries.fandom.com/wiki/Tyrant_Pathway/Abilities",
  bard: "https://lordofthemysteries.fandom.com/wiki/Sun_Pathway/Abilities",
  reader: "https://lordofthemysteries.fandom.com/wiki/White_Tower_Pathway/Abilities",
  sleepless: "https://lordofthemysteries.fandom.com/wiki/Darkness_Pathway/Abilities",
  corpse_collector: "https://lordofthemysteries.fandom.com/wiki/Death_Pathway/Abilities",
  warrior: "https://lordofthemysteries.fandom.com/wiki/Twilight_Giant_Pathway/Abilities",
  mystery_pryer: "https://lordofthemysteries.fandom.com/wiki/Hermit_Pathway/Abilities",
  generalist: "https://lordofthemysteries.fandom.com/wiki/Paragon_Pathway/Abilities",
  hunter: "https://lordofthemysteries.fandom.com/wiki/Red_Priest_Pathway/Abilities",
  marauder: "https://lordofthemysteries.fandom.com/wiki/Error_Pathway/Abilities",
  assassin: "https://lordofthemysteries.fandom.com/wiki/Demoness_Pathway/Abilities",
  arbiter: "https://lordofthemysteries.fandom.com/wiki/Justiciar_Pathway/Abilities",
  lawyer: "https://lordofthemysteries.fandom.com/wiki/Black_Emperor_Pathway/Abilities",
  prisoner: "https://lordofthemysteries.fandom.com/wiki/Chained_Pathway/Abilities",
  criminal: "https://lordofthemysteries.fandom.com/wiki/Abyss_Pathway/Abilities",
  planter: "https://lordofthemysteries.fandom.com/wiki/Mother_Pathway/Abilities",
  apothecary: "https://lordofthemysteries.fandom.com/wiki/Moon_Pathway/Abilities",
  monster: "https://lordofthemysteries.fandom.com/wiki/Wheel_of_Fortune_Pathway/Abilities",
  secret_suppliant: "https://lordofthemysteries.fandom.com/wiki/Hanged_Man_Pathway/Abilities",
};
