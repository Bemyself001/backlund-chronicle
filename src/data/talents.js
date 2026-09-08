// 开局天赋：所有效果都必须能被本地引擎诚实执行，不做纯叙事承诺。
export const TALENTS = [
  { id: "none", name: "无特殊天赋", description: "以普通人的起点走进贝克兰德。", effects: {} },
  { id: "hardy", name: "坚韧体格", description: "常年劳作留下的底子，生命上限 +2。", effects: { maxHealth: 2 } },
  { id: "steady-mind", name: "沉着心智", description: "见惯意外与谎言，理智上限 +2。", effects: { maxSanity: 2 } },
  { id: "sensitive", name: "敏锐灵性", description: "对异常隐约多一分直觉，灵性上限 +2。", effects: { maxSpirituality: 2 } },
  { id: "savings", name: "小有积蓄", description: "一笔省下来的应急钱，开局资金额外 +1 镑。", effects: { bonusMoneyPence: 240 } },
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
