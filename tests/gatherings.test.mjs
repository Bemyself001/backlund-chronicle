import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { GATHERING, PATHWAYS, getContentTrigger } from "../src/content/index.js";
import { gatheringView, gatheringState, gatheringSchedule, gatheringItem, gatheringSellPrice } from "../src/engine/gatherings.js";
import { executeSpecialAction, specialState } from "../src/engine/specialActions.js";
import { resolveSpecialAction } from "../src/services/specialActions.js";
import { migrateSave } from "../src/services/storage.js";
import { parseWorldTime, formatWorldTime } from "../src/engine/worldTime.js";
import { moneyFromPence, moneyToPence } from "../src/system/money.js";
import { getAdvancement } from "../src/system/character.js";
import { spiritualGrowthForSequence } from "../src/system/characterStats.js";
import { getMapLocation } from "../src/system/map.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { visibleGameState } from "../src/services/memory.js";
import { engageTrigger, settleQuestStep } from "../src/engine/triggerEngine.js";
import { syncQuestJournal } from "../src/engine/questRuntime.js";
import { inspectQuestTracking } from "../src/services/questTracking.js";

function fresh(pathwayId = "seer", sequence = 9) {
  const pathway = PATHWAYS.find(path => path.id === pathwayId);
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "聚会测试员", extraordinary: sequence == null ? "ordinary" : "low", pathway: sequence == null ? "" : `${pathway.name}（序列${sequence}）` });
  game.money = moneyFromPence(1000000); game.capacity.maxWeight = 100;
  game.worldTime = "1349年 10月17日 · 周二 · 18:00";
  game.location = { id: GATHERING.locationId, name: getMapLocation(GATHERING.locationId).name, district: "贝克兰德桥区" };
  return game;
}
function request(game, operation, extra = {}) {
  const view = gatheringView(game);
  return { operation, revision: specialState(game).revision, gatheringRevision: view.revision,
    expectedTurn: game.turn, expectedWorldTime: game.worldTime, sessionId: view.schedule?.id, ...extra };
}
const run = (game, operation, extra) => resolveSpecialAction(game, request(game, operation, extra));
function introduced(game = fresh()) { return run(run(game, "gathering-contact"), "gathering-introduce"); }
function inside(game = introduced()) {
  game.worldTime = "1349年 10月17日 · 周二 · 20:00";
  return run(game, "gathering-enter");
}
function buy(game, kind) {
  const offer = gatheringView(game).offers.find(entry => entry.kind === kind);
  return run(game, "gathering-buy", { offerId: offer.id, pricePence: offer.pricePence });
}
function entry(game, definitionId, version = 2, status = "available") {
  const definition = structuredClone(getContentTrigger(definitionId));
  definition.version = version;
  if (version === 1) { definition.stages = []; delete definition.engagedStage; }
  const instance = { instanceId: `test:${definitionId}`, definitionId, definitionVersion: version, definitionSnapshot: definition,
    status, category: "occult-entry", stage: "discovered", createdTurn: 0, expiresTurn: 10, stageHistory: [], presentation: definition.presentation };
  game.triggerState.active.push(instance);
  return instance.instanceId;
}

