import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { knownPeople, syncKnownPeople, visiblePeopleContext } from "../src/engine/people.js";
import { processTriggers, engageTrigger, settleQuestStep } from "../src/engine/triggerEngine.js";
import { migrateSave, saveGame, loadGame } from "../src/services/storage.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { buildPlanningContext } from "../src/services/memory.js";
import { moneyToPence } from "../src/system/money.js";

const WATCH = "watch.heirloom.late-hour";
const RENARD = "side.queens.renard-fall";
const fresh = () => createInitialGame({ ...EMPTY_CHARACTER, name: "艾琳·霍尔", surname: "霍尔" });
const fact = (game, key, turn = 5, value = true) => { game.triggerState.facts[key] = { value, firstTurn: turn, evidenceIds: [] }; };
const addQuest = (game, definitionId, stage, status = "engaged", extra = {}) => {
  const instance = { instanceId: "test:" + definitionId, definitionId, stage, status, createdTurn: 3, engagedTurn: status === "engaged" ? 4 : null, stageHistory: [], ...extra };
  game.triggerState[["completed", "failed", "abandoned", "expired"].includes(status) ? "history" : "active"].push(instance);
  return instance;
};
const person = (game, id) => knownPeople(game).find(entry => entry.id === id);

test("fresh games, eligibility and unconfirmed narrative names do not reveal people", () => {
  const game = fresh();
  addQuest(game, WATCH, "white-iris-confrontation", "eligible", { definitionSnapshot: { secret: "塞西莉亚·沃恩" } });
  game.recentDialogues.push({ role: "assistant", content: "你猜想红夫人会是塞西莉亚·沃恩吗？" });
  const before = structuredClone(game);
  assert.deepEqual(knownPeople(game), []);
  assert.deepEqual(game, before);
});

test("the recovered note recalls a relative; only decoding discloses White Iris", () => {
  const game = fresh();
  fact(game, "watch.note-recovered", 4);
  assert.deepEqual(knownPeople(game).map(entry => entry.id), ["reginald"]);
  const uncle = person(game, "reginald");
  assert.equal(uncle.name, "雷金纳德·霍尔");
  assert.equal(uncle.contact, "known");
  assert.doesNotMatch(JSON.stringify(uncle), /考古学家|魔女会|已故|南岸/);
  fact(game, "watch.formal-quest-unlocked", 6);
  const iris = person(game, "white-iris");
  assert.equal(iris.contact, "heard");
  assert.equal(iris.name, "白鸢尾");
  assert.equal(iris.dossier.firstTurn, 6);
  assert.doesNotMatch(JSON.stringify(knownPeople(game)), /塞西莉亚|红夫人|序列7/);
});

test("encounter does not reveal a true name, ledger does not invent a meeting", () => {
  const game = fresh();
  fact(game, "watch.formal-quest-unlocked");
  const instance = addQuest(game, WATCH, "white-iris-confrontation");
  assert.equal(person(game, "white-iris").contact, "met");
  assert.equal(person(game, "white-iris").name, "白鸢尾");
  instance.stage = "last-chance";
  game.clues.push({ id: "clue-demoness-south-bank-ledger", discoveredAt: "第 8 轮" });
  assert.equal(person(game, "white-iris").contact, "heard");
  assert.equal(person(game, "white-iris").name, "塞西莉亚·沃恩");
  assert.equal(person(game, "white-iris").alias, "白鸢尾");
  assert.equal(person(game, "red-lady").contact, "heard");
  assert.match(person(game, "red-lady").role, /序列6/);
});

test("quest completion alone must not grant undiscovered ledger identities", () => {
  const game = fresh();
  addQuest(game, WATCH, "completed-escape", "completed");
  fact(game, "watch.late-hour.completed");
  assert.equal(person(game, "white-iris").name, "白鸢尾");
  assert.equal(person(game, "red-lady"), undefined);
  assert.equal(person(game, "azik-eggers"), undefined);
});

