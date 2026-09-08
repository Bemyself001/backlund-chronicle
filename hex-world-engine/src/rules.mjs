/**
 * 规则层 —— 改变世界状态的唯一入口
 * 每个函数接收 state，原地修改并返回 { ok, log, ... } 结果。
 * AI 侧只能调用这些入口递送意图，全部空间计算在此完成。
 */
import { DIRECTIONS, directionByName, key, ringAround, areaWithin, distance } from "./coordinates.mjs";
import { terrainAt, terrainLabel, deterministicPick, IMPASSABLE_TERRAINS } from "./generation.mjs";

/** 创建一局新世界 */
export function createWorld(seed = 1) {
  const state = {
    seed: Number(seed) || 1,
    player: { q: 0, r: 0 },
    turn: 0,
    tiles: {},
  };
  // 出生点直接登记并揭开
  state.tiles[key(0, 0)] = { ...terrainAt(state, 0, 0), discovered: true };
  return state;
}

/** 登记/覆盖一格（内部使用）：揭开迷雾并写入状态 */
function settleTile(state, q, r, patch = {}) {
  const k = key(q, r);
  state.tiles[k] = { ...terrainAt(state, q, r), ...patch, discovered: true };
  return state.tiles[k];
}

/**
 * 向指定方向移动一格。
 * 校验方向合法性、地形通行性；通过后更新坐标、揭开目标格、推进轮次。
 */
export function move(state, directionName) {
  const dir = directionByName(directionName);
  if (!dir) return { ok: false, reason: `无效方向「${directionName}」，可用：${DIRECTIONS.map((d) => d.name).join("、")}` };
  const q = state.player.q + dir.dq;
  const r = state.player.r + dir.dr;
  const tile = terrainAt(state, q, r);
  if (IMPASSABLE_TERRAINS.has(tile.terrain)) {
    return { ok: false, reason: `${dir.name}方是${terrainLabel(tile.terrain)}，无法直接翻越` };
  }
  const settled = settleTile(state, q, r);
  state.player = { q, r };
  state.turn += 1;
  return {
    ok: true,
    log: `向${dir.name}移动，进入${terrainLabel(settled.terrain)}${settled.name ? `「${settled.name}」` : ""}`,
    position: { q, r },
    tile: settled,
  };
}

/** 方向夹角判定：目标格是否大致处于某个方向扇区（±60°） */
function inDirectionSector(origin, target, directionName) {
  if (!directionName) return true;
  const idx = DIRECTIONS.findIndex((d) => d.name === directionName);
  if (idx < 0) return true;
  // 将位移投影到立方坐标的三个方向分量做近似：目标应在该方向及其相邻两方向之一的射线上占优
  for (const offset of [-1, 0, 1]) {
    const d = DIRECTIONS[(idx + offset + 6) % 6];
    // 沿该方向走 distance 步能到达目标，即视为在该扇区内
    const steps = distance(origin, target);
    if (steps === 0) continue;
    if (origin.q + d.dq * steps === target.q && origin.r + d.dr * steps === target.r) return true;
  }
  return false;
}

/**
 * 在未知地块中按约束登记一个新地点。
 * AI 只提供语义约束（名称、地形、大致方向、距离上限），
 * 引擎圈定候选集后确定性抽签，同一提议在同一轮永远选中同一格。
 */
export function placeLocation(state, proposal = {}) {
  const name = String(proposal.name || "").trim();
  const terrain = String(proposal.terrain || "").trim();
  const direction = String(proposal.direction || "").trim();
  const maxDistance = Math.max(1, Math.min(6, Number(proposal.maxDistance) || 3));
  if (name.length < 2) return { ok: false, reason: "地点名称至少两个字" };
  // 重名检查：同名地点不重复生成，直接返回已有位置
  for (const [k, tile] of Object.entries(state.tiles)) {
    if (tile.name === name) {
      const [q, r] = k.split(",").map(Number);
      return { ok: true, reused: true, q, r, log: `「${name}」已在记录之中` };
    }
  }
  // 圈定候选：范围内、未登记（无名称）、地形匹配（若指定）、方向扇区吻合（若指定）
  const candidates = [];
  for (let d = 1; d <= maxDistance; d += 1) {
    for (const pos of ringAround(state.player.q, state.player.r, d)) {
      const tile = state.tiles[key(pos.q, pos.r)];
      if (tile?.name) continue;                       // 已有名地点的格子不覆盖
      const natural = terrainAt(state, pos.q, pos.r);
      if (IMPASSABLE_TERRAINS.has(natural.terrain)) continue;
      if (terrain && natural.terrain !== terrain) continue;
      if (!inDirectionSector(state.player, pos, direction)) continue;
      candidates.push(pos);
    }
  }
  if (!candidates.length) {
    return { ok: false, reason: `周围 ${maxDistance} 格内没有符合条件的区域（地形：${terrain || "不限"}，方向：${direction || "不限"}）` };
  }
  const pick = deterministicPick(state, candidates, name);
  settleTile(state, pick.q, pick.r, { name });
  return {
    ok: true,
    reused: false,
    q: pick.q,
    r: pick.r,
    distance: distance(state.player, pick),
    log: `「${name}」确定位于${direction ? `${direction}方` : "附近"} ${distance(state.player, pick)} 格的${terrainLabel(terrainAt(state, pick.q, pick.r).terrain)}上`,
  };
}

/** 揭开指定格子周围 radius 圈的迷雾（探索/登高远眺用） */
export function revealArea(state, q, r, radius = 1) {
  const revealed = [];
  for (const pos of areaWithin(q, r, Math.max(0, Math.min(3, radius)))) {
    const k = key(pos.q, pos.r);
    if (!state.tiles[k]?.discovered) {
      revealed.push(settleTile(state, pos.q, pos.r));
    }
  }
  return revealed;
}
