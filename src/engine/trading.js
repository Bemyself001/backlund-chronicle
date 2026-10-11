import { ECONOMY } from "../content/index.js";
import { moneyFromPence, moneyToPence, formatMoney } from "../system/money.js";
import { normalizeInventoryItem } from "../system/items.js";
import { getMapLocation, normalizeLocationKnowledge } from "../system/map.js";
import { travelToLocation } from "../system/hexworld.js";
import { parseWorldTime } from "./worldTime.js";

export const TRADE_RULE = "【交易市场】码头供货摊与商会街商行的贸易货物、报价、库存、收购量与收据以本地trading档案为准。查看报价不移动、不跳时、不成交；前往、购买与出售必须由特殊行动的交易市场确认。不得用money或inventory工具伪造市场成交、货物批次、成本、数量或利润。只能出售真实持有且有采购登记的货物，不能拿普通同名物品替代。不同渠道有价差，报价与限额按游戏日期固定，次日重置；读档不会刷新。同一渠道买入再卖出会亏损，异地成交的实际利润以收据为准。普通货物不授予非凡能力。";
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const integer = value => Number.isInteger(value) && value >= 0 ? value : 0;
const hash = text => { let result = 2166136261; for (const char of text) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return result >>> 0; };
const priceText = value => formatMoney(moneyFromPence(value));

export function tradingState(game) {
  const raw = game.trading || {};
  return { version: 1, revision: integer(raw.revision), days: object(raw.days), lots: object(raw.lots), receipts: Array.isArray(raw.receipts) ? raw.receipts : [] };
}
export function isTradeGood(item) { return Boolean(item?.tradeLot || String(item?.itemId || "").startsWith("trade-good-") || item?.tags?.includes("贸易货物")); }
export function tradeDay(game) { return parseWorldTime(game.worldTime)?.toISOString().slice(0, 10) || null; }

function quotes(game, channel, day, state) {
  return ECONOMY.trade.goods.map(good => {
    const base = channel.prices[good.id], used = state.days[day]?.[channel.id]?.[good.id] || {};
    // 同一档案、日期、渠道、货物的报价确定，不因查看或读档重掷。
    const percent = [90, 95, 100, 105, 110][hash(`${game.id}:${day}:${channel.id}:${good.id}`) % 5];
    return { ...good, buyPence: Math.ceil(base.buy * percent / 100), sellPence: Math.floor(base.sell * percent / 100),
      stock: Math.max(0, base.stock - integer(used.bought)), demand: Math.max(0, base.demand - integer(used.sold)) };
  });
}

export function tradeView(game) {
  const state = tradingState(game), day = tradeDay(game);
  const channels = ECONOMY.trade.channels.map(channel => ({ id: channel.id, name: channel.name, description: channel.description,
    locationId: channel.locationId, onSite: game.location?.id === channel.locationId, quotes: day ? quotes(game, channel, day, state) : [] }));
  const lots = (game.inventory || []).filter(item => {
    const lot = state.lots[item.instanceId];
    return lot && lot.remaining === item.quantity && item.itemId === `trade-good-${lot.goodId}` && item.quantity > 0;
  }).map(item => ({ instanceId: item.instanceId, name: item.name, quantity: item.quantity, ...state.lots[item.instanceId],
    equipped: item.equipped || Object.values(game.equipment || {}).includes(item.instanceId),
    protected: (item.tags || []).some(tag => ["任务物品", "关键证据", "关键物品"].includes(tag)) }));
  return { day, revision: state.revision, channels, lots, maxQuantity: ECONOMY.trade.maxQuantity,
    receipts: state.receipts.slice(-12).map(entry => ({ ...entry })), rule: TRADE_RULE };
}

export function isTradeToolCall(game, call) {
  if (!["money.add", "money.remove", "inventory.add", "inventory.remove", "inventory.update"].includes(call.name?.replace("__", "."))) return false;
  const args = call.args || {};
  const item = game.inventory?.find(item => item.instanceId === args.instanceId);
  return isTradeGood(args.item) || isTradeGood(args.patch) || isTradeGood(item)
    || /贸易货物|交易市场|码头供货摊|商会街商行|封装茶叶|棉布货包|干草药货包|机械零件货包|trade-good-|trade-lot:|trade-(?:buy|sell|travel)/.test(`${call.reason || ""} ${JSON.stringify(args)}`);
}

