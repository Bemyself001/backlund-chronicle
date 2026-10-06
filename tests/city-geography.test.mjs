import test from "node:test";
import assert from "node:assert/strict";
import { CITY_GEOGRAPHY, CITY_HEXES, cellKey, cityRoute, districtAt, hexDistance, hexForMapPoint, isPassableCityHex, isRiverHex, mapPointForHex } from "../src/system/mapGeometry.js";
import { MAP_DISTRICTS, MAP_LOCATIONS, getMapLocation, getMapLocations, findTravelRoute, normalizeMapExtensions, planDynamicLocation } from "../src/system/map.js";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { ensureWorld, exploreHex, canExploreHex, travelToLocation, hexContext } from "../src/system/hexworld.js";
import { migrateSave } from "../src/services/storage.js";
import { executeToolCalls } from "../src/engine/tools.js";

test("districts cover the city land and landmarks match their geographical boroughs", () => {
  assert.equal(MAP_DISTRICTS.length, 11);
  assert.equal(new Set(MAP_LOCATIONS.map(cellKey)).size, MAP_LOCATIONS.length);
  for (const hex of CITY_HEXES) {
    assert.deepEqual(hexForMapPoint(mapPointForHex(hex)), hex);
    if (!isRiverHex(hex)) assert.ok(MAP_DISTRICTS.includes(districtAt(hex)), cellKey(hex));
  }
  for (const location of MAP_LOCATIONS) {
    assert.equal(districtAt(location), location.district, location.name);
    assert.equal(isRiverHex(location), false, location.name);
    assert.ok(cityRoute(getMapLocation("east-station"), location), location.name);
  }
  for (const [id, district] of Object.entries({ "queen-library": "乔伍德区", "saint-wind": "乔伍德区", "iron-gate": "桥区", "west-museum": "西区", "machinery-heart": "圣乔治区" })) assert.equal(getMapLocation(id).district, district);
});

test("the river is a continuous west-to-east chain with bends and never randomizes", () => {
  const river = CITY_GEOGRAPHY.river.cells.map(([q, r]) => ({ q, r }));
  assert.ok(river[0].q < CITY_GEOGRAPHY.bounds.minQ);
  assert.ok(river.at(-1).q > CITY_GEOGRAPHY.bounds.maxQ);
  assert.ok(mapPointForHex(river.at(-1)).y > mapPointForHex(river[0]).y);
  const slopes = [];
  for (let i = 1; i < river.length; i++) {
    assert.equal(hexDistance(river[i - 1], river[i]), 1);
    assert.ok(river[i].q >= river[i - 1].q);
    slopes.push(mapPointForHex(river[i]).y - mapPointForHex(river[i - 1]).y);
  }
  assert.ok(slopes.some(slope => slope > 0) && slopes.some(slope => slope < 0));
  const worlds = ["甲", "乙"].map(name => createInitialGame({ ...EMPTY_CHARACTER, name }).world);
  for (const hex of CITY_HEXES) {
    const terrain = worlds[0].tiles[cellKey(hex)].terrain;
    if (["river", "bridge"].includes(terrain)) assert.equal(worlds[1].tiles[cellKey(hex)].terrain, terrain);
    assert.equal(terrain === "river" || terrain === "bridge", isRiverHex(hex));
  }
});

test("southwest belongs to South Bridge and southeast St George faces the docks across the river", () => {
  const warehouse = getMapLocation("bridge-docks"), church = getMapLocation("machinery-heart");
  assert.ok(warehouse.x < 50 && warehouse.y > 50);
  assert.ok(church.x > 50 && church.y > 50);
  assert.equal(districtAt({ q: 0, r: 4 }), "大桥南区", "the south bridge landing remains in South Bridge");
  for (const [q, r] of CITY_GEOGRAPHY.river.cells.filter(([q]) => q >= 3 && q <= 9)) {
    assert.equal(districtAt({ q, r: r - 1 }), "码头区");
    assert.equal(districtAt({ q, r: r + 1 }), "圣乔治区");
  }
  const route = findTravelRoute("dock-workers-square", church.id, [church.id]);
  assert.deepEqual(route.crossings, ["贝克兰德大桥"]);
  assert.ok(route.grids > hexDistance(getMapLocation("dock-workers-square"), church));
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "南岸方位", startingDistrict: "圣乔治区" });
  assert.deepEqual(game.world.player, { q: church.q, r: church.r });
  assert.match(hexContext(game), /大桥南区位于西南侧，圣乔治区位于东南侧，与北岸码头区隔塔索克河相望/);
});

