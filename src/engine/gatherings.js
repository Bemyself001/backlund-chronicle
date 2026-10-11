import { GATHERING, PATHWAYS, getPathway, getSequenceName } from "../content/index.js";
import { getAdvancement } from "../system/character.js";
import { moneyFromPence, moneyToPence } from "../system/money.js";
import { normalizeInventoryItem, normalizePotion } from "../system/items.js";
import { normalizeCharacteristic } from "../system/characteristics.js";
import { isBeyonderEquipment } from "../system/beyonderItems.js";
import { normalizeEquipment } from "../system/equipment.js";
import { getMapLocation, normalizeLocationKnowledge } from "../system/map.js";
import { travelToLocation } from "../system/hexworld.js";
import { parseWorldTime, formatWorldTime, worldWeekday } from "./worldTime.js";
import { normalizeTriggerState, setTriggerFact } from "./triggerState.js";

export const GATHERING_RULE = "【非凡聚会】以gathering本地档案为准：资格不由序列自动获得，聚会只在登记地点与固定时间开放。查看清单、询价与自由交谈不代表成交；购买、出售、调制、留言、入场、离场和赴会等待由特殊行动的非凡聚会按钮原子结算。不得用money.add/remove或inventory.add/remove伪造聚会成交，也不得把留言当成预付款、把配方或材料当成成品魔药。对话可描写当前已知清单、卖方代号、规矩和已确认交易结果，未成交只能引导玩家查看清单并确认。获取魔药、特性或装备不自动服用、晋升或装备。下次开放时间会随游戏时间推进，已登记介绍资格持续有效；不能把错过某场写成资格丢失。";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const positive = value => Number.isInteger(value) && value > 0;
const fact = (game, key) => (game.triggerState?.facts?.[key]?.value ?? game.triggerState?.facts?.[key]) === true;
const hash = text => { let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return value >>> 0; };
const costText = amount => `${amount}便士`;

export function gatheringState(game) {
  const raw = game.gatherings || {};
  return { version: 1, revision: Number.isInteger(raw.revision) ? raw.revision : 0,
    sessions: raw.sessions && typeof raw.sessions === "object" && !Array.isArray(raw.sessions) ? raw.sessions : {},
    attendance: typeof raw.attendance === "string" ? raw.attendance : null,
    requests: Array.isArray(raw.requests) ? raw.requests : [], receipts: Array.isArray(raw.receipts) ? raw.receipts : [],
  };
}

// 使用游戏内“周二”纪元；绝不读取玩家电脑上的真实日期。
export function gatheringSchedule(game, { afterCurrent = false } = {}) {
  const now = parseWorldTime(game.worldTime);
  if (!now) return null;
  for (let offset = 0; offset <= 7; offset += 1) {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() + offset);
    start.setUTCHours(GATHERING.startHour, 0, 0, 0);
    if (!GATHERING.weekdays.includes(worldWeekday(start))) continue;
    const end = new Date(start.getTime() + GATHERING.durationMinutes * 60000);
    if (afterCurrent ? start <= now : end <= now) continue;
    return { id: `${GATHERING.id}:${start.toISOString()}`, startsAt: formatWorldTime(start), endsAt: formatWorldTime(end),
      open: start <= now && now < end, waitMinutes: Math.max(0, Math.ceil((start - now) / 60000)),
      remainingMinutes: Math.max(0, Math.floor((end - now) / 60000)) };
  }
  return null;
}

function targetIdentity(game) {
  const rank = getAdvancement(game.character);
  return { pathwayId: rank.pathwayId || PATHWAYS[0].id, sequence: rank.type === "extraordinary" ? Math.max(4, rank.sequence - 1) : 9 };
}