test("all three entries have finite progress, real address rewards, strict on-site handoff and a permanent introduction", () => {
  for (const definitionId of ["occult.entry.hidden-receipt", "occult.entry.midnight-employer", "occult.entry.seer.reversed-reflection"]) {
    let game = fresh(); game.location.id = "east-station";
    const id = entry(game, definitionId), definition = getContentTrigger(definitionId);
    assert.ok([2, 3].includes(definition.stages.length));
    assert.equal(engageTrigger(game, id, 1, "开始调查").ok, true); game.turn = 1;
    assert.equal(gatheringView(game).access, false);
    for (const [index, stage] of definition.stages.entries()) {
      const transition = stage.transitions[0], action = transition.description;
      if (stage.locationId) {
        const failed = settleQuestStep(game, id, transition.objectiveId, game.turn + 1, action, action, action);
        assert.equal(failed.ok, false); assert.equal(gatheringView(game).access, false);
        const plan = inspectQuestTracking(game, { id, revision: syncQuestJournal(game).entries[id].revision });
        assert.equal(plan.kind, "travel"); assert.equal(plan.locationId, GATHERING.locationId);
        game.location.id = GATHERING.locationId;
      }
      const result = settleQuestStep(game, id, transition.objectiveId, game.turn + 1, action, action, action);
      assert.equal(result.ok, true, definitionId); game.turn += 1;
      assert.ok(game.clues.length > 0); assert.equal(syncQuestJournal(game).entries[id].entryProgress.done, index + 1);
      if (!transition.complete) assert.match(syncQuestJournal(game).entries[id].objective, /旅店|灰手套/);
      // 每个已完成阶段的收益只发一次；重复请求不能倒退阶段。
      const rewards = structuredClone(game.triggerState.rewardsClaimed);
      assert.equal(settleQuestStep(game, id, transition.objectiveId, game.turn + 1, action, action, action).ok, false);
      assert.deepEqual(game.triggerState.rewardsClaimed, rewards);
      if (!transition.complete) game.location.id = "east-station";
    }
    assert.equal(gatheringView(game).access, true);
    assert.equal(syncQuestJournal(game).entries[id].status, "completed");
    assert.equal(gatheringView(migrateSave(game)).access, true);
    if (definitionId.includes("seer")) assert.ok(game.inventory.some(item => item.recipe?.sequence === 8 && item.recipe.pathwayId === "seer"));
  }
});

test("entry refusals and hypothetical handoffs cannot grant invitation or rewards", () => {
  const game = fresh(), id = entry(game, "occult.entry.hidden-receipt");
  engageTrigger(game, id, 1, "调查收据");
  assert.equal(settleQuestStep(game, id, "decode-receipt", 2, "不要检查收据", "检查收据", "不要检查收据").ok, false);
  assert.equal(gatheringView(game).access, false); assert.equal(game.triggerState.rewardsClaimed.length, 0);
});

test("old empty entry snapshots migrate into a useful current stage without reopening terminal history", () => {
  const game = fresh(); game.content.contentVersion = "2026.10.09.1";
  const engagedId = entry(game, "occult.entry.hidden-receipt", 1, "engaged");
  const availableId = entry(game, "occult.entry.midnight-employer", 1);
  game.triggerState.history.push({ instanceId: "completed-old", definitionId: "occult.entry.seer.reversed-reflection", definitionVersion: 1, category: "occult-entry", status: "completed", stage: "completed", createdTurn: 0, stageHistory: [] });
  const migrated = migrateSave(game), engaged = migrated.triggerState.active.find(item => item.instanceId === engagedId);
  assert.equal(engaged.definitionVersion, 2); assert.equal(engaged.stage, "read-receipt");
  assert.equal(migrated.triggerState.active.find(item => item.instanceId === availableId).expiresTurn, 10);
  assert.equal(migrated.triggerState.history.find(item => item.instanceId === "completed-old").definitionVersion, 1);
  assert.equal(gatheringView(migrated).access, false); assert.equal(migrated.triggerState.rewardsClaimed.length, 0);
  const progressed = settleQuestStep(migrated, engagedId, "decode-receipt", 2, "检查收据背面的暗记", "已核对收据背面的旅店地址", "检查收据背面的暗记");
  assert.equal(progressed.ok, true, progressed.reason);
});

test("ordinary and already-promoted players have a two-step contact route, never rank-only access", () => {
  for (const sequence of [null, 9, 8, 5, 4]) {
    const game = fresh("seer", sequence), before = structuredClone(game);
    assert.equal(gatheringView(game).access, false);
    assert.throws(() => run(game, "gathering-enter"), /资格/);
    assert.deepEqual(game, before);
    const contact = run(game, "gathering-contact");
    assert.equal(gatheringView(contact).contactKnown, true); assert.equal(gatheringView(contact).access, false);
    const invited = run(contact, "gathering-introduce");
    assert.equal(gatheringView(invited).access, true); assert.equal(moneyToPence(invited.money), moneyToPence(game.money));
    assert.equal(getAdvancement(invited.character).sequence, getAdvancement(game.character).sequence);
    assert.throws(() => run(invited, "gathering-introduce"), /已有资格/);
    assert.equal(invited.relationships.find(person => person.id === "mist-lamp-contact").contact, "met");
  }
});

