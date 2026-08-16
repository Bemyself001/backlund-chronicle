import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { findTravelRoute, MAP_LOCATIONS } from "../src/data/map.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { minutesForTurn } from "../src/engine/turn.js";

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
