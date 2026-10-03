import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVE_CONTENT, MAP_LOCATIONS, MAP_ROUTES, ORGANIZATIONS, PATHWAYS, SPECIAL_ACTIONS, getOrganization, validateContentPack } from "../src/content/index.js";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { actionGate, availableSpecialActions, commissionOffer, registrationGate, specialState } from "../src/engine/specialActions.js";
import { resolveSpecialAction } from "../src/services/specialActions.js";
import { migrateSave } from "../src/services/storage.js";
import { visibleGameState } from "../src/services/memory.js";
import { findTravelRoute, getMapLocation } from "../src/system/map.js";
import { moneyToPence } from "../src/system/money.js";
import { getChurchTalisman } from "../src/system/talismans.js";

const organization = getOrganization("mi9");
const work = SPECIAL_ACTIONS.find(entry => entry.id === "work-mi9");
function fresh(pathwayId = "seer") {
  const pathway = PATHWAYS.find(entry => entry.id === pathwayId);
  return createInitialGame({ ...EMPTY_CHARACTER, name: "军情九处测试员", extraordinary: "low", pathway: `${pathway.name}（序列9）` });
}
function run(game, operation, id, optionId) {
  return resolveSpecialAction(game, { operation, id, optionId, revision: specialState(game).revision });
}
function atHeadquarters(game = fresh()) {
  game.location = { ...getMapLocation(organization.headquarters) };
  return game;
}

test("MI9 is a government organization with a rumored, reachable headquarters and AI context", () => {
  const game = fresh();
  assert.equal(organization.church, undefined);
  assert.ok(organization.agency);
  assert.ok(organization.tags.includes("government"));
  assert.ok(organization.tags.includes("official"));
  assert.equal(game.locationKnowledge[organization.headquarters].status, "rumored");
  const location = getMapLocation(organization.headquarters);
  assert.equal(MAP_LOCATIONS.filter(entry => entry.q === location.q && entry.r === location.r).length, 1);
  assert.equal(MAP_LOCATIONS.filter(entry => entry.code === location.code).length, 1);
  for (const from of ["queen-library", "queen-archive"]) {
    assert.ok(MAP_ROUTES.some(route => route.from === from && route.to === location.id));
    const route = findTravelRoute(from, location.id, [from, location.id], game);
    assert.ok(route?.minutes > 0);
    assert.equal(route.path.at(-1), location.id);
  }
  const context = visibleGameState(game);
  const info = context.officialOrganizations.find(entry => entry.id === organization.id);
  assert.equal(info.agency, organization.agency);
  assert.equal(info.church, undefined);
  assert.equal(info.description, organization.description);
  assert.equal(info.locationName, location.name);
  assert.ok(context.mapRumors.some(entry => entry.id === location.id));
  assert.deepEqual(validateContentPack(), []);
  const invalid = structuredClone(ACTIVE_CONTENT);
  invalid.organizations.find(entry => entry.id === "mi9").headquarters = "missing-headquarters";
  assert.ok(validateContentPack(invalid).some(error => /mi9.*驻地无效/.test(error)));
  invalid.organizations.find(entry => entry.id === "mi9").headquarters = location.id;
  invalid.organizations.find(entry => entry.id === "mi9").agency = {};
  assert.ok(validateContentPack(invalid).some(error => /mi9.*agency/.test(error)));
});

