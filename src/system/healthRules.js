export const BASIC_ATTACK_PERCENT = 12;
export const BASIC_ATTACK_RULE = Object.freeze({ effect: "damage", damagePercent: BASIC_ATTACK_PERCENT, weaponAttack: true, cost: 0 });
export const MAX_ATTACK_PERCENT = 60;
export const WEAK_POINT_BONUS_PERCENT = 5;
export const ENEMY_MOVES = Object.freeze({
  attack: { name: "普通攻击", damagePercent: 12 },
  windup: { name: "蓄力", damagePercent: 0 },
  heavy: { name: "蓄力重击", damagePercent: 20, cooldown: 2 },
  guard: { name: "防御", damagePercent: 0 },
  wait: { name: "观察", damagePercent: 0 },
});

export function healthPoints(maxHealth, percent, rounding = "up") {
  if (!Number.isSafeInteger(maxHealth) || maxHealth < 1 || !Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error("生命百分比或生命上限无效");
  if (percent === 0) return 0;
  // Round once, after all multipliers; remove floating-point noise at integer boundaries.
  const exact = Math.round(maxHealth * percent / 100 * 1e9) / 1e9;
  return Math.max(1, rounding === "down" ? Math.floor(exact) : Math.ceil(exact));
}

export function attackPercent(basePercent, stacks = 0, multiplier = 1.2, weakPointBonus = 0) {
  if (!Number.isFinite(basePercent) || basePercent < 0 || basePercent > 100 || !Number.isInteger(stacks) || stacks < 0 || stacks > 3) throw new Error("伤害比例或强化层数无效");
  if (![0, WEAK_POINT_BONUS_PERCENT].includes(weakPointBonus)) throw new Error("弱点奖励必须来自本地固定规则");
  return Math.min(MAX_ATTACK_PERCENT, Math.round((basePercent * multiplier ** stacks + weakPointBonus) * 1e6) / 1e6);
}

export const displayPercent = value => `${Number(value.toFixed(3))}%`;

// Skill effects have explicit duration. Legacy wounds keep their original removal condition.
export function normalizeHealthEffect(raw) {
  if (!raw || !Number.isFinite(raw.percent) || raw.percent === 0 || raw.percent < -60 || raw.percent > 100) return null;
  if (raw.remainingTurns !== null && (!Number.isInteger(raw.remainingTurns) || raw.remainingTurns < 1 || raw.remainingTurns > 100)) return null;
  return {
    percent: raw.percent, remainingTurns: raw.remainingTurns,
    startsTurn: Number.isSafeInteger(raw.startsTurn) && raw.startsTurn >= 0 ? raw.startsTurn : 0,
    lastTickTurn: Number.isSafeInteger(raw.lastTickTurn) ? raw.lastTickTurn : -1,
  };
}
