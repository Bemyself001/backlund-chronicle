import {
  MAX_COMBAT_ENEMIES, MAX_ENEMY_HEALTH, MAX_ENEMY_ID_LENGTH, MAX_ENEMY_NAME_LENGTH,
  isEnemyStunned, normalizeCombatState,
} from "../system/combat.js";
import { applyStatDelta } from "./statChanges.js";
import { BASIC_ATTACK_RULE, ENEMY_MOVES, displayPercent, healthPoints } from "../system/healthRules.js";
import { actionPreview, mainActionGate, markMainAction, preparationGate } from "../system/combatActions.js";
import { damageEnemy } from "./healthEffects.js";
import { weakPointAssessment } from "../system/weakPoints.js";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum && value <= MAX_ENEMY_HEALTH;
const text = (value, limit) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= limit;
const failure = (reason) => ({ ok: false, reason });
const change = (enemy, before, kind) => ({
  enemyId: enemy.id, name: enemy.name, kind, before, after: enemy.health,
  delta: before === null ? 0 : enemy.health - before, maxHealth: enemy.maxHealth, status: enemy.status,
});

export function combatActionAvailability(game, args = {}, turn = Number(game.turn || 0) + 1) {
  const gate = mainActionGate(game, turn);
  if (gate) return gate;
  if (!["attack", "defend", "wait"].includes(args.actionId)) return "请选择普通攻击、防御或观察";
  if (!(game.combat?.enemies || []).some(enemy => enemy.status === "active" && enemy.health > 0)) return "当前没有仍在场的敌人";
  if (args.actionId === "attack" && !game.combat.enemies.some(enemy => enemy.id === args.enemyId && enemy.status === "active" && enemy.health > 0)) return "请选择当前遭遇中尚未被击败的敌人";
  return preparationGate(game, { ...BASIC_ATTACK_RULE, effect: args.actionId === "attack" ? "damage" : "defend" }, args.boostStacks ?? 0);
}

