import { SPECIAL_ACTIONS, SPECIAL_RECIPES, SPECIAL_CONTACTS, getOrganization } from "../content/index.js";
import { getAdvancement } from "../system/character.js";
import { moneyFromPence, moneyToPence } from "../system/money.js";
import { applyStatDelta } from "./statChanges.js";
import { resolveTurnProgress } from "./turn.js";
import { makeId } from "../utils/id.js";
import { medicineRecipe, consumeMedicine } from "./recovery.js";

export function specialState(game) {
  const raw = game.specialActions || {};
  return { ...raw, version: 1, revision: Number.isInteger(raw.revision) ? raw.revision : 0,
    active: raw.active || null, availableTurn: raw.availableTurn || 0,
    completed: raw.completed || [], lastPool: raw.lastPool || {}, materials: raw.materials || {},
    reputation: raw.reputation || 0, gravekeeper: Boolean(raw.gravekeeper), products: raw.products || {},
    knownClues: raw.knownClues || [],
  };
}

function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function membership(game, organizationId) {
  const member = game.organizationState?.membership;
  return member?.status === "active" && member.organizationId === organizationId;
}

export function actionGate(game, definition) {
  const advancement = getAdvancement(game.character);
  if (!definition) return "未知行动";
  if (advancement.type !== "extraordinary") return "成为非凡者后解锁途径行动";
  if (definition.pathwayId !== advancement.pathwayId && !definition.sharedOrganization) return "当前途径不可用";
  if (advancement.sequence > definition.maxSequence) return `序列${definition.maxSequence}及以上解锁`;
  if (definition.organizationId && !membership(game, definition.organizationId)) return `需正式加入${getOrganization(definition.organizationId)?.name || "所属组织"}`;
  if (definition.locationId && game.location.id !== definition.locationId) return "需到达指定地点";
  if (definition.license === "gravekeeper" && !specialState(game).gravekeeper) return "需先登记为守墓人";
  return "";
}

export function availableSpecialActions(game) {
  const advancement = getAdvancement(game.character);
  return SPECIAL_ACTIONS.filter((definition) => definition.pathwayId === advancement.pathwayId || definition.sharedOrganization);
}

export function watchContactText(game) {
  const fact = game.triggerState?.facts?.[SPECIAL_CONTACTS.watchOutcomeFact];
  return SPECIAL_CONTACTS.watchContacts[fact?.value ?? fact] || "联络人只把你当作外围合作者，不要求你正式加入魔女会。";
}

export function registrationGate(game, kind) {
  const state = specialState(game);
  const advancement = getAdvancement(game.character);
  if (kind === "gravekeeper") {
    const work = SPECIAL_ACTIONS.find((entry) => entry.license === "gravekeeper");
    if (advancement.pathwayId !== work.pathwayId) return "收尸人途径可登记守墓工作";
    if (state.gravekeeper) return "已登记为守墓人";
    if (game.location.id !== SPECIAL_CONTACTS.registrationLocation) return "需到达墓地管理处";
  } else if (kind === "organization") {
    if (advancement.type !== "extraordinary") return "成为非凡者后可申请";
    if (game.organizationState?.membership?.status === "active") return "已有正式组织身份";
    if (game.location.id !== SPECIAL_CONTACTS.organizationLocation) return "需到达圣赛缪尔教堂登记";
  } else return "未知登记项目";
  return "";
}

export function commissionOffer(game, definition) {
  const state = specialState(game);
  const seed = `${game.id}:${definition.id}:${Math.floor(game.turn / 3)}:${state.completed.length}`;
  let index = hash(seed) % definition.pool.length;
  if (definition.pool[index].id === state.lastPool[definition.id]) index = (index + 1) % definition.pool.length;
  return definition.pool[index];
}

function requireCondition(condition, message) { if (!condition) throw new Error(message); }
function pay(game, cost) {
  const balance = moneyToPence(game.money);
  requireCondition(balance >= cost, "资金不足");
  game.money = moneyFromPence(balance - cost);
}
function requireHealthy(game) {
  requireCondition(game.character.stats.health > 0 && game.character.stats.sanity > 0, "生命或理智归零，需先恢复再工作");
}

