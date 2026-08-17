import { makeId } from "../utils/id.js";
import { findTravelRoute, getMapLocation, MAP_LOCATIONS, normalizeLocationKnowledge } from "../data/map.js";
import { amountToPence, formatMoney, moneyFromPence, moneyToPence } from "../data/money.js";
import { normalizeInventoryItem, normalizeItemImportance } from "../data/items.js";

export const TOOL_SCHEMAS = {
  "inventory.add": { required: ["item"], description: "新增或合并一个结构化物品实例" },
  "inventory.remove": { required: ["instanceId", "quantity"], description: "减少物品数量或移除实例" },
  "inventory.update": { required: ["instanceId", "patch"], description: "更新物品的可变字段" },
  "money.add": { required: ["amount"], description: "增加角色持有的镑、苏勒或便士" },
  "money.remove": { required: ["amount"], description: "扣除角色持有的镑、苏勒或便士" },
  "money.inspect": { required: [], description: "核对当前资金余额，不修改状态" },
  "item.inspect": { required: ["instanceId"], description: "检查物品并揭示已发现信息" },
  "item.use": { required: ["instanceId"], description: "使用消耗品或工具" },
  "item.equip": { required: ["instanceId"], description: "装备可装备物品" },
  "item.unequip": { required: ["instanceId"], description: "卸下已装备物品" },
  "occult.contact": { required: ["entryId"], description: "确认玩家主动接触当前非凡入口" },
  "occult.reveal": { required: ["topic", "evidence"], description: "在已有非凡接触后揭示有限神秘知识" },
  "character.update": { required: ["patch"], description: "更新受限角色数值" },
  "status.add": { required: ["status"], description: "添加状态效果" },
  "status.remove": { required: ["statusId"], description: "移除状态效果" },
  "relationship.update": { required: ["npcId", "delta"], description: "更新已知 NPC 关系" },
  "location.discover": { required: ["locationId", "status", "note"], description: "记录地点传闻或确认发现地点" },
  "location.move": { required: ["locationId"], description: "移动到已发现地点" },
  "clue.add": { required: ["clue"], description: "添加一条新线索" },
  "quest.add": { required: ["quest"], description: "添加任务" },
  "quest.update": { required: ["questId", "patch"], description: "更新任务进度" },
  "dice.check": { required: ["difficulty"], description: "执行 1d20 检定" },
};

function weightOf(inventory) {
  return inventory.reduce((sum, item) => sum + Number(item.weight || 0) * Number(item.quantity || 0), 0);
}

function signature(turn, call) {
  return `${turn}:${call.name}:${JSON.stringify(call.args || {})}`;
}

function fail(name, reason) {
  return { name, ok: false, reason, log: `变更被拒绝：${reason}` };
}

function succeed(name, log, data = {}) {
  return { name, ok: true, log, data };
}

