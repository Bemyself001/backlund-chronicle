// 本城原创的小型交易圈；时间、报价与商品为游戏内容，不宣称是原著交易行情。
export const GATHERING = {
  id: "mist-lamp", name: "雾灯聚会", locationId: "soot-lamp", room: "雾鸦旅店 · 二楼包间",
  contact: "灰手套", contactFact: "gathering.mist-lamp.contact", accessFact: "gathering.mist-lamp.access",
  weekdays: [2, 5], startHour: 20, durationMinutes: 120, scheduleText: "每周二、周五 20:00—22:00",
  introduction: "旅店老板指了指角落里戴灰手套的男人。他只问你从哪里听到了暗语，随后递来一张写着聚会规矩的小卡：隐去真名，不探问来历，钱与物当面点清。",
  invitation: "灰手套核对了你带来的线索，将一枚雾灯印记压在卡片上。“这不是组织，也不要求你效忠谁。周二、周五晚上八点，二楼包间。可以只听消息；任何交易都要你亲自确认。”你的介绍资格已登记，今后不必反复寻找入口。",
  entrance: "你出示雾灯印记，沿楼梯来到烛火照亮的包间。帘后的人以代号相称。主持人把今晚的交易清单推到桌前：“标价、余量、已经确认的身份都写在上面。可以交谈，也可以安静地听完。”",
  inquiry: "灰手套替你记下需求。聚会尚未开场，他不会收取订金；下一场的清单会给出明确报价。是否成交，仍由你当面决定。",
  intelligence: "主持人提醒：配方、成品魔药和非凡特性是三种不同的东西。得到配方不等于得到魔药，买到特性也不会自动晋升。低序列的特性必须先调制；序列七起可选择直接吸收，但身体、理智与灵性都会付出代价。今后可凭雾灯印记找灰手套留言，不用重新追查入口。",
  sellers: ["纸页", "药师", "铜扣", "夜鸟"],
  labels: { recipe: "配方", material: "材料", potion: "魔药", characteristic: "非凡特性", equipment: "非凡物品" },
  // 序列3—0尚无可用能力，聚会不会凭空提供其晋升商品。
  prices: {
    9: { recipe: 1200, material: 4800, potion: 9600, characteristic: 7200 },
    8: { recipe: 2400, material: 12000, potion: 19200, characteristic: 16800 },
    7: { recipe: 4800, material: 24000, potion: 36000, characteristic: 30000 },
    6: { recipe: 9600, material: 48000, potion: 72000, characteristic: 60000 },
    5: { recipe: 19200, material: 96000, potion: 144000, characteristic: 120000 },
    4: { recipe: 48000, material: 240000, potion: 360000, characteristic: 300000 },
  },
  equipment: {
    itemId: "gathering-mist-dagger", name: "雾纹短刀", category: "非凡物品", rarity: "非凡", beyonder: true,
    tags: ["非凡物品", "装备", "武器"], weight: 0.7,
    description: "本城匠人制作的非凡短刀，刃面留着雾纹。装备后采用本地固定的非凡近战武器伤害加成；不授予额外途径能力。",
    weapon: { kind: "melee", quality: "extraordinary" }, pricePence: 24000,
  },
};