test("the in-game Tuesday epoch, midnight and closing boundaries produce the correct next date", () => {
  const game = introduced();
  for (const [time, open, expected] of [
    ["1349年 10月17日 · 周二 · 19:59", false, "10月17日 · 周二 · 20:00"],
    ["1349年 10月17日 · 周二 · 20:00", true, "10月17日 · 周二 · 20:00"],
    ["1349年 10月17日 · 周二 · 21:59", true, "10月17日 · 周二 · 20:00"],
    ["1349年 10月17日 · 周二 · 22:00", false, "10月20日 · 周五 · 20:00"],
    ["1349年 10月20日 · 周五 · 22:00", false, "10月24日 · 周二 · 20:00"],
    ["1349年 10月31日 · 周二 · 22:00", false, "11月3日 · 周五 · 20:00"],
  ]) {
    game.worldTime = time;
    assert.equal(gatheringSchedule(game).open, open); assert.ok(gatheringSchedule(game).startsAt.endsWith(expected));
  }
});

test("reading schedules does not consume time or move; travel and waiting need explicit current requests", () => {
  const game = introduced(); game.location.id = "east-station";
  const before = structuredClone(game);
  gatheringView(game); gatheringView(game);
  assert.deepEqual(game, before);
  assert.throws(() => run(game, "gathering-wait"), /到达旅店/);
  const travelled = run(game, "gathering-travel");
  assert.equal(travelled.location.id, GATHERING.locationId); assert.notEqual(travelled.worldTime, game.worldTime);
  const schedule = gatheringSchedule(travelled), stale = request(travelled, "gathering-wait");
  const waited = run(travelled, "gathering-wait");
  assert.equal(waited.worldTime, schedule.startsAt); assert.equal(gatheringView(waited).inside, false);
  assert.throws(() => executeSpecialAction(waited, stale), /状态已更新/);
  assert.equal(gatheringView(run(waited, "gathering-enter")).inside, true);
});

test("session stock and seller identities remain fixed across view, reload, leaving and re-entry", () => {
  const game = inside(), before = structuredClone(game), view = gatheringView(game);
  assert.ok(view.offers.length >= 5); assert.deepEqual(new Set(view.offers.map(offer => offer.kind)), new Set(["recipe", "material", "potion", "characteristic", "equipment"]));
  gatheringView(game); assert.deepEqual(game, before);
  assert.deepEqual(gatheringView(migrateSave(game)).offers, view.offers);
  const bought = buy(game, "potion"), saved = migrateSave(bought), reentered = run(run(saved, "gathering-leave"), "gathering-enter");
  assert.equal(gatheringView(reentered).offers.find(offer => offer.kind === "potion").stock, 0);
  assert.deepEqual(gatheringView(reentered).offers.map(offer => offer.seller), view.offers.map(offer => offer.seller));
});

test("all pathways receive their next supported sequence; the gathering never creates sequence three advancement", () => {
  for (const pathway of PATHWAYS) {
    for (const sequence of [9, 8, 7, 6, 5, 4]) {
      const game = inside(introduced(fresh(pathway.id, sequence))), offer = gatheringView(game).offers.find(entry => entry.kind === "potion");
      assert.equal(offer.item.potion.pathwayId, pathway.id); assert.equal(offer.item.potion.sequence, Math.max(4, sequence - 1));
    }
  }
});

test("buying settles exact price, one instance, stock, receipt, time and fixed narrative without auto-use or auto-equip", () => {
  let game = inside(), before = structuredClone(game);
  const offer = gatheringView(game).offers.find(offer => offer.kind === "characteristic");
  game = buy(game, "characteristic");
  assert.deepEqual(before.character.advancement, game.character.advancement);
  assert.deepEqual(before.character.stats, game.character.stats);
  assert.equal(moneyToPence(game.money), moneyToPence(before.money) - offer.pricePence);
  const item = game.inventory.find(item => item.characteristic?.sequence === 8);
  assert.ok(item); assert.equal(item.equipped, false);
  assert.equal(parseWorldTime(game.worldTime) - parseWorldTime(before.worldTime), 10 * 60000);
  assert.equal(gatheringState(game).receipts.at(-1).amountPence, -offer.pricePence);
  assert.equal(game.storyHistory.at(-1).source, "fixed"); assert.ok(game.lastTurnAudit);
  const gear = buy(game, "equipment").inventory.find(item => item.itemId === GATHERING.equipment.itemId);
  assert.equal(gear.beyonder, true); assert.ok(gear.tags.includes("装备")); assert.equal(gear.equipped, false);
  assert.ok(gear.weapon.bonusPercent >= 21 && gear.weapon.bonusPercent <= 25);
});

