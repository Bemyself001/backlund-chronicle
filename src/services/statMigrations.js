import { getAdvancement } from "../system/character.js";
import { ADVANCEMENT_STATS_VERSION, INITIAL_STATS_VERSION, ALL_STAT_GROWTH_VERSION, BASE_HEALTH, totalSpiritualGrowth, totalRankGrowth } from "../system/characterStats.js";
import { syncStatCollapseStatuses } from "../engine/statChanges.js";

const LEGACY_GROWTH = { 9: 3, 8: 1, 7: 1, 6: 1, 5: 2, 4: 2, 3: 2, 2: 3, 1: 3, 0: 4 };

function addCapacity(stats, stat, amount) {
  const maxKey = `max${stat[0].toUpperCase()}${stat.slice(1)}`;
  if (amount <= 0 || !Number.isFinite(stats[stat]) || !Number.isFinite(stats[maxKey])) return;
  stats[maxKey] += amount;
  stats[stat] = stats[stat] === 0 && stat !== "spirituality" ? 0 : Math.max(0, Math.min(stats[maxKey], stats[stat] + amount));
}

// Each independent rule has a saved version, so reloading never heals or grants twice.
export function migrateCharacterStatRules(game) {
  const stats = { ...(game.character?.stats || {}) };
  if (Number(game.initialStatsVersion || 0) < INITIAL_STATS_VERSION) addCapacity(stats, "health", BASE_HEALTH - 10);
  if (Number(game.advancementStatsVersion || 0) < ADVANCEMENT_STATS_VERSION) {
    const advancement = getAdvancement(game.character);
    if (advancement.type === "extraordinary") {
      let oldGrowth = 0;
      for (let rank = 9; rank >= advancement.sequence; rank -= 1) oldGrowth += LEGACY_GROWTH[rank];
      addCapacity(stats, "spirituality", totalSpiritualGrowth(advancement.sequence) - oldGrowth);
    }
  }
  if (Number(game.allStatGrowthVersion || 0) < ALL_STAT_GROWTH_VERSION) {
    const advancement = getAdvancement(game.character);
    const growth = advancement.type === "extraordinary" ? totalRankGrowth(advancement.sequence) : 0;
    for (const stat of ["health", "sanity"]) {
      const wasZero = stats[stat] === 0;
      addCapacity(stats, stat, growth);
      if (wasZero) stats[stat] = 0;
    }
  }
  game.character = { ...game.character, stats };
  game.initialStatsVersion = Math.max(INITIAL_STATS_VERSION, Number(game.initialStatsVersion) || 0);
  game.advancementStatsVersion = Math.max(ADVANCEMENT_STATS_VERSION, Number(game.advancementStatsVersion) || 0);
  game.allStatGrowthVersion = Math.max(ALL_STAT_GROWTH_VERSION, Number(game.allStatGrowthVersion) || 0);
  syncStatCollapseStatuses(game);
  return game;
}