// Validate against a detached state; failed calls leave the entire game untouched.
export function executeCombatTool(game, name, args, { turn = game.turn + 1, playerAction = "" } = {}) {
  if (!record(args)) return failure("战斗工具参数必须是对象。");
  if (!Number.isSafeInteger(turn) || turn < 0) return failure("战斗回合无效。");
  const combat = normalizeCombatState(game.combat);
  if (name === "enemy.damage") return failure("伤害点数不能由AI指定；普通攻击请使用combat.action，技能请使用ability.use");
  if (name === "combat.action") {
    if (["amount", "damage", "damagePercent"].some(key => Object.hasOwn(args, key))) return failure("伤害参数由本地招式决定，不能自行提供数值");
    const gate = combatActionAvailability(game, args, turn);
    if (gate) return failure(gate);
    const stacks = args.boostStacks ?? 0;
    const assessment = weakPointAssessment(args.weakPoint, { playerAction, damage: args.actionId === "attack" });
    if (assessment.reason) return failure(assessment.reason);
    const preview = actionPreview(game, { ...BASIC_ATTACK_RULE, effect: args.actionId === "attack" ? "damage" : "defend" }, stacks, null, assessment.bonus);
    let attack = null;
    if (args.actionId === "attack") {
      const enemy = combat.enemies.find(entry => entry.id === args.enemyId);
      if (!enemy) return failure("敌人数据无效");
      attack = damageEnemy(enemy, preview.combinedDamagePercent, stacks, turn, preview.weakPointBonusPercent);
    }
    const cost = applyStatDelta(game, "spirituality", -preview.spiritualityCost);
    if (args.actionId === "defend") game.character.guardedThroughTurn = turn;
    markMainAction(game, turn, stacks);
    game.combat = combat;
    return { ok: true, log: attack ? `普通攻击${preview.weapon ? `（${preview.weapon.name}附加${displayPercent(preview.weaponBonusPercent)}）` : ""}${preview.weakPoint ? `；弱点「${preview.weakPoint.name}」奖励${displayPercent(preview.weakPointBonusPercent)}：${preview.weakPoint.evidence}；` : ""}按目标最大生命值${displayPercent(attack.effectivePercent)}结算：${attack.enemyName}受到${attack.damage}点伤害，生命${attack.before}→${attack.after}/${attack.maxHealth}${attack.after === 0 ? "，已被击败" : ""}。`
      : args.actionId === "defend" ? "采取防御姿态，本回合敌人的直接攻击伤害比例减半。" : "观察局势，结束本回合的主要行动。",
    data: { combatAction: { actionId: args.actionId, ...preview, ...attack, stacks, turn }, statChanges: cost ? [cost] : [],
      enemyChanges: attack ? [change(combat.enemies.find(entry => entry.id === args.enemyId), attack.before, "damage")] : [] } };
  }
  if (name === "enemy.encounter") {
    if (!Array.isArray(args.enemies) || !args.enemies.length || args.enemies.length > MAX_COMBAT_ENEMIES) {
      return failure(`遭遇必须提供 1 至 ${MAX_COMBAT_ENEMIES} 名敌人。`);
    }
    const seen = new Set();
    for (const enemy of args.enemies) {
      if (!record(enemy) || !text(enemy.id, MAX_ENEMY_ID_LENGTH) || !text(enemy.name, MAX_ENEMY_NAME_LENGTH)) {
        return failure("每名敌人都需要有效且长度受限的 id 与姓名。");
      }
      if (seen.has(enemy.id.trim())) return failure("同一次遭遇不能重复登记同一敌人。");
      seen.add(enemy.id.trim());
      if (!integer(enemy.maxHealth, 1) || (enemy.health !== undefined && (!integer(enemy.health) || enemy.health > enemy.maxHealth))) {
        return failure(`敌人生命必须为有限整数，生命上限须在 1 至 ${MAX_ENEMY_HEALTH} 之间，当前生命不能超过上限。`);
      }
    }
    const newCount = args.enemies.filter((entry) => !combat.enemies.some((enemy) => enemy.id === entry.id.trim())).length;
    if (combat.enemies.length + newCount > MAX_COMBAT_ENEMIES) return failure("敌人记录已达保存上限，无法登记新的敌人。");
    const enemyChanges = [];
    for (const supplied of args.enemies) {
      let enemy = combat.enemies.find((entry) => entry.id === supplied.id.trim());
      const before = enemy?.health ?? null;
      if (!enemy) {
        const health = supplied.health ?? supplied.maxHealth;
        enemy = normalizeCombatState({ enemies: [{
          id: supplied.id.trim(), name: supplied.name.trim(), health, maxHealth: supplied.maxHealth,
          status: health === 0 ? "defeated" : "active", stunnedThroughTurn: -1, lastActedTurn: -1,
        }] }).enemies[0];
        combat.enemies.push(enemy);
      } else if (enemy.status === "withdrawn" && enemy.health > 0) {
        enemy.status = "active";
      }
      enemy.lastUpdatedTurn = turn;
      enemyChanges.push(change(enemy, before, "encounter"));
    }
    game.combat = combat;
    return { ok: true, log: `登记遭遇：${enemyChanges.map((enemy) => `${enemy.name}（${enemy.after}/${enemy.maxHealth}）`).join("、")}。`, data: { enemyChanges } };
  }

  if (!["enemy.act", "enemy.leave"].includes(name)) return failure(`未知战斗工具：${name}`);
  if (!text(args.enemyId, MAX_ENEMY_ID_LENGTH)) return failure("必须指定有效的敌人 id。");
  const enemy = combat.enemies.find((entry) => entry.id === args.enemyId.trim());
  if (!enemy) return failure("该敌人尚未登记，请先建立遭遇。");
  if (enemy.status !== "active" || enemy.health <= 0) return failure("该敌人已被击败或离开当前遭遇。");
  const before = enemy.health;
  if (name === "enemy.leave") {
    enemy.status = "withdrawn";
    enemy.lastUpdatedTurn = turn;
    game.combat = combat;
    return { ok: true, log: `${enemy.name}离开当前遭遇。`, data: { enemyChanges: [change(enemy, before, "leave")] } };
  }

  if (["damage", "amount", "damagePercent"].some(key => Object.hasOwn(args, key))) return failure("敌人伤害由本地招式决定，请提供moveId，不能自行填写伤害数值");
  const move = Object.hasOwn(ENEMY_MOVES, args.moveId) ? ENEMY_MOVES[args.moveId] : null;
  if (!move) return failure("敌人招式必须来自本地登记的moveId");
  if (args.action !== undefined && !text(args.action, 500)) return failure("敌人行动描述不能超过500字");
  if (isEnemyStunned(enemy, turn)) return failure(`${enemy.name}仍处于眩晕状态，本回合无法行动。`);
  if (enemy.lastActedTurn >= turn) return failure(`${enemy.name}本回合已经行动，不能重复行动。`);
  if (args.moveId === "heavy" && !(enemy.windupTurn >= 0 && enemy.windupTurn < turn && enemy.heavyReadyTurn <= turn)) return failure("重击必须先在此前回合蓄力，且冷却已经结束");
  if (args.moveId === "windup" && enemy.heavyReadyTurn > turn) return failure("重击尚在冷却，无法再次蓄力");
  const stats = game.character?.stats;
  if (!stats || !Number.isSafeInteger(stats.health) || stats.health < 0
    || !Number.isSafeInteger(stats.maxHealth) || stats.maxHealth < 1 || stats.health > stats.maxHealth
    || !Array.isArray(game.statusEffects)) {
    return failure("玩家生命数据无效，无法结算敌人行动。");
  }
  enemy.lastActedTurn = turn;
  enemy.lastUpdatedTurn = turn;
  if (args.moveId === "windup") enemy.windupTurn = turn;
  else if (args.moveId === "heavy") { enemy.windupTurn = -1; enemy.heavyReadyTurn = turn + move.cooldown + 1; }
  else enemy.windupTurn = -1;
  if (args.moveId === "guard") enemy.guardedThroughTurn = turn + 1;
  const damagePercent = game.character.guardedThroughTurn >= turn ? move.damagePercent / 2 : move.damagePercent;
  const requestedDamage = healthPoints(stats.maxHealth, damagePercent);
  const statChange = applyStatDelta(game, "health", -requestedDamage);
  const damage = statChange ? -statChange.delta : 0;
  game.combat = combat;
  return {
    ok: true, log: `${enemy.name}：${move.name}${args.action ? `（${args.action.trim()}）` : ""}${damage ? `；按你最大生命值${displayPercent(damagePercent)}结算，你受到${damage}点伤害` : ""}${args.moveId === "windup" ? "；下一回合可发动20%最大生命值的重击" : ""}。`,
    data: {
      enemyChanges: [change(enemy, before, "act")],
      enemyAction: { enemyId: enemy.id, name: enemy.name, turn, moveId: args.moveId, action: move.name, damagePercent, damage, requestedDamage },
      statChanges: statChange ? [statChange] : [],
    },
  };
}
