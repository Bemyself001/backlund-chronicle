import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { findTravelRoute, MAP_LOCATIONS } from "../src/data/map.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { minutesForTurn } from "../src/engine/turn.js";
import { ensureMapMoveToolCall } from "../src/services/mapTravel.js";

const known = ["east-station", "iron-gate", "soot-lamp", "queen-library"];

test("map exposes connected routes without crossing undiscovered locations", () => {
  assert.equal(MAP_LOCATIONS.length, 9);
  const direct = findTravelRoute("east-station", "soot-lamp", known);
  assert.equal(direct.minutes, 28);
  assert.deepEqual(direct.path, ["east-station", "soot-lamp"]);
  const crossDistrict = findTravelRoute("queen-library", "iron-gate", known);
  assert.equal(crossDistrict.minutes, 50);
  assert.deepEqual(crossDistrict.path, ["queen-library", "east-station", "iron-gate"]);
  assert.equal(findTravelRoute("east-station", "bridge-docks", known), null);
});

test("validated map travel updates location and supplies exact elapsed time", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "地图测试员" });
  const call = { id: "move-map-test", name: "location.move", args: { locationId: "soot-lamp" }, reason: "玩家从地图选择目的地" };
  const execution = executeToolCalls(game, [call]);
  assert.equal(execution.results[0].ok, true);
  assert.equal(execution.results[0].data.travelMinutes, 28);
  assert.equal(execution.game.location.id, "soot-lamp");
  assert.equal(minutesForTurn("前往桥区·雾鸦旅店", [call], execution.results), 28);
});

test("map travel refuses moving to the current place", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "地图测试员" });
  const execution = executeToolCalls(game, [{ id: "move-same", name: "location.move", args: { locationId: "east-station" }, reason: "重复选择当前位置" }]);
  assert.equal(execution.results[0].ok, false);
  assert.match(execution.results[0].reason, /已经位于/);
});

test("map selection always supplies a deterministic destination ID", () => {
  const destination = MAP_LOCATIONS.find((location) => location.id === "soot-lamp");
  const calls = ensureMapMoveToolCall([], destination, 4);
  assert.deepEqual(calls[0].args, { locationId: "soot-lamp" });
  assert.equal(calls[0].id, "map-move-4-soot-lamp");
});

test("map selection repairs an AI movement call without duplicating it", () => {
  const destination = MAP_LOCATIONS.find((location) => location.id === "queen-library");
  const calls = ensureMapMoveToolCall([
    { id: "ai-move", name: "location.move", args: { district: "错误城区" }, reason: "模型未提供地点 ID" },
    { id: "ai-clue", name: "clue.add", args: { name: "车票" } },
  ], destination, 5);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].args.locationId, "queen-library");
  assert.equal(calls[0].args.district, undefined);
  assert.equal(calls[0].id, "map-move-5-queen-library");
});
