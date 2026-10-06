import { healthPoints, attackPercent, normalizeHealthEffect } from "../system/healthRules.js";
import { applyStatDelta, syncStatCollapseStatuses } from "./statChanges.js";

export function damageEnemy(enemy, basePercent, stacks = 0, turn = 0, weakPointBonus = 0) {
  const damagePercent = attackPercent(basePercent, stacks, 1.2, weakPointBonus);
  const effectivePercent = enemy.guardedThroughTurn >= turn ? damagePercent / 2 : damagePercent;
  const requestedDamage = healthPoints(enemy.maxHealth, effectivePercent);
  const before = enemy.health;
  enemy.health = Math.max(0, before - requestedDamage);
  if (enemy.health === 0) enemy.status = "defeated";
  enemy.lastUpdatedTurn = turn;
  return { enemyId: enemy.id, enemyName: enemy.name, before, after: enemy.health, maxHealth: enemy.maxHealth,
    damagePercent, effectivePercent, requestedDamage, damage: before - enemy.health };
}

export function healCharacter(game, percent) {
  return applyStatDelta(game, "health", healthPoints(game.character.stats.maxHealth, percent, "down"));
}

export function stealLife(game, damage, maxHealth, definition) {
  if (!definition || damage <= 0) return null;
  const percent = Math.min(definition.maxHealPercent, damage / maxHealth * 100 * definition.ratio);
  return healCharacter(game, percent);
}

export function addHealthOverTime(statuses, ability, turn) {
  const definition = ability.rule.healthOverTime;
  if (!definition) return;
  const healthEffect = normalizeHealthEffect({ percent: definition.percent, remainingTurns: definition.duration, startsTurn: turn + 1, lastTickTurn: turn });
  if (!healthEffect) throw new Error("技能的持续生命效果配置无效");
  const status = { id: `ability:${ability.id}:health`, name: ability.name, kind: definition.percent < 0 ? "danger" : "positive",
    description: `每回合${definition.percent < 0 ? "损失" : "恢复"}最大生命值的${Math.abs(definition.percent)}%，持续${definition.duration}回合。`, healthEffect };
  const index = statuses.findIndex(entry => entry.id === status.id);
  if (index < 0) statuses.push(status); else statuses[index] = status;
}

export function settleHealthEffects(game, turn) {
  if (!game.character?.stats) return [];
  convertLegacyHealthTicks(game, turn);
  const ticks = [];
  const settle = (statuses, target, enemy = false) => (statuses || []).filter(status => {
    const effect = normalizeHealthEffect(status.healthEffect);
    if (!effect || effect.startsTurn > turn || effect.lastTickTurn >= turn) return true;
    if (enemy && (target.status !== "active" || target.health <= 0)) return true;
    const amount = healthPoints(target.maxHealth, Math.abs(effect.percent), effect.percent > 0 ? "down" : "up");
    let change;
    if (enemy) {
      const before = target.health;
      target.health = Math.max(0, Math.min(target.maxHealth, before + (effect.percent < 0 ? -amount : amount)));
      if (!target.health) target.status = "defeated";
      target.lastUpdatedTurn = turn;
      change = { stat: "health", label: `${target.name}生命`, before, after: target.health, delta: target.health - before, enemyId: target.id };
    } else {
      // A regeneration tick cannot revive a collapsed character.
      change = effect.percent > 0 && target.health <= 0 ? null : applyStatDelta(game, "health", effect.percent < 0 ? -amount : amount);
    }
    if (change) ticks.push({ status: status.name, ...change, percent: effect.percent });
    status.healthEffect = { ...effect, lastTickTurn: turn, remainingTurns: effect.remainingTurns === null ? null : effect.remainingTurns - 1 };
    return status.healthEffect.remainingTurns !== 0;
  });
  game.statusEffects = settle(game.statusEffects, game.character.stats);
  for (const enemy of game.combat?.enemies || []) if (enemy.statusEffects?.length) enemy.statusEffects = settle(enemy.statusEffects, enemy, true);
  syncStatCollapseStatuses(game);
  return ticks;
}

function convertLegacyHealthTicks(game, turn) {
  const maxHealth = game.character.stats?.maxHealth;
  game.statusEffects = (game.statusEffects || []).map(status => {
    const next = { ...status, ...(status.tick ? { tick: { ...status.tick } } : {}) };
    if (Number.isFinite(next.tick?.health) && next.tick.health !== 0 && Number.isSafeInteger(maxHealth) && maxHealth > 0) {
      next.healthEffect = normalizeHealthEffect({ percent: Math.max(-60, Math.min(100, next.tick.health / maxHealth * 100)), remainingTurns: null, startsTurn: turn, lastTickTurn: turn - 1 });
      delete next.tick.health;
    } else if (next.healthEffect) next.healthEffect = normalizeHealthEffect(next.healthEffect);
    return next;
  });
}

export function migrateHealthEffects(game) {
  convertLegacyHealthTicks(game, Number(game.turn || 0) + 1);
  // Prepared choices are drafts, not saved buffs. Older snapshots cannot carry them forward.
  delete game.character.combatBoost;
  game.character.mainActionLastUsedTurn = Math.max(Number.isSafeInteger(game.character.mainActionLastUsedTurn) ? game.character.mainActionLastUsedTurn : -1,
    Number.isSafeInteger(game.character.abilityLastUsedTurn) ? game.character.abilityLastUsedTurn : -1);
}
