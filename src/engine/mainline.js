import { MAINLINE, getContentTrigger } from "../content/index.js";
import { normalizeTriggerState, setTriggerFact } from "./triggerState.js";
import { engageTrigger, settleQuestStep } from "./triggerEngine.js";
import { syncQuestJournal } from "./questRuntime.js";
import { getMapLocation, normalizeLocationKnowledge } from "../system/map.js";
import { travelToLocation } from "../system/hexworld.js";
import { activeEnemies } from "../system/combat.js";
import { appendDialogueExchange } from "./conversations.js";
import { advanceWorldTime } from "./worldTime.js";

export const MAINLINE_RULE = "【雾中无名者主线】本线为三章原创剧情：前期核实名册，中期结识阿兹克并取得铜哨，后期由玩家亲自确认加入塔罗会。进度、奖励与入会以本地主线档案为准，只能通过主线入口确认，不根据聊天或AI工具跳过阶段、假定已入会或重复给铜哨。已有怀表任务取得的铜哨继续有效。不得提前泄露后续案件结果、阿兹克隐秘身份或塔罗会成员真实身份；当前档案只公开已到达阶段。塔罗身份独立保存，不替换玩家既有官方组织身份。";
const assert = (value, message) => { if (!value) throw new Error(message); };
const hasWhistle = game => (game.inventory || []).some(item => item.itemId === "azik-copper-whistle" && item.quantity > 0);

export function mainlineInstance(game) {
  return [...(game.triggerState?.active || []), ...(game.triggerState?.history || [])].find(entry => entry.definitionId === MAINLINE.id && entry.status !== "eligible") || null;
}

export function tarotMembership(game) {
  const value = game.tarotClub;
  if (value?.status !== "active" || !MAINLINE.codenames.includes(value.codename) || game.triggerState?.facts?.["mainline.tarot.joined"]?.value !== true) return null;
  return { status: "active", name: "塔罗会", codename: value.codename, joinedTurn: Number.isInteger(value.joinedTurn) ? value.joinedTurn : 0,
    joinedAt: String(value.joinedAt || ""), source: MAINLINE.id };
}

export function mainlineView(game) {
  const instance = mainlineInstance(game), completed = instance?.status === "completed";
  const index = completed ? MAINLINE.steps.length : Math.max(0, MAINLINE.steps.findIndex(step => step.id === instance?.stage));
  const step = completed ? null : MAINLINE.steps[index];
  const membership = tarotMembership(game);
  return { id: MAINLINE.id, title: MAINLINE.title, description: MAINLINE.description, status: instance?.status || "unstarted",
    instanceId: instance?.instanceId || null, revision: `${instance?.status || "unstarted"}:${instance?.stage || ""}:${instance?.stageHistory?.length || 0}`,
    done: index, total: MAINLINE.steps.length,
    lastResult: instance?.lastProgressEvidence || "",
    chapters: MAINLINE.chapters.map(chapter => ({ ...chapter, done: MAINLINE.steps.filter((entry, position) => entry.chapter === chapter.id && position < index).length,
      total: MAINLINE.steps.filter(entry => entry.chapter === chapter.id).length, current: step?.chapter === chapter.id })),
    current: step ? { id: step.id, chapter: step.chapter, title: step.title, locationId: step.locationId, minutes: step.minutes,
      label: step.label, objective: step.objective, scene: step.scene, locationName: getMapLocation(step.locationId, game)?.name, onSite: game.location?.id === step.locationId } : null,
    hasWhistle: hasWhistle(game), membership, codenames: MAINLINE.codenames,
    aboveGrayFog: instance?.status === "engaged" && instance.stage === "tarot-oath" };
}

function healthy(game) {
  assert(game.character?.stats?.health > 0 && game.character?.stats?.sanity > 0, "请先恢复身心状态，再继续主线");
  assert(!activeEnemies(game).length, "请先结束当前遭遇，再继续主线");
}

function revealDestination(game, locationId) {
  if (!locationId) return;
  game.locationKnowledge = normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, game.location.id, game);
  const previous = game.locationKnowledge[locationId] || {};
  game.locationKnowledge[locationId] = { ...previous, status: previous.status === "visited" ? "visited" : "discovered",
    note: "主线档案中已核实的下一步地点", discoveredAt: previous.discoveredAt || `第${game.turn + 1}轮` };
}

