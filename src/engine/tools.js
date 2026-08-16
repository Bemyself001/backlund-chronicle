import { makeId } from "../utils/id.js";
import { findTravelRoute, getMapLocation } from "../data/map.js";

export const TOOL_SCHEMAS = {
  "inventory.add": { required: ["item"], description: "新增或合并一个结构化物品实例" },
  "inventory.remove": { required: ["instanceId", "quantity"], description: "减少物品数量或移除实例" },
  "inventory.update": { required: ["instanceId", "patch"], description: "更新物品的可变字段" },
  "item.inspect": { required: ["instanceId"], description: "检查物品并揭示已发现信息" },
  "item.use": { required: ["instanceId"], description: "使用消耗品或工具" },
  "item.equip": { required: ["instanceId"], description: "装备可装备物品" },
  "item.unequip": { required: ["instanceId"], description: "卸下已装备物品" },
  "character.update": { required: ["patch"], description: "更新受限角色数值" },
  "status.add": { required: ["status"], description: "添加状态效果" },
  "status.remove": { required: ["statusId"], description: "移除状态效果" },
  "relationship.update": { required: ["npcId", "delta"], description: "更新已知 NPC 关系" },
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

function validateCall(game, call) {
  const schema = TOOL_SCHEMAS[call.name];
  if (!schema) return `未知工具「${call.name}」`;
  if (!call.args || typeof call.args !== "object") return "参数必须是对象";
  const missing = schema.required.filter((key) => call.args[key] === undefined);
  if (missing.length) return `缺少参数：${missing.join("、")}`;
  if (!call.reason || String(call.reason).trim().length < 2) return "缺少与本轮叙事对应的变更理由";
  if (!game.character || !Array.isArray(game.inventory)) return "游戏状态结构不完整";
  return "";
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
      if (existing) {
        existing.quantity += quantity;
        existing.isNew = true;
      } else {
        game.inventory.push({ instanceId: makeId("item"), category: "杂物", weight: 0, rarity: "普通", condition: "良好", equipped: false, tags: [], properties: {}, hiddenInfo: "", discoveredInfo: source.description, ...source, quantity, acquiredAt: turnLabel, source: source.source || call.reason, isNew: true });
      }
      return succeed(call.name, `${turnLabel}：获得「${source.name}」×${quantity}——${source.source || call.reason}。`);
    }
    case "inventory.remove": {
      const target = findItem();
      const quantity = Number(args.quantity);
      if (!target) return fail(call.name, "背包中不存在该物品实例");
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > target.quantity) return fail(call.name, "移除数量无效或超过持有数量");
      target.quantity -= quantity;
      if (target.quantity === 0) game.inventory = game.inventory.filter((item) => item.instanceId !== target.instanceId);
      return succeed(call.name, `${turnLabel}：失去「${target.name}」×${quantity}——${call.reason}。`);
    }
    case "inventory.update": {
      const target = findItem();
      if (!target) return fail(call.name, "背包中不存在该物品实例");
      const allowed = ["description", "condition", "discoveredInfo", "properties", "tags"];
      Object.entries(args.patch || {}).forEach(([key, value]) => { if (allowed.includes(key)) target[key] = value; });
      return succeed(call.name, `${turnLabel}：更新「${target.name}」——${call.reason}。`);
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
        target.quantity -= 1;
        if (target.quantity <= 0) game.inventory = game.inventory.filter((item) => item.instanceId !== target.instanceId);
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
    case "character.update": {
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
    case "location.move": {
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

export function executeToolCalls(currentGame, calls = []) {
  const game = structuredClone(currentGame);
  const processed = new Set(game.processedToolCalls || []);
  const results = [];
  for (const call of calls.slice(0, 12)) {
    const callId = call.id || signature(game.turn + 1, call);
    if (processed.has(callId)) { results.push(fail(call.name, "重复工具调用已忽略")); continue; }
    const validationError = validateCall(game, call);
    if (validationError) { results.push(fail(call.name, validationError)); continue; }
    const result = executeOne(game, call);
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
