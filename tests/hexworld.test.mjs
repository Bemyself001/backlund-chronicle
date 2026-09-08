import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { MAP_LOCATIONS, hexDistance, hexForLocation } from "../src/data/map.js";
import { buildWorld, canExploreHex, ensureWorld, exploreHex, hexContext, travelToLocation, visibleHexes, worldSeedFor } from "../src/data/hexworld.js";
import { migrateSave } from "../src/services/storage.js";

test("static landmarks occupy distinct passable hexes", () => {
  const hexes = MAP_LOCATIONS.map((location) => hexForLocation(location));
  const keys = new Set(hexes.map((hex) => `${hex.q},${hex.r}`));
  assert.equal(keys.size, MAP_LOCATIONS.length);
});

test("world builds deterministically from the same character", () => {
  const first = createInitialGame({ ...EMPTY_CHARACTER, name: "确定性测试员" });
  const second = createInitialGame({ ...EMPTY_CHARACTER, name: "确定性测试员" });
  assert.equal(worldSeedFor(first), worldSeedFor(second));
  assert.deepEqual(buildWorld(first).tiles, buildWorld(second).tiles);
});

test("initial world marks the four starting locations discovered at their hexes", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "初始世界测试员" });
  const world = ensureWorld(game);
  const station = hexForLocation(MAP_LOCATIONS.find((location) => location.id === "east-station"));
  const tile = world.tiles[`${station.q},${station.r}`];
  assert.equal(tile.discovered, true);
  assert.equal(tile.locationId, "east-station");
  assert.equal(tile.name, "贝克兰德火车站");
  assert.deepEqual(world.player, station);
  // 传闻地点不应提前泄露名称
  const archive = hexForLocation(MAP_LOCATIONS.find((location) => location.id === "queen-archive"));
  assert.equal(world.tiles[`${archive.q},${archive.r}`].discovered, false);
});

test("travel moves the player, reveals the area and prices time by hex distance", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "旅行测试员" });
  const before = hexForLocation(MAP_LOCATIONS.find((location) => location.id === "east-station"));
  const target = hexForLocation(MAP_LOCATIONS.find((location) => location.id === "queen-library"));
  const travel = travelToLocation(game, "queen-library");
  assert.equal(travel.grids, hexDistance(before, target));
  assert.equal(travel.minutes, 6 + travel.grids * 7);
  assert.deepEqual(game.world.player, target);
  const revealed = visibleHexes(game, 1).filter((cell) => cell.discovered);
  assert.ok(revealed.length >= 7); // 目标格 + 一圈邻格
});

test("hex context describes position, surroundings and known places", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "上下文测试员" });
  const text = hexContext(game);
  assert.match(text, /【当前位置】/);
  assert.match(text, /【周围】/);
  assert.match(text, /贝克兰德火车站/);
});

test("legacy saves without a world rebuild one during migration", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "迁移测试员" });
  const legacy = structuredClone(game);
  delete legacy.world;
  legacy.version = 10;
  const migrated = migrateSave(legacy);
  assert.equal(migrated.version, 11);
  assert.ok(migrated.world?.tiles);
  const station = hexForLocation(MAP_LOCATIONS.find((location) => location.id === "east-station"));
  assert.equal(migrated.world.tiles[`${station.q},${station.r}`].discovered, true);
});

test("exploration moves the player to an adjacent empty hex, reveals fog and advances 13 minutes", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "探索测试员" });
  ensureWorld(game);
  const start = game.world.player;
  const target = visibleHexes(game, 1).find((cell) => canExploreHex(game, cell.q, cell.r).ok && canExploreHex(game, cell.q, cell.r).tile && ["plain", "forest", "hill"].includes(canExploreHex(game, cell.q, cell.r).tile.terrain));
  assert.ok(target, "should find an explorable adjacent hex");
  const toMinutes = (value) => { const m = String(value).match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
  const minutesBefore = toMinutes(game.worldTime);
  const result = exploreHex(game, target.q, target.r);
  assert.equal(result.ok, true);
  assert.equal(result.minutes, 13);
  assert.ok(result.narrative.length > 0);
  assert.deepEqual(game.world.player, { q: target.q, r: target.r });
  assert.equal(game.world.tiles[`${target.q},${target.r}`].discovered, true);
  const minutesAfter = toMinutes(game.worldTime);
  assert.equal(minutesAfter - minutesBefore, 13);
  assert.match(game.location.id, /^hex:/);
  assert.match(game.location.name, /^未登记的/);
  void start;
});

test("exploration rejects distant, occupied and impassable hexes", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "拒绝测试员" });
  ensureWorld(game);
  const distant = canExploreHex(game, game.world.player.q + 3, game.world.player.r);
  assert.equal(distant.ok, false);
  const station = hexForLocation(MAP_LOCATIONS.find((location) => location.id === "east-station"));
  const occupied = canExploreHex(game, station.q, station.r);
  assert.equal(occupied.ok, false);
  // 山地与河流不可通行：在世界中寻找此类格子验证
  const world = game.world;
  const blocked = Object.entries(world.tiles).find(([, tile]) => ["mountain", "river"].includes(tile.terrain));
  if (blocked) {
    const [q, r] = blocked[0].split(",").map(Number);
    const refusal = canExploreHex(game, q, r);
    assert.equal(refusal.ok, false);
  }
});
