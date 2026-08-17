import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { findTravelRoute, MAP_LOCATIONS, normalizeLocationKnowledge } from "../src/data/map.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { minutesForTurn } from "../src/engine/turn.js";
import { ensureMapMoveToolCall, ensureMockMapDiscoveryToolCall } from "../src/services/mapTravel.js";

const known = ["east-station", "iron-gate", "soot-lamp", "queen-library"];

test("initial map knowledge separates unknown, rumored, and discovered locations", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "地图测试员" });
  const knowledge = normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, game.location.id);
  assert.equal(knowledge["east-station"].status, "discovered");
  assert.equal(knowledge["queen-archive"].status, "rumored");
  assert.equal(knowledge["north-flats"].status, "unknown");
});

test("location discovery records a rumor before confirming the full place", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "地图测试员" });
  const execution = executeToolCalls(game, [{
    id: "rumor-north-flats",
    name: "location.discover",
    args: { locationId: "north-flats", status: "rumored", note: "搬运工提到北区有不查来历的廉租公寓。" },
    reason: "玩家向搬运工打听北区住处",
  }]);
  assert.equal(execution.results[0].ok, true);
  assert.equal(execution.game.locationKnowledge["north-flats"].status, "rumored");
  assert.equal(execution.game.discoveredLocations.some((location) => location.id === "north-flats"), false);
});

test("confirmed location discovery unlocks the place and its route", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "地图测试员" });
  const execution = executeToolCalls(game, [{
    id: "discover-queen-archive",
    name: "location.discover",
    args: { locationId: "queen-archive", status: "discovered", note: "从市政目录确认了档案馆的地址和开放时间。" },
    reason: "玩家查阅了火车站的市政目录",
  }]);
  assert.equal(execution.results[0].ok, true);
  assert.equal(execution.game.locationKnowledge["queen-archive"].status, "discovered");
  assert.equal(execution.game.discoveredLocations.some((location) => location.id === "queen-archive"), true);
  assert.ok(findTravelRoute("east-station", "queen-archive", execution.game.discoveredLocations.map((location) => location.id)));
});

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

test("Mock map investigation supplies a deterministic discovery call", () => {
  const calls = ensureMockMapDiscoveryToolCall([], { locationId: "queen-archive" }, 6);
  assert.equal(calls[0].name, "location.discover");
  assert.deepEqual(calls[0].args, {
    locationId: "queen-archive",
    status: "discovered",
    note: "保存旧地契、人口登记与部分封存案卷的石砌建筑。",
  });
});