// 所有入口共享版本检查；UI 双击、重试旧选择和重复结算都不能重复领奖。
export function executeSpecialAction(game, request) {
  const before = specialState(game);
  requireCondition(request.revision === before.revision, "行动状态已更新，请重新选择");
  const next = structuredClone(game);
  const state = specialState(next);
  next.specialActions = state;
  let action = "";
  let narrative = "";
  let minutes = 5;
  const logs = [];
  const operation = request.operation;
  if (["accept", "craft", "register"].includes(operation)) {
    requireHealthy(next);
    requireCondition(!state.active, "请先完成或放弃当前委托");
  }
  if (operation === "sleep") {
    requireCondition(next.location.id === "soot-lamp", "需到达雾鸦旅店才能睡觉");
    action = "在雾鸦旅店睡觉8小时";
    narrative = "你在雾鸦旅店安静睡了八小时，起身时检查了自己的身体与精神状况。";
    minutes = 480;
  } else if (operation === "accept") {
    const definition = SPECIAL_ACTIONS.find((entry) => entry.id === request.id);
    const reason = actionGate(next, definition);
    requireCondition(!reason, reason);
    requireCondition(next.turn >= state.availableTurn, `还需 ${state.availableTurn - next.turn} 回合才能接取新委托`);
    const offer = commissionOffer(next, definition);
    const stake = definition.stake || 0;
    pay(next, stake);
    const contact = definition.contact === "watch" ? watchContactText(next) : "";
    const id = makeId("commission");
    state.active = { id, definitionId: definition.id, offer: structuredClone(offer), startedTurn: next.turn + 1, stake,
      // 小赌结果在接单时固定，读档与反复打开菜单不会重掷。
      roll: hash(`${next.id}:${definition.id}:${next.turn}:${state.completed.length}`) % 100,
    };
    state.lastPool[definition.id] = offer.id;
    next.quests.push({ id, title: offer.title, summary: offer.scene, status: "active", source: "特殊行动", objectives: [{ id: "special-complete", text: "在特殊行动内选择处理方式", completed: false }] });
    action = `接取${definition.name}：${offer.title}`;
    narrative = `${offer.scene}${contact ? `\n\n${contact}` : ""}\n\n你已接下这份委托，可以在特殊行动中选择处理方式。${stake ? `已预留 ${stake} 便士赌注。` : ""}`;
  } else if (operation === "resolve" || operation === "abandon") {
    const active = state.active;
    requireCondition(active && active.id === request.id, "委托已结算或不再有效");
    const definition = SPECIAL_ACTIONS.find((entry) => entry.id === active.definitionId);
    let reward = 0;
    if (operation === "resolve") {
      requireHealthy(next);
      const reason = actionGate(next, definition);
      requireCondition(!reason, reason);
      const option = active.offer.options.find((entry) => entry.id === request.optionId);
      requireCondition(option, "无效的剧情选项");
      reward = option.reward;
      narrative = option.ending;
      if (active.stake && option.id === "careful") {
        reward = active.roll < 45 ? active.stake * 2 : active.roll < 65 ? active.stake : 0;
        narrative += `\n\n本局${reward > active.stake ? "小有收获" : reward === active.stake ? "打平" : "失利"}，扣除预留赌注后净收入 ${reward - active.stake} 便士。`;
      }
      if (!active.stake) reward += Math.min(72, Math.max(0, 9 - getAdvancement(next.character).sequence) * 12);
      if (option.health) {
        const delta = applyStatDelta(next, "health", option.health);
        if (delta) logs.push(`竞技损耗：生命 ${delta.before}→${delta.after}`);
      }
      state.reputation += option.reputation || 0;
      // 浅显线索稀少、固定且只入档一次；不会生成配方或隐藏主线事实。
      if (active.offer.clue && option.id === "careful" && !state.knownClues.includes(active.offer.id)) {
        state.knownClues.push(active.offer.id);
        next.clues.push({ id: `special-clue-${active.offer.id}`, title: `${active.offer.title}·工作札记`, detail: active.offer.clue, kind: "ordinary_note", source: "特殊行动", turn: next.turn + 1 });
        narrative += `\n\n${active.offer.clue}`;
      }
      action = `完成委托：${active.offer.title}（${option.label}）`;
      minutes = definition.minutes;
    } else {
      action = `放弃委托：${active.offer.title}`;
      narrative = "你通知委托方结束这次工作，没有领取工作报酬。";
      reward = active.stake; // 尚未下注的预留筹码退回；放弃同样消耗回合并进入间隔。
    }
    next.money = moneyFromPence(moneyToPence(next.money) + reward);
    logs.push(`结算入账 ${reward} 便士${active.stake ? "（含退回或赢得的筹码）" : ""}`);
    next.quests = next.quests.map((quest) => quest.id === active.id ? { ...quest, status: operation === "resolve" ? "completed" : "abandoned", objectives: (quest.objectives || []).map((entry) => ({ ...entry, completed: operation === "resolve" })) } : quest);
    state.completed = [...state.completed, { id: active.id, title: active.offer.title, turn: next.turn + 1, reward, status: operation }].slice(-60);
    state.active = null;
    state.availableTurn = next.turn + 4;
  } else if (operation === "register") {
    const reason = registrationGate(next, request.id);
    requireCondition(!reason, reason);
    if (request.id === "gravekeeper") {
      state.gravekeeper = true;
      action = "登记为守墓人";
      narrative = "墓地管理人核对了你的身份，讲解墓册与遗体交接要求，将你登记为守墓人。之后可以在这里接取有薪工作。";
    } else {
      const organization = getOrganization(SPECIAL_CONTACTS.organizationId);
      next.organizationState = { membership: { organizationId: organization.id, name: organization.name, kind: "official", tags: [...organization.tags], status: "active", joinedTurn: next.turn + 1, evidence: "本人到场，明确接受值夜者纪律并完成正式登记。" } };
      action = "正式加入值夜者";
      narrative = "你确认愿意接受值夜者的纪律与任务安排，完成身份说明和正式登记。值班人员将基础委托册交给你，提醒你遇到超出能力的异常必须报告。";
    }
    minutes = 30;
  } else if (operation === "buy" || operation === "craft" || operation === "buy-medicine") {
    const recipe = SPECIAL_RECIPES.find((entry) => entry.id === request.id);
    const reason = operation === "buy-medicine" && recipe?.stat ? "" : actionGate(next, recipe);
    requireCondition(!reason, reason);
    if (operation === "buy") {
      pay(next, recipe.cost);
      state.materials[recipe.id] = (state.materials[recipe.id] || 0) + 1;
      action = `购买${recipe.material}`;
      narrative = `你通过本城供货渠道购买一份${recipe.material}，花费 ${recipe.cost} 便士。材料已放入特殊行动的制作储备。`;
    } else {
      requireCondition(operation === "buy-medicine" ? recipe.stat : state.materials[recipe.id] > 0, "缺少对应材料包，请先购买材料");
      const weight = next.inventory.reduce((sum, item) => sum + (Number(item.weight) || 0) * (Number(item.quantity) || 0), 0);
      requireCondition(weight + recipe.weight <= (next.capacity?.maxWeight || 12), "行囊负重不足，请先整理物品");
      if (operation === "buy-medicine") pay(next, recipe.sale);
      else state.materials[recipe.id] -= 1;
      const instanceId = makeId("crafted");
      next.inventory.push({ instanceId, itemId: `special-${recipe.id}`, name: recipe.name, description: recipe.description,
        category: recipe.stat ? "消耗品" : "武器", quantity: 1, weight: recipe.weight, rarity: "普通", importance: "normal",
        tags: recipe.stat ? ["普通药剂", "消耗品"] : ["装备"], condition: "良好", equipped: false, properties: {}, source: operation === "buy-medicine" ? "购买药剂" : "特殊行动制作", acquiredAt: `第 ${next.turn + 1} 轮`, isNew: true });
      state.products[instanceId] = recipe.id;
      action = `制作${recipe.name}`;
      narrative = `你消耗一份${recipe.material}，完成了${recipe.name}。${recipe.description}\n\n成品已放入行囊，可在特殊行动中自用或出售。`;
      minutes = 30;
      if (operation === "buy-medicine") {
        action = `购买${recipe.name}`;
        narrative = `你花费 ${recipe.sale} 便士购买了一份${recipe.name}。${recipe.description}可在行囊或特殊行动中使用。`;
        minutes = 10;
      }
    }
  } else if (operation === "sell" || operation === "use") {
    const item = next.inventory.find((entry) => entry.instanceId === request.id && entry.quantity > 0);
    const recipe = SPECIAL_RECIPES.find((entry) => entry.id === state.products[request.id]) || (operation === "use" && medicineRecipe(item));
    requireCondition(recipe && item, "该制作成品已不在行囊中");
    requireCondition(!item.equipped, "请先卸下装备再出售");
    if (operation === "sell") {
      next.money = moneyFromPence(moneyToPence(next.money) + recipe.sale);
      action = `出售${recipe.name}`;
      narrative = `你把${recipe.name}交给本城收购商，获得 ${recipe.sale} 便士。`;
    } else {
      requireCondition(recipe.stat, "该成品不是可服用药剂");
      const delta = consumeMedicine(next, item);
      action = `使用${recipe.name}`;
      narrative = `${recipe.name}已经使用，${delta.label} ${delta.before}→${delta.after}。`;
    }
    if (operation === "sell") item.quantity -= 1;
    next.inventory = next.inventory.filter((entry) => entry.quantity > 0);
    if (!item.quantity) delete state.products[request.id];
  } else throw new Error("未知特殊行动");

  state.revision += 1;
  const progress = resolveTurnProgress(next, action, "low", [], [], { elapsedMinutes: minutes });
  if (operation === "sleep") narrative += `\n\n${progress.restRecovery.map(change => `${change.label} ${change.before}→${change.after}`).join("；") || "生命与理智均已达到上限。"}`;
  next.turn = game.turn + 1;
  next.hiddenDanger = progress.hiddenDanger;
  if (next.world) next.world.turn = next.turn;
  if (progress.newTrigger?.presentation) narrative += `\n\n【${progress.newTrigger.presentation.title}】${progress.newTrigger.presentation.text}`;
  return { next, action, narrative, progress, logs };
}
