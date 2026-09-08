// 开局天赋：所有效果都必须能被本地引擎诚实执行，不做纯叙事承诺。
export const TALENTS = [
  { id: "none", name: "无特殊天赋", description: "以普通人的起点走进贝克兰德。", effects: {} },
  { id: "hardy", name: "坚韧体格", description: "常年劳作留下的底子，生命上限 +2。", effects: { maxHealth: 2 } },
  { id: "steady-mind", name: "沉着心智", description: "见惯意外与谎言，理智上限 +2。", effects: { maxSanity: 2 } },
  { id: "sensitive", name: "敏锐灵性", description: "对异常隐约多一分直觉，灵性上限 +2。", effects: { maxSpirituality: 2 } },
  { id: "savings", name: "小有积蓄", description: "一笔省下来的应急钱，开局资金额外 +1 镑。", effects: { bonusMoneyPence: 240 } },
  { id: "heirloom-watch", name: "家传怀表", description: "一件来自家人的旧怀表，开局随身携带；仔细检查也许能发现什么。", effects: { item: { itemId: "heirloom-watch", name: "家传怀表", category: "工具", description: "黄铜表壳磨得发亮，走时准确，只在雷雨夜慢半分钟。表盖内侧刻着一行已经磨浅的字。", weight: 0.1, rarity: "少见", tags: ["可检查"], hiddenInfo: "机芯夹层里藏着一小卷纸条，上面用陌生的速记符号写着一句话，墨迹尚未完全褪色。" } } },
];

export function getTalent(id) {
  return TALENTS.find((talent) => talent.id === id) || TALENTS[0];
}

// 在 createInitialGame 中调用：把天赋效果写进角色数值与开局资金。
export function applyTalent(stats, talentId) {
  const talent = getTalent(talentId);
  const next = { ...stats };
  if (talent.effects.maxHealth) { next.maxHealth += talent.effects.maxHealth; next.health = next.maxHealth; }
  if (talent.effects.maxSanity) { next.maxSanity += talent.effects.maxSanity; next.sanity = next.maxSanity; }
  if (talent.effects.maxSpirituality) { next.maxSpirituality += talent.effects.maxSpirituality; next.spirituality = next.maxSpirituality; }
  return next;
}

export function talentMoneyBonus(talentId) {
  return getTalent(talentId).effects.bonusMoneyPence || 0;
}

export function talentItemSpec(talentId) {
  return getTalent(talentId).effects.item || null;
}
