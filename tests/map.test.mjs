import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { findLocationRelations, findTravelRoute, getChildLocations, getMapLocation, getMapLocations, MAP_LOCATIONS, normalizeLocationKnowledge, planDynamicLocation } from "../src/data/map.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { minutesForTurn } from "../src/engine/turn.js";
import { ensureMapMoveToolCall, ensureMockMapDiscoveryToolCall } from "../src/services/mapTravel.js";

const known = ["east-station", "iron-gate", "soot-lamp", "queen-library"];
const apothecary = {
  name: "红烟囱药材铺",
  district: "东区",
  kind: "shop",
  scope: "landmark",
  anchorId: "iron-gate",
  rumor: "铁门街深处据说有一家只在傍晚开门的药材铺。",
  description: "门面狭窄的药材铺，红铜烟管从二楼窗沿伸出。",
  status: "rumored",
  temporary: false,
};

test("initial map knowledge separates unknown, rumored, and discovered locations", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "地图测试员" });
  const knowledge = normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, game.location.id, game);
  assert.equal(knowledge["east-station"].status, "visited");
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
  assert.equal(execution.game.locationKnowledge["soot-lamp"].status, "visited");
  assert.equal(minutesForTurn("前往桥区·雾鸦旅店", [call], execution.results), 28);
});

test("story growth creates a persistent local node without exposing a rumored true name", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "地图生长测试员" });
  const execution = executeToolCalls(game, [{ id: "grow-shop", name: "location.grow", args: { location: apothecary }, reason: "多个来源提到同一间店" }]);
  const result = execution.results[0];
  assert.equal(result.ok, true);
  assert.equal(execution.game.mapExtensions.locations.length, 1);
  assert.equal(execution.game.mapExtensions.routes.length, 1);
  assert.equal(execution.game.locationKnowledge[result.data.locationId].status, "rumored");
  assert.equal(execution.game.discoveredLocations.some((entry) => entry.id === result.data.locationId), false);
  assert.equal(Object.hasOwn(result.data, "name"), false);
  assert.doesNotMatch(result.log, /红烟囱药材铺/);
});

test("dynamic locations deduplicate deterministically and become traversable after confirmation", () => {
  const firstGame = createInitialGame({ ...EMPTY_CHARACTER, name: "去重测试员" });
  const secondGame = createInitialGame({ ...EMPTY_CHARACTER, name: "坐标测试员" });
  const firstPlan = planDynamicLocation(firstGame, apothecary, 1);
  const secondPlan = planDynamicLocation(secondGame, apothecary, 1);
  assert.equal(firstPlan.location.id, secondPlan.location.id);
  assert.deepEqual({ x: firstPlan.location.x, y: firstPlan.location.y }, { x: secondPlan.location.x, y: secondPlan.location.y });

  const grown = executeToolCalls(firstGame, [{ id: "grow-shop", name: "location.grow", args: { location: apothecary }, reason: "听到店铺传闻" }]);
  const repeated = executeToolCalls(grown.game, [{ id: "grow-shop-again", name: "location.grow", args: { location: { ...apothecary, status: "discovered" } }, reason: "找到了准确门牌" }]);
  const locationId = repeated.results[0].data.locationId;
  assert.equal(repeated.results[0].data.reused, true);
  assert.equal(repeated.game.mapExtensions.locations.length, 1);
  assert.equal(repeated.game.locationKnowledge[locationId].status, "discovered");
  assert.ok(findTravelRoute("east-station", locationId, repeated.game.discoveredLocations.map((entry) => entry.id), repeated.game));

  const moved = executeToolCalls(repeated.game, [{ id: "move-dynamic", name: "location.move", args: { locationId }, reason: "从地图选择新地点" }]);
  assert.equal(moved.results[0].ok, true);
  assert.equal(moved.game.location.id, locationId);
  assert.equal(moved.game.locationKnowledge[locationId].status, "visited");
});

test("interiors remain child locations and temporary unused places can be archived", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "子地点测试员" });
  const proposal = {
    name: "旧木箱地下室", district: "东区", kind: "interior", scope: "interior", anchorId: "east-station",
    rumor: "站房内部似乎还有一层未登记的地下空间。", description: "石阶尽头是一间低矮地下室，墙边堆着旧木箱。",
    status: "discovered", temporary: true,
  };
  const grown = executeToolCalls(game, [{ id: "grow-cellar", name: "location.grow", args: { location: proposal }, reason: "亲自确认地下室入口" }]);
  const locationId = grown.results[0].data.locationId;
  assert.equal(getChildLocations(grown.game, "east-station").some((location) => location.id === locationId), true);
  assert.equal(getMapLocations(grown.game, { includeInteriors: false }).some((location) => location.id === locationId), false);

  const archived = executeToolCalls(grown.game, [{ id: "archive-cellar", name: "location.archive", args: { locationId, evidence: "施工队已经永久封死入口" }, reason: "该临时空间不再可用" }]);
  assert.equal(archived.results[0].ok, true);
  assert.equal(getMapLocation(locationId, archived.game), null);
  assert.equal(getMapLocation(locationId, archived.game, { includeArchived: true }).lifecycle, "archived");
  assert.equal(archived.game.discoveredLocations.some((location) => location.id === locationId), false);
});

test("dynamic growth rejects anchors that the player has not discovered", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "锚点测试员" });
  const execution = executeToolCalls(game, [{
    id: "grow-hidden-anchor", name: "location.grow", reason: "没有可靠路线",
    args: { location: { ...apothecary, district: "北区", anchorId: "north-flats", name: "蓝门诊所" } },
  }]);
  assert.equal(execution.results[0].ok, false);
  assert.match(execution.results[0].reason, /已经发现|到访/);
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

test("location relations match quests, clues and NPCs by name fragments", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "关联测试员" });
  game.quests.push({ id: "q1", title: "调查市政档案馆的失窃案", summary: "有人潜入档案馆", status: "进行中" });
  game.clues.push({ id: "c1", title: "半张货运单", detail: "收货方是市政档案馆" });
  game.relationships.push({ id: "n1", name: "老周", role: "火车站看守", value: 1, note: "在贝克兰德火车站工作多年" });
  const archive = MAP_LOCATIONS.find((location) => location.id === "queen-archive");
  const relations = findLocationRelations(game, archive);
  assert.equal(relations.quests.length, 1);
  assert.equal(relations.clues.length, 1);
  assert.equal(relations.npcs.length, 0);
  const station = MAP_LOCATIONS.find((location) => location.id === "east-station");
  assert.equal(findLocationRelations(game, station).npcs.length, 1);
});