export function gatheringItem(kind, pathwayId, sequence, instanceId) {
  if (kind === "equipment") {
    const { pricePence: _price, ...item } = GATHERING.equipment;
    return normalizeInventoryItem({ ...structuredClone(item), instanceId, quantity: 1, equipped: false });
  }
  assert(getPathway(pathwayId) && GATHERING.prices[sequence] && GATHERING.labels[kind], "没有登记这种商品");
  const rank = getSequenceName(pathwayId, sequence);
  const name = { recipe: `${rank}魔药配方抄本`, material: `${rank}魔药材料包`, potion: `${rank}魔药`, characteristic: `${rank}非凡特性` }[kind];
  const description = {
    recipe: `已核对的${rank}配方资料。材料与调制须另行筹备；购买配方不会自动晋升。`,
    material: `按聚会登记配方核对并封装的${rank}材料包。持有同途径、同序列的配方后，可在此调制一份魔药；未调制前不是魔药或完整特性。`,
    potion: `已确认途径与序列的${rank}成品魔药。放入行囊，服用与晋升须另外明确选择。`,
    characteristic: `已确认途径与序列的完整${rank}非凡特性。持有不会自动晋升；直接吸收的条件与属性惩罚仍按本地晋升规则执行。`,
  }[kind];
  return normalizeInventoryItem({ instanceId, itemId: `gathering-${kind}-${pathwayId}-${sequence}`, name, description, quantity: 1,
    category: { recipe: "书籍", material: "非凡材料", potion: "魔药", characteristic: "非凡特性" }[kind],
    tags: { recipe: ["魔药配方", "重要物品"], material: ["非凡材料", "材料"], potion: ["魔药", "消耗品"], characteristic: ["非凡特性"] }[kind],
    weight: kind === "material" ? 0.6 : 0.1, equipped: false, importance: "important",
    ...(kind === "recipe" ? { recipe: { pathwayId, sequence, identified: true } } : {}),
    ...(kind === "material" ? { gatheringMaterial: { pathwayId, sequence } } : {}),
    ...(kind === "potion" ? { potion: { pathwayId, sequence, identified: true } } : {}),
    ...(kind === "characteristic" ? { characteristic: { pathwayId, sequence, identified: true } } : {}),
  });
}

function makeOffer(game, sessionId, kind, pathwayId, sequence, requestId) {
  const id = kind === "equipment" ? "equipment:mist-dagger" : `${kind}:${pathwayId}:${sequence}`;
  const item = gatheringItem(kind, pathwayId, sequence, `trade:${sessionId}:${id}`);
  return { id, kind, pathwayId: kind === "equipment" ? null : pathwayId, sequence: kind === "equipment" ? null : sequence,
    item, pricePence: kind === "equipment" ? GATHERING.equipment.pricePence : GATHERING.prices[sequence][kind],
    stock: kind === "material" ? 2 : 1, seller: GATHERING.sellers[hash(`${game.id}:${sessionId}:${id}`) % GATHERING.sellers.length],
    ...(requestId ? { requestId } : {}) };
}

function startSession(game, state, schedule) {
  if (state.sessions[schedule.id]) return state.sessions[schedule.id];
  const target = targetIdentity(game);
  const offers = ["recipe", "material", "potion", "characteristic", "equipment"].map(kind => makeOffer(game, schedule.id, kind, target.pathwayId, target.sequence));
  const alternate = PATHWAYS[hash(`${game.id}:${schedule.id}`) % PATHWAYS.length];
  if (alternate.id !== target.pathwayId) offers.push(makeOffer(game, schedule.id, "recipe", alternate.id, 9));
  for (const request of state.requests.filter(entry => entry.status === "pending" && entry.sessionId === schedule.id)) {
    if (request.kind === "sell") {
      const item = game.inventory.find(item => item.instanceId === request.instanceId && item.quantity > 0);
      const price = item && gatheringSellPrice(item);
      request.status = price && !isEquipped(game, item) ? "matched" : "unavailable";
      request.pricePence = price || 0;
      request.result = request.status === "matched" ? "买方愿按现场收购价成交；物品仍在行囊，请当面确认出售。" : "物品已不在行囊、尚未确认身份或仍在装备，未代售也未收取费用。";
    } else {
      const offer = makeOffer(game, schedule.id, request.kind, request.pathwayId, request.sequence, request.id);
      if (!offers.some(entry => entry.id === offer.id)) offers.push(offer);
      request.status = "matched"; request.offerId = offer.id; request.pricePence = offer.pricePence;
      request.result = "供货人已给出明确报价，商品在本场清单中。未扣款，确认购买后才交付。";
    }
  }
  const session = { id: schedule.id, startsAt: schedule.startsAt, endsAt: schedule.endsAt, offers, intelligenceRead: false };
  state.sessions[schedule.id] = session;
  // 保留近期场次与独立交易收据，关闭旧场次后不会重新开放或重新生成。
  const ids = Object.keys(state.sessions).sort();
  for (const id of ids.slice(0, Math.max(0, ids.length - 12))) delete state.sessions[id];
  return session;
}

