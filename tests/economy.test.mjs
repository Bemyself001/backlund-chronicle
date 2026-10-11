import test from "node:test";
import assert from "node:assert/strict";
import { ECONOMY, GATHERING, SPECIAL_ACTIONS, validateContentPack, ACTIVE_CONTENT } from "../src/content/index.js";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { tradeView, tradingState } from "../src/engine/trading.js";
import { actionGate, availableSpecialActions, commissionOffer, commissionBonus, executeSpecialAction, specialState } from "../src/engine/specialActions.js";
import { resolveSpecialAction } from "../src/services/specialActions.js";
import { migrateSave } from "../src/services/storage.js";
import { moneyFromPence, moneyToPence } from "../src/system/money.js";
import { parseWorldTime } from "../src/engine/worldTime.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { visibleGameState, promptGameState, publicStateChanges } from "../src/services/memory.js";
import { getMapLocation } from "../src/system/map.js";
import { gatheringView } from "../src/engine/gatherings.js";

function fresh() {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "经济测试员", extraordinary: "ordinary", pathway: "" });
  game.money = moneyFromPence(5000); game.capacity.maxWeight = 100;
  game.worldTime = "1349年 10月17日 · 周二 · 10:00";
  return at(game, "dock");
}
function at(game, channelId) {
  const channel = ECONOMY.trade.channels.find(entry => entry.id === channelId), location = getMapLocation(channel.locationId);
  game.location = { id: location.id, name: location.name, district: `贝克兰德${location.district}` };
  return game;
}
function request(game, operation, extra = {}) {
  const view = tradeView(game);
  return { operation, revision: specialState(game).revision, tradeRevision: view.revision, marketDay: view.day,
    expectedTurn: game.turn, expectedWorldTime: game.worldTime, channelId: "dock", quantity: 1, ...extra };
}
const run = (game, operation, extra) => resolveSpecialAction(game, request(game, operation, extra));
const quote = (game, channelId, goodId) => tradeView(game).channels.find(entry => entry.id === channelId).quotes.find(entry => entry.id === goodId);
const buy = (game, channelId = "dock", goodId = "tea", quantity = 1) => run(game, "trade-buy", { channelId, goodId, quantity, unitPricePence: quote(game, channelId, goodId).buyPence });
function sell(game, channelId, quantity = 1) {
  const lot = tradeView(game).lots[0];
  return run(game, "trade-sell", { channelId, instanceId: lot.instanceId, quantity, unitPricePence: quote(game, channelId, lot.goodId).sellPence });
}

test("player-selected prices and a coherent progression are registered separately from formulas and potions", () => {
  assert.equal(GATHERING.prices[9].recipe, 30 * 240);
  assert.equal(GATHERING.prices[9].characteristic, 50 * 240);
  for (const sequence of [9, 8, 7, 6, 5, 4]) {
    const prices = GATHERING.prices[sequence];
    assert.ok(prices.material < prices.potion && prices.characteristic < prices.potion);
    if (sequence < 9) for (const kind of Object.keys(prices)) assert.ok(prices[kind] > GATHERING.prices[sequence + 1][kind]);
  }
  assert.deepEqual(validateContentPack(), []);
  const broken = structuredClone(ACTIVE_CONTENT); broken.economy.trade.channels[0].prices.tea.sell = 99999;
  assert.ok(validateContentPack(broken).some(error => /报价/.test(error)));
});

test("ordinary players can take all three authored jobs, with on-site gates, saved offers and exact wages", () => {
  for (const definition of ECONOMY.jobs) {
    const game = fresh(), before = structuredClone(game);
    assert.ok(availableSpecialActions(game).some(entry => entry.id === definition.id));
    if (game.location.id !== definition.locationId) assert.match(actionGate(game, definition), /指定地点/);
    game.location.id = definition.locationId;
    const accepted = resolveSpecialAction(game, { operation: "accept", id: definition.id, revision: specialState(game).revision });
    const loaded = migrateSave(accepted), wage = loaded.specialActions.active.offer.options.find(entry => entry.id === "careful").reward;
    assert.deepEqual(loaded.specialActions.active, accepted.specialActions.active);
    const settled = resolveSpecialAction(loaded, { operation: "resolve", id: loaded.specialActions.active.id, optionId: "careful", revision: specialState(loaded).revision });
    assert.equal(moneyToPence(settled.money), moneyToPence(game.money) + wage);
    assert.equal(parseWorldTime(settled.worldTime) - parseWorldTime(loaded.worldTime), definition.minutes * 60000);
    assert.ok(wage >= 12 * 12 && wage <= 16 * 12);
    assert.equal(settled.character.advancement.type, "ordinary");
    assert.equal(commissionBonus(game, definition), 0);
    assert.equal(before.turn, game.turn);
  }
});