test("version-two south-bank saves relocate registered sites and interiors without moving northern sites or replaying progress", () => {
  const oldHexes = { "bridge-docks": { q: 3, r: 5 }, "machinery-heart": { q: -3, r: 7 } };
  for (const currentId of ["bridge-docks", "machinery-heart", "old-south-store", "old-church-office"]) {
    const raw = createInitialGame({ ...EMPTY_CHARACTER, name: "旧南岸" });
    raw.turn = 12; raw.content.contentVersion = "2026.10.06.2";
    raw.world.geographyVersion = 2;
    raw.mapExtensions = { geographyVersion: 2, locations: [
      { id: "old-south-store", name: "大桥南区·旧商店", district: "大桥南区", scope: "landmark", anchorId: "bridge-docks", q: 4, r: 5 },
      { id: "old-church-office", name: "圣乔治区·教堂办公室", district: "圣乔治区", scope: "interior", anchorId: "machinery-heart", q: -3, r: 7 },
      { id: "north-bookshop", name: "乔伍德区·旧书店", district: "乔伍德区", scope: "landmark", anchorId: "queen-library", q: 2, r: -1 },
      { id: "east-workshop", name: "东区·跨区工坊", district: "东区", scope: "landmark", anchorId: "machinery-heart", q: 5, r: -3 },
    ], routes: [{ from: "bridge-docks", to: "old-south-store", minutes: 7 }, { from: "machinery-heart", to: "old-church-office", minutes: 3 }, { from: "machinery-heart", to: "east-workshop", minutes: 40 }] };
    for (const [id, hex] of Object.entries(oldHexes)) {
      raw.world.tiles[cellKey(hex)] = { terrain: "plain", locationId: id, name: getMapLocation(id).name, discovered: true };
    }
    const current = raw.mapExtensions.locations.find(location => location.id === currentId) || { ...getMapLocation(currentId), ...oldHexes[currentId] };
    raw.location = { id: currentId, name: current.name, district: current.district, q: current.q, r: current.r };
    raw.world.player = { q: current.q, r: current.r };
    raw.locationKnowledge["old-south-store"] = { status: "visited", note: "已经核对店铺门牌" };
    raw.triggerState.active.push({ instanceId: "ongoing-renard", definitionId: "side.queens.renard-fall", status: "engaged", stage: "auction-conversation", createdTurn: 3, engagedTurn: 4, stageHistory: [] });
    const before = structuredClone(raw);
    const loaded = migrateSave(raw);
    const destination = getMapLocation(currentId, loaded);
    assert.deepEqual(loaded.world.player, { q: destination.q, r: destination.r });
    assert.equal(districtAt(loaded.world.player), destination.district);
    assert.equal(cellKey(getMapLocation("old-church-office", loaded)), cellKey(getMapLocation("machinery-heart")));
    assert.equal(cellKey(getMapLocation("north-bookshop", loaded)), "2,-1");
    assert.equal(cellKey(getMapLocation("east-workshop", loaded)), "5,-3");
    assert.equal(getMapLocation("east-workshop", loaded).district, "东区");
    assert.equal(loaded.locationKnowledge["old-south-store"].status, "visited");
    assert.equal(loaded.triggerState.active.find(entry => entry.instanceId === "ongoing-renard").stage, "auction-conversation");
    for (const id of Object.keys(oldHexes)) {
      assert.equal(Object.values(loaded.world.tiles).filter(tile => tile.locationId === id).length, 1);
      assert.equal(loaded.world.tiles[cellKey(getMapLocation(id))].locationId, id);
    }
    for (const field of ["turn", "worldTime", "money", "inventory", "storyHistory"]) assert.deepEqual(loaded[field], before[field], field);
    assert.deepEqual(raw, before, "migration never mutates the source save");
    const again = migrateSave(structuredClone(loaded));
    assert.deepEqual(again.world, loaded.world); assert.deepEqual(again.mapExtensions, loaded.mapExtensions);
  }
});

