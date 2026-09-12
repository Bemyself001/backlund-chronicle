/**
 * hexworld —— 系统层与 hex-world-engine 之间的适配层
 *
 * 固定内容（content/backlund/map.js）是地点元数据来源；
 * 引擎状态（game.world）负责空间真相：格子、迷雾、玩家坐标。
 * 世界可以从注册表 + 知识状态确定性重建，旧存档也能安全迁移。
 */
import { areaWithin, createWorld, distance as engineDistance, key as hexKey, neighbors, revealArea, stableHash, terrainAt } from "../../hex-world-engine/src/index.mjs";
import { getMapLocations, hexForLocation, isDiscoveredLocationStatus, normalizeLocationKnowledge } from "./map.js";
import { advanceWorldTime } from "../engine/turn.js";

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
  const registeredCurrentLocation = game.location?.id
    ? getMapLocations(game, { includeArchived: true }).find((entry) => entry.id === game.location.id)
    : null;
  const currentHex = hexForLocation(registeredCurrentLocation || game.location);
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

/** —— 探索模式：相邻无地点格子的本地探索（不消耗 AI 回合） —— */

const SCENERY = {
  plain: [
    "你沿街走了一段，煤气灯在湿石板路上投下长长的光晕。橱窗、门牌与行人的斗篷都寻常得近乎乏味——但这一带的门牌号、岔路与守夜人的巡逻节奏，你已经记在了心里。",
    "这一片街区没什么值得一提的地标，只有晾衣绳、煤烟味和远处教堂的钟声。你绕了两条巷子，确认了几条能快走脱身的小路。",
  ],
  forest: [
    "林荫区的树木在雾里显得格外高。你在长椅与铸铁围栏之间走了一圈，除了几只乌鸦和一位遛狗的老妇人，什么也没发现——但树篱后那条隐蔽小径的位置，你记下了。",
    "落叶在靴底发出潮湿的声响。这片林荫区白日里大概很体面，入夜后却静得能听见煤气灯的电流声。你确认了这里的出入口与视线死角。",
  ],
  hill: [
    "坡地的石阶比看起来更耗体力。站在高处，你能越过屋顶望见邻近街区的烟囱与塔尖——视野本身就有价值。这一带的坡道与阶梯走向，你已经摸清。",
    "你沿着坡道上下走了一遭。街面随高度错层排列，门牌顺序颇为古怪；好在现在你不需要再依赖猜测了。",
  ],
};

/** 判断格子是否可徒步探索（邻格、可通行、非剧情地点） */
export function canExploreHex(game, q, r) {
  const world = ensureWorld(game);
  if (engineDistance(world.player, { q, r }) !== 1) return { ok: false, reason: "只能探索相邻的街区" };
  const tile = world.tiles[hexKey(q, r)] || terrainAt(world, q, r);
  if (tile.locationId) return { ok: false, reason: "该处有已登记的地点，请使用前往或调查" };
  if (tile.terrain === "mountain" || tile.terrain === "river") return { ok: false, reason: `${cityTerrainLabel(tile.terrain)}无法徒步穿过` };
  return { ok: true, tile };
}

/**
 * 探索相邻的空格子：移动、揭开迷雾、推进时间，并生成一段本地景色描写。
 * 不调用 AI；返回 { narrative, minutes, tile }。
 */
export function exploreHex(game, q, r) {
  const check = canExploreHex(game, q, r);
  if (!check.ok) return check;
  const world = ensureWorld(game);
  const tile = check.tile;
  world.player = { q, r };
  const stored = world.tiles[hexKey(q, r)] || { ...tile };
  stored.discovered = true;
  world.tiles[hexKey(q, r)] = stored;
  revealArea(world, q, r, 1);
  const variant = stableHash(world.seed, "scenery", q, r) % (SCENERY[tile.terrain]?.length || 1);
  const narrative = (SCENERY[tile.terrain] || SCENERY.plain)[variant];
  game.location = { id: `hex:${q},${r}`, name: `未登记的${cityTerrainLabel(tile.terrain)}`, district: "贝克兰德城区", q, r };
  game.worldTime = advanceWorldTime(game.worldTime, EXPLORE_MINUTES);
  return { ok: true, narrative, minutes: EXPLORE_MINUTES, tile: stored };
}

export const EXPLORE_MINUTES = 13;

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