test("uncle's identity, control and death each need their own evidence", () => {
  const game = fresh();
  fact(game, "watch.note-recovered", 2);
  addQuest(game, WATCH, "find-uncle");
  assert.equal(person(game, "reginald").contact, "known");
  fact(game, "watch.uncle-found-alive", 8);
  assert.equal(person(game, "reginald").contact, "met");
  assert.doesNotMatch(person(game, "reginald").role, /序列8/);
  fact(game, "watch.uncle-sequence-confirmed", 9);
  assert.match(person(game, "reginald").role, /序列8/);
  fact(game, "watch.control-confirmed", 10);
  assert.equal(person(game, "reginald").status, "受控制");
  fact(game, "watch.uncle-released", 11, false);
  assert.notEqual(person(game, "reginald").status, "已故");
  fact(game, "watch.uncle-released", 12);
  assert.equal(person(game, "reginald").status, "已故");
});

test("Renard notice includes the injured daughter but neither a meeting nor Edmund", () => {
  const game = fresh();
  addQuest(game, RENARD, "message-seen", "available");
  assert.deepEqual(knownPeople(game).map(entry => entry.id).sort(), ["renard-daughter", "viscount-renard"]);
  assert.equal(person(game, "viscount-renard").contact, "heard");
  assert.equal(person(game, "renard-daughter").contact, "heard");
  assert.equal(person(game, "viscount-renard").lastKnownLocation, "");
  fact(game, "side.renard.completed", 8);
  fact(game, "knowledge.deep-control-irreversible", 8);
  assert.equal(person(game, "edmund-vair"), undefined);
  assert.equal(person(game, "viscount-renard").status, "欠你一次人情");
});

test("auction, cooperation and shared treatment are distinct Edmund discoveries", () => {
  const game = fresh();
  const instance = addQuest(game, RENARD, "secure-treatment");
  assert.equal(person(game, "viscount-renard").contact, "met");
  assert.equal(person(game, "edmund-vair"), undefined);
  instance.stage = "auction-conversation";
  assert.equal(person(game, "edmund-vair").contact, "met");
  assert.equal(person(game, "edmund-vair").status, "");
  fact(game, "side.renard.cooperation-agreed", 9);
  assert.equal(person(game, "edmund-vair").status, "合作伙伴");
  game.triggerState.rewardsClaimed.push("side.renard.pay-shared");
  assert.equal(person(game, "edmund-vair").status, "曾共同救治");
});

test("boy's record survives failure without claiming he reached safety", () => {
  const game = fresh();
  const instance = addQuest(game, "side.bridge.ebb-iron-door", "rescue-dock-boy");
  assert.equal(person(game, "dock-boy").contact, "met");
  fact(game, "side.iron-door.boy-rescued", 7);
  instance.status = "failed";
  instance.stage = "flooded";
  assert.equal(person(game, "dock-boy").status, "已脱困");
  assert.notEqual(person(game, "dock-boy").status, "已安全撤离");
});

test("the whistle grants knowledge, not friendship, and survives item removal", () => {
  const game = fresh();
  game.inventory.push({ itemId: "azik-copper-whistle", acquiredAt: "第 17 轮" });
  syncKnownPeople(game);
  const azik = person(game, "azik-eggers");
  assert.equal(azik.contact, "heard");
  assert.equal(azik.value, 0);
  game.inventory = game.inventory.filter(item => item.itemId !== "azik-copper-whistle");
  syncKnownPeople(game);
  assert.deepEqual(person(game, "azik-eggers"), azik);
});

test("legacy aliases merge into one stable identity while relationship tools still work", () => {
  const game = fresh();
  game.relationships = [{ id: "old-iris", name: "白鸢尾", value: -12, note: "曾阻挡去路" }];
  fact(game, "demoness.white-iris.true-name", 9, "塞西莉亚·沃恩");
  syncKnownPeople(game);
  assert.equal(game.relationships.length, 1);
  assert.equal(game.relationships[0].id, "white-iris");
  assert.equal(game.relationships[0].value, -12);
  for (const npcId of ["old-iris", "白鸢尾", "塞西莉亚·沃恩", "white-iris"]) {
    const result = executeToolCalls(game, [{ id: "update:" + npcId, name: "relationship.update", args: { npcId, delta: -1 }, reason: "谈判失败" }]);
    assert.equal(result.results[0].ok, true, npcId);
    assert.equal(result.game.relationships[0].value, -13);
  }
});