test("ordinary explored south-bank streets retain their coordinates and refresh their district", () => {
  for (const [hex, previousDistrict, district] of [[{ q: -4, r: 8 }, "圣乔治区", "大桥南区"], [{ q: 4, r: 5 }, "大桥南区", "圣乔治区"]]) {
    const raw = createInitialGame({ ...EMPTY_CHARACTER, name: "旧街道" });
    raw.content.contentVersion = "2026.10.06.2"; raw.world.geographyVersion = 2;
    raw.location = { id: `hex:${cellKey(hex)}`, name: "未登记的街区", district: `贝克兰德${previousDistrict}`, ...hex };
    raw.world.player = hex;
    const loaded = migrateSave(raw);
    assert.deepEqual(loaded.world.player, hex);
    assert.equal(loaded.location.district, `贝克兰德${district}`);
    assert.equal(loaded.world.tiles[cellKey(hex)].district, district);
    assert.deepEqual(migrateSave(loaded).world, loaded.world);
  }
});

test("cross-river preview and settlement use the same bridge route without water shortcuts", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "过桥", startingDistrict: "码头区" });
  const target = getMapLocation("bridge-docks");
  game.discoveredLocations.push({ id: target.id, name: target.name });
  const preview = findTravelRoute(game.location.id, target.id, [target.id], game);
  assert.deepEqual(preview.crossings, ["贝克兰德大桥"]);
  assert.ok(preview.grids > hexDistance(game.world.player, target));
  for (let i = 1; i < preview.hexPath.length; i++) {
    assert.equal(hexDistance(preview.hexPath[i - 1], preview.hexPath[i]), 1);
    assert.ok(isPassableCityHex(preview.hexPath[i]));
  }
  const travel = travelToLocation(game, target.id);
  assert.deepEqual(travel, preview);
  assert.deepEqual(game.world.player, { q: target.q, r: target.r });
});

test("exploration cannot wade through the river but can cross the public bridge", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "桥头" });
  game.location = { id: "hex:0,2", name: "桥头", q: 0, r: 2 };
  ensureWorld(game);
  assert.equal(canExploreHex(game, 1, 2).ok, false);
  assert.equal(canExploreHex(game, 0, 3).ok, true);
  assert.equal(exploreHex(game, 0, 3).ok, true);
  assert.match(game.location.name, /贝克兰德大桥/);
  assert.equal(canExploreHex(game, 0, 4).ok, true);
  assert.equal(exploreHex(game, 0, 4).ok, true);
  assert.equal(districtAt(game.world.player), "大桥南区");
});

