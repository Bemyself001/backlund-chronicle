import { getAdvancement } from "./character.js";
import { attackPercent, healthPoints } from "./healthRules.js";
import { weaponBonus } from "./weapons.js";

export function attackPreparation(game) {
  return getAdvancement(game.character).unlockedAbilities.find(ability => ability.rule.preparation)?.rule.preparation || null;
}

export function mainActionGate(game, turn = Number(game.turn || 0) + 1) {
  if (!Number.isSafeInteger(turn) || turn < 0) return "行动回合无效";
  if (Number(game.character?.stats?.health) <= 0 || Number(game.character?.stats?.sanity) <= 0) return "当前生命或理智归零，无法行动";
  if (Math.max(game.character?.mainActionLastUsedTurn ?? -1, game.character?.abilityLastUsedTurn ?? -1) >= turn) return "本回合已经使用过主要行动";
  return "";
}

export function actionPreview(game, rule, stacks = 0, target = null, weakPoint = null) {
  const preparation = attackPreparation(game);
  const weapon = weaponBonus(game, rule);
  const baseDamagePercent = rule.effect === "damage" ? rule.damagePercent : 0;
  const weaponBonusPercent = weapon?.bonusPercent || 0;
  const combinedDamagePercent = baseDamagePercent + weaponBonusPercent;
  const weakPointBonusPercent = rule.effect === "damage" ? weakPoint?.bonusPercent || 0 : 0;
  const damagePercent = rule.effect === "damage" ? attackPercent(combinedDamagePercent, stacks, preparation?.multiplier || 1.2, weakPointBonusPercent) : 0;
  const guarded = target && target.guardedThroughTurn >= Number(game.turn || 0) + 1;
  const effectivePercent = guarded ? damagePercent / 2 : damagePercent;
  const healthCost = healthPoints(game.character.stats.maxHealth, rule.healthCostPercent || 0);
  const healing = rule.effect === "health" ? Math.min(game.character.stats.maxHealth - game.character.stats.health + healthCost,
    healthPoints(game.character.stats.maxHealth, rule.healPercent, "down")) : 0;
  return {
    stacks, multiplier: (preparation?.multiplier || 1.2) ** stacks,
    preparationCost: stacks * (preparation?.cost || 0),
    spiritualityCost: (rule.cost || 0) + stacks * (preparation?.cost || 0),
    healthCost, healPercent: rule.healPercent || 0, healing,
    baseDamagePercent, weaponBonusPercent, combinedDamagePercent, weapon, weakPoint, weakPointBonusPercent,
    damagePercent, effectivePercent, guarded: Boolean(guarded),
    damage: target ? Math.min(target.health, healthPoints(target.maxHealth, effectivePercent)) : null,
    capped: rule.effect === "damage" && combinedDamagePercent * (preparation?.multiplier || 1.2) ** stacks + weakPointBonusPercent > damagePercent,
  };
}

export function preparationGate(game, rule, stacks = 0) {
  if (!Number.isInteger(stacks) || stacks < 0 || stacks > 3) return "强化层数必须是0至3的整数";
  const preparation = attackPreparation(game);
  if (stacks && (!preparation || stacks > preparation.maxStacks)) return "角色尚未解锁此强化准备动作";
  if (stacks && rule.effect !== "damage") return "攻击强化只能用于本回合的普攻或伤害技能";
  const preview = actionPreview(game, rule, stacks);
  if (!Number.isFinite(game.character.stats.spirituality) || game.character.stats.spirituality < preview.spiritualityCost) return "灵性不足，无法同时支付强化与技能消耗";
  if (game.character.stats.health <= preview.healthCost) return "生命不足，耗血后必须至少保留1点生命";
  return "";
}

export function markMainAction(game, turn, stacks = 0) {
  game.character.mainActionLastUsedTurn = turn;
  if (stacks) game.character.combatBoost = { stacks, multiplier: 1.2 ** stacks, expiresTurn: turn };
}
