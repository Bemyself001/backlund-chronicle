/**
 * hexworld —— 游戏与 hex-world-engine 之间的适配层
 *
 * 注册表（data/map.js）仍是地点元数据的权威来源；
 * 引擎状态（game.world）负责空间真相：格子、迷雾、玩家坐标。
 * 世界可以从注册表 + 知识状态确定性重建，旧存档也能安全迁移。
 */
import { areaWithin, createWorld, distance as engineDistance, key as hexKey, neighbors, revealArea, stableHash, terrainAt } from "../../hex-world-engine/src/index.mjs";
import { getMapLocations, hexForLocation, isDiscoveredLocationStatus, normalizeLocationKnowledge } from "./map.js";

/** 城市语境下的地形展示名（引擎自然地形 → 雾都地貌） */
export const CITY_TERRAIN_LABELS = {
  plain: "街区",
  forest: "林荫区",
  hill: "坡地",
  mountain: "封闭厂区",
  river: "河道",
};

export function cityTerrainLabel(terrain) {
  return CITY_TERRAIN_LABELS[terrain] || terrain || "街区";
}

/** 世界种子：同名角色永远生成同一座城 */
export function worldSeedFor(game) {
  return stableHash("backlund", game?.character?.name || "佚名") % 100000;
}

/** 从注册表与知识状态构建/对齐引擎世界 */
export function buildWorld(game) {
  const world = createWorld(worldSeedFor(game));
  reconcileWorld(world, game);
  return world;
}

/**
 * 把注册表地点与知识状态同步进世界（幂等）。
 * 已揭开的地形格保留原样；命名格强制落在城市地形上。
 */
export function reconcileWorld(world, game) {
  const knowledge = normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, game.location?.id, game);
  const occupied = new Set();
  const locations = getMapLocations(game, { includeArchived: true }).filter((location) => location.lifecycle !== "archived");
  for (const location of locations) {
    let hex = hexForLocation(location);
    if (!hex) continue;
    // 防撞：同名格不可叠加，沿环向外找最近的空格
    if (occupied.has(hexKey(hex.q, hex.r))) {
      let radius = 1;
      let found = null;
      while (!found && radius <= 4) {
        for (const pos of areaWithin(hex.q, hex.r, radius)) {
          if (!occupied.has(hexKey(pos.q, pos.r))) { found = pos; break; }
        }
        radius += 1;
      }
      if (found) hex = found;
    }
    occupied.add(hexKey(hex.q, hex.r));
    location.q = hex.q;
    location.r = hex.r;
    const status = knowledge[location.id]?.status || "unknown";
    const known = isDiscoveredLocationStatus(status);
    const existing = world.tiles[hexKey(hex.q, hex.r)];
    world.tiles[hexKey(hex.q, hex.r)] = {
      terrain: existing?.terrain && existing.terrain !== "mountain" ? existing.terrain : "plain",
      name: known ? location.name.replace(/^.+?区[·・]/, "") : null,
      locationId: location.id,
      discovered: known,
      features: existing?.features || [],
    };
  }
  const currentHex = game.location?.id ? hexForLocation(getMapLocations(game, { includeArchived: true }).find((entry) => entry.id === game.location.id) || {}) : null;
  if (currentHex) {
    world.player = { q: currentHex.q, r: currentHex.r };
    const here = world.tiles[hexKey(currentHex.q, currentHex.r)];
    if (here) here.discovered = true;
  }
  world.turn = game.turn || 0;
  return world;
}

/** 确保 game.world 存在并与注册表对齐；旧存档无 world 时现场迁移 */
export function ensureWorld(game) {
  if (!game.world || typeof game.world.seed !== "number" || !game.world.tiles) {
    game.world = buildWorld(game);
    return game.world;
  }
  reconcileWorld(game.world, game);
  return game.world;
}