test("non-gambling commissions double basic income and apply the increased sequence supplement once", () => {
  const definition = SPECIAL_ACTIONS.find(entry => entry.id === "work-reader");
  for (const sequence of [9, 8, 4]) {
    const game = createInitialGame({ ...EMPTY_CHARACTER, name: "非凡工作者", extraordinary: "low", pathway: `阅读者（序列${sequence}）` });
    const offer = commissionOffer(game, definition), original = definition.pool.find(entry => entry.id === offer.id);
    assert.equal(offer.options[0].reward, original.options[0].reward * 2);
    const accepted = resolveSpecialAction(game, { operation: "accept", id: definition.id, revision: specialState(game).revision });
    const settled = resolveSpecialAction(accepted, { operation: "resolve", id: accepted.specialActions.active.id, optionId: "careful", revision: specialState(accepted).revision });
    assert.equal(moneyToPence(settled.money) - moneyToPence(game.money), offer.options[0].reward + (9 - sequence) * 24);
  }
  const casino = SPECIAL_ACTIONS.find(entry => entry.id === "work-monster");
  assert.equal(commissionOffer(fresh(), casino).options[1].reward, 6);
});

test("view and reload keep prices, money and time fixed; all goods have profitable cross-channel routes", () => {
  const game = fresh(), before = structuredClone(game), view = tradeView(game);
  assert.deepEqual(tradeView(game), view); assert.deepEqual(game, before);
  assert.deepEqual(tradeView(migrateSave(game)), view);
  for (const good of ECONOMY.trade.goods) {
    const dock = quote(game, "dock", good.id), merchant = quote(game, "merchant", good.id);
    assert.ok(dock.sellPence < dock.buyPence && merchant.sellPence < merchant.buyPence);
    assert.ok(good.id === "parts" ? dock.sellPence > merchant.buyPence : merchant.sellPence > dock.buyPence);
  }
});

test("bulk procurement and partial cross-channel resale preserve cost basis, stock, audit and saved profit", () => {
  const initial = fresh(), unitCost = quote(initial, "dock", "tea").buyPence, stock = quote(initial, "dock", "tea").stock;
  const before = structuredClone(initial);
  let game = buy(initial, "dock", "tea", 3);
  assert.deepEqual(initial, before);
  assert.equal(moneyToPence(game.money), moneyToPence(initial.money) - unitCost * 3);
  assert.equal(quote(game, "dock", "tea").stock, stock - 3);
  assert.equal(tradeView(game).lots[0].quantity, 3);
  game = migrateSave(game);
  const travelStart = game.worldTime;
  game = run(game, "trade-travel", { channelId: "merchant" });
  assert.equal(game.location.id, "hillston-market"); assert.notEqual(game.worldTime, travelStart);
  const sellingPrice = quote(game, "merchant", "tea").sellPence, demand = quote(game, "merchant", "tea").demand;
  const money = moneyToPence(game.money);
  game = sell(game, "merchant", 2);
  assert.equal(moneyToPence(game.money), money + sellingPrice * 2);
  assert.equal(tradeView(game).lots[0].quantity, 1);
  assert.equal(quote(game, "merchant", "tea").demand, demand - 2);
  const receipt = tradingState(game).receipts.at(-1);
  assert.equal(receipt.costBasisPence, unitCost * 2);
  assert.equal(receipt.profitPence, (sellingPrice - unitCost) * 2); assert.ok(receipt.profitPence > 0);
  assert.deepEqual(tradeView(migrateSave(game)), tradeView(game));
  assert.ok(game.lastTurnAudit); assert.equal(game.storyHistory.at(-1).source, "fixed");
  game = sell(game, "merchant"); assert.equal(tradeView(game).lots.length, 0);
});

test("same-channel resale loses money and cannot replenish today's purchase stock", () => {
  const initial = fresh(), game = sell(buy(initial), "dock");
  assert.ok(moneyToPence(game.money) < moneyToPence(initial.money));
  assert.equal(quote(game, "dock", "tea").stock, quote(initial, "dock", "tea").stock - 1);
});

