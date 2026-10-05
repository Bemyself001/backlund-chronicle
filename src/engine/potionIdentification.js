import { getSequenceName } from "../content/index.js";
import { normalizePotion, normalizeInventoryItem, playerVisibleItem } from "../system/items.js";
import { moneyToPence, moneyFromPence } from "../system/money.js";
import { visitPersonGate } from "./visitablePeople.js";

export const POTION_IDENTIFICATION_PRICE = 240;
export const POTION_IDENTIFICATION_LOCATION = "minsk-street-15";

export function identificationGate(game, instanceId, turn = Number(game.turn || 0) + 1) {
  const item = game.inventory?.find(entry => entry.instanceId === instanceId);
  const potion = item && normalizePotion(item);
  if (!potion || !Number.isInteger(item.quantity) || item.quantity < 1) return "背包中没有可鉴定的魔药";
  if (potion.identified) return "这瓶魔药已经鉴定";
  if (Number(item.identificationLastTurn ?? -1) >= turn) return "这组魔药本回合已经鉴定过一瓶，请下一回合再鉴定";
  if (game.location?.id !== POTION_IDENTIFICATION_LOCATION) return "请前往明斯克街15号，请夏洛克·莫里亚蒂鉴定";
  const meetingGate = visitPersonGate(game, "sherlock-moriarty", { conversation: true });
  if (meetingGate) return meetingGate;
  if (!potion.pathwayId || !Number.isInteger(potion.sequence)) return "这瓶魔药缺少可核实的来源，暂时无法鉴定；不会收取费用";
  if (moneyToPence(game.money) < POTION_IDENTIFICATION_PRICE) return "鉴定一瓶魔药需要1镑（240便士），当前余额不足";
  return "";
}

// Called only on the turn's detached candidate state. No narrative or AI-supplied identity is trusted.
export function identifyPotion(game, args = {}, { turn = Number(game.turn || 0) + 1, playerAction = "", identificationRequest } = {}) {
  const instanceId = args.instanceId || args.potionInstanceId;
  const action = String(playerAction).replace(/\s/g, "");
  const confirmedRequest = identificationRequest?.instanceId === instanceId && identificationRequest?.feePence === POTION_IDENTIFICATION_PRICE && identificationRequest?.confirmed === true;
  const explicitConsent = /鉴定/.test(action) && /(?:同意|确认|支付|付|接受|花费).{0,16}(?:1|一)镑|(?:同意|确认|支付|付|接受|花费).{0,16}240便士/.test(action)
    && !/[?？]|是否|能否|报价|考虑|打算|计划|(?:不|别|拒绝|取消|暂缓).{0,16}(?:鉴定|付|接受|同意)/.test(action);
  if (args.feePence !== POTION_IDENTIFICATION_PRICE || (!confirmedRequest && !explicitConsent)) return { name: "potion.identify", ok: false, reason: "鉴定须明确同意每瓶1镑（240便士）的费用" };
  const reason = identificationGate(game, instanceId, turn);
  if (reason) return { name: "potion.identify", ok: false, reason, log: reason };
  if (!Number.isSafeInteger(turn) || turn < 0) return { name: "potion.identify", ok: false, reason: "鉴定回合无效" };
  const index = game.inventory.findIndex(entry => entry.instanceId === instanceId);
  const item = game.inventory[index];
  const potion = normalizePotion(item);
  const name = `${getSequenceName(potion.pathwayId, potion.sequence)}魔药`;
  let identifiedId = instanceId;
  if (item.quantity > 1) {
    const prefix = `${instanceId}-identified-${turn}`;
    identifiedId = prefix;
    let counter = 1;
    while (game.inventory.some(entry => entry.instanceId === identifiedId)) identifiedId = `${prefix}-${counter++}`;
  }
  const identified = normalizeInventoryItem({ ...item, instanceId: identifiedId, name, quantity: 1,
    itemId: `potion-${potion.pathwayId}-${potion.sequence}`, potion: { ...potion, identified: true },
    description: `夏洛克·莫里亚蒂确认：${potion.pathwayName}途径序列${potion.sequence}「${getSequenceName(potion.pathwayId, potion.sequence)}」成品魔药。`,
    discoveredInfo: `已鉴定为${name}。`, hiddenInfo: "", isNew: true });
  const beforeMoney = moneyToPence(game.money);
  const inventory = [...game.inventory];
  if (item.quantity > 1) {
    inventory[index] = { ...item, quantity: item.quantity - 1, identificationLastTurn: turn };
    inventory.push(identified);
  } else inventory[index] = identified;
  game.inventory = inventory;
  game.money = moneyFromPence(beforeMoney - POTION_IDENTIFICATION_PRICE);
  return { name: "potion.identify", ok: true,
    log: `夏洛克·莫里亚蒂鉴定了1瓶${name}，费用1镑（240便士）。`,
    data: { identifiedItem: playerVisibleItem(identified), potionIdentification: { instanceId: identifiedId, sourceInstanceId: instanceId, quantity: 1, pricePence: POTION_IDENTIFICATION_PRICE, pathwayId: potion.pathwayId, sequence: potion.sequence }, moneyChange: { before: beforeMoney, after: beforeMoney - POTION_IDENTIFICATION_PRICE, delta: -POTION_IDENTIFICATION_PRICE } } };
}