test("dynamic landmarks stay on distinct borough land and interiors share their parent hex", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "地标登记", startingDistrict: "乔伍德区" });
  for (let i = 0; i < 5; i++) {
    const proposal = { name: `街口店铺${i}`, district: "乔伍德区", anchorId: "queen-library", scope: "landmark", kind: "shop", status: "discovered", rumor: "馆员指明了附近的店铺。", description: "临街的小店铺对外营业，入口和门牌已核验。" };
    assert.equal(planDynamicLocation(game, proposal).ok, true);
    const result = executeToolCalls(game, [{ name: "location.grow", args: { location: proposal }, reason: "沿街核对" }]);
    assert.equal(result.results[0].ok, true);
    game = result.game;
  }
  const placed = getMapLocations(game);
  assert.equal(new Set(placed.map(cellKey)).size, placed.length);
  for (const location of placed) assert.equal(districtAt(location), location.district);
  const extension = normalizeMapExtensions({ ...game.mapExtensions, locations: [...game.mapExtensions.locations, { id: "reading-room", name: "乔伍德区·阅览室", district: "乔伍德区", anchorId: "queen-library", scope: "interior", x: 5, y: 95 }] });
  const interior = extension.locations.find(location => location.id === "reading-room");
  assert.equal(cellKey(interior), cellKey(getMapLocation("queen-library")));
  game.mapExtensions = extension;
  const world = ensureWorld(game);
  assert.equal(world.tiles[cellKey(interior)].locationId, "queen-library");
  assert.equal(Object.values(world.tiles).some(tile => tile.locationId === interior.id), false);
});

test("legacy library saves migrate once without restarting quests, changing resources or duplicating markers", () => {
  const raw = createInitialGame({ ...EMPTY_CHARACTER, name: "旧图书馆" });
  raw.turn = 12;
  raw.content.contentVersion = "2026.10.05.1";
  raw.location = { id: "queen-library", name: "皇后区·公共图书馆", district: "贝克兰德皇后区" };
  raw.choices = [{ label: "前往皇后区公共图书馆，查找文字与符号资料", intent: "investigate", risk: "low" }];
  raw.mapExtensions = { locations: [{ id: "old-reading-room", name: "皇后区·阅览室", district: "皇后区", scope: "interior", anchorId: "queen-library", x: 49, y: 35 }], routes: [{ from: "queen-library", to: "old-reading-room", minutes: 3 }] };
  raw.world.geographyVersion = 1;
  raw.world.tiles["0,-2"] = { terrain: "plain", name: "公共图书馆", locationId: "queen-library", discovered: true };
  const history = structuredClone(raw.storyHistory), money = structuredClone(raw.money), items = structuredClone(raw.inventory), worldBefore = structuredClone(raw.world);
  const migrated = migrateSave(raw);
  assert.equal(migrated.location.district, "贝克兰德乔伍德区");
  assert.equal(migrated.mapExtensions.locations[0].district, "乔伍德区");
  assert.equal(migrated.turn, 12);
  assert.deepEqual(migrated.inventory, items);
  assert.deepEqual(migrated.money, money);
  assert.deepEqual(migrated.storyHistory, history);
  assert.deepEqual(raw.world, worldBefore);
  assert.match(migrated.choices[0].label, /乔伍德区公共图书馆/);
  assert.equal(migrated.world.tiles["0,-2"].locationId, undefined);
  assert.equal(Object.values(migrated.world.tiles).filter(tile => tile.locationId === "queen-library").length, 1);
  const again = migrateSave(structuredClone(migrated));
  assert.deepEqual(again.mapExtensions, migrated.mapExtensions);
  assert.deepEqual(again.world, migrated.world);
  assert.match(hexContext(again), /塔索克河自西向东/);
  assert.match(hexContext(again), /公共图书馆与圣风大教堂在乔伍德区/);
});

test("crowded legacy districts retain every location and resolve duplicate map codes", () => {
  const legacy = { locations: Array.from({ length: 24 }, (_, i) => ({ id: `legacy-shop-${i}`, name: `桥区·旧店铺${i}`, district: "桥区", scope: "landmark", anchorId: "soot-lamp", x: 50, y: 70, code: "B1" })), routes: [] };
  const normalized = normalizeMapExtensions(legacy);
  assert.equal(normalized.locations.length, 24);
  const records = getMapLocations(normalized);
  assert.equal(new Set(records.map(location => location.code)).size, records.length);
  assert.equal(new Set(records.filter(location => location.scope !== "interior").map(cellKey)).size, records.filter(location => location.scope !== "interior").length);
  assert.ok(normalized.locations.some(location => location.scope === "interior"));
  assert.deepEqual(normalizeMapExtensions(normalized), normalized);
});
