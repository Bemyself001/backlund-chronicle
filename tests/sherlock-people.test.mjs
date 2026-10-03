import test from "node:test";
import assert from "node:assert/strict";
import { ACTIVE_CONTENT, OPENINGS, VISITABLE_PEOPLE, validateContentPack } from "../src/content/index.js";
import { createInitialGame, EMPTY_CHARACTER, DEFAULT_SYSTEM_PROMPT, migrateSystemPrompt } from "../src/data/defaults.js";
import { knownPeople } from "../src/engine/people.js";
import { specialState } from "../src/engine/specialActions.js";
import { hasMetPerson, nearbyPeopleContext, requestedPersonVisit, visitPersonGate } from "../src/engine/visitablePeople.js";
import { resolveSpecialAction } from "../src/services/specialActions.js";
import { migrateSave } from "../src/services/storage.js";
import { buildPlanningContext, buildRenderingContext, visibleGameState } from "../src/services/memory.js";
import { advanceWorldTime } from "../src/engine/worldTime.js";

const sherlock = VISITABLE_PEOPLE.find(person => person.id === "sherlock-moriarty");
const fresh = (district = "东区") => createInitialGame({ ...EMPTY_CHARACTER, name: "拜访测试员", startingDistrict: district });
const atDoor = () => fresh("乔伍德区");
const record = game => knownPeople(game).find(person => person.id === sherlock.id);
const request = game => ({ operation: "visit-person", id: sherlock.id, revision: specialState(game).revision });
const visit = game => resolveSpecialAction(game, request(game));
const privateIdentity = /克莱恩|Klein|愚者|源堡|塔罗会|格尔曼|无面人/;

test("all openings know only the detective's advertised address; arrival alone does not count as a meeting", () => {
  for (const opening of OPENINGS) {
    const game = fresh(opening.district);
    assert.ok(game.discoveredLocations.some(location => location.id === sherlock.locationId));
    const person = record(game);
    assert.equal(person.name, "夏洛克·莫里亚蒂");
    assert.equal(person.role, "私家侦探");
    assert.equal(person.contact, "heard");
    assert.equal(person.value, 0);
    assert.equal(hasMetPerson(game, sherlock), false);
    assert.doesNotMatch(JSON.stringify(person), privateIdentity);
    assert.match(visitPersonGate(game, sherlock.id, { conversation: true }), /先到达|先敲门/);
  }
  const door = atDoor();
  assert.equal(visitPersonGate(door, sherlock.id), "");
  assert.equal(nearbyPeopleContext(door)[0].met, false);
  assert.ok(door.choices.every(choice => choice.risk === "low"));
  assert.deepEqual(nearbyPeopleContext(fresh()), []);
});

test("visits are local, available to ordinary people, and atomically record a meeting without granting resources", () => {
  const game = atDoor();
  const original = structuredClone(game);
  const asked = request(game);
  const next = resolveSpecialAction(game, asked);
  assert.deepEqual(game, original);
  assert.equal(next.turn, 1);
  assert.equal(next.worldTime, advanceWorldTime(game.worldTime, 10));
  assert.equal(record(next).contact, "met");
  assert.equal(record(next).dossier.firstTurn, 1);
  assert.equal(record(next).dossier.discoveries.met.turn, 1);
  assert.equal(next.occult.contact, 0);
  for (const key of ["inventory", "money", "clues", "character"]) assert.deepEqual(next[key], game[key], key);
  assert.equal(record(next).value, 0);
  assert.equal(visitPersonGate(next, sherlock.id, { conversation: true }), "");
  assert.equal(next.recentDialogues.at(-1).source, "fixed");
  assert.match(next.recentDialogues.at(-1).content, /夏洛克·莫里亚蒂/);
  assert.doesNotMatch(next.recentDialogues.at(-1).content, privateIdentity);
  assert.equal(next.choices.length, 3);
  assert.ok(next.choices.every(choice => choice.label.includes(sherlock.name) && choice.risk === "low"));
  assert.throws(() => resolveSpecialAction(next, asked), /行动状态已更新/);
});

test("distance, combat, collapsed stats, and unknown people cannot bypass the visit gate", () => {
  assert.throws(() => visit(fresh()), /需先到达/);
  for (const stat of ["health", "sanity"]) {
    const game = atDoor();
    game.character.stats[stat] = 0;
    const before = structuredClone(game);
    assert.throws(() => visit(game), /身心状态/);
    assert.deepEqual(game, before);
  }
  const battle = atDoor();
  battle.combat.enemies = [{ id: "thug", name: "暴徒", health: 10, maxHealth: 10, status: "active" }];
  assert.throws(() => visit(battle), /结束当前遭遇/);
  assert.throws(() => resolveSpecialAction(atDoor(), { ...request(atDoor()), id: "someone-else" }), /尚未开放/);
});

