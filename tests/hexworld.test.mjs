import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { MAP_LOCATIONS, hexDistance, hexForLocation } from "../src/data/map.js";
import { buildWorld, ensureWorld, hexContext, travelToLocation, visibleHexes, worldSeedFor } from "../src/data/hexworld.js";
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
