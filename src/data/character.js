import { pathwayIdForName, pathwayNameForId } from "./pathways.js";

export function createAdvancement(character = {}) {
  if (character.extraordinary !== "low") {
    return {
      type: "ordinary",
      pathwayId: null,
      pathwayName: null,
      sequence: null,
      sequenceLabel: "普通人",
      status: "none",
      acquiredAt: "character_creation",
    };
  }
  const raw = String(character.pathway || "");
  const match = raw.match(/^(.+?)（序列(\d+)）$/);
  const pathwayName = match?.[1] || raw || "未登记途径";
  const sequence = Number(match?.[2] || 9);
  return {
    type: "extraordinary",
    pathwayId: pathwayIdForName(pathwayName) || pathwayName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "unknown",
    pathwayName,
    sequence,
    sequenceLabel: `序列${sequence}`,
    status: "stable",
    acquiredAt: "character_creation",
  };
}

export function withAdvancement(character = {}) {
  return { ...character, advancement: character.advancement ? { ...createAdvancement(character), ...character.advancement } : createAdvancement(character) };
}

export function getAdvancement(character = {}) {
  return character.advancement ? { ...createAdvancement(character), ...character.advancement } : createAdvancement(character);
}

export function applyAdvancement(character = {}, pathwayId, sequence, acquiredAt) {
  const pathwayName = pathwayNameForId(pathwayId);
  if (!pathwayName || !Number.isInteger(sequence) || sequence < 0 || sequence > 9) return null;
  const previous = getAdvancement(character);
  const spiritualGrowth = { 9: 3, 8: 1, 7: 1, 6: 1, 5: 2, 4: 2, 3: 2, 2: 3, 1: 3, 0: 4 }[sequence];
  const stats = { ...(character.stats || {}) };
  const previousMax = Number(stats.maxSpirituality || 0);
  stats.maxSpirituality = previousMax + spiritualGrowth;
  stats.spirituality = Math.min(stats.maxSpirituality, Number(stats.spirituality || 0) + spiritualGrowth);
  return {
    ...character,
    extraordinary: "low",
    pathway: `${pathwayName}（序列${sequence}）`,
    stats,
    advancement: {
      type: "extraordinary",
      pathwayId,
      pathwayName,
      sequence,
      sequenceLabel: `序列${sequence}`,
      status: "newly_promoted",
      acquiredAt,
      previousSequence: previous.sequence,
    },
  };
}