test("insufficient funds, wrong price, wrong session, capacity and stale confirmation leave the entire save unchanged", () => {
  const initial = inside(), offer = gatheringView(initial).offers.find(offer => offer.kind === "potion");
  for (const failure of ["funds", "price", "session", "capacity", "time", "revision"]) {
    const game = structuredClone(initial);
    if (failure === "funds") game.money = moneyFromPence(1);
    if (failure === "capacity") game.capacity.maxWeight = 0.01;
    const args = request(game, "gathering-buy", { offerId: offer.id, pricePence: offer.pricePence });
    if (failure === "price") args.pricePence -= 1;
    if (failure === "session") args.sessionId = "fictional-session";
    if (failure === "time") args.expectedWorldTime = "stale";
    if (failure === "revision") args.gatheringRevision -= 1;
    const before = structuredClone(game);
    assert.throws(() => executeSpecialAction(game, args));
    assert.deepEqual(game, before, failure);
  }
  const bought = buy(initial, "potion"), before = structuredClone(bought);
  assert.throws(() => run(bought, "gathering-buy", { offerId: offer.id, pricePence: offer.pricePence }), /售罄/);
  assert.deepEqual(bought, before);
});

test("closing time invalidates attendance and late transactions without losing the invitation", () => {
  const game = inside(), offer = gatheringView(game).offers.find(offer => offer.kind === "potion");
  game.worldTime = "1349年 10月17日 · 周二 · 21:51";
  assert.throws(() => run(game, "gathering-buy", { offerId: offer.id, pricePence: offer.pricePence }), /来不及/);
  game.worldTime = "1349年 10月17日 · 周二 · 22:00";
  assert.equal(gatheringView(game).inside, false); assert.equal(gatheringView(game).access, true);
  assert.equal(gatheringView(game).offers.length, 0);
  assert.throws(() => run(game, "gathering-buy", { offerId: offer.id, pricePence: offer.pricePence }), /已经结束/);
});

test("a bought recipe plus matching material becomes one potion, preserving the recipe and promotion gate", () => {
  let game = buy(buy(inside(), "recipe"), "material");
  const recipe = game.inventory.find(item => item.recipe?.sequence === 8), before = structuredClone(game);
  const brewed = run(game, "gathering-brew", { instanceId: recipe.instanceId });
  assert.equal(brewed.inventory.filter(item => item.itemId === "gathering-material-seer-8").length, 0);
  assert.equal(brewed.inventory.find(item => item.instanceId === recipe.instanceId).quantity, 1);
  assert.equal(brewed.inventory.find(item => item.potion?.pathwayId === "seer" && item.potion.sequence === 8).quantity, 1);
  assert.equal(moneyToPence(brewed.money), moneyToPence(game.money));
  assert.equal(parseWorldTime(brewed.worldTime) - parseWorldTime(game.worldTime), 20 * 60000);
  assert.deepEqual(brewed.character.advancement, before.character.advancement);
  assert.throws(() => run(brewed, "gathering-brew", { instanceId: recipe.instanceId }), /缺少.*材料/);
  const wrong = structuredClone(game);
  wrong.inventory.find(item => item.gatheringMaterial).gatheringMaterial.pathwayId = "reader";
  assert.throws(() => run(wrong, "gathering-brew", { instanceId: recipe.instanceId }), /缺少.*材料/);
});

