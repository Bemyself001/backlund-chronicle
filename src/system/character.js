import { getUnlockedAbilities, getSequenceName, pathwayIdForName, pathwayNameForId } from "../content/index.js";
import { advancementCurrentStats, spiritualGrowthForSequence } from "./characterStats.js";
import { CHARACTERISTIC_MAX_SEQUENCE } from "./characteristics.js";

export function createAdvancement(character = {}) {
  if (character.extraordinary !== "low") {
    return {
      type: "ordinary",
      pathwayId: null,
      pathwayName: null,
      sequence: null,
      sequenceLabel: "普通人",
      sequenceName: "普通人",
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
    sequenceName: getSequenceName(pathwayIdForName(pathwayName), sequence),
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
    const advancement = { ...legacy, ...supplied, type: "ordinary", pathwayId: null, pathwayName: null, sequence: null, sequenceLabel: "普通人", sequenceName: "普通人", status: "none", unlockedAbilities: [] };
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
    sequenceName: getSequenceName(pathwayId, sequence),
    status: supplied?.status || "stable",
    unlockedAbilities: getUnlockedAbilities(pathwayId, sequence),
  };
  return { ...character, extraordinary: "low", pathway: `${pathwayName}（序列${sequence}）`, advancement };
}

export function getAdvancement(character = {}) {
  return withAdvancement(character).advancement;
}

export function applyAdvancement(character = {}, pathwayId, sequence, acquiredAt, options = {}) {
  const pathwayName = pathwayNameForId(pathwayId);
  if (!pathwayName || !Number.isInteger(sequence) || sequence < 0 || sequence > 9) return null;
  const previous = getAdvancement(character);
  if (previous.type === "ordinary" ? sequence !== 9 : previous.pathwayId !== pathwayId || sequence !== previous.sequence - 1) return null;
  const method = options.method || "potion";
  if (!["potion", "characteristic"].includes(method) || (method === "characteristic" && sequence > CHARACTERISTIC_MAX_SEQUENCE)) return null;
  const spiritualGrowth = spiritualGrowthForSequence(sequence);
  const stats = { ...(character.stats || {}) };
  const previousMax = Number(stats.maxSpirituality || 0);
  stats.maxSpirituality = previousMax + spiritualGrowth;
  if (sequence < 9) {
    stats.maxHealth = Number(stats.maxHealth) + spiritualGrowth;
    stats.maxSanity = Number(stats.maxSanity) + spiritualGrowth;
  }
  Object.assign(stats, advancementCurrentStats(stats, spiritualGrowth, method));
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
      sequenceName: getSequenceName(pathwayId, sequence),
      status: "newly_promoted",
      acquiredAt,
      previousSequence: previous.sequence,
      method,
      unlockedAbilities: getUnlockedAbilities(pathwayId, sequence),
    },
  };
}

export function isExplicitAdvancementIntent(action = "") {
  const text = String(action).replace(/\s+/g, "");
  if (/[?？]|是否|能否|可否|要不要|能不能|可不可以|明天|改天|下次|以后|稍后/.test(text)
    || /(?:不|别|取消|放弃|拒绝|暂缓|考虑|打算|计划).{0,16}(?:使用|服用|吸收|融合|吞服|喝下|饮下|吞下|摄入|晋升|成为非凡者)/.test(text)) return false;
  return /使用.{0,12}魔药|(服用|喝下|饮下|吞下|摄入).{0,8}(魔药|药剂)|(魔药|药剂).{0,8}(服用|喝下|饮下|吞下|摄入)|(?:吸收|融合|吞服|服用|使用).{0,20}非凡特性|非凡特性.{0,12}(?:吸收|融合|吞服|服用)|正式晋升|开始晋升|成为非凡者|晋升(?:到|至)?序列/.test(text);
}
