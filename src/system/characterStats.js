export const INITIAL_STATS_VERSION = 2;
export const ADVANCEMENT_STATS_VERSION = 2;
export const ALL_STAT_GROWTH_VERSION = 1;
export const BASE_HEALTH = 20;
export const BASE_SANITY = 10;
export const ORDINARY_SPIRITUALITY = 5;

// Ordinary → sequence 9 keeps its original +3; subsequent ranks gain +2 … +10.
export function spiritualGrowthForSequence(sequence) {
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 9) return 0;
  return sequence === 9 ? 3 : 10 - sequence;
}

export function totalSpiritualGrowth(sequence) {
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 9) return 0;
  let total = 0;
  for (let rank = 9; rank >= sequence; rank -= 1) total += spiritualGrowthForSequence(rank);
  return total;
}

export function initialCharacterStats(advancement) {
  const spirituality = ORDINARY_SPIRITUALITY + (advancement?.type === "extraordinary" ? totalSpiritualGrowth(advancement.sequence) : 0);
  const growth = advancement?.type === "extraordinary" ? totalRankGrowth(advancement.sequence) : 0;
  return { health: BASE_HEALTH + growth, maxHealth: BASE_HEALTH + growth, sanity: BASE_SANITY + growth, maxSanity: BASE_SANITY + growth,
    spirituality, maxSpirituality: spirituality };
}

export function totalRankGrowth(sequence) {
  return Math.max(0, totalSpiritualGrowth(sequence) - 3);
}

export const ADVANCEMENT_STAT_RULE = "【角色成长与晋升恢复】普通人初始生命20、理智10、灵性5；序列9生命20、理智10、灵性8，天赋额外叠加。普通人成为序列9仅增加3点当前灵性和灵性上限；序列9→8三项上限增加2点，8→7增加3点，之后每级多1点，直到1→0增加10点。灵性当前值仅增加上限差，保留原有消耗，不会自动回满。成功晋升的回合在其他数值与持续状态结算后，由本地引擎自动把生命和理智恢复至各自上限，移除因相应数值归零产生的濒危、精神恍惚状态；不会解除其他诅咒、流血等持续状态，其下轮影响依然有效。未获确认、被拒绝或失败的晋升不会加点、恢复或消耗魔药。不得额外调用character.update重复发放晋升加值或恢复，最终数值以本地结算结果为准。";