test("all pathways can explicitly join MI9 at headquarters, retain membership on reload, and receive no church charm", () => {
  for (const pathway of PATHWAYS) {
    const game = atHeadquarters(fresh(pathway.id));
    const unchanged = structuredClone(game);
    assert.equal(registrationGate(game, "mi9"), "");
    assert.ok(availableSpecialActions(game).some(entry => entry.id === work.id));
    assert.match(actionGate(game, work), /需正式加入军情九处/);
    const joined = run(game, "register", "mi9");
    assert.deepEqual(game, unchanged);
    assert.equal(joined.turn, game.turn + 1);
    assert.equal(joined.organizationState.membership.organizationId, "mi9");
    assert.ok(joined.organizationState.membership.tags.includes("combat-support"));
    assert.match(joined.recentDialogues.at(-1).content, /鲁恩王国军方所属军情九处/);
    assert.doesNotMatch(joined.recentDialogues.at(-1).content, /undefined|教会|教堂/);
    assert.equal(joined.inventory.some(item => getChurchTalisman(item)), false);
    const loaded = migrateSave(JSON.parse(JSON.stringify(joined)));
    assert.deepEqual(loaded.organizationState.membership, joined.organizationState.membership);
    assert.equal(actionGate(loaded, work), "");
    assert.equal(loaded.inventory.some(item => getChurchTalisman(item)), false);
  }
});

test("MI9 registration and commissions reject ordinary applicants, wrong places, and active organization replacement", () => {
  const ordinary = atHeadquarters(createInitialGame({ ...EMPTY_CHARACTER, name: "普通申请者" }));
  assert.throws(() => run(ordinary, "register", "mi9"), /成为非凡者/);
  const away = fresh();
  const unchanged = structuredClone(away);
  assert.throws(() => run(away, "register", "mi9"), /需到达/);
  assert.deepEqual(away, unchanged);
  for (const existing of ORGANIZATIONS) {
    const game = atHeadquarters();
    game.organizationState = { membership: { organizationId: existing.id, name: existing.name, status: "active" } };
    assert.throws(() => run(game, "register", "mi9"), /已有正式组织身份/);
  }
  const joined = run(atHeadquarters(), "register", "mi9");
  for (const other of ORGANIZATIONS.filter(entry => entry.headquarters)) {
    const moved = structuredClone(joined);
    moved.location.id = other.headquarters;
    assert.throws(() => run(moved, "register", other.id), /已有正式组织身份/);
  }
  for (const other of SPECIAL_ACTIONS.filter(entry => entry.organizationId && entry.organizationId !== "mi9")) {
    assert.match(actionGate(joined, other), /需正式加入/);
  }
  const moved = structuredClone(joined);
  moved.location.id = "queen-library";
  assert.throws(() => run(moved, "accept", work.id), /指定地点/);
});

test("all three authored MI9 assignments and both options survive saves, settle once, and obey cooldown", () => {
  assert.equal(work.pool.length, 3);
  for (const keyword of ["情报调查", "监视", "护送"]) assert.ok(work.pool.some(offer => offer.title.includes(keyword)));
  for (const offer of work.pool) {
    for (const option of offer.options) {
      const joined = run(atHeadquarters(), "register", "mi9");
      for (let attempt = 0; commissionOffer(joined, work).id !== offer.id && attempt < 100; attempt += 1) joined.turn += 3;
      assert.equal(commissionOffer(joined, work).id, offer.id);
      const beforeMoney = moneyToPence(joined.money);
      const accepted = run(joined, "accept", work.id);
      assert.throws(() => run(accepted, "accept", work.id), /当前委托/);
      const loaded = migrateSave(JSON.parse(JSON.stringify(accepted)));
      assert.deepEqual(loaded.specialActions.active.offer, offer);
      const settled = run(loaded, "resolve", loaded.specialActions.active.id, option.id);
      assert.equal(moneyToPence(settled.money) - beforeMoney, option.reward);
      assert.equal(settled.specialActions.active, null);
      assert.equal(settled.quests.find(entry => entry.id === loaded.specialActions.active.id).status, "completed");
      assert.match(settled.recentDialogues.at(-1).content, new RegExp(option.ending));
      assert.equal(settled.recentDialogues.at(-1).source, "fixed");
      assert.equal(settled.lastTurnAudit.turn, settled.turn);
      assert.throws(() => run(settled, "resolve", loaded.specialActions.active.id, option.id), /已结算/);
      assert.throws(() => run(settled, "accept", work.id), /还需 3/);
      settled.turn += 3;
      assert.doesNotThrow(() => run(settled, "accept", work.id));
    }
  }
});
