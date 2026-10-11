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

// Maxima have already grown; current values still belong to the previous rank.
export function advancementCurrentStats(stats, growth, method = "potion") {
  const grownCurrent = (stat) => Math.min(Number(stats[`max${stat[0].toUpperCase()}${stat.slice(1)}`]), Math.max(0, Number(stats[stat]) || 0) + growth);
  if (method === "characteristic") {
    return Object.fromEntries(["health", "sanity", "spirituality"].map(stat => [stat, Math.floor(grownCurrent(stat) * 0.5)]));
  }
  return { health: Number(stats.maxHealth), sanity: Number(stats.maxSanity), spirituality: grownCurrent("spirituality") };
}

export const ADVANCEMENT_STAT_RULE = "【角色成长与晋升恢复】普通人初始生命20、理智10、灵性5；序列9生命20、理智10、灵性8，天赋额外叠加。普通人成为序列9仅增加3点当前灵性和灵性上限；序列9→8三项上限增加2点，8→7增加3点，之后每级多1点，直到1→0增加10点。魔药晋升把生命和理智恢复至各自上限，当前灵性仅增加上限差并保留原有消耗；成功回合在其他数值与持续状态结算后再次保证生命和理智回满。从目标序列7至0，非凡特性晋升的三项上限正常增长，当前生命、理智和灵性先各自增加本次晋升增长值，再乘50%并向下取整；受伤或灵性不足时剩余更少，不按上限减半，不先回满。特性惩罚仅在晋升成功时扣除一次，不在回合结束或读档时重复扣除或恢复；后续伤害、消耗、休息和持续状态正常生效。两种晋升均同步维护数值归零及恢复状态，不解除其他诅咒、流血等持续状态。未获确认、被拒绝或失败的晋升不会加点、恢复或消耗晋升物品；同一回合只能晋升一次。不得额外调用character.update重复发放晋升加值、施加惩罚或补偿特性损失，最终数值以本地结算结果为准。";
