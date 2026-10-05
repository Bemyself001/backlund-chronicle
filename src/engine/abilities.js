import { getAdvancement } from "../system/character.js";
import { normalizeCombatState } from "../system/combat.js";
import { applyStatDelta } from "./statChanges.js";

const findAbility = (game, id) => getAdvancement(game.character).unlockedAbilities.find(entry => entry.id === id);
export function passiveAbilityModifier(game, abilityId, checkKind) {
  const ability = findAbility(game, abilityId);
  return ability?.kind === "passive" && ability.rule.checkKind === checkKind ? ability.rule.modifier : 0;
}
export function abilityAvailability(game, abilityId, targetId, turn = Number(game.turn || 0) + 1) {
  const ability = findAbility(game, abilityId);
  if (!ability) return "角色尚未解锁此能力";
  if (ability.kind === "passive") return "被动能力会在适用检定中提供加值，无需主动施放";
  if (Number(game.character?.stats?.health) <= 0 || Number(game.character?.stats?.sanity) <= 0) return "当前生命或理智归零，无法使用能力";
  if (Number(game.character?.abilityLastUsedTurn ?? -1) >= turn) return "本回合已经使用过能力";
  if (!Number.isFinite(game.character?.stats?.spirituality) || game.character.stats.spirituality < ability.rule.cost) return "灵性不足，无法支付能力消耗";
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
  const reason = abilityAvailability(game, args.abilityId, targetId, turn);
  if (reason) return { name: "ability.use", ok: false, reason, log: reason };
  if (!Number.isSafeInteger(turn) || turn < 0) return { name: "ability.use", ok: false, reason: "能力回合无效" };
  const ability = findAbility(game, args.abilityId);
  const { effect, amount, duration, cost } = ability.rule;
  const abilityEffect = { abilityId: ability.id, name: ability.name, effect, targetId, spiritualityCost: cost };
  const statChanges = [];
  if (ability.target.kind === "enemy") {
    const combat = normalizeCombatState(game.combat);
    const enemy = combat.enemies.find(entry => entry.id === targetId);
    if (!enemy) return { name: "ability.use", ok: false, reason: "敌人数据无效" };
    abilityEffect.before = enemy.health;
    if (effect === "damage") {
      enemy.health = Math.max(0, enemy.health - amount);
      if (enemy.health === 0) enemy.status = "defeated";
      abilityEffect.damage = abilityEffect.before - enemy.health;
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
  } else {
    const change = applyStatDelta(game, effect, amount);
    if (change) statChanges.push(change);
  }
  const costChange = applyStatDelta(game, "spirituality", -cost);
  if (costChange) statChanges.push(costChange);
  game.character.abilityLastUsedTurn = turn;
  return { name: "ability.use", ok: true, log: `使用「${ability.name}」，消耗${cost}点灵性。${ability.description}`, data: { abilityEffect, statChanges } };
}