function isEquipped(game, item) { return item.equipped || Object.values(game.equipment || {}).includes(item.instanceId); }
export function gatheringSellPrice(item) {
  if (!positive(item.quantity) || (item.tags || []).some(tag => ["任务物品", "关键证据", "关键物品"].includes(tag))) return 0;
  const identity = normalizePotion(item) || normalizeCharacteristic(item);
  if (identity?.identified && GATHERING.prices[identity.sequence]) {
    return Math.floor(GATHERING.prices[identity.sequence][normalizePotion(item) ? "potion" : "characteristic"] * 0.4);
  }
  if (isBeyonderEquipment(item)) return Math.floor(GATHERING.equipment.pricePence * 0.4);
  for (const kind of ["recipe", "material"]) {
    const data = kind === "recipe" ? item.recipe : item.gatheringMaterial;
    if (getPathway(data?.pathwayId) && GATHERING.prices[data?.sequence] && item.itemId === `gathering-${kind}-${data.pathwayId}-${data.sequence}`) {
      return Math.floor(GATHERING.prices[data.sequence][kind] * 0.4);
    }
  }
  return 0;
}

export function gatheringView(game) {
  const state = gatheringState(game), schedule = gatheringSchedule(game);
  const access = fact(game, GATHERING.accessFact), contact = access || fact(game, GATHERING.contactFact);
  const onSite = game.location?.id === GATHERING.locationId;
  const inside = access && onSite && schedule?.open && state.attendance === schedule.id;
  const session = inside ? state.sessions[schedule.id] : null;
  const requests = state.requests.map(entry => ["pending", "matched"].includes(entry.status) && schedule && parseWorldTime(entry.dueAt) < parseWorldTime(schedule.startsAt)
    ? { ...entry, status: "missed", result: "该场聚会已经结束。没有扣费或代售，可以重新留言下一场。" } : { ...entry });
  return { id: GATHERING.id, name: GATHERING.name, room: GATHERING.room, locationId: GATHERING.locationId,
    contact: contact ? GATHERING.contact : "旅店联络人", access, contactKnown: contact, onSite, inside, schedule,
    nextSchedule: gatheringSchedule(game, { afterCurrent: true }), revision: state.revision,
    offers: (session?.offers || []).map(offer => ({ ...offer, item: structuredClone(offer.item), owned: offer.kind === "recipe" && game.inventory.some(item => item.itemId === offer.item.itemId && item.quantity > 0) })),
    sellable: (game.inventory || []).map(item => ({ instanceId: item.instanceId, name: item.name, quantity: item.quantity, pricePence: gatheringSellPrice(item), equipped: isEquipped(game, item) })).filter(item => item.pricePence > 0),
    requests, receipts: state.receipts.slice(-12).map(entry => ({ ...entry })), intelligenceRead: Boolean(session?.intelligenceRead),
    intelligence: session?.intelligenceRead ? session.intelligenceText || GATHERING.intelligence : "", rule: GATHERING_RULE };
}

function requireRoom(game, state, request, minutes = 10) {
  const schedule = gatheringSchedule(game);
  assert(fact(game, GATHERING.accessFact), "尚未取得聚会介绍资格");
  assert(game.location?.id === GATHERING.locationId, "需先到达聚会地点");
  assert(schedule?.open && request.sessionId === schedule.id && state.attendance === schedule.id, "本场聚会尚未入场或已经结束，请查看下次开放时间");
  assert(schedule.remainingMinutes >= minutes, "本场即将结束，已来不及完成这项交易，请下次赴会");
  const session = state.sessions[schedule.id];
  assert(session, "未找到已登记的本场清单，请重新入场");
  return session;
}
function capacityGate(game, added, removed = 0) {
  const weight = game.inventory.reduce((sum, item) => sum + (Number(item.weight) || 0) * (Number(item.quantity) || 0), 0);
  assert(weight - removed + added <= (game.capacity?.maxWeight || 12), "行囊负重不足，请先整理物品");
}
function receipt(game, state, kind, name, amountPence, details = {}) {
  state.receipts.push({ id: `gathering-receipt:${game.turn + 1}:${state.revision}`, kind, name, quantity: 1, amountPence, worldTime: game.worldTime, turn: game.turn + 1, ...details });
  state.receipts = state.receipts.slice(-60);
}