test("a legacy name alone cannot acquire secret character information", () => {
  const game = fresh();
  game.relationships = [{ id: "old-red-lady", name: "红夫人", value: 0 }];
  assert.doesNotMatch(JSON.stringify(knownPeople(game)), /序列6|魔女会|白鸢尾/);
});

test("migration is idempotent, preserves unknown relations and never replays rewards", () => {
  const game = fresh();
  game.turn = 30;
  addQuest(game, RENARD, "completed-medicine", "completed", {
    completedTurn: 23,
    stageHistory: [{ from: "secure-treatment", to: "auction-conversation", turn: 12 }, { from: "auction-conversation", to: "completed-medicine", turn: 23 }],
  });
  game.relationships = [
    { id: "viscount-renard", name: "雷纳德子爵", value: 27, note: "旧人情记录" },
    { id: "bridge-dockworkers", name: "南岸码头工人", value: 18, note: "工人愿意提供消息" },
  ];
  const money = moneyToPence(game.money);
  const migrated = migrateSave(game);
  const reloaded = migrateSave(migrated);
  assert.deepEqual(reloaded, migrated);
  assert.equal(moneyToPence(reloaded.money), money);
  assert.deepEqual(reloaded.inventory, migrated.inventory);
  assert.equal(person(reloaded, "viscount-renard").value, 27);
  assert.equal(person(reloaded, "viscount-renard").note, "旧人情记录");
  assert.equal(person(reloaded, "edmund-vair").contact, "met");
  assert.equal(reloaded.relationships.find(entry => entry.id === "bridge-dockworkers").value, 18);
});

test("saving immediately includes discoveries and load keeps them without mutating source", (t) => {
  const entries = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "localStorage", previous); else delete globalThis.localStorage; });
  const game = fresh();
  fact(game, "watch.note-recovered", 4);
  const before = structuredClone(game);
  const saved = saveGame(game);
  assert.deepEqual(game, before);
  assert.equal(saved.relationships[0].name, "雷金纳德·霍尔");
  assert.equal(loadGame().relationships[0].name, "雷金纳德·霍尔");
});

test("real quest transitions register people without awarding relationship points early", () => {
  const game = fresh();
  processTriggers(game, { action: "打听雷纳德的求医消息", turn: 1 });
  const instance = game.triggerState.active.find(entry => entry.definitionId === RENARD);
  assert.ok(instance);
  assert.equal(game.relationships.find(entry => entry.id === "viscount-renard").contact, "heard");
  const engaged = engageTrigger(game, instance.instanceId, 2, "回应雷纳德的求医消息");
  assert.equal(engaged.ok, true);
  game.location.id = "queen-renard-estate";
  const step = settleQuestStep(game, instance.instanceId, "assess-renard-injury", 3, "与子爵交谈", "在门厅与子爵本人交谈，确认求医情况", "与子爵交谈");
  assert.equal(step.ok, true);
  const renard = game.relationships.find(entry => entry.id === "viscount-renard");
  assert.equal(renard.contact, "met");
  assert.equal(renard.value, 0);
  assert.equal(game.relationships.some(entry => entry.id === "edmund-vair"), false);
});

test("AI context receives disclosed people and no registry spoilers", () => {
  const game = fresh();
  fact(game, "watch.formal-quest-unlocked", 5);
  const context = JSON.stringify(visiblePeopleContext(game));
  assert.match(context, /白鸢尾/);
  assert.doesNotMatch(context, /塞西莉亚|红夫人|序列7|discoveries|questIds/);
  const messages = buildPlanningContext(game, "打听纸条里的人", "");
  assert.ok(messages.some(message => message.content.includes("听闻不") || message.content.includes("heard仅为听闻")));
  assert.ok(messages.some(message => message.content.includes('"id":"white-iris"')));
});
