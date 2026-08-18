export const PATHWAYS = [
  ["seer", "占卜家"],
  ["apprentice", "学徒"],
  ["spectator", "观众"],
  ["sailor", "水手"],
  ["bard", "歌颂者"],
  ["reader", "阅读者"],
  ["sleepless", "不眠者"],
  ["corpse_collector", "收尸人"],
  ["warrior", "战士"],
  ["mystery_pryer", "窥秘人"],
  ["generalist", "通识者"],
  ["hunter", "猎人"],
].map(([id, name]) => ({ id, name }));

export const PATHWAY_IDS = Object.fromEntries(PATHWAYS.map((pathway) => [pathway.name, pathway.id]));
export const PATHWAY_NAMES = Object.fromEntries(PATHWAYS.map((pathway) => [pathway.id, pathway.name]));

export function getPathway(pathwayId) {
  return PATHWAYS.find((pathway) => pathway.id === pathwayId) || null;
}

export function pathwayIdForName(pathwayName) {
  return PATHWAY_IDS[String(pathwayName || "").trim()] || null;
}

export function pathwayNameForId(pathwayId) {
  return PATHWAY_NAMES[String(pathwayId || "").trim()] || null;
}
