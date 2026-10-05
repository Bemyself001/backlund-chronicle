import { normalizeHealthEffect } from "./healthRules.js";

export const MAX_ENEMY_HEALTH = 1_000_000;
export const MAX_COMBAT_ENEMIES = 100;
export const MAX_ENEMY_ID_LENGTH = 80;
export const MAX_ENEMY_NAME_LENGTH = 120;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const finiteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const savedTurn = (value) => Number.isSafeInteger(value) && value >= -1 ? value : -1;

// Import only the small, serializable combat schema; absent combat is an empty encounter history.
export function normalizeCombatState(rawCombat = {}) {
  const enemies = [];
  const byId = new Map();
  const entries = isRecord(rawCombat) && Array.isArray(rawCombat.enemies) ? rawCombat.enemies : [];
  for (const raw of entries) {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") continue;
    const id = raw.id.trim();
    const name = raw.name.trim();
    if (!id || id.length > MAX_ENEMY_ID_LENGTH || !name || name.length > MAX_ENEMY_NAME_LENGTH) continue;
    if (!finiteNumber(raw.maxHealth) || raw.maxHealth < 1) continue;
    if (raw.health !== undefined && !finiteNumber(raw.health)) continue;
    if (raw.status !== undefined && !["active", "defeated", "withdrawn"].includes(raw.status)) continue;
    const maxHealth = Math.min(MAX_ENEMY_HEALTH, Math.trunc(raw.maxHealth));
    const health = raw.status === "defeated" ? 0 : Math.max(0, Math.min(maxHealth, Math.trunc(raw.health ?? maxHealth)));
    const status = health === 0 ? "defeated" : raw.status || "active";
    const duplicate = byId.get(id);
    if (duplicate) {
      // A duplicate record may never bring a defeated enemy back to life.
      if (status === "defeated") {
        duplicate.health = 0;
        duplicate.status = "defeated";
      }
      continue;
    }
    if (enemies.length >= MAX_COMBAT_ENEMIES) continue;
    const enemy = {
      id, name, health, maxHealth, status,
      stunnedThroughTurn: savedTurn(raw.stunnedThroughTurn),
      lastActedTurn: savedTurn(raw.lastActedTurn),
      lastUpdatedTurn: Math.max(0, savedTurn(raw.lastUpdatedTurn)),
      moveSet: "standard", windupTurn: savedTurn(raw.windupTurn), heavyReadyTurn: savedTurn(raw.heavyReadyTurn),
      guardedThroughTurn: savedTurn(raw.guardedThroughTurn),
      statusEffects: (Array.isArray(raw.statusEffects) ? raw.statusEffects : []).flatMap(status => {
        const healthEffect = normalizeHealthEffect(status?.healthEffect);
        return typeof status?.id === "string" && typeof status.name === "string" && healthEffect ? [{ id: status.id, name: status.name, description: String(status.description || ""), healthEffect }] : [];
      }).slice(0, 30),
    };
    enemies.push(enemy);
    byId.set(id, enemy);
  }
  return { enemies };
}

export function activeEnemies(game) {
  return (game?.combat?.enemies || []).filter((enemy) => enemy.status === "active" && enemy.health > 0);
}

export function isEnemyStunned(enemy, turn) {
  return Number.isSafeInteger(turn) && turn >= 0 && Number.isSafeInteger(enemy?.stunnedThroughTurn)
    && enemy.stunnedThroughTurn >= turn;
}