test("selling removes one owned item, credits exact quote, and cannot sell equipped or unidentified objects", () => {
  let game = inside(), item = gatheringItem("characteristic", "seer", 7, "sale-test");
  item.quantity = 2; game.inventory.push(item);
  const price = gatheringSellPrice(item), balance = moneyToPence(game.money);
  game = run(game, "gathering-sell", { instanceId: item.instanceId, pricePence: price });
  assert.equal(game.inventory.find(entry => entry.instanceId === item.instanceId).quantity, 1);
  assert.equal(moneyToPence(game.money), balance + price);
  assert.equal(gatheringState(game).receipts.at(-1).kind, "sell");
  const gear = gatheringItem("equipment", "seer", 9, "equipped-sale"); game.inventory.push(gear); game.equipment["非凡物品:1"] = gear.instanceId;
  const before = structuredClone(game);
  assert.throws(() => run(game, "gathering-sell", { instanceId: gear.instanceId, pricePence: gatheringSellPrice(gear) }), /卸下/);
  assert.deepEqual(game, before);
  assert.equal(gatheringSellPrice({ ...item, characteristic: { identified: false } }), 0);
  assert.equal(gatheringSellPrice({ ...item, tags: ["关键证据"] }), 0);
});

test("outside buy requests take no money, match a next-session offer and settle only after explicit confirmation", () => {
  const game = introduced(), balance = moneyToPence(game.money), inventory = structuredClone(game.inventory);
  const schedule = gatheringSchedule(game, { afterCurrent: true });
  const pending = run(game, "gathering-request", { kind: "potion", pathwayId: "reader", sequence: 7, sessionId: schedule.id });
  assert.equal(moneyToPence(pending.money), balance); assert.deepEqual(pending.inventory, inventory);
  assert.equal(gatheringView(pending).requests.at(-1).status, "pending");
  const saved = migrateSave(pending); saved.worldTime = schedule.startsAt;
  const entered = run(saved, "gathering-enter"), matched = gatheringView(entered).requests.at(-1);
  assert.equal(matched.status, "matched"); assert.equal(moneyToPence(entered.money), balance);
  const offer = gatheringView(entered).offers.find(offer => offer.id === matched.offerId);
  assert.equal(offer.item.potion.pathwayId, "reader"); assert.equal(offer.item.potion.sequence, 7);
  const settled = run(entered, "gathering-buy", { offerId: offer.id, pricePence: offer.pricePence });
  assert.equal(gatheringView(settled).requests.at(-1).status, "fulfilled");
  assert.equal(moneyToPence(settled.money), balance - offer.pricePence);
});

test("sell requests never confiscate equipment, reply once on arrival, and cancellation or missed dates never charge", () => {
  const game = introduced(), item = gatheringItem("equipment", "seer", 9, "requested-sale"); game.inventory.push(item);
  const schedule = gatheringSchedule(game, { afterCurrent: true });
  const pending = run(game, "gathering-request", { kind: "sell", instanceId: item.instanceId, sessionId: schedule.id });
  assert.ok(pending.inventory.some(entry => entry.instanceId === item.instanceId));
  const cancelled = run(pending, "gathering-cancel-request", { requestId: gatheringView(pending).requests[0].id });
  assert.equal(moneyToPence(cancelled.money), moneyToPence(game.money));
  const missed = structuredClone(pending); missed.worldTime = "1349年 10月18日 · 周三 · 10:00";
  assert.equal(gatheringView(missed).requests[0].status, "missed");
  pending.worldTime = schedule.startsAt;
  const entered = run(pending, "gathering-enter");
  assert.equal(gatheringView(entered).requests[0].status, "matched");
  assert.ok(entered.inventory.some(entry => entry.instanceId === item.instanceId));
  entered.worldTime = "1349年 10月18日 · 周三 · 10:00";
  assert.equal(gatheringView(entered).requests[0].status, "missed");
});

