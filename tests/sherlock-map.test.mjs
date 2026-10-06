import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { DISTRICT_LAYOUT, INITIAL_DISCOVERED_LOCATION_IDS, MAP_DISTRICTS, MAP_LOCATIONS, MAP_ROUTES, OPENINGS } from "../src/content/index.js";
import { findTravelRoute, getMapLocation, hexForLocation, planDynamicLocation } from "../src/data/map.js";
import { ensureWorld } from "../src/system/hexworld.js";
import { executeToolCalls } from "../src/engine/tools.js";

const addressId = "minsk-street-15";

test("Minsk Street is a public address in its own district without identity spoilers", () => {
  const address = getMapLocation(addressId);
  assert.equal(address.name, "乔伍德区·明斯克街15号");
  assert.equal(address.district, "乔伍德区");
  assert.ok(MAP_DISTRICTS.includes(address.district));
  assert.ok(INITIAL_DISCOVERED_LOCATION_IDS.includes(addressId));
  assert.match(address.rumor, /报纸.*夏洛克·莫里亚蒂/);
  assert.doesNotMatch(JSON.stringify(address), /克莱恩|愚者|序列|非凡/);
  const { minX, maxX, minY, maxY } = DISTRICT_LAYOUT[address.district];
  assert.ok(address.x >= minX && address.x <= maxX && address.y >= minY && address.y <= maxY);
  assert.equal(MAP_LOCATIONS.filter((location) => location.q === address.q && location.r === address.r).length, 1);
  assert.equal(MAP_ROUTES.filter((route) => route.from === addressId || route.to === addressId).length, 2);
});

test("Cherwood opening starts on the public street before any meeting or commission", () => {
  const opening = OPENINGS.find((entry) => entry.district === "乔伍德区");
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "明斯克街访客", startingDistrict: opening.district });
  assert.equal(game.location.id, addressId);
  assert.match(opening.narrative, /公共街道/);
  assert.match(opening.narrative, /尚未敲门/);
  assert.doesNotMatch(JSON.stringify(opening), /克莱恩|愚者|序列|非凡/);
  assert.deepEqual(game.quests, []);
  assert.deepEqual(game.clues, []);
  assert.deepEqual(game.world.player, hexForLocation(getMapLocation(addressId)));
});

test("a player can travel to Minsk Street and return with synchronized hex coordinates", () => {
  const initial = createInitialGame({ ...EMPTY_CHARACTER, name: "往返访客", startingDistrict: "乔伍德区" });
  const knownIds = initial.discoveredLocations.map((location) => location.id);
  const outbound = findTravelRoute(addressId, "queen-library", knownIds, initial);
  const inbound = findTravelRoute("queen-library", addressId, knownIds, initial);
  assert.ok(outbound.minutes > 0);
  assert.equal(outbound.minutes, inbound.minutes);
  let game = initial;
  for (const locationId of ["queen-library", addressId]) {
    const execution = executeToolCalls(game, [{ id: `visit-${locationId}`, name: "location.move", args: { locationId }, reason: "玩家从地图选择已知地址" }]);
    assert.equal(execution.results[0].ok, true);
    game = execution.game;
    assert.equal(game.location.id, locationId);
    assert.equal(game.locationKnowledge[locationId].status, "visited");
    const world = ensureWorld(game);
    assert.deepEqual(world.player, hexForLocation(getMapLocation(locationId)));
    assert.equal(world.tiles[`${world.player.q},${world.player.r}`].locationId, locationId);
  }
});

test("Cherwood accepts nearby dynamic locations within its own map bounds", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "乔伍德街区调查", startingDistrict: "乔伍德区" });
  const proposal = {
    name: "明斯克街报摊", district: "乔伍德区", kind: "shop", scope: "landmark", anchorId: addressId,
    rumor: "街口报摊正在出售今天的报纸。", description: "木制报摊摆着成叠的日报，雨棚下挂着几份晚报样张。", status: "discovered",
  };
  const planned = planDynamicLocation(game, proposal, 1);
  assert.equal(planned.ok, true);
  assert.equal(planned.location.district, "乔伍德区");
  assert.equal(planned.location.code, "J4");
  assert.equal(planned.route.from, addressId);
  const bounds = DISTRICT_LAYOUT["乔伍德区"];
  assert.ok(planned.location.x >= bounds.minX && planned.location.x <= bounds.maxX);
  assert.ok(planned.location.y >= bounds.minY && planned.location.y <= bounds.maxY);
  assert.notDeepEqual(hexForLocation(planned.location), hexForLocation(getMapLocation(addressId)));
});
