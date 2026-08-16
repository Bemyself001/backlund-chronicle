const PATHWAY_IDS = {
  "占卜家": "seer",
  "学徒": "apprentice",
  "观众": "spectator",
  "水手": "sailor",
  "歌颂者": "bard",
  "阅读者": "reader",
  "不眠者": "sleepless",
  "收尸人": "corpse_collector",
  "战士": "warrior",
  "窥秘人": "mystery_pryer",
  "通识者": "generalist",
  "猎人": "hunter",
};

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
    pathwayId: PATHWAY_IDS[pathwayName] || pathwayName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "unknown",
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
