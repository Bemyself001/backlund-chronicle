import { getUnlockedAbilities, pathwayIdForName, pathwayNameForId } from "./pathways.js";

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
      unlockedAbilities: [],
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
    unlockedAbilities: getUnlockedAbilities(pathwayIdForName(pathwayName), sequence),
  };
}

export function withAdvancement(character = {}) {
  const legacy = createAdvancement(character);
  const supplied = character.advancement && typeof character.advancement === "object" ? character.advancement : null;
  const type = supplied?.type === "extraordinary" || (!supplied && legacy.type === "extraordinary") ? "extraordinary" : "ordinary";
  if (type === "ordinary") {
    const advancement = { ...legacy, ...supplied, type: "ordinary", pathwayId: null, pathwayName: null, sequence: null, sequenceLabel: "普通人", status: "none", unlockedAbilities: [] };
    return { ...character, extraordinary: "ordinary", pathway: "无", advancement };
  }
  const pathwayId = String(supplied?.pathwayId || legacy.pathwayId || "");
  const pathwayName = pathwayNameForId(pathwayId) || supplied?.pathwayName || legacy.pathwayName;
  const sequence = Number(supplied?.sequence ?? legacy.sequence);
  if (!pathwayName || !Number.isInteger(sequence) || sequence < 0 || sequence > 9) return { ...character, extraordinary: "ordinary", pathway: "无", advancement: createAdvancement({ ...character, extraordinary: "ordinary" }) };
  const advancement = {
    ...legacy,
    ...supplied,
    type: "extraordinary",
    pathwayId,
    pathwayName,
    sequence,
    sequenceLabel: `序列${sequence}`,
    status: supplied?.status || "stable",
    unlockedAbilities: getUnlockedAbilities(pathwayId, sequence),
  };
  return { ...character, extraordinary: "low", pathway: `${pathwayName}（序列${sequence}）`, advancement };
}

export function getAdvancement(character = {}) {
  return withAdvancement(character).advancement;
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
      unlockedAbilities: getUnlockedAbilities(pathwayId, sequence),
    },
  };
}

export function isExplicitAdvancementIntent(action = "") {
  const text = String(action).replace(/\s+/g, "");
  return /(服用|喝下|饮下|吞下|摄入).{0,8}(魔药|药剂)|(魔药|药剂).{0,8}(服用|喝下|饮下|吞下|摄入)|正式晋升|开始晋升|成为非凡者|晋升(?:到|至)?序列/.test(text);
}