test("duplicate and excessive pending requests, unknown ranks and absent sale objects are rejected atomically", () => {
  let game = introduced(), sessionId = gatheringSchedule(game, { afterCurrent: true }).id;
  const args = { kind: "potion", pathwayId: "seer", sequence: 7, sessionId };
  game = run(game, "gathering-request", args);
  assert.throws(() => run(game, "gathering-request", args), /已经登记/);
  assert.throws(() => run(game, "gathering-request", { ...args, sequence: 3 }), /没有登记/);
  assert.throws(() => run(game, "gathering-request", { kind: "sell", instanceId: "non-existent", sessionId }), /可出售/);
  game = run(game, "gathering-request", { ...args, kind: "recipe" });
  game = run(game, "gathering-request", { ...args, kind: "material" });
  const before = structuredClone(game);
  assert.throws(() => run(game, "gathering-request", { ...args, sequence: 8 }), /三条/);
  assert.deepEqual(game, before);
});

test("session messages are useful and permanent; read-only context hides stock before entry and local tools cannot fake trades", () => {
  const invited = introduced(); assert.equal(visibleGameState(invited).gathering.offers.length, 0);
  const game = inside(invited), informed = run(game, "gathering-intelligence");
  assert.match(gatheringView(informed).intelligence, /小丑魔药配方抄本/);
  assert.ok(informed.clues.some(clue => clue.kind === "gathering"));
  assert.equal(moneyToPence(game.money), moneyToPence(informed.money));
  assert.throws(() => run(informed, "gathering-intelligence"), /已经记录/);
  const before = structuredClone(informed);
  const execution = executeToolCalls(informed, [
    { id: "fake-payment", name: "money.remove", args: { amount: 20 }, reason: "购买聚会商品" },
    { id: "fake-delivery", name: "inventory.add", args: { item: { instanceId: "fake", name: "小丑魔药", itemId: "gathering-potion-seer-8", category: "魔药", quantity: 1, weight: 0.1, tags: ["魔药"] } }, reason: "聚会供货" },
  ]);
  assert.ok(execution.results.every(result => !result.ok));
  assert.deepEqual(execution.game.inventory, before.inventory); assert.deepEqual(execution.game.money, before.money);
  assert.equal(gatheringView(migrateSave(informed)).intelligence, gatheringView(informed).intelligence);
});

test("a legacy save gets empty gathering state while equipped slots and ongoing commissions stay intact", () => {
  const old = fresh(); delete old.gatherings;
  const migrated = migrateSave(old);
  assert.deepEqual(migrated.gatherings, { version: 1, revision: 0, attendance: null, sessions: {}, requests: [], receipts: [] });
  assert.equal(gatheringView(migrated).access, false);
  assert.equal(formatWorldTime(parseWorldTime(migrated.worldTime)), migrated.worldTime);
});

test("purchased characteristics still require explicit absorption and apply the existing half-current-stats penalty once", () => {
  const game = buy(inside(introduced(fresh("seer", 8))), "characteristic");
  Object.assign(game.character.stats, { health: 6, sanity: 5, spirituality: 4 });
  const item = game.inventory.find(item => item.characteristic?.sequence === 7), growth = spiritualGrowthForSequence(7);
  const call = { id: "absorb-purchased", name: "advancement.promote", args: { pathwayId: "seer", sequence: 7, characteristicInstanceId: item.instanceId, evidence: "玩家确认吸收已购买并核对的完整特性" }, reason: "确认直接晋升" };
  const cancelled = executeToolCalls(game, [call], { playerAction: "暂不吸收非凡特性", blockedCallIndexes: [0] });
  assert.equal(cancelled.results[0].ok, false); assert.equal(cancelled.game.character.advancement.sequence, 8);
  assert.ok(cancelled.game.inventory.some(entry => entry.instanceId === item.instanceId));
  const promoted = executeToolCalls(game, [call], { playerAction: "确认吸收非凡特性并正式晋升" });
  assert.equal(promoted.results[0].ok, true, promoted.results[0].reason);
  assert.equal(promoted.game.character.advancement.sequence, 7);
  assert.equal(promoted.game.character.stats.health, Math.floor((6 + growth) / 2));
  assert.equal(promoted.game.character.stats.sanity, Math.floor((5 + growth) / 2));
  assert.equal(promoted.game.character.stats.spirituality, Math.floor((4 + growth) / 2));
  assert.equal(promoted.game.inventory.some(entry => entry.instanceId === item.instanceId), false);
  assert.deepEqual(migrateSave(promoted.game).character.stats, promoted.game.character.stats);
});