test("explicit visit choices are recognized without mistaking questions, refusal, or remote mentions for visits", () => {
  const game = atDoor();
  for (const text of ["敲门拜访夏洛克·莫里亚蒂，询问调查服务", "登门拜访夏洛克", "拜访莫里亚蒂侦探"]) {
    assert.equal(requestedPersonVisit(game, text)?.id, sherlock.id);
  }
  for (const text of ["暂不拜访夏洛克", "取消登门拜访莫里亚蒂", "与夏洛克交谈，询问线索", "夏洛克是谁？", "我可以明天再拜访夏洛克吗？", "我不打算今天下午拜访夏洛克，只看门牌。", "向路人询问拜访夏洛克需要预约吗？"]) {
    assert.equal(requestedPersonVisit(game, text), null, text);
  }
  assert.equal(requestedPersonVisit(fresh(), "拜访夏洛克"), null);
});

test("revisits and save reloads preserve the first meeting, one dossier, and relationship value", () => {
  const met = visit(atDoor());
  met.relationships.find(person => person.id === sherlock.id).value = 6;
  const loaded = migrateSave(JSON.parse(JSON.stringify(met)));
  const again = visit(loaded);
  assert.equal(again.turn, 2);
  assert.equal(record(again).dossier.discoveries.met.turn, 1);
  assert.equal(again.relationships.filter(person => person.id === sherlock.id).length, 1);
  assert.equal(record(again).value, 6);
  assert.equal(record(again).dossier.records.length, 2);
  assert.match(again.recentDialogues.at(-1).content, /再次敲门/);
  assert.deepEqual(migrateSave(again).character.stats, again.character.stats);
  again.location.id = "queen-library";
  assert.deepEqual(nearbyPeopleContext(again), []);
  assert.match(visitPersonGate(again, sherlock.id, { conversation: true }), /先到达/);
});

test("public NPC context supplies personality and local disclosure rules without loading his secret identity", () => {
  const met = visit(atDoor());
  const visible = visibleGameState(met);
  assert.equal(visible.nearbyPeople[0].met, true);
  assert.match(visible.nearbyPeople[0].behavior, /证据|隐私/);
  assert.doesNotMatch(JSON.stringify({ people: visible.relationships, nearby: visible.nearbyPeople }), privateIdentity);
  for (const context of [buildPlanningContext(met, "向夏洛克询问案件", DEFAULT_SYSTEM_PROMPT), buildRenderingContext(met, met, "向夏洛克询问案件", DEFAULT_SYSTEM_PROMPT, { accepted: [], rejected: [], derivedEffects: {} })]) {
    const text = JSON.stringify(context);
    assert.match(text, /公开广告地址不等于相识/);
    assert.match(text, /提问不等于调查证明/);
    assert.match(text, /询问报价不等于接受委托或付款/);
    assert.doesNotMatch(text, /克莱恩|Klein/);
  }
});

test("old saves gain the address without a meeting, and content validation rejects broken NPC configuration", () => {
  const game = fresh();
  game.turn = 18;
  game.content.contentVersion = "2026.10.03.2";
  game.discoveredLocations = game.discoveredLocations.filter(location => location.id !== sherlock.locationId);
  delete game.locationKnowledge[sherlock.locationId];
  const migrated = migrateSave(game);
  assert.equal(migrated.locationKnowledge[sherlock.locationId].status, "discovered");
  assert.equal(record(migrated).contact, "heard");
  assert.equal(hasMetPerson(migrated, sherlock), false);
  assert.equal(migrated.turn, 18);
  assert.deepEqual(migrated.character.stats, game.character.stats);
  assert.equal(migrateSave(migrated).discoveredLocations.filter(location => location.id === sherlock.locationId).length, 1);
  const visited = visit(atDoor());
  visited.content.contentVersion = "2026.10.03.2";
  const loaded = migrateSave(visited);
  assert.equal(loaded.locationKnowledge[sherlock.locationId].status, "visited");
  assert.equal(record(loaded).contact, "met");
  const invalid = structuredClone(ACTIVE_CONTENT);
  invalid.visitablePeople[0].locationId = "nowhere";
  assert.ok(validateContentPack(invalid).some(error => error.includes("可拜访人物")));
});

test("the former background-only default prompt migrates to support registered characters without replacing custom prose", () => {
  const previous = DEFAULT_SYSTEM_PROMPT.replace("原作主线保持为背景，本地登记的原作人物可以按拜访与披露规则参与原创支线", "原作主线和重要人物仅作为遥远背景");
  assert.equal(migrateSystemPrompt(previous), DEFAULT_SYSTEM_PROMPT);
  const custom = "请写温和、简短的日常对话，保留我作出决定的空间。";
  assert.equal(migrateSystemPrompt(custom), custom);
});