function stableId(text) {
  let hash = 2166136261;
  for (const character of String(text)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `clue-${(hash >>> 0).toString(36)}`;
}

function stableItemId(text) {
  return stableId(text).replace(/^clue-/, "item-");
}

function appendRepairNote(current, next) {
  return [current, next].filter(Boolean).join("；");
}

function inventoryCandidates(args = {}) {
  const nested = [args.item, args.target].filter((value) => value && typeof value === "object");
  return [
    args.instanceId,
    args.itemId,
    args.itemName,
    args.name,
    ...nested.flatMap((value) => [value.instanceId, value.itemId, value.name]),
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

function resolveInventoryReference(game, args = {}) {
  if (!game?.inventory?.length) return { item: null, resolutionError: "当前背包为空" };
  const candidates = inventoryCandidates(args);
  if (!candidates.length) return { item: null, resolutionError: "缺少物品标识：请提供 instanceId，或唯一的 itemId/name" };
  const matches = game.inventory.filter((item) => candidates.some((candidate) => [item.instanceId, item.itemId, item.name].map(String).includes(candidate)));
  const unique = [...new Map(matches.map((item) => [item.instanceId, item])).values()];
  if (unique.length === 1) return { item: unique[0] };
  if (unique.length > 1) return { item: null, resolutionError: `物品标识「${candidates[0]}」对应多个实例，请改用 instanceId` };
  return { item: null, resolutionError: `背包中找不到「${candidates[0]}」` };
}

function relationshipCandidates(args = {}) {
  const nested = [args.npc, args.relationship, args.target].filter((value) => value && typeof value === "object");
  return [
    args.npcId,
    args.npcName,
    args.name,
    ...nested.flatMap((value) => [value.id, value.npcId, value.name]),
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

function parseRelationshipDelta(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  const number = text.match(/[+-]?\d+(?:\.\d+)?/);
  if (!number) return null;
  const amount = Math.abs(Number(number[0]));
  if (!Number.isFinite(amount)) return null;
  return /下降|减少|降低|恶化|敌意|负面|不满/.test(text) ? -amount : amount;
}

function resolveRelationshipReference(game, args = {}) {
  const candidates = relationshipCandidates(args);
  if (!candidates.length) return { npc: null, resolutionError: "缺少 NPC 标识：请提供 npcId，或唯一的 npcName/name" };
  const matches = (game.relationships || []).filter((npc) => candidates.some((candidate) => [npc.id, npc.name].map(String).includes(candidate)));
  const unique = [...new Map(matches.map((npc) => [npc.id, npc])).values()];
  if (unique.length === 1) return { npc: unique[0] };
  if (unique.length > 1) return { npc: null, resolutionError: `NPC 标识「${candidates[0]}」对应多个对象，请改用 npcId` };
  return { npc: null, resolutionError: `找不到 NPC「${candidates[0]}」` };
}

function locationCandidates(args = {}) {
  const nested = [args.location, args.destination, args.target].filter((value) => value && typeof value === "object");
  return [
    args.locationId,
    args.id,
    args.locationName,
    args.name,
    ...nested.flatMap((value) => [value.id, value.locationId, value.name]),
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

function resolveLocationReference(args = {}) {
  const candidates = locationCandidates(args);
  if (!candidates.length) return { location: null, resolutionError: "缺少地点标识：请提供地图目录中的 locationId" };
  const matches = MAP_LOCATIONS.filter((location) => candidates.some((candidate) => [location.id, location.name].includes(candidate)));
  const unique = [...new Map(matches.map((location) => [location.id, location])).values()];
  if (unique.length === 1) return { location: unique[0] };
  if (unique.length > 1) return { location: null, resolutionError: `地点标识「${candidates[0]}」对应多个地点，请改用 locationId` };
  return { location: null, resolutionError: `地图目录中找不到地点「${candidates[0]}」` };
}

function repairToolArgs(name, rawArgs = {}, game = null) {
  const args = { ...rawArgs };
  let repairNote = "";
  let resolutionError = "";
  if (name === "clue.add") {
    if (!args.clue && (args.id || args.title || args.detail)) {
      args.clue = { id: args.id, title: args.title, detail: args.detail };
      delete args.id;
      delete args.title;
      delete args.detail;
      repairNote = "已将线索字段整理到 clue 对象";
    }
    if (args.clue?.title && !args.clue.id) {
      args.clue = { ...args.clue, id: stableId(args.clue.title) };
      repairNote = appendRepairNote(repairNote, "已根据线索标题生成 id");
    }
  }
  if (name === "inventory.add") {
    if (!args.item && (args.itemId || args.name || args.description || args.detail)) {
      args.item = {
        itemId: args.itemId,
        name: args.name,
        description: args.description || args.detail,
        category: args.category,
        quantity: args.quantity,
        weight: args.weight,
        rarity: args.rarity,
        condition: args.condition,
        importance: args.importance,
        tags: args.tags,
        properties: args.properties,
        source: args.source,
      };
      ["itemId", "name", "description", "detail", "category", "quantity", "weight", "rarity", "condition", "importance", "tags", "properties", "source"].forEach((key) => delete args[key]);
      repairNote = appendRepairNote(repairNote, "已将物品字段整理到 item 对象");
    }
    if (typeof args.item === "string" && args.item.trim()) {
      args.item = { name: args.item.trim() };
      repairNote = appendRepairNote(repairNote, "已将物品名称整理为结构化对象");
    }
    if (args.item && typeof args.item === "object") {
      const item = { ...args.item };
      if (!item.itemId && item.name) {
        item.itemId = stableItemId(item.name);
        repairNote = appendRepairNote(repairNote, "已根据物品名称生成 itemId");
      }
      if (!item.description && item.discoveredInfo) item.description = item.discoveredInfo;
      if (!item.description && item.name) {
        item.description = `本轮行动中获得的${item.name}`;
        repairNote = appendRepairNote(repairNote, "已补充物品的最小描述");
      }
      args.item = item;
    }
  }
  if (["inventory.remove", "inventory.update", "item.inspect", "item.use", "item.equip", "item.unequip"].includes(name)) {
    const nestedItem = args.item && typeof args.item === "object" ? args.item : null;
    if (!args.instanceId && nestedItem?.instanceId) {
      args.instanceId = nestedItem.instanceId;
      repairNote = appendRepairNote(repairNote, "已从物品对象读取 instanceId");
    }
    if (!args.instanceId && game) {
      const resolved = resolveInventoryReference(game, args);
      if (resolved.item) {
        args.instanceId = resolved.item.instanceId;
        repairNote = appendRepairNote(repairNote, `已根据「${resolved.item.name}」匹配背包实例`);
      } else {
        resolutionError = resolved.resolutionError;
      }
    }
    if (name === "inventory.remove" && args.quantity === undefined && args.instanceId) {
      args.quantity = 1;
      repairNote = appendRepairNote(repairNote, "未指定数量，按 1 件处理");
    }
  }
  if (name === "occult.contact" && game?.occult?.entryAvailable && !args.entryId && game.occult.currentEntry?.id) {
    args.entryId = game.occult.currentEntry.id;
    repairNote = appendRepairNote(repairNote, "已匹配当前非凡入口");
  }
  if (name === "relationship.update") {
    const nestedRelationship = args.relationship && typeof args.relationship === "object" ? args.relationship : null;
    if (args.delta === undefined) {
      const deltaSource = args.change ?? args.relationshipDelta ?? args.adjustment ?? args.amount ?? nestedRelationship?.delta ?? nestedRelationship?.change;
      const parsedDelta = parseRelationshipDelta(deltaSource);
      if (parsedDelta !== null) {
        args.delta = parsedDelta;
        repairNote = appendRepairNote(repairNote, "已将关系变化整理为 delta");
      }
    } else {
      const parsedDelta = parseRelationshipDelta(args.delta);
      if (parsedDelta !== null && parsedDelta !== args.delta) args.delta = parsedDelta;
    }
    if (!args.npcId && game) {
      const resolved = resolveRelationshipReference(game, args);
      if (resolved.npc) {
        args.npcId = resolved.npc.id;
        repairNote = appendRepairNote(repairNote, `已根据「${resolved.npc.name}」匹配 NPC`);
      } else {
        resolutionError = resolved.resolutionError;
      }
    }
  }
  if (["location.discover", "location.move"].includes(name)) {
    const resolved = resolveLocationReference(args);
    if (!args.locationId && resolved.location) {
      args.locationId = resolved.location.id;
      repairNote = appendRepairNote(repairNote, `已根据「${resolved.location.name}」匹配地图地点`);
    } else if (!resolved.location) {
      resolutionError = resolved.resolutionError;
    }
    if (name === "location.discover") {
      const statusAliases = { rumor: "rumored", rumoured: "rumored", known: "discovered", 听闻: "rumored", 传闻: "rumored", 已发现: "discovered" };
      const sourceStatus = args.status ?? args.level ?? args.knowledgeStatus;
      if (statusAliases[sourceStatus]) args.status = statusAliases[sourceStatus];
      if (!args.note && resolved.location && ["rumored", "discovered"].includes(args.status)) {
        args.note = args.status === "rumored" ? resolved.location.rumor : resolved.location.description;
        repairNote = appendRepairNote(repairNote, "已根据地图目录补充地点记录");
      }
    }
  }
  return { args, repairNote, resolutionError };
}

export function normalizeToolCall(call = {}, game = null) {
  let args = call.args;
  let argsInvalid = Boolean(call.argsInvalid);
  let argsInvalidCause = call.argsInvalidCause || "";
  if (!args && typeof call.arguments === "string") {
    try { args = JSON.parse(call.arguments); } catch {
      args = {};
      argsInvalid = argsInvalid || call.arguments.trim().length > 0;
      if (argsInvalid && !argsInvalidCause) argsInvalidCause = "json";
    }
  }
  if (!args && call.parameters && typeof call.parameters === "object") args = call.parameters;
  if (!args && call.function?.arguments) {
    try { args = JSON.parse(call.function.arguments); } catch {
      args = {};
      argsInvalid = argsInvalid || call.function.arguments.trim().length > 0;
      if (argsInvalid && !argsInvalidCause) argsInvalidCause = "json";
    }
  }
  const name = String(call.name || call.tool || call.function?.name || "").replace("__", ".");
  const rawArgs = args && typeof args === "object" ? { ...args } : {};
  const reason = call.reason || rawArgs.reason || `AI 提议执行 ${name || "未知工具"}`;
  delete rawArgs.reason;
  const repaired = repairToolArgs(name, rawArgs, game);
  return { ...call, name, args: repaired.args, reason: String(reason).trim() || `AI 提议执行 ${name}`, repairNote: repaired.repairNote, resolutionError: repaired.resolutionError, argsInvalid, argsInvalidCause };
}

export function normalizeToolCalls(calls = [], game = null) {
  return (Array.isArray(calls) ? calls : []).map((call) => normalizeToolCall(call, game));
}

export function dedupeToolCalls(calls = []) {
  const seen = new Set();
  return calls.filter((call) => {
    const key = `${call.name}:${JSON.stringify(call.args || {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function validateCall(game, call) {
  if (!call.name) return "工具调用缺少名称，已忽略";
  const schema = TOOL_SCHEMAS[call.name];
  if (!schema) return `未知工具「${call.name}」`;
  if (call.argsInvalidCause === "length") return "工具参数不是合法 JSON，且响应因长度限制结束，很可能被输出预算截断。";
  if (call.argsInvalid) return "工具参数不是合法 JSON，可能由输出截断、流式分片拼装异常或模型格式错误造成。";
  if (call.resolutionError) return call.resolutionError;
  if (!call.args || typeof call.args !== "object") return "参数必须是对象";
  const missing = schema.required.filter((key) => call.args[key] === undefined);
  if (missing.length) return `缺少参数（模型未提供）：${missing.join("、")}`;
  if (!call.reason || String(call.reason).trim().length < 2) return "缺少与本轮叙事对应的变更理由";
  if (!game.character || !Array.isArray(game.inventory)) return "游戏状态结构不完整";
  return "";
}

export function validateToolCall(game, call) {
  const normalized = normalizeToolCall(call, game);
  return { call: normalized, error: validateCall(game, normalized) };
}

export function isRepairableToolError(call, error = "") {
  return Boolean(call?.argsInvalid) || /参数|缺少.*(?:ID|标识|字段)|必须提供/.test(error);
}

function amountArg(args) {
  return args.amount || { pounds: args.pounds, solers: args.solers, pence: args.pence };
}

function executeOne(game, call) {
  const args = call.args;
  const turnLabel = `第 ${game.turn + 1} 轮`;
  const findItem = () => game.inventory.find((item) => item.instanceId === args.instanceId);
  switch (call.name) {
    case "inventory.add": {
      const source = args.item;
      const quantity = Number(source?.quantity ?? 1);
      if (!source?.itemId || !source?.name || !source?.description) return fail(call.name, "新物品必须包含 itemId、name 与 description");
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) return fail(call.name, "物品数量必须是 1—10 的整数");
      const projected = weightOf(game.inventory) + Number(source.weight || 0) * quantity;
      if (projected > game.capacity.maxWeight) return fail(call.name, `背包将超过 ${game.capacity.maxWeight}kg 容量`);
      const existing = game.inventory.find((item) => item.itemId === source.itemId && !item.equipped);
      let changedItem;
      if (existing) {
        existing.quantity += quantity;
        existing.isNew = true;
        existing.importance = normalizeItemImportance({ ...existing, importance: source.importance || existing.importance, tags: [...(existing.tags || []), ...(source.tags || [])] });
        changedItem = existing;
      } else {
        changedItem = normalizeInventoryItem({ instanceId: makeId("item"), category: "杂物", weight: 0, rarity: "普通", condition: "良好", equipped: false, tags: [], properties: {}, hiddenInfo: "", discoveredInfo: source.description, ...source, quantity, acquiredAt: turnLabel, source: source.source || call.reason, isNew: true });
        game.inventory.push(changedItem);
      }
      return succeed(call.name, `${turnLabel}：获得「${source.name}」×${quantity}——${source.source || call.reason}。`, { inventoryChange: { ...changedItem, delta: quantity, reason: source.source || call.reason } });
    }
    case "inventory.remove": {
      const target = findItem();
      const quantity = Number(args.quantity);
      if (!target) return fail(call.name, "背包中不存在该物品实例");
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > target.quantity) return fail(call.name, "移除数量无效或超过持有数量");
      const change = { ...target, delta: -quantity, reason: call.reason, importance: normalizeItemImportance(target) };
      target.quantity -= quantity;
      if (target.quantity === 0) game.inventory = game.inventory.filter((item) => item.instanceId !== target.instanceId);
      return succeed(call.name, `${turnLabel}：失去「${target.name}」×${quantity}——${call.reason}。`, { inventoryChange: change });
    }
    case "inventory.update": {
      const target = findItem();
      if (!target) return fail(call.name, "背包中不存在该物品实例");
      const allowed = ["description", "condition", "discoveredInfo", "properties", "tags"];
      Object.entries(args.patch || {}).forEach(([key, value]) => { if (allowed.includes(key)) target[key] = value; });
      return succeed(call.name, `${turnLabel}：更新「${target.name}」——${call.reason}。`);
    }
    case "money.add": {
      const amountPence = amountToPence(amountArg(args));
      if (!Number.isInteger(amountPence) || amountPence < 1) return fail(call.name, "增加金额必须是正整数，并按镑、苏勒、便士填写");
      const current = moneyToPence(game.money || {});
      game.money = moneyFromPence(current + amountPence);
      return succeed(call.name, `${turnLabel}：获得资金 ${formatMoney(moneyFromPence(amountPence))}——${call.reason}。`, { amountPence, balance: game.money });
    }
    case "money.remove": {
      const amountPence = amountToPence(amountArg(args));
      const current = moneyToPence(game.money || {});
      if (!Number.isInteger(amountPence) || amountPence < 1) return fail(call.name, "扣除金额必须是正整数，并按镑、苏勒、便士填写");
      if (amountPence > current) return fail(call.name, `资金不足，当前余额为 ${formatMoney(game.money || {})}`);
      game.money = moneyFromPence(current - amountPence);
      return succeed(call.name, `${turnLabel}：支付 ${formatMoney(moneyFromPence(amountPence))}——${call.reason}。`, { amountPence, balance: game.money });
    }
    case "money.inspect": {
      game.money = moneyFromPence(moneyToPence(game.money || {}));
      return succeed(call.name, `${turnLabel}：资金核对——当前余额 ${formatMoney(game.money)}。`, { balance: game.money });
    }
    case "item.inspect": {
      const target = findItem();
      if (!target) return fail(call.name, "找不到要检查的物品");
      if (target.hiddenInfo && args.reveal) target.discoveredInfo = `${target.discoveredInfo} ${target.hiddenInfo}`.trim();
      return succeed(call.name, `${turnLabel}：检查「${target.name}」——${target.discoveredInfo || target.description}`);
    }
    case "item.use": {
      const target = findItem();
      if (!target) return fail(call.name, "找不到要使用的物品");
      if (target.tags.includes("消耗品")) {
        const change = { ...target, delta: -1, reason: call.reason, importance: normalizeItemImportance(target) };
        target.quantity -= 1;
        if (target.quantity <= 0) game.inventory = game.inventory.filter((item) => item.instanceId !== target.instanceId);
        return succeed(call.name, `${turnLabel}：使用「${target.name}」——${call.reason}。`, { inventoryChange: change });
      }
      return succeed(call.name, `${turnLabel}：使用「${target.name}」——${call.reason}。`);
    }
    case "item.equip": {
      const target = findItem();
      if (!target) return fail(call.name, "找不到要装备的物品");
      if (!target.tags.includes("装备")) return fail(call.name, "该物品不允许装备");
      Object.values(game.equipment).forEach((id) => { const old = game.inventory.find((item) => item.instanceId === id); if (old && old.category === target.category) old.equipped = false; });
      target.equipped = true;
      game.equipment[target.category] = target.instanceId;
      return succeed(call.name, `${turnLabel}：装备「${target.name}」。`);
    }
    case "item.unequip": {
      const target = findItem();
      if (!target?.equipped) return fail(call.name, "该物品当前没有装备");
      target.equipped = false;
      delete game.equipment[target.category];
      return succeed(call.name, `${turnLabel}：卸下「${target.name}」。`);
    }
    case "occult.contact": {
      const occult = game.occult || { contact: 0, revealLevel: 0, entryAvailable: false, entryHistory: [] };
      if (Number(occult.contact) === 1) return fail(call.name, "玩家已经接触过非凡世界，本轮不重复记录");
      if (!occult.entryAvailable || !occult.currentEntry) return fail(call.name, "当前没有可验证的非凡入口");
      if (args.entryId !== occult.currentEntry.id) return fail(call.name, "入口 ID 与当前可见入口不匹配");
      game.occult = { ...occult, contact: 1, entryAvailable: false, contactedAt: turnLabel, contactedEntryId: args.entryId };
      return succeed(call.name, `${turnLabel}：你确认接触了非凡世界的入口「${occult.currentEntry.title}」——${call.reason}。`, { contact: 1, entryId: args.entryId });
    }
    case "occult.reveal": {
      const occult = game.occult || { contact: 0, revealLevel: 0 };
      if (Number(occult.contact) !== 1) return fail(call.name, "尚未接触非凡世界，不能揭示神秘知识");
      if (Number(occult.revealLevel) >= 1) return fail(call.name, "本轮之前已经揭示过该阶段的神秘知识");
      if (String(args.topic || "").trim().length < 2 || String(args.evidence || "").trim().length < 2) return fail(call.name, "揭示神秘知识必须提供主题和已确认的证据");
      game.occult = { ...occult, revealLevel: 1, lastReveal: { topic: String(args.topic).trim(), evidence: String(args.evidence).trim(), at: turnLabel } };
      return succeed(call.name, `${turnLabel}：你从「${args.evidence}」中确认了关于「${args.topic}」的有限神秘信息——${call.reason}。`, { revealLevel: 1 });
    }
    case "character.update": {
      if (args.requiresOccult && Number(game.occult?.contact) !== 1) return fail(call.name, "尚未接触非凡世界，不能应用非凡相关角色变化");
      const allowed = ["health", "sanity", "spirituality"];
      Object.entries(args.patch || {}).forEach(([key, value]) => {
        if (!allowed.includes(key) || !Number.isFinite(Number(value))) return;
        const max = game.character.stats[`max${key[0].toUpperCase()}${key.slice(1)}`];
        game.character.stats[key] = Math.max(0, Math.min(max, Number(value)));
      });
      return succeed(call.name, `${turnLabel}：角色状态发生变化——${call.reason}。`);
    }
    case "status.add": {
      if (!args.status?.id || !args.status?.name) return fail(call.name, "状态必须包含 id 与 name");
      if (game.statusEffects.some((status) => status.id === args.status.id)) return fail(call.name, "该状态已存在，本轮不重复添加");
      game.statusEffects.push({ kind: "neutral", description: "", ...args.status });
      return succeed(call.name, `${turnLabel}：获得状态「${args.status.name}」——${call.reason}。`);
    }
    case "status.remove": {
      const status = game.statusEffects.find((entry) => entry.id === args.statusId);
      if (!status) return fail(call.name, "该状态不存在");
      game.statusEffects = game.statusEffects.filter((entry) => entry.id !== args.statusId);
      return succeed(call.name, `${turnLabel}：状态「${status.name}」已解除。`);
    }
    case "relationship.update": {
      const npc = game.relationships.find((entry) => entry.id === args.npcId);
      const delta = Number(args.delta);
      if (!npc || !Number.isFinite(delta) || Math.abs(delta) > 10) return fail(call.name, "NPC 不存在或单轮关系变化超过 ±10");
      npc.value = Math.max(-100, Math.min(100, npc.value + delta));
      if (args.note) npc.note = String(args.note);
      return succeed(call.name, `${turnLabel}：${npc.name}的关系${delta >= 0 ? "提升" : "下降"}${Math.abs(delta)}。`);
    }
    case "location.discover": {
      const location = getMapLocation(args.locationId);
      if (!location) return fail(call.name, "地点不在本地地图目录中");
      if (!["rumored", "discovered"].includes(args.status)) return fail(call.name, "地点状态只能是 rumored 或 discovered");
      if (String(args.note || "").trim().length < 4) return fail(call.name, "地点记录必须说明玩家实际听闻或确认的信息");
      game.discoveredLocations = Array.isArray(game.discoveredLocations) ? game.discoveredLocations : [];
      game.locationKnowledge = normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, game.location?.id);
      const currentStatus = game.locationKnowledge[location.id]?.status || "unknown";
      if (currentStatus === "discovered") return fail(call.name, "该地点已经发现，无需重复记录");
      if (currentStatus === "rumored" && args.status === "rumored") return fail(call.name, "该地点传闻已经记录，无需重复添加");
      const record = { status: args.status, note: String(args.note).trim(), discoveredAt: turnLabel, source: call.reason };
      game.locationKnowledge[location.id] = record;
      if (args.status === "discovered" && !game.discoveredLocations.some((entry) => entry.id === location.id)) {
        game.discoveredLocations.push({ id: location.id, name: location.name, note: record.note });
      }
      const action = args.status === "rumored" ? "记录地点传闻" : "确认发现地点";
      return succeed(call.name, `${turnLabel}：${action}「${location.name}」——${call.reason}。`, { locationId: location.id, status: args.status });
    }
    case "location.move": {
      game.discoveredLocations = Array.isArray(game.discoveredLocations) ? game.discoveredLocations : [];
      const location = game.discoveredLocations.find((entry) => entry.id === args.locationId);
      if (!location) return fail(call.name, "目的地尚未发现，不能直接移动");
      if (location.id === game.location.id) return fail(call.name, "角色已经位于该地点");
      const mappedOrigin = getMapLocation(game.location.id);
      const mappedTarget = getMapLocation(location.id);
      const discoveredIds = game.discoveredLocations.map((entry) => entry.id);
      const route = mappedOrigin && mappedTarget ? findTravelRoute(game.location.id, location.id, discoveredIds) : null;
      if (mappedOrigin && mappedTarget && !route) return fail(call.name, "当前已知交通图中没有通往该地点的可用路线");
      const mappedDistrict = mappedTarget?.district ? `贝克兰德${mappedTarget.district}` : null;
      game.location = { id: location.id, name: location.name, district: mappedDistrict || args.district || location.district || "贝克兰德" };
      return succeed(call.name, `${turnLabel}：前往「${location.name}」——${call.reason}。`, { travelMinutes: route?.minutes || 35, path: route?.path || [location.id] });
    }
    case "clue.add": {
      if (!args.clue?.id || !args.clue?.title) return fail(call.name, "线索必须包含 id 与 title");
      if (game.clues.some((clue) => clue.id === args.clue.id)) return fail(call.name, "该线索已经记录");
      game.clues.push({ detail: "", ...args.clue, discoveredAt: turnLabel, isNew: true });
      return succeed(call.name, `${turnLabel}：发现线索「${args.clue.title}」——${call.reason}。`);
    }
    case "quest.add": {
      if (!args.quest?.id || !args.quest?.title) return fail(call.name, "任务必须包含 id 与 title");
      if (game.quests.some((quest) => quest.id === args.quest.id)) return fail(call.name, "任务已存在");
      game.quests.push({ status: "进行中", summary: "", ...args.quest });
      return succeed(call.name, `${turnLabel}：新增任务「${args.quest.title}」。`);
    }
    case "quest.update": {
      const quest = game.quests.find((entry) => entry.id === args.questId);
      if (!quest) return fail(call.name, "任务不存在");
      const allowed = ["status", "summary"];
      Object.entries(args.patch || {}).forEach(([key, value]) => { if (allowed.includes(key)) quest[key] = value; });
      return succeed(call.name, `${turnLabel}：任务「${quest.title}」已更新为${quest.status}。`);
    }
    case "dice.check": {
      const difficulty = Math.max(2, Math.min(20, Number(args.difficulty)));
      const roll = Math.floor(Math.random() * 20) + 1;
      const total = roll + Number(args.modifier || 0);
      return succeed(call.name, `${turnLabel}：检定 ${total >= difficulty ? "成功" : "失败"}（1d20=${roll}${args.modifier ? `，修正${Number(args.modifier) >= 0 ? "+" : ""}${args.modifier}` : ""}，难度${difficulty}）。`, { roll, total, difficulty });
    }
    default: return fail(call.name, "工具未实现");
  }
}

export function executeToolCalls(currentGame, calls = [], options = {}) {
  const game = structuredClone(currentGame);
  const processed = new Set(game.processedToolCalls || []);
  const results = [];
  for (const [index, call] of normalizeToolCalls(calls, game).slice(0, 12).entries()) {
    const callId = call.id || signature(game.turn + 1, call);
    if (processed.has(callId)) { results.push(fail(call.name, "重复工具调用已忽略")); continue; }
    if (options.blockedCallIndexes?.includes(index)) {
      results.push(fail(call.name, "玩家未确认这项重要物品变更"));
      processed.add(callId);
      continue;
    }
    const validationError = validateCall(game, call);
    if (validationError) { results.push(fail(call.name, validationError)); continue; }
    const result = executeOne(game, call);
    if (call.repairNote) {
      result.repairNote = call.repairNote;
      result.log = `${result.log}（${call.repairNote}）`;
    }
    results.push(result);
    processed.add(callId);
  }
  game.processedToolCalls = [...processed].slice(-120);
  const logs = results.map((result) => ({ id: makeId("log"), turn: game.turn + 1, text: result.log, tone: result.ok ? "success" : "danger" }));
  return { game, results, logs };
}

export function buildRejectedToolNarrative(action, results = []) {
  const reasons = [...new Set(results.filter((result) => !result.ok).map((result) => String(result.reason || "当前条件不足").trim()).filter(Boolean))].slice(0, 3);
  const attempted = String(action || "继续行动").replace(/[。！？!?]+$/g, "");
  const detail = reasons.length ? `本地规则给出的原因是：${reasons.join("；")}。` : "当前条件不足，本轮没有发生状态变化。";
  return `你尝试执行“${attempted}”，但预期的变化没有发生。${detail}你可以补充条件、检查现有物品，或换一种方式继续。`;
}
