import test from "node:test";
import assert from "node:assert/strict";
import {
  DIRECTIONS, key, neighbors, distance, ringAround, areaWithin,
  createWorld, move, placeLocation, revealArea,
  describeSurroundings, describeKnownLocations, mapSummary,
  saveWorld, loadWorld, terrainAt,
} from "../src/index.mjs";

test("坐标数学：六邻接与距离", () => {
  assert.equal(DIRECTIONS.length, 6);
  const ns = neighbors(0, 0);
  assert.deepEqual(ns.map((n) => n.direction), ["东北", "东", "东南", "西南", "西", "西北"]);
  for (const n of ns) assert.equal(distance({ q: 0, r: 0 }, n), 1);
  assert.equal(distance({ q: 0, r: 0 }, { q: 3, r: -1 }), 3);
});

test("坐标数学：环与区域大小符合六边形公式", () => {
  assert.equal(ringAround(0, 0, 0).length, 1);
  assert.equal(ringAround(0, 0, 1).length, 6);
  assert.equal(ringAround(0, 0, 3).length, 18);
  assert.equal(areaWithin(0, 0, 2).length, 19); // 1 + 6 + 12
});

test("惰性生成：同一坐标地形恒定，不同种子世界不同", () => {
  const a = createWorld(42);
  const b = createWorld(42);
  const c = createWorld(7);
  let differs = false;
  for (let q = -5; q <= 5; q += 1) {
    for (let r = -5; r <= 5; r += 1) {
      assert.equal(terrainAt(a, q, r).terrain, terrainAt(b, q, r).terrain);
      if (terrainAt(a, q, r).terrain !== terrainAt(c, q, r).terrain) differs = true;
    }
  }
  assert.ok(differs, "不同种子应生成不同世界");
  // 未揭开的地形查询不写入状态（惰性）
  assert.equal(Object.keys(a.tiles).length, 1);
});

test("移动：合法方向揭开迷雾并推进轮次", () => {
  const state = createWorld(42);
  // 找一个可通行方向
  const dir = neighbors(0, 0).find((n) => !["mountain"].includes(terrainAt(state, n.q, n.r).terrain));
  const result = move(state, dir.direction);
  assert.equal(result.ok, true);
  assert.equal(state.player.q, dir.q);
  assert.equal(state.player.r, dir.r);
  assert.equal(state.turn, 1);
  assert.equal(state.tiles[key(dir.q, dir.r)].discovered, true);
});

test("移动：无效方向被拒绝", () => {
  const state = createWorld(42);
  const result = move(state, "北方");
  assert.equal(result.ok, false);
  assert.match(result.reason, /无效方向/);
  assert.equal(state.turn, 0);
});

test("移动：不可通行地形被拒绝且不位移", () => {
  const state = createWorld(42);
  // 在东侧人工放一座山
  state.tiles[key(1, 0)] = { terrain: "mountain", name: null, discovered: true, features: [] };
  const result = move(state, "东");
  assert.equal(result.ok, false);
  assert.match(result.reason, /无法直接翻越/);
  assert.deepEqual(state.player, { q: 0, r: 0 });
});

test("放置地点：约束选址、确定性抽签、重名复用", () => {
  const state = createWorld(42);
  const first = placeLocation(state, { name: "废弃瞭望塔", maxDistance: 3 });
  assert.equal(first.ok, true);
  assert.equal(first.reused, false);
  assert.ok(first.distance >= 1 && first.distance <= 3);
  // 同名提议 → 复用，不重复生成
  const again = placeLocation(state, { name: "废弃瞭望塔", maxDistance: 3 });
  assert.equal(again.ok, true);
  assert.equal(again.reused, true);
  assert.equal(again.q, first.q);
  assert.equal(again.r, first.r);
});

test("放置地点：苛刻约束落空时给出可读拒绝", () => {
  const state = createWorld(42);
  const result = placeLocation(state, { name: "不存在的湖", terrain: "river", direction: "东", maxDistance: 1 });
  if (!result.ok) assert.match(result.reason, /没有符合条件的区域/);
});

test("可重放：同一操作序列产生逐字节相同的世界", () => {
  const script = (s) => {
    const ops = [
      () => placeLocation(s, { name: "灰渡村", maxDistance: 2 }),
      () => move(s, "东"), () => move(s, "东南"), () => move(s, "东北"),
      () => placeLocation(s, { name: "猎人小屋", maxDistance: 3 }),
      () => revealArea(s, s.player.q, s.player.r, 1),
    ];
    for (const op of ops) op();
    return saveWorld(s);
  };
  assert.equal(script(createWorld(99)), script(createWorld(99)));
});

test("可存档：JSON 往返后引擎照常工作", () => {
  const state = createWorld(42);
  move(state, "东");
  placeLocation(state, { name: "驿站", maxDistance: 2 });
  const restored = loadWorld(saveWorld(state));
  assert.equal(saveWorld(restored), saveWorld(state));
  const result = move(restored, "东南");
  assert.ok(typeof result.ok === "boolean");
});

test("无 AI 可玩：模拟 60 步后状态自洽", () => {
  const state = createWorld(2026);
  for (let i = 0; i < 60; i += 1) {
    const dir = DIRECTIONS[i % 6].name;
    move(state, dir); // 山地会被拒，但状态必须保持合法
    assert.ok(Number.isInteger(state.player.q) && Number.isInteger(state.player.r));
    const here = state.tiles[key(state.player.q, state.player.r)];
    assert.ok(here?.discovered, "玩家所在格必定已揭开");
  }
  const summary = mapSummary(state);
  assert.ok(summary.discoveredTiles >= 1);
});

test("上下文打包：自然语言、含未知遮蔽与已知地名", () => {
  const state = createWorld(42);
  const text = describeSurroundings(state);
  assert.match(text, /【当前位置】/);
  assert.match(text, /东北：/);
  placeLocation(state, { name: "磨坊", maxDistance: 2 });
  // 磨坊未必在邻格，但已知地名索引必须收录
  assert.match(describeKnownLocations(state), /磨坊/);
});