// 调用者已克隆整个存档。任何验证失败都会丢弃副本，金钱/库存/时间同时不变。
export function executeGatheringAction(game, request) {
  const state = gatheringState(game);
  assert(request.gatheringRevision === state.revision && request.expectedTurn === game.turn && request.expectedWorldTime === game.worldTime, "聚会状态或时间已更新，请重新选择");
  assert(game.character.stats.health > 0 && game.character.stats.sanity > 0, "生命或理智归零，需先恢复再赴会");
  game.gatherings = state;
  let action = "", narrative = "", minutes = 10;
  const operation = request.operation;
  if (operation === "gathering-travel") {
    assert(game.location.id !== GATHERING.locationId, "已经到达聚会地点");
    const location = getMapLocation(GATHERING.locationId, game);
    const travel = travelToLocation(game, location.id);
    assert(travel, "无法结算前往聚会地点的行程");
    game.location = { id: location.id, name: location.name, district: `贝克兰德${location.district}` };
    game.locationKnowledge = normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, location.id, game);
    game.locationKnowledge[location.id] = { ...game.locationKnowledge[location.id], status: "visited", visitedAt: `第${game.turn + 1}轮` };
    state.attendance = null;
    minutes = Math.max(1, travel.minutes); action = `前往${location.name}寻找聚会联络人`;
    narrative = `你按地图行程来到${location.name}，耗时${minutes}分钟。抵达后可以找联络人；到达并不等于已经入场。`;
  } else if (operation === "gathering-contact" || operation === "gathering-introduce") {
    assert(game.location.id === GATHERING.locationId, "需到达旅店才能找联络人");
    game.triggerState = normalizeTriggerState(game);
    if (operation === "gathering-contact") {
      assert(!fact(game, GATHERING.contactFact) && !fact(game, GATHERING.accessFact), "已经认识联络人，可直接查看日程或留言");
      setTriggerFact(game.triggerState, GATHERING.contactFact, game.turn + 1, ["gathering-contact"]);
      action = "向旅店老板打听联络人"; narrative = GATHERING.introduction;
      game.clues.push({ id: "clue-gathering-contact", title: "灰手套的联络规矩", detail: "雾鸦旅店的灰手套愿意核对来意并办理介绍；下一步可当面申请介绍资格。认识联络人还不等于已经获准入场。", kind: "occult_entry", discoveredAt: `第${game.turn + 1}轮` });
    } else {
      assert(fact(game, GATHERING.contactFact) && !fact(game, GATHERING.accessFact), "先认识联络人，已有资格则无需重复登记");
      setTriggerFact(game.triggerState, GATHERING.accessFact, game.turn + 1, ["gathering-introduction"]);
      setTriggerFact(game.triggerState, "occult.contact", game.turn + 1, ["gathering-introduction"]);
      action = "向灰手套说明来意并登记聚会介绍"; narrative = GATHERING.invitation;
    }
  } else if (operation === "gathering-wait") {
    assert(fact(game, GATHERING.accessFact) && game.location.id === GATHERING.locationId, "需持有介绍资格并到达旅店后才能等待赴会");
    const schedule = gatheringSchedule(game);
    assert(schedule && !schedule.open && request.sessionId === schedule.id && schedule.waitMinutes > 0, "赴会时间已经改变，请重新查看日程");
    minutes = schedule.waitMinutes; state.attendance = null;
    action = `在旅店等待雾灯聚会开场（${minutes}分钟）`;
    narrative = `你明确选择留在旅店等到${schedule.startsAt}。等待消耗${minutes}分钟，持续状态照常结算；开场后仍需出示介绍卡入场。`;
  } else if (operation === "gathering-enter") {
    const schedule = gatheringSchedule(game);
    assert(fact(game, GATHERING.accessFact), "尚未取得聚会介绍资格");
    assert(game.location.id === GATHERING.locationId && schedule?.open && request.sessionId === schedule.id, "需在开放时间到达聚会地点");
    assert(state.attendance !== schedule.id, "已在本场聚会中");
    assert(schedule.remainingMinutes >= 5, "聚会即将散场，请参加下一场");
    startSession(game, state, schedule); state.attendance = schedule.id;
    action = "出示介绍卡，进入雾灯聚会"; narrative = GATHERING.entrance; minutes = 5;
  } else if (operation === "gathering-buy") {
    const session = requireRoom(game, state, request);
    const offer = session.offers.find(entry => entry.id === request.offerId);
    assert(offer && offer.stock > 0, "商品已售罄或不在本场清单中");
    assert(request.pricePence === offer.pricePence, "报价已更新，请重新确认");
    assert(!(offer.kind === "recipe" && game.inventory.some(item => item.itemId === offer.item.itemId && item.quantity > 0)), "已持有这份配方，无需重复购买");
    const balance = moneyToPence(game.money);
    assert(balance >= offer.pricePence, "资金不足，尚未扣款");
    capacityGate(game, offer.item.weight);
    const item = normalizeInventoryItem({ ...structuredClone(offer.item), instanceId: `${offer.item.instanceId}:${offer.stock}`, quantity: 1, equipped: false, source: GATHERING.name, acquiredAt: `第${game.turn + 1}轮`, isNew: true });
    game.money = moneyFromPence(balance - offer.pricePence); game.inventory.push(item); offer.stock -= 1;
    for (const entry of state.requests.filter(entry => entry.sessionId === session.id && entry.offerId === offer.id && entry.status === "matched")) entry.status = "fulfilled";
    receipt(game, state, "buy", item.name, -offer.pricePence, { sessionId: session.id, seller: offer.seller, instanceId: item.instanceId });
    action = `在雾灯聚会购买${item.name}`; narrative = `你与“${offer.seller}”当面核对${item.name}，支付${costText(offer.pricePence)}。一份物品已交付行囊，余量${offer.stock}；交易收据已登记。服用、吸收与装备须另外选择。`;
  } else if (operation === "gathering-sell") {
    const session = requireRoom(game, state, request);
    const item = game.inventory.find(entry => entry.instanceId === request.instanceId && entry.quantity > 0);
    assert(item, "物品已不在行囊中"); assert(!isEquipped(game, item), "请先卸下装备再出售");
    const price = gatheringSellPrice(item);
    assert(price > 0 && request.pricePence === price, "无法按这份报价收购，请重新查看清单");
    item.quantity -= 1; game.inventory = game.inventory.filter(entry => entry.quantity > 0);
    game.money = moneyFromPence(moneyToPence(game.money) + price); normalizeEquipment(game);
    for (const entry of state.requests.filter(entry => entry.kind === "sell" && entry.instanceId === item.instanceId && entry.status === "matched")) entry.status = "fulfilled";
    receipt(game, state, "sell", item.name, price, { sessionId: session.id, instanceId: item.instanceId });
    action = `在雾灯聚会出售一份${item.name}`; narrative = `买方点清一份${item.name}，你获得${costText(price)}。行囊已扣除对应物品，交易收据已登记。`;
  } else if (operation === "gathering-brew") {
    requireRoom(game, state, request, 20);
    const recipe = game.inventory.find(item => item.instanceId === request.instanceId && item.quantity > 0 && item.recipe?.identified);
    assert(recipe && GATHERING.prices[recipe.recipe.sequence] && getPathway(recipe.recipe.pathwayId)
      && recipe.itemId === `gathering-recipe-${recipe.recipe.pathwayId}-${recipe.recipe.sequence}`, "需持有已登记的配方抄本");
    const { pathwayId, sequence } = recipe.recipe;
    const material = game.inventory.find(item => item.quantity > 0 && item.itemId === `gathering-material-${pathwayId}-${sequence}` && item.gatheringMaterial?.pathwayId === pathwayId && item.gatheringMaterial.sequence === sequence);
    assert(material, "缺少同途径、同序列的材料包");
    const potion = gatheringItem("potion", pathwayId, sequence, `gathering-brew:${game.turn + 1}:${state.revision}`);
    capacityGate(game, potion.weight, material.weight);
    material.quantity -= 1; game.inventory = game.inventory.filter(item => item.quantity > 0);
    game.inventory.push({ ...potion, source: GATHERING.name, acquiredAt: `第${game.turn + 1}轮`, isNew: true });
    receipt(game, state, "brew", potion.name, 0, { recipeId: recipe.instanceId, materialId: material.instanceId, instanceId: potion.instanceId });
    action = `按抄本调制${potion.name}`; narrative = `你按已确认配方消耗一份${material.name}，在聚会药师监督下调制出${potion.name}。配方抄本保留，成品放入行囊；晋升与仪式条件仍需另行确认。`; minutes = 20;
  } else if (operation === "gathering-intelligence") {
    const session = requireRoom(game, state, request, 5);
    assert(!session.intelligenceRead, "本场的基础消息已经记录，可继续交谈或查看清单"); session.intelligenceRead = true;
    const offer = session.offers.find(offer => offer.kind === "recipe");
    session.intelligenceText = `${GATHERING.intelligence}${offer ? `\n\n本场已核实的供货方向：${offer.item.name}，报价${costText(offer.pricePence)}，由“${offer.seller}”提供。同序列材料、成品与特性可分别查看，不必为取得报价再做调查任务。` : ""}`;
    game.clues.push({ id: `clue-gathering-intel:${session.id}`, title: "雾灯聚会的晋升与交易提醒", detail: session.intelligenceText, kind: "gathering", discoveredAt: `第${game.turn + 1}轮` });
    action = "听取本场聚会的免费消息"; narrative = session.intelligenceText; minutes = 5;
  } else if (operation === "gathering-request") {
    assert(fact(game, GATHERING.accessFact) && game.location.id === GATHERING.locationId, "需持有介绍资格并到旅店当面留言");
    const schedule = gatheringSchedule(game, { afterCurrent: true });
    assert(schedule && request.sessionId === schedule.id, "下场日程已更新，请重新选择");
    assert(state.requests.filter(entry => ["pending", "matched"].includes(entry.status) && parseWorldTime(entry.dueAt) >= parseWorldTime(game.worldTime)).length < 3, "最多同时保留三条待处理留言");
    let name = "", price = 0;
    if (request.kind === "sell") {
      const item = game.inventory.find(item => item.instanceId === request.instanceId && item.quantity > 0);
      assert(item && !isEquipped(game, item) && gatheringSellPrice(item), "需选择可出售、已卸下的行囊物品"); name = item.name;
    } else {
      assert(["recipe", "material", "potion", "characteristic", "equipment"].includes(request.kind), "未知求购物品类型");
      const item = gatheringItem(request.kind, request.pathwayId, request.sequence, "preview"); name = item.name;
      price = request.kind === "equipment" ? GATHERING.equipment.pricePence : GATHERING.prices[request.sequence][request.kind];
    }
    assert(!state.requests.some(entry => entry.sessionId === schedule.id && ["pending", "matched"].includes(entry.status) && entry.kind === request.kind && (request.kind === "sell" ? entry.instanceId === request.instanceId : entry.pathwayId === request.pathwayId && entry.sequence === request.sequence)), "这条需求已经登记，等待下场报价即可");
    state.requests.push({ id: `gathering-request:${game.turn + 1}:${state.revision}`, kind: request.kind, name,
      pathwayId: request.pathwayId, sequence: request.sequence, instanceId: request.instanceId,
      sessionId: schedule.id, dueAt: schedule.startsAt, pricePence: price, status: "pending" });
    state.requests = state.requests.slice(-30); action = `向灰手套留言${request.kind === "sell" ? "求售" : "求购"}${name}`;
    narrative = `${GATHERING.inquiry}\n\n登记物品：${name}；答复场次：${schedule.startsAt}。`; minutes = 5;
  } else if (operation === "gathering-cancel-request") {
    const entry = state.requests.find(entry => entry.id === request.requestId && ["pending", "matched"].includes(entry.status));
    assert(entry, "留言已处理，无法重复取消"); entry.status = "cancelled"; action = `撤销${entry.name}的聚会留言`;
    narrative = "你撤销了留言，没有扣费或出售物品。已经由供货人带到本场的商品仍可在清单中自由查看。"; minutes = 5;
  } else if (operation === "gathering-leave") {
    requireRoom(game, state, request, 1); state.attendance = null;
    action = "离开雾灯聚会的包间"; narrative = "你收好自己的物品离开包间。已完成交易保留，介绍资格持续有效。"; minutes = 1;
  } else throw new Error("未知聚会行动");
  state.revision += 1;
  return { action, narrative, minutes };
}
