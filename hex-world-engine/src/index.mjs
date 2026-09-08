/**
 * hex-world-engine —— AI 叙事游戏的确定性世界物理层
 *
 * 分工原则：
 *   AI 只递语义意图、只读自然语言上下文；
 *   坐标、方向、距离、地形、选址全部由本引擎计算。
 */
export { DIRECTIONS, key, neighbors, distance, ringAround, areaWithin, directionByName } from "./coordinates.mjs";
export { stableHash, terrainAt, deterministicPick, terrainLabel, TERRAINS, TERRAIN_LABELS, IMPASSABLE_TERRAINS } from "./generation.mjs";
export { createWorld, move, placeLocation, revealArea } from "./rules.mjs";
export { describeSurroundings, describeKnownLocations, mapSummary } from "./context.mjs";

/** 存档：状态为纯 JSON 对象，直接序列化 */
export function saveWorld(state) {
  return JSON.stringify(state);
}

/** 读档 */
export function loadWorld(json) {
  const state = JSON.parse(json);
  if (!state || typeof state.seed !== "number" || !state.player || typeof state.tiles !== "object") {
    throw new Error("存档结构不完整");
  }
  return state;
}