export function executeTradeAction(game, request) {
  const state = tradingState(game), day = tradeDay(game);
  assert(game.character.stats.health > 0 && game.character.stats.sanity > 0, "生命或理智归零，需先恢复再行动");
  assert(request.tradeRevision === state.revision && request.expectedTurn === game.turn && request.expectedWorldTime === game.worldTime, "市场状态或时间已更新，请重新查看报价");
  const channel = ECONOMY.trade.channels.find(entry => entry.id === request.channelId);
  assert(channel && day && request.marketDay === day, "交易渠道或游戏日期已改变，请重新查看报价");
  game.trading = state;
  let action, narrative, minutes = 10;
  if (request.operation === "trade-travel") {
    assert(game.location.id !== channel.locationId, "已经到达该交易渠道");
    const location = getMapLocation(channel.locationId, game), travel = travelToLocation(game, location.id);
    assert(travel, "无法结算前往市场的行程");
    game.location = { id: location.id, name: location.name, district: `贝克兰德${location.district}` };
    game.locationKnowledge = normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, location.id, game);
    game.locationKnowledge[location.id] = { ...game.locationKnowledge[location.id], status: "visited", visitedAt: `第${game.turn + 1}轮` };
    if (game.gatherings) game.gatherings.attendance = null;
    minutes = Math.max(1, travel.minutes); action = `前往${channel.name}`;
    narrative = `你按地图行程来到${location.name}，耗时${minutes}分钟。${channel.description}可以先查看报价，买卖需要另行确认。`;
  } else {
    assert(["trade-buy", "trade-sell"].includes(request.operation), "未知市场行动");
    assert(game.location.id === channel.locationId, "需先到达该交易渠道才能成交");
    assert(Number.isInteger(request.quantity) && request.quantity > 0 && request.quantity <= ECONOMY.trade.maxQuantity, "数量必须为允许范围内的正整数");
    const selling = request.operation === "trade-sell";
    const item = selling ? game.inventory.find(entry => entry.instanceId === request.instanceId) : null;
    const lot = selling ? state.lots[item?.instanceId] : null;
    const goodId = selling ? lot?.goodId : request.goodId;
    const quote = quotes(game, channel, day, state).find(entry => entry.id === goodId);
    assert(quote, "没有登记这种贸易货物");
    const quantity = request.quantity, unitPrice = selling ? quote.sellPence : quote.buyPence, total = unitPrice * quantity;
    assert(request.unitPricePence === unitPrice, "报价已改变，请重新确认");
    let instanceId, costBasisPence = 0;
    if (selling) {
      assert(item && lot && item.itemId === `trade-good-${lot.goodId}` && item.quantity === lot.remaining && lot.remaining >= quantity, "货物已不在行囊或采购登记不匹配");
      assert(!item.equipped && !Object.values(game.equipment || {}).includes(item.instanceId), "请先卸下装备再出售");
      assert(!(item.tags || []).some(tag => ["任务物品", "关键证据", "关键物品"].includes(tag)), "任务证据不能出售");
      assert(Number.isInteger(lot.unitCostPence) && lot.unitCostPence > 0, "采购成本登记无效");
      assert(quantity <= quote.demand, "今日收购量不足，请减少数量或另找渠道");
      costBasisPence = lot.unitCostPence * quantity; instanceId = item.instanceId;
      item.quantity -= quantity; lot.remaining -= quantity;
      game.inventory = game.inventory.filter(entry => entry.quantity > 0);
      if (!lot.remaining) delete state.lots[instanceId];
      game.money = moneyFromPence(moneyToPence(game.money) + total);
    } else {
      assert(quantity <= quote.stock, "今日库存不足，请减少数量或改日采购");
      const balance = moneyToPence(game.money);
      assert(balance >= total, "资金不足，尚未扣款");
      const weight = game.inventory.reduce((sum, entry) => sum + (Number(entry.weight) || 0) * (Number(entry.quantity) || 0), 0);
      assert(weight + quote.weight * quantity <= (game.capacity?.maxWeight || 12), "行囊负重不足，请减少数量");
      instanceId = `trade-lot:${game.id}:${game.turn + 1}:${state.revision}`;
      const good = normalizeInventoryItem({ instanceId, itemId: `trade-good-${goodId}`, name: quote.name, description: quote.description,
        category: "贸易货物", tags: ["贸易货物"], quantity, weight: quote.weight, equipped: false, importance: "normal",
        tradeLot: { goodId, unitCostPence: unitPrice, channelId: channel.id }, source: channel.name, acquiredAt: `第${game.turn + 1}轮`, isNew: true });
      state.lots[instanceId] = { goodId, unitCostPence: unitPrice, remaining: quantity, channelId: channel.id };
      game.inventory.push(good); game.money = moneyFromPence(balance - total);
    }
    state.days[day] ||= {}; state.days[day][channel.id] ||= {};
    state.days[day][channel.id][goodId] ||= { bought: 0, sold: 0 };
    state.days[day][channel.id][goodId][selling ? "sold" : "bought"] += quantity;
    const profitPence = selling ? total - costBasisPence : null;
    state.receipts.push({ id: `trade-receipt:${game.turn + 1}:${state.revision}`, kind: selling ? "sell" : "buy", channelId: channel.id,
      channelName: channel.name, name: quote.name, goodId, instanceId, quantity, unitPricePence: unitPrice,
      amountPence: selling ? total : -total, costBasisPence, profitPence, worldTime: game.worldTime, turn: game.turn + 1 });
    state.receipts = state.receipts.slice(-60);
    const dates = Object.keys(state.days).sort();
    for (const old of dates.slice(0, Math.max(0, dates.length - 14))) delete state.days[old];
    action = `在${channel.name}${selling ? "出售" : "购买"}${quote.name}×${quantity}`;
    narrative = `${channel.name}按单份${priceText(unitPrice)}${selling ? "收购" : "交付"}${quantity}份${quote.name}，${selling ? "入账" : "支付"}${priceText(total)}。货物、资金与本日限额已登记，耗时10分钟。${selling ? `\n\n本批采购成本${priceText(costBasisPence)}；本次${profitPence >= 0 ? "获利" : "亏损"}${priceText(Math.abs(profitPence))}，交易收据已保存。` : "\n\n货物已放入行囊，可以运往另一渠道比较收购报价。"}`;
  }
  state.revision += 1;
  return { action, narrative, minutes };
}
