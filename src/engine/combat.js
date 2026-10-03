import {
  MAX_COMBAT_ENEMIES, MAX_ENEMY_HEALTH, MAX_ENEMY_ID_LENGTH, MAX_ENEMY_NAME_LENGTH,
  isEnemyStunned, normalizeCombatState,
} from "../system/combat.js";
import { applyStatDelta } from "./statChanges.js";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum && value <= MAX_ENEMY_HEALTH;
const text = (value, limit) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= limit;
const failure = (reason) => ({ ok: false, reason });
const change = (enemy, before, kind) => ({
  enemyId: enemy.id, name: enemy.name, kind, before, after: enemy.health,
  delta: before === null ? 0 : enemy.health - before, maxHealth: enemy.maxHealth, status: enemy.status,
});

// Validate against a detached state; failed calls leave the entire game untouched.
export function executeCombatTool(game, name, args, { turn = game.turn + 1 } = {}) {
  if (!record(args)) return failure("战斗工具参数必须是对象。");
  if (!Number.isSafeInteger(turn) || turn < 0) return failure("战斗回合无效。");
  const combat = normalizeCombatState(game.combat);
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
        enemy = {
          id: supplied.id.trim(), name: supplied.name.trim(), health, maxHealth: supplied.maxHealth,
          status: health === 0 ? "defeated" : "active", stunnedThroughTurn: -1, lastActedTurn: -1,
        };
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

  if (!["enemy.damage", "enemy.act", "enemy.leave"].includes(name)) return failure(`未知战斗工具：${name}`);
  if (!text(args.enemyId, MAX_ENEMY_ID_LENGTH)) return failure("必须指定有效的敌人 id。");
  const enemy = combat.enemies.find((entry) => entry.id === args.enemyId.trim());
  if (!enemy) return failure("该敌人尚未登记，请先建立遭遇。");
  if (enemy.status !== "active" || enemy.health <= 0) return failure("该敌人已被击败或离开当前遭遇。");
  const before = enemy.health;
  if (name === "enemy.damage") {
    if (!integer(args.amount, 1)) return failure(`敌人伤害必须是 1 至 ${MAX_ENEMY_HEALTH} 的有限整数。`);
    enemy.health = Math.max(0, enemy.health - args.amount);
    if (enemy.health === 0) enemy.status = "defeated";
    enemy.lastUpdatedTurn = turn;
    game.combat = combat;
    return {
      ok: true, log: `${enemy.name}受到 ${before - enemy.health} 点伤害，生命 ${enemy.health}/${enemy.maxHealth}${enemy.health === 0 ? "，已被击败" : ""}。`,
      data: { enemyChanges: [change(enemy, before, "damage")] },
    };
  }
  if (name === "enemy.leave") {
    enemy.status = "withdrawn";
    enemy.lastUpdatedTurn = turn;
    game.combat = combat;
    return { ok: true, log: `${enemy.name}离开当前遭遇。`, data: { enemyChanges: [change(enemy, before, "leave")] } };
  }

  if (!integer(args.damage)) return failure(`敌人行动伤害必须是 0 至 ${MAX_ENEMY_HEALTH} 的有限整数。`);
  if (!text(args.action, 500)) return failure("敌人行动需要不超过 500 字的行动描述。");
  if (isEnemyStunned(enemy, turn)) return failure(`${enemy.name}仍处于眩晕状态，本回合无法行动。`);
  if (enemy.lastActedTurn >= turn) return failure(`${enemy.name}本回合已经行动，不能重复行动。`);
  const stats = game.character?.stats;
  if (!stats || !Number.isSafeInteger(stats.health) || stats.health < 0
    || !Number.isSafeInteger(stats.maxHealth) || stats.maxHealth < 1 || stats.health > stats.maxHealth
    || !Array.isArray(game.statusEffects)) {
    return failure("玩家生命数据无效，无法结算敌人行动。");
  }
  enemy.lastActedTurn = turn;
  enemy.lastUpdatedTurn = turn;
  const statChange = applyStatDelta(game, "health", -args.damage);
  const damage = statChange ? -statChange.delta : 0;
  game.combat = combat;
  return {
    ok: true, log: `${enemy.name}：${args.action.trim()}${damage ? `；你受到 ${damage} 点伤害` : ""}。`,
    data: {
      enemyChanges: [change(enemy, before, "act")],
      enemyAction: { enemyId: enemy.id, name: enemy.name, turn, action: args.action.trim(), damage, requestedDamage: args.damage },
      statChanges: statChange ? [statChange] : [],
    },
  };
}
