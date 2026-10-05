import { getAdvancement } from "../system/character.js";
import { normalizeCombatState } from "../system/combat.js";
import { applyStatDelta } from "./statChanges.js";
import { actionPreview, mainActionGate, markMainAction, preparationGate } from "../system/combatActions.js";
import { addHealthOverTime, damageEnemy, healCharacter, stealLife } from "./healthEffects.js";
import { displayPercent } from "../system/healthRules.js";

const findAbility = (game, id) => getAdvancement(game.character).unlockedAbilities.find(entry => entry.id === id);
export function passiveAbilityModifier(game, abilityId, checkKind) {
  const ability = findAbility(game, abilityId);
  return ability?.kind === "passive" && ability.rule.checkKind === checkKind ? ability.rule.modifier : 0;
}
export function abilityAvailability(game, abilityId, targetId, turn = Number(game.turn || 0) + 1, boostStacks = 0) {
  const ability = findAbility(game, abilityId);
  if (!ability) return "角色尚未解锁此能力";
  if (ability.kind === "passive") return "被动能力会在适用检定中提供加值，无需主动施放";
  const gate = mainActionGate(game, turn) || preparationGate(game, ability.rule, boostStacks);
  if (gate) return gate;
  if (ability.target.kind === "enemy") {
    const enemy = game.combat?.enemies?.find(entry => entry.id === targetId);
    if (!enemy || enemy.status !== "active" || enemy.health <= 0) return "请选择当前遭遇中尚未被击败的敌人";
  }
  if (ability.target.kind === "clue") {
    const clue = game.clues?.find(entry => entry.id === targetId);
    if (!clue) return "请选择调查手记中已有的线索";
    if (Number(clue.analysisProgress || 0) >= 5) return "该线索已完成解析";
  }
  if (["health", "sanity"].includes(ability.rule.effect)) {
    const stat = ability.rule.effect;
    const maximum = `max${stat[0].toUpperCase()}${stat.slice(1)}`;
    if (game.character.stats[stat] >= game.character.stats[maximum]) return "该项数值已满，无需使用能力";
  }
  return "";
}

export function resolveAbilityUse(game, args = {}, { turn = Number(game.turn || 0) + 1 } = {}) {
  const targetId = args.targetId || args.enemyId || args.clueId;
  const stacks = args.boostStacks ?? 0;
  const reason = abilityAvailability(game, args.abilityId, targetId, turn, stacks);
  if (reason) return { name: "ability.use", ok: false, reason, log: reason };
  if (!Number.isSafeInteger(turn) || turn < 0) return { name: "ability.use", ok: false, reason: "能力回合无效" };
  const ability = findAbility(game, args.abilityId);
  const { effect, amount, duration, healPercent } = ability.rule;
  const preview = actionPreview(game, ability.rule, stacks);
  const cost = preview.spiritualityCost;
  const abilityEffect = { abilityId: ability.id, name: ability.name, effect, targetId, spiritualityCost: cost, boostStacks: stacks, multiplier: preview.multiplier, healthCost: preview.healthCost };
  const statChanges = [];
  if (ability.target.kind === "enemy") {
    const combat = normalizeCombatState(game.combat);
    const enemy = combat.enemies.find(entry => entry.id === targetId);
    if (!enemy) return { name: "ability.use", ok: false, reason: "敌人数据无效" };
    abilityEffect.before = enemy.health;
    if (effect === "damage") {
      Object.assign(abilityEffect, damageEnemy(enemy, ability.rule.damagePercent, stacks, turn));
      if (ability.rule.healthOverTime) addHealthOverTime(enemy.statusEffects, ability, turn);
    } else if (effect === "control") {
      const progress = Math.max(0, Math.min(2, Number(game.character.abilityControl?.[targetId]) || 0)) + 1;
      game.character.abilityControl = { ...game.character.abilityControl, [targetId]: progress === 3 ? 0 : progress };
      abilityEffect.controlProgress = progress;
      if (progress === 3) {
        const firstBlockedTurn = enemy.lastActedTurn >= turn ? turn + 1 : turn;
        enemy.stunnedThroughTurn = Math.max(enemy.stunnedThroughTurn, firstBlockedTurn + 1);
        abilityEffect.stunnedThroughTurn = enemy.stunnedThroughTurn;
      }
    } else {
      const firstBlockedTurn = enemy.lastActedTurn >= turn ? turn + 1 : turn;
      enemy.stunnedThroughTurn = Math.max(enemy.stunnedThroughTurn, firstBlockedTurn + duration - 1);
      abilityEffect.stunnedThroughTurn = enemy.stunnedThroughTurn;
    }
    enemy.lastUpdatedTurn = turn;
    abilityEffect.after = enemy.health;
    game.combat = combat;
  } else if (effect === "analysis") {
    const clue = game.clues.find(entry => entry.id === targetId);
    abilityEffect.before = Math.max(0, Math.min(5, Number(clue.analysisProgress) || 0));
    clue.analysisProgress = Math.min(5, abilityEffect.before + amount);
    clue.analyzedBy = [...new Set([...(Array.isArray(clue.analyzedBy) ? clue.analyzedBy : []), ability.id])];
    abilityEffect.after = clue.analysisProgress;
    abilityEffect.clueId = clue.id;
  } else if (effect !== "health") {
    const change = applyStatDelta(game, effect, amount);
    if (change) statChanges.push(change);
  }
  const healthCostChange = applyStatDelta(game, "health", -preview.healthCost);
  if (healthCostChange) statChanges.push(healthCostChange);
  if (effect === "health") {
    const change = healCharacter(game, healPercent);
    if (change) statChanges.push(change);
    Object.assign(abilityEffect, { healPercent, healing: change?.delta || 0, before: change?.before, after: change?.after });
    if (ability.rule.healthOverTime) addHealthOverTime(game.statusEffects, ability, turn);
  }
  if (effect === "damage" && ability.rule.lifeSteal) {
    const change = stealLife(game, abilityEffect.damage, abilityEffect.maxHealth, ability.rule.lifeSteal);
    if (change) statChanges.push(change);
    abilityEffect.lifeStealHealing = change?.delta || 0;
  }
  const costChange = applyStatDelta(game, "spirituality", -cost);
  if (costChange) statChanges.push(costChange);
  game.character.abilityLastUsedTurn = turn;
  markMainAction(game, turn, stacks);
  const summary = effect === "damage"
    ? `按目标最大生命值的${displayPercent(abilityEffect.effectivePercent)}结算（向上取整）：${abilityEffect.enemyName}受到${abilityEffect.damage}点伤害，生命值${abilityEffect.before}→${abilityEffect.after} / ${abilityEffect.maxHealth}${abilityEffect.after === 0 ? "，已被击败" : ""}。`
    : effect === "health" ? `按自身最大生命值${healPercent}%治疗，实际恢复${abilityEffect.healing}点生命。` : ability.description;
  return { name: "ability.use", ok: true, log: `使用「${ability.name}」，消耗${cost}点灵性。${summary}`, data: { abilityEffect, statChanges } };
}