test("oversized quantities, capacity, insufficient money, remote buys and stale dates reject the whole transaction", () => {
  for (const failure of ["funds", "capacity", "location", "price", "day", "time", "revision", "quantity", "fraction", "stock", "negative"]) {
    const game = fresh(), args = request(game, "trade-buy", { goodId: "tea", unitPricePence: quote(game, "dock", "tea").buyPence });
    if (failure === "funds") game.money = moneyFromPence(1);
    if (failure === "capacity") game.capacity.maxWeight = 0.1;
    if (failure === "location") game.location.id = "east-station";
    if (failure === "price") args.unitPricePence -= 1;
    if (failure === "day") args.marketDay = "1349-10-16";
    if (failure === "time") args.expectedWorldTime = "stale";
    if (failure === "revision") args.tradeRevision -= 1;
    if (failure === "quantity") args.quantity = 11;
    if (failure === "fraction") args.quantity = 1.5;
    if (failure === "stock") args.quantity = 5;
    if (failure === "negative") args.quantity = -1;
    const before = structuredClone(game);
    assert.throws(() => executeSpecialAction(game, args), undefined, failure); assert.deepEqual(game, before, failure);
  }
  const game = buy(fresh()), stale = request(game, "trade-sell", { instanceId: tradeView(game).lots[0].instanceId, unitPricePence: quote(game, "dock", "tea").sellPence });
  const sold = sell(game, "dock"), before = structuredClone(sold);
  assert.throws(() => executeSpecialAction(sold, stale), /更新/); assert.deepEqual(sold, before);
});

test("unregistered, missing, equipped or protected batches cannot be sold", () => {
  for (const failure of ["registration", "quantity", "equipped", "protected", "missing", "demand"]) {
    const game = buy(fresh()), lot = tradeView(game).lots[0], item = game.inventory.find(entry => entry.instanceId === lot.instanceId);
    if (failure === "registration") delete game.trading.lots[item.instanceId];
    if (failure === "quantity") item.quantity += 1;
    if (failure === "equipped") game.equipment["武器"] = item.instanceId;
    if (failure === "protected") item.tags.push("关键证据");
    if (failure === "missing") game.inventory = game.inventory.filter(entry => entry.instanceId !== item.instanceId);
    if (failure === "demand") game.trading.days[tradeView(game).day].dock.tea.sold = 4;
    const before = structuredClone(game);
    assert.throws(() => run(game, "trade-sell", { instanceId: lot.instanceId, unitPricePence: quote(game, "dock", "tea").sellPence }));
    assert.deepEqual(game, before, failure);
  }
});

test("daily limits survive leaving and saving; only advancing game date replenishes them", () => {
  let game = buy(fresh(), "dock", "tea", 4);
  assert.equal(quote(migrateSave(game), "dock", "tea").stock, 0);
  game = run(run(game, "trade-travel", { channelId: "merchant" }), "trade-travel", { channelId: "dock" });
  assert.equal(quote(game, "dock", "tea").stock, 0);
  game.worldTime = "1349年 10月18日 · 周三 · 10:00";
  assert.equal(quote(game, "dock", "tea").stock, 4);
  assert.equal(tradeView(game).lots[0].quantity, 4);
});