/** 移动到指定地点：更新玩家坐标并揭开目的地周边迷雾 */
export function travelToLocation(game, locationId) {
  const world = ensureWorld(game);
  const location = getMapLocations(game, { includeArchived: true }).find((entry) => entry.id === locationId);
  const hex = hexForLocation(location);
  if (!location || !hex) return null;
  const grids = engineDistance(world.player, hex);
  world.player = { q: hex.q, r: hex.r };
  const tile = world.tiles[hexKey(hex.q, hex.r)];
  if (tile) tile.discovered = true;
  revealArea(world, hex.q, hex.r, 1);
  world.turn = game.turn || world.turn;
  const minutes = grids === 0 ? 0 : 6 + grids * 7;
  const transport = grids <= 3 ? "步行" : grids <= 6 ? "公共马车" : "轨道马车";
  return { grids, minutes, transports: grids === 0 ? [] : [transport], path: [game.location?.id, locationId].filter(Boolean) };
}

/** 两格间的大致方向名（用于叙事与上下文） */
export function directionNameBetween(from, to) {
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  if (!dq && !dr) return "此处";
  // 轴坐标 → 像素方向角，再归入最近的六方向扇区
  const px = 1.5 * dq;
  const py = Math.sqrt(3) * (dr + dq / 2);
  const angle = Math.atan2(py, px) * 180 / Math.PI; // 东=0，顺时针为正
  const names = ["东", "东南", "西南", "西", "西北", "东北"];
  const index = Math.round(angle / 60);
  return names[((index % 6) + 6) % 6];
}

function describeHexTile(world, q, r) {
  const tile = world.tiles[hexKey(q, r)];
  if (!tile?.discovered) return "未知区域";
  return `${cityTerrainLabel(tile.terrain)}${tile.name ? `「${tile.name}」` : ""}`;
}

/** 每轮注入 AI 上下文的空间包：当前位置 + 六邻格 + 已知地点索引 */
export function hexContext(game) {
  const world = ensureWorld(game);
  const here = world.tiles[hexKey(world.player.q, world.player.r)] || terrainAt(world, world.player.q, world.player.r);
  const around = neighbors(world.player.q, world.player.r).map((n) => `- ${n.direction}：${describeHexTile(world, n.q, n.r)}`);
  const known = [];
  for (const tile of Object.values(world.tiles)) {
    if (!tile.discovered || !tile.name || !tile.locationId) continue;
    known.push(tile);
  }
  const locationLines = known.map((tile) => {
    const hex = Object.keys(world.tiles).find((k) => world.tiles[k] === tile);
    const [q, r] = String(hex).split(",").map(Number);
    const d = engineDistance(world.player, { q, r });
    return d === 0 ? `- 「${tile.name}」（当前所在）` : `- 「${tile.name}」（${directionNameBetween(world.player, { q, r })}方，约 ${d} 个街区）`;
  });
  return [
    `【当前位置】${cityTerrainLabel(here.terrain)}${here.name ? `「${here.name}」` : ""}`,
    "【周围】",
    ...around,
    locationLines.length ? "【已知地点】" : "【已知地点】尚无",
    ...locationLines,
  ].join("\n");
}

/** —— 以下为地图 UI 用的几何助手（平顶六边形） —— */

export function hexToPixel(q, r, size) {
  return { x: size * 1.5 * q, y: size * Math.sqrt(3) * (r + q / 2) };
}

export function hexPolygonPoints(cx, cy, size) {
  const points = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i);
    points.push(`${(cx + size * Math.cos(angle)).toFixed(2)},${(cy + size * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(" ");
}

/** 需要渲染的格子集合：以玩家为中心 radius 圈，外加所有命名/已知地点所在格 */
export function visibleHexes(game, radius = 4) {
  const world = ensureWorld(game);
  const set = new Map();
  for (const pos of areaWithin(world.player.q, world.player.r, radius)) {
    set.set(hexKey(pos.q, pos.r), pos);
  }
  for (const [k, tile] of Object.entries(world.tiles)) {
    if (!tile.discovered && !tile.locationId) continue;
    const [q, r] = k.split(",").map(Number);
    set.set(k, { q, r });
  }
  return [...set.values()].map((pos) => {
    const tile = world.tiles[hexKey(pos.q, pos.r)] || terrainAt(world, pos.q, pos.r);
    return { ...pos, tile, discovered: Boolean(world.tiles[hexKey(pos.q, pos.r)]?.discovered) };
  });
}