export function executeMainlineAction(game, request) {
  healthy(game);
  const view = mainlineView(game), turn = game.turn + 1;
  assert(request.mainlineRevision === view.revision && request.expectedTurn === game.turn && request.expectedWorldTime === game.worldTime, "主线进度或时间已更新，请重新查看当前目标");
  if (request.operation === "mainline-start") {
    assert(view.status === "unstarted", "这条主线已经登记，不能重复开始");
    game.triggerState = normalizeTriggerState(game);
    game.triggerState.active = game.triggerState.active.filter(entry => entry.definitionId !== MAINLINE.id);
    const definition = getContentTrigger(MAINLINE.id);
    const instance = { instanceId: `mainline:${game.id}:fogbound-name`, definitionId: MAINLINE.id, definitionVersion: definition.version,
      definitionSnapshot: structuredClone(definition), category: "mainline", status: "available", stage: MAINLINE.steps[0].id,
      createdTurn: turn, expiresTurn: null, stageHistory: [], presentation: structuredClone(definition.presentation) };
    game.triggerState.active.push(instance);
    const result = engageTrigger(game, instance.instanceId, turn, "开始调查雾中无名者", { local: true });
    assert(result.ok, result.reason);
    game.trackedQuestId = instance.instanceId;
    revealDestination(game, MAINLINE.steps[0].locationId);
    return { action: `开始主线：${MAINLINE.title}`, minutes: 5, narrative: "你决定调查那份署名被涂去的善款启事，将「雾中无名者」登记进手记。\n\n第一步是到公共图书馆核对旧报。你可以随时离开去处理自己的事，已经核实的证据与章节进度会保留。" };
  }
  assert(view.status === "engaged" && view.current, "主线尚未开始或已经结束");
  const instance = mainlineInstance(game), step = MAINLINE.steps.find(entry => entry.id === view.current.id);
  assert(request.stepId === step.id, "这项行动不属于当前主线阶段");
  if (request.operation === "mainline-travel") {
    assert(!view.aboveGrayFog, "请先结束灰雾会面");
    assert(!view.current.onSite, "已经到达当前目标地点");
    const location = getMapLocation(step.locationId, game), travel = travelToLocation(game, location.id);
    assert(travel, "无法到达当前目标地点");
    game.location = { id: location.id, name: location.name, district: `贝克兰德${location.district}` };
    revealDestination(game, location.id);
    game.locationKnowledge[location.id] = { ...game.locationKnowledge[location.id], status: "visited", visitedAt: `第${turn}轮` };
    if (game.gatherings) game.gatherings.attendance = null;
    return { action: `为主线前往${location.name}`, minutes: Math.max(1, travel.minutes), narrative: `你依照已确认的地址来到${location.name}，行程耗时${Math.max(1, travel.minutes)}分钟。\n\n${step.scene}\n\n到达地点后，还需要你亲自选择当前的调查行动。` };
  }
  if (request.operation === "mainline-defer") {
    assert(view.aboveGrayFog, "当前没有等待答复的灰雾会面");
    instance.stageHistory.push({ id: `${instance.instanceId}:${turn}:defer`, from: instance.stage, to: "gray-fog", turn, evidenceIds: ["玩家暂缓加入塔罗会"] });
    instance.stage = "gray-fog"; instance.lastProgressEvidence = "玩家暂缓加入，已结束会面；邀请继续有效。";
    syncQuestJournal(game);
    return { action: "暂缓加入塔罗会，告辞离开灰雾", minutes: 5, narrative: "你说明自己还需要考虑，向长桌尽头告辞。灰雾缓缓退去，你在旅店房间中回过神来。\n\n入会尚未发生。邀请继续保留，准备好时可以再次回应。" };
  }
  assert(request.operation === "mainline-step", "未知主线行动");
  assert(view.current.onSite, "请先实际到达当前主线地点");
  if (step.id === "first-letter") assert(hasWhistle(game), "请先将阿兹克铜哨带在身边，再联系信使");
  if (step.id === "tarot-oath") {
    assert(request.confirmed === true, "需要你亲自确认加入塔罗会");
    assert(MAINLINE.codenames.includes(request.codename), "请选择当前未被占用的塔罗代号");
    assert(!tarotMembership(game), "已经登记塔罗会身份，不能重复加入");
  }
  const alreadyOwnedWhistle = hasWhistle(game);
  if (step.id === "copper-whistle" && !alreadyOwnedWhistle) {
    const weight = (game.inventory || []).reduce((sum, item) => sum + Number(item.weight || 0) * Number(item.quantity || 0), 0);
    assert(weight + 0.05 <= (game.capacity?.maxWeight || 12), "行囊负重不足，请为铜哨留出0.05公斤空间");
  }
  const result = settleQuestStep(game, instance.instanceId, step.id, turn, step.label, step.narrative, step.label, { local: true });
  assert(result.ok, result.reason);
  if (step.id === "copper-whistle") {
    game.occult = { ...game.occult, contact: 1 };
    setTriggerFact(game.triggerState, "occult.contact", turn, [instance.instanceId]);
  }
  if (step.letter) appendDialogueExchange(game, "azik-eggers", step.letter, step.reply, { source: "fixed", minutes: step.minutes });
  let narrative = alreadyOwnedWhistle && step.legacyNarrative ? step.legacyNarrative : step.narrative;
  if (step.id === "tarot-oath") {
    game.tarotClub = { status: "active", codename: request.codename, joinedTurn: turn, joinedAt: advanceWorldTime(game.worldTime, step.minutes) };
    setTriggerFact(game.triggerState, "mainline.tarot.codename", turn, [instance.instanceId], request.codename);
    narrative += `\n\n【正式身份】塔罗会成员 · 「${request.codename}」\n这份身份已记入角色档案。`;
  }
  mainlineInstance(game).lastProgressEvidence = narrative;
  const nextStep = mainlineView(game).current;
  revealDestination(game, nextStep?.locationId);
  return { action: `主线：${step.label}`, narrative, minutes: step.minutes };
}