test("AI tools cannot mint trade batches or independently credit resale income, while unrelated money changes still work", () => {
  const game = fresh(), before = structuredClone(game);
  const calls = [
    { id: "fake-pay", name: "money.add", args: { amount: 500 }, reason: "收到货款" },
    { id: "fake-goods", name: "inventory.add", args: { item: { instanceId: "counterfeit", itemId: "trade-good-tea", name: "封装茶叶", category: "贸易货物", tags: ["贸易货物"], quantity: 4, weight: 0.5 } }, reason: "货物交付" },
  ];
  const failed = executeToolCalls(game, calls);
  assert.ok(failed.results.every(result => !result.ok)); assert.deepEqual(failed.game.money, before.money); assert.deepEqual(failed.game.inventory, before.inventory);
  const unrelated = executeToolCalls(game, [{ id: "other-money", name: "money.add", args: { amount: 12 }, reason: "归还此前借款" }]);
  assert.equal(unrelated.results[0].ok, true);
  const owned = buy(game), item = tradeView(owned).lots[0];
  const removal = executeToolCalls(owned, [{ id: "fake-remove", name: "inventory.remove", args: { instanceId: item.instanceId, quantity: 1 }, reason: "售出货物" }]);
  assert.equal(removal.results[0].ok, false);
  assert.equal(visibleGameState(owned).trading.lots[0].quantity, 1);
  const inspection = executeToolCalls(owned, [
    { id: "inspect-owned", name: "item.inspect", args: { instanceId: item.instanceId }, reason: "查看贸易货物" },
    { id: "repaid-loan", name: "money.add", args: { amount: 12 }, reason: "归还此前借款" },
  ]);
  assert.equal(inspection.results[1].ok, true);
  const counterfeitPatch = executeToolCalls(game, [
    { id: "fake-patch-pay", name: "money.add", args: { amount: 500 }, reason: "收到货款" },
    { id: "fake-patch", name: "inventory.update", args: { instanceId: game.inventory[0].instanceId, patch: { tradeLot: { goodId: "tea", unitCostPence: 1 } } }, reason: "登记采购" },
  ]);
  assert.ok(counterfeitPatch.results.every(result => !result.ok));
  assert.deepEqual(counterfeitPatch.game.money, game.money);
  const namedSale = executeToolCalls(owned, [{ id: "sale-no-goods", name: "money.add", args: { amount: 500 }, reason: "出售封装茶叶收到货款" }]);
  assert.equal(namedSale.results[0].ok, false);
});

test("trade context exposes requested quotes and real costs without repeating catalogues on unrelated turns", () => {
  const game = fresh(), routine = promptGameState(game, "检查伤势");
  assert.equal(routine.trading.channels.some(channel => channel.quotes), false);
  const market = promptGameState(game, "比较茶叶的买卖报价");
  assert.equal(market.trading.channels[0].quotes.find(entry => entry.id === "tea").buyPence, quote(game, "dock", "tea").buyPence);
  const nextDay = structuredClone(game); nextDay.worldTime = "1349年 10月18日 · 周三 · 10:00";
  assert.deepEqual(publicStateChanges(game, nextDay).trading, { day: { before: "1349-10-17", after: "1349-10-18" } });
  const purchased = buy(game, "dock", "tea", 2), delta = publicStateChanges(game, purchased).trading;
  assert.equal(delta.receipts[0].amountPence, -quote(game, "dock", "tea").buyPence * 2);
  assert.deepEqual(delta.quotas[0], { channelId: "dock", goodId: "tea", fields: { stock: { before: 4, after: 2 } } });
  assert.equal(promptGameState(purchased, "整理行囊").trading.lots[0].unitCostPence, quote(game, "dock", "tea").buyPence);
});

test("incapacitated characters cannot transact or travel, and rejected requests leave all market state unchanged", () => {
  for (const stat of ["health", "sanity"]) {
    const game = fresh(); game.character.stats[stat] = 0;
    const before = structuredClone(game);
    assert.throws(() => buy(game), /归零/);
    assert.throws(() => run(game, "trade-travel", { channelId: "merchant" }), /归零/);
    assert.deepEqual(game, before);
  }
});

test("legacy saves gain an empty market and preserve quoted gathering prices and signed work agreements", () => {
  const old = fresh(); delete old.trading;
  old.gatherings = { version: 1, revision: 2, sessions: { old: { id: "old", offers: [{ id: "old-price", pricePence: 1200, stock: 1 }] } }, attendance: null, requests: [], receipts: [] };
  const loaded = migrateSave(old);
  assert.deepEqual(loaded.trading, { version: 1, revision: 0, days: {}, lots: {}, receipts: [] });
  assert.equal(loaded.gatherings.sessions.old.offers[0].pricePence, 1200);
  const next = fresh(); next.location.id = "east-station";
  const definition = ECONOMY.jobs[0];
  const accepted = resolveSpecialAction(next, { operation: "accept", id: definition.id, revision: specialState(next).revision });
  accepted.specialActions.active.offer.options[0].reward = 60;
  const loadedAgreement = migrateSave(accepted);
  const settled = resolveSpecialAction(loadedAgreement, { operation: "resolve", id: loadedAgreement.specialActions.active.id, optionId: "careful", revision: specialState(loadedAgreement).revision });
  assert.equal(moneyToPence(settled.money) - moneyToPence(accepted.money), 60);
  assert.equal(gatheringView(loaded).access, false);
});
