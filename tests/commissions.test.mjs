import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame, EMPTY_CHARACTER } from "../src/system/game.js";
import { executeToolCalls, normalizeToolCalls } from "../src/engine/tools.js";
import { resolveTurnProgress } from "../src/engine/turn.js";
import { advanceWorldTime } from "../src/engine/worldTime.js";
import { commissionView, offerCommission, validateCommissionRecords } from "../src/engine/commissions.js";
import { visibleQuestJournal, projectQuestJournal, questAssistance } from "../src/engine/questRuntime.js";
import { registerQuest, validateQuestPatch } from "../src/engine/questLifecycle.js";
import { inspectQuestTracking, resolveQuestTrackingRequest } from "../src/services/questTracking.js";
import { inferCommissionInquiry, ensureCommissionOfferTool, inferCommissionTrackingRequest, restoreCommissionRecord, appendCommissionReport } from "../src/services/commissions.js";
import { visibleGameState, buildPlanningContext } from "../src/services/memory.js";
import { createTurnResolution } from "../src/services/turnResolution.js";
import { migrateSave, saveGame, loadGame, importSave } from "../src/services/storage.js";
import { moneyToPence } from "../src/system/money.js";
import { resolveSpecialAction } from "../src/services/specialActions.js";
import { specialState } from "../src/engine/specialActions.js";
import { resolveQuestAction } from "../src/engine/questActions.js";

const NPC = "sherlock-moriarty";
const SCOPE = "调查舅舅失踪的线索";
const ACTION = `委托夏洛克·莫里亚蒂${SCOPE}，先商定费用与交付时间`;
function fresh() {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "委托测试员", startingDistrict: "乔伍德区" });
  game.triggerState.facts[`person.${NPC}.met`] = { value: true, firstTurn: 0 };
  game.money = { pounds: 5, solers: 0, pence: 0 };
  return game;
}
function quote(game = fresh(), objective = SCOPE, feePence = 240, durationMinutes = 1440) {
  const action = `委托夏洛克·莫里亚蒂${objective}`;
  const inquiry = { ...inferCommissionInquiry(game, action), feePence, durationMinutes };
  const calls = ensureCommissionOfferTool([], inquiry, game);
  const execution = executeToolCalls(game, calls, { playerAction: action });
  assert.equal(execution.results[0].ok, true, execution.results[0].reason);
  resolveTurnProgress(execution.game, action, "low", calls, execution.results, { commissionOnly: true });
  execution.game.turn += 1;
  return execution.game;
}
function request(game, operation, quest = game.quests.find(entry => entry.commission)) {
  const entry = visibleQuestJournal(game).find(entry => entry.questId === quest.id);
  return { id: entry.id, revision: entry.revision, routeId: `commission:${operation}` };
}
function turn(game, operation) {
  const tracking = request(game, operation);
  const plan = inspectQuestTracking(game, tracking);
  assert.equal(plan.ok, true, plan.reason);
  const calls = [{ id: `track:${game.turn + 1}:${operation}`, name: "quest.track", args: tracking, reason: plan.action }];
  const execution = executeToolCalls(game, calls, { questTrackingRequest: tracking, playerAction: plan.action });
  assert.equal(execution.results[0].ok, true, execution.results[0].reason);
  const progress = resolveTurnProgress(execution.game, plan.action, "low", calls, execution.results, { commissionOnly: true, travelOnly: plan.kind === "travel" });
  execution.game.turn += 1;
  return { ...execution, progress, resolution: createTurnResolution(calls, execution.results, progress, execution.game), calls };
}
const accepted = () => turn(quote(), "accept").game;

test("an issued investigation keeps action focus even when its scope mentions the heirloom watch", () => {
  const game = fresh();
  game.triggerState.active.push({ instanceId: "watch-case", definitionId: "watch.heirloom.hidden-note", status: "engaged", stage: "investigate", stageHistory: [], presentation: { title: "家传怀表" } });
  const offered = quote(game, "调查怀表和舅舅失踪的线索");
  assert.equal(offered.questFocus.id, `quest:${offered.quests[0].id}`);
  assert.equal(offered.triggerState.active.find(entry => entry.instanceId === "watch-case").stage, "investigate");
});

test("quick waiting advances an accepted NPC investigation without a second fee or automatic report collection", () => {
  const game = accepted(), commission = structuredClone(game.quests[0].commission);
  const next = resolveSpecialAction(game, { operation: "wait", hours: 24, revision: specialState(game).revision, expectedTurn: game.turn, expectedWorldTime: game.worldTime });
  assert.equal(next.worldTime, commission.dueAt);
  assert.equal(next.quests[0].commission.phase, "ready");
  assert.equal(next.quests[0].commission.dueAt, commission.dueAt);
  assert.equal(next.quests[0].commission.report, null);
  assert.deepEqual(next.money, game.money);
  assert.deepEqual(next.clues, game.clues);
  assert.equal(turn(next, "collect").game.clues.length, 2);
});

test("a commission-only turn cannot claim an unrelated ordinary quest's pending reward", () => {
  const game = fresh();
  const registered = registerQuest(game, { id: "letter", title: "送信支线", status: "engaged", objective: "交还信件",
    contract: { nodes: [{ id: "deliver", objective: "交还信件", conditions: [{ type: "action", terms: ["交还信件"] }] }],
      rewards: [{ type: "money", amountPence: 240 }], rewardClaim: { objective: "领取约定报酬", locationId: game.location.id } } }, 0, "我接受送信委托");
  assert.equal(registered.ok, true, registered.reason);
  const action = "交还信件";
  const completion = resolveQuestAction(game, { instanceId: "quest:letter", actionQuote: action, outcome: "progress", evidence: "实际交付信件", steps: [{ objectiveId: "deliver" }] }, action, 1);
  assert.equal(completion.ok, true, completion.reason);
  game.turn = 1; game.questFocus = { id: "quest:letter" };
  const money = structuredClone(game.money);
  resolveTurnProgress(game, "向委托人领取约定报酬和调查报告", "low", [], [], { commissionOnly: true });
  assert.equal(game.quests[0].stage, "awaiting-reward");
  assert.deepEqual(game.money, money);
});

test("explicit inquiry registers a quote when AI omits it or instead proposes ordinary tasks, payment and clues", () => {
  const game = fresh(), before = structuredClone(game);
  const inquiry = inferCommissionInquiry(game, ACTION);
  assert.equal(inquiry.objective, SCOPE);
  assert.equal(inferCommissionInquiry(game, "让夏洛克帮我寻找舅舅").objective, "寻找舅舅");
  assert.equal(inferCommissionInquiry(game, "委托夏洛克调查昨天发生的失窃").objective, "调查昨天发生的失窃");
  const calls = ensureCommissionOfferTool(normalizeToolCalls([
    { name: "money.remove", args: { amountPence: 240 }, reason: "错误的立即扣费" },
    { name: "quest.add", args: { quest: { id: "wrong", title: "让玩家自己寻找舅舅" } } },
    { name: "clue.add", args: { clue: { id: "premature", title: "未交付报告" } } },
  ], game), inquiry, game);
  assert.deepEqual(calls.map(call => call.name), ["commission.offer"]);
  const result = executeToolCalls(game, calls, { playerAction: ACTION });
  assert.equal(result.results[0].ok, true);
  assert.deepEqual(result.game.money, game.money);
  assert.deepEqual(result.game.clues, game.clues);
  assert.equal(result.game.quests[0].commission.phase, "offered");
  assert.equal(result.game.quests[0].lifecycle, undefined);
  const entry = projectQuestJournal(result.game).issued[0];
  assert.equal(entry.commission.issuer, "player");
  assert.equal(entry.commission.executorId, NPC);
  assert.equal(questAssistance(result.game, entry), null);
  assert.deepEqual(game, before);
  assert.match(buildPlanningContext(game, ACTION, "", { commissionInquiry: inquiry }).at(-1).content, /requestedCommissionInquiry/);
});

test("quotes are gated by a real meeting and validated scope, price and delivery time", () => {
  const input = { npcId: NPC, objective: SCOPE, feePence: 240, durationMinutes: 60 };
  for (const change of [game => delete game.triggerState.facts[`person.${NPC}.met`], game => { game.location.id = "iron-gate"; }, game => { game.character.stats.sanity = 0; }]) {
    const game = fresh(); change(game); const before = structuredClone(game);
    assert.equal(offerCommission(game, input, ACTION).ok, false);
    assert.deepEqual(game, before);
  }
  for (const patch of [{ feePence: -1 }, { feePence: 0.5 }, { durationMinutes: 59 }, { durationMinutes: 10081 }, { objective: "短" }, { npcId: "unknown" }]) assert.equal(offerCommission(fresh(), { ...input, ...patch }, ACTION).ok, false);
  for (const action of ["不想委托夏洛克调查舅舅失踪的线索", "昨天委托夏洛克调查舅舅失踪的线索", "如果委托夏洛克调查舅舅失踪的线索", "明天委托夏洛克调查舅舅失踪的线索", "询问夏洛克如何收费"])
    assert.equal(inferCommissionInquiry(fresh(), action), null, action);
  assert.equal(registerQuest(fresh(), { id: "fake", title: "调查委托", source: "玩家委托" }).ok, false);
});

test("acceptance atomically deducts the agreed fee exactly once; repeated offers do not reset scope or time", () => {
  const offered = quote(), before = moneyToPence(offered.money);
  const stale = request(offered, "accept");
  const next = turn(offered, "accept").game, data = next.quests[0].commission;
  assert.equal(moneyToPence(next.money), before - 240);
  assert.equal(data.acceptedAt, advanceWorldTime(offered.worldTime, 10));
  assert.equal(data.dueAt, advanceWorldTime(data.acceptedAt, 1440));
  assert.equal(data.feePaid, true);
  const snapshot = structuredClone(next);
  assert.equal(resolveQuestTrackingRequest(next, stale).ok, false);
  assert.equal(resolveQuestTrackingRequest(next, request(next, "accept")).ok, false);
  assert.deepEqual(next, snapshot);
  const again = offerCommission(next, { npcId: NPC, objective: SCOPE, feePence: 120, durationMinutes: 60 }, ACTION);
  assert.equal(again.reused, true);
  assert.deepEqual(next, snapshot);
  assert.equal(validateQuestPatch(next.quests[0], { summary: "改为立刻交付" }).ok, false);
});

test("insufficient balance and forged UI requests preserve the commission, wallet and clock", () => {
  const game = quote(); game.money = { pounds: 0, solers: 0, pence: 10 };
  const before = structuredClone(game), tracking = request(game, "accept");
  assert.equal(resolveQuestTrackingRequest(game, tracking).ok, false);
  assert.deepEqual(game, before);
  const execution = executeToolCalls(game, [{ name: "quest.track", args: tracking, reason: "接单" }]);
  assert.equal(execution.results[0].ok, false);
  assert.deepEqual(execution.game.money, before.money);
  assert.equal(execution.game.quests[0].commission.phase, "offered");
});

test("viewing progress is read-only and free; asking in person takes ten minutes without resetting the deadline", () => {
  const game = accepted(), before = structuredClone(game), data = game.quests[0].commission;
  const status = inspectQuestTracking(game, request(game, "status"));
  assert.equal(status.kind, "commission-status");
  assert.equal(resolveQuestTrackingRequest(game, request(game, "status")).kind, "commission-status");
  assert.deepEqual(game, before);
  const asked = turn(game, "check");
  assert.equal(asked.progress.elapsedMinutes, 10);
  assert.equal(asked.game.quests[0].commission.dueAt, data.dueAt);
  assert.deepEqual(asked.game.money, game.money);
  assert.equal(commissionView(asked.game, asked.game.quests[0]).remainingMinutes, 1430);
  const collapsed = structuredClone(game); collapsed.character.stats.health = 0;
  assert.equal(inspectQuestTracking(collapsed, request(collapsed, "status")).ok, true);
});

test("NPC investigation follows calendar time at exact boundaries and stays open through many unrelated turns", () => {
  const start = fresh(); start.worldTime = "1349年 12月31日 · 周一 · 23:40";
  const game = turn(quote(start, SCOPE, 240, 60), "accept").game;
  const quest = game.quests[0], due = quest.commission.dueAt;
  assert.match(due, /1350年 1月1日/);
  assert.equal(commissionView(game, quest).phase, "investigating");
  game.turn = 100;
  const progress = resolveTurnProgress(game, "快进1小时", "low");
  assert.equal(progress.worldTime, due);
  assert.equal(game.quests[0].commission.phase, "ready");
  assert.equal(progress.commissionUpdates[0].phase, "ready");
  assert.equal(projectQuestJournal(game).issued[0].status, "engaged");
  assert.equal(quest.commission.report, null);
  assert.equal(game.clues.length, 0);
});

test("collecting the uncle report grants two persistent actionable leads and known addresses without teleportation or main-story completion", () => {
  let game = fresh();
  const definition = { id: "test.uncle", category: "personal-story", stages: [{ id: "ask", transitions: [{ objectiveId: "ask", actionTerms: ["调查舅舅"], nextStage: "done", complete: true }] }] };
  game.triggerState.active.push({ instanceId: "uncle-case", definitionId: definition.id, definitionSnapshot: definition, status: "engaged", stage: "ask", presentation: { title: "寻找舅舅" }, stageHistory: [] });
  game = turn(quote(game), "accept").game;
  const main = game.triggerState.active.find(entry => entry.instanceId === "uncle-case");
  assert.equal(main.stage, "ask");
  assert.equal(game.quests[0].commission.relatedQuestId, "uncle-case");
  assert.equal(game.questJournal.attempts["uncle-case"], undefined);
  const early = structuredClone(game);
  assert.equal(resolveQuestTrackingRequest(game, request(game, "collect")).ok, false);
  assert.deepEqual(game, early);
  game.worldTime = game.quests[0].commission.dueAt;
  const money = structuredClone(game.money), location = structuredClone(game.location);
  const collected = turn(game, "collect"), report = collected.results[0].data.commissionReport;
  assert.equal(report.clues.length, 2);
  assert.equal(collected.game.clues.length, 2);
  assert.ok(report.clues.every(clue => clue.relatedQuestId === "uncle-case" && clue.title && clue.detail && clue.locationId));
  for (const clue of report.clues) assert.equal(collected.game.locationKnowledge[clue.locationId].status, "discovered");
  assert.deepEqual(collected.game.money, money);
  assert.deepEqual(collected.game.location, location);
  assert.equal(collected.game.triggerState.active.find(entry => entry.instanceId === "uncle-case").stage, "ask");
  assert.equal(collected.game.quests[0].commission.phase, "collected");
  assert.equal(projectQuestJournal(collected.game).archive.some(entry => entry.commission), true);
  const narrative = appendCommissionReport("侦探递来报告。", collected.resolution);
  for (const clue of report.clues) assert.ok(narrative.includes(clue.detail));
  const snapshot = structuredClone(collected.game);
  assert.equal(resolveQuestTrackingRequest(collected.game, request(collected.game, "collect")).ok, false);
  assert.deepEqual(collected.game, snapshot);
});

test("custom investigations return one scope-specific clue; uncollected contents stay out of public context", () => {
  let game = quote(fresh(), "调查邻居遗失信件的投递记录");
  game = turn(game, "accept").game;
  assert.equal(visibleGameState(game).activeQuests[0].commission.report, null);
  game.quests[0].commission.report = { secret: "提前泄露报告" };
  assert.doesNotMatch(JSON.stringify(visibleGameState(game)), /提前泄露报告/);
  game.quests[0].commission.report = null;
  game.worldTime = game.quests[0].commission.dueAt;
  const collected = turn(game, "collect").game;
  assert.equal(collected.quests[0].commission.report.clues.length, 1);
  assert.match(collected.quests[0].commission.report.clues[0].detail, /邻居遗失信件/);
  assert.equal(validateCommissionRecords(collected), collected);
});

test("remote tracking travels before accepting or collecting; arrival never performs the NPC operation", () => {
  const game = quote(); game.location = { id: "iron-gate", name: "东区·铁门街" };
  const money = structuredClone(game.money);
  const travelled = turn(game, "accept");
  assert.equal(travelled.results[0].data.kind, "travel");
  assert.equal(travelled.game.location.id, "minsk-street-15");
  assert.equal(travelled.game.quests[0].commission.phase, "offered");
  assert.deepEqual(travelled.game.money, money);
  const begun = turn(travelled.game, "accept").game;
  begun.worldTime = begun.quests[0].commission.dueAt; begun.location = { id: "iron-gate", name: "东区·铁门街" };
  const returned = turn(begun, "collect").game;
  assert.equal(returned.quests[0].commission.phase, "ready");
  assert.equal(returned.clues.length, 0);
});

test("typed and generated options use the registered commission while ambiguous, future and negative actions remain conversational", () => {
  const game = quote();
  assert.equal(inferCommissionTrackingRequest(game, "确认夏洛克的调查委托并支付调查费用").routeId, "commission:accept");
  assert.equal(inferCommissionTrackingRequest(game, "查看委托进度").routeId, "commission:status");
  assert.equal(inferCommissionTrackingRequest(game, "领取夏洛克的调查报告").routeId, "commission:collect");
  assert.equal(inspectQuestTracking(game, inferCommissionTrackingRequest(game, "领取夏洛克的调查报告")).ok, false);
  for (const action of ["不要领取夏洛克的报告", "明天领取夏洛克的报告", "是否取消夏洛克的委托", "昨天支付夏洛克的调查费用"])
    assert.equal(inferCommissionTrackingRequest(game, action), null);
  const second = quote(game, "调查邻居失踪的情况");
  assert.throws(() => inferCommissionTrackingRequest(second, "领取夏洛克的调查报告"), /多项调查委托/);
  assert.equal(inferCommissionTrackingRequest(second, `查看「${second.quests[0].title}」的委托进度`).id, `quest:${second.quests[0].id}`);
});

test("cancelling is recorded with no second charge or false refund and preserves the original investigation", () => {
  for (const paid of [false, true]) {
    const game = paid ? accepted() : quote(), money = structuredClone(game.money);
    const next = turn(game, "cancel").game;
    assert.deepEqual(next.money, money);
    assert.equal(next.quests[0].commission.phase, "cancelled");
    assert.equal(next.clues.length, 0);
    assert.match(next.quests[0].commission.history.at(-1).note, paid ? /不退还/ : /未扣费/);
  }
});

test("a fresh commission after cancellation retains the old record and starts with a separate unpaid quote", () => {
  const ended = turn(quote(), "cancel").game, old = structuredClone(ended.quests[0]);
  const renewed = quote(ended);
  assert.equal(renewed.quests.length, 2);
  assert.deepEqual(renewed.quests[0], old);
  assert.notEqual(renewed.quests[1].id, old.id);
  assert.equal(renewed.quests[1].commission.phase, "offered");
  assert.equal(renewed.quests[1].commission.feePaid, false);
  assert.equal(inferCommissionTrackingRequest(renewed, "确认夏洛克的调查委托").id, `quest:${renewed.quests[1].id}`);
});

test("old narrative-only commissions can be explicitly restored without paying or consuming a turn, and cannot reset existing progress", () => {
  const game = fresh(); game.recentDialogues.push({ role: "assistant", content: "侦探已接受寻找舅舅的委托，费用已经结清。" });
  const before = structuredClone(game), restore = { npcId: NPC, objective: SCOPE, feePence: 240, remainingMinutes: 120, acceptedAndPaid: true };
  assert.equal(projectQuestJournal(game).issued.length, 0);
  const repaired = restoreCommissionRecord(game, restore);
  assert.equal(repaired.ok, true, repaired.reason);
  assert.deepEqual(game, before);
  assert.deepEqual(repaired.game.money, game.money);
  assert.equal(repaired.game.turn, game.turn);
  assert.equal(repaired.game.worldTime, game.worldTime);
  assert.equal(repaired.game.quests[0].commission.phase, "investigating");
  assert.equal(repaired.game.quests[0].commission.paymentSource, "player-restored");
  assert.equal(restoreCommissionRecord(repaired.game, { ...restore, remainingMinutes: 0 }).game.quests[0].commission.dueAt, repaired.game.quests[0].commission.dueAt);
  assert.equal(restoreCommissionRecord(game, { ...restore, acceptedAndPaid: false }).ok, false);
  const due = restoreCommissionRecord(game, { ...restore, remainingMinutes: 0 }).game;
  assert.equal(due.quests[0].commission.phase, "ready");
  assert.equal(validateCommissionRecords(due), due);
  assert.equal(turn(due, "collect").game.clues.length, 2);
});

test("legacy quests already labelled player commissions remain loadable and can gain a separate tracked NPC record", () => {
  const old = fresh();
  old.quests.push({ id: "legacy-npc-inquiry", source: "玩家委托", title: "委托夏洛克寻找舅舅", objective: "等待侦探消息", status: "active" });
  const loaded = migrateSave(old);
  assert.equal(loaded.quests[0].id, "legacy-npc-inquiry");
  const original = structuredClone(loaded.quests[0]);
  const restored = restoreCommissionRecord(loaded, { npcId: NPC, objective: SCOPE, feePence: 240, remainingMinutes: 0, acceptedAndPaid: true, relatedQuestId: "quest:legacy-npc-inquiry" });
  assert.equal(restored.ok, true, restored.reason);
  assert.deepEqual(restored.game.quests[0], original);
  assert.equal(projectQuestJournal(restored.game).issued.length, 1);
  assert.equal(restored.game.quests[1].commission.relatedQuestId, "quest:legacy-npc-inquiry");
});

test("commission clocks, reports, clue ids and payment proof survive save/reload/import; malformed reports cannot replace a save", async t => {
  const values = new Map(), previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "localStorage", previous); else delete globalThis.localStorage; });
  const game = accepted(), record = structuredClone(game.quests[0].commission);
  saveGame(game);
  assert.deepEqual(loadGame("autosave").quests[0].commission, record);
  const due = migrateSave({ ...game, worldTime: record.dueAt });
  assert.equal(due.quests[0].commission.phase, "ready");
  assert.equal(migrateSave(due).quests[0].commission.revision, due.quests[0].commission.revision);
  const collected = turn(due, "collect").game;
  collected.apiKey = "must-not-export";
  saveGame(collected);
  assert.doesNotMatch(values.get("mist-chronicle-saves-v1"), /must-not-export/);
  const imported = await importSave({ text: async () => JSON.stringify({ game: collected }) });
  assert.deepEqual(imported.quests[0].commission.report, collected.quests[0].commission.report);
  assert.deepEqual(imported.clues.map(clue => clue.id), collected.clues.map(clue => clue.id));
  assert.equal(imported.apiKey, undefined);
  const cabinet = new Map(values), invalid = structuredClone(collected);
  invalid.quests[0].commission.report.clues = [];
  await assert.rejects(importSave({ text: async () => JSON.stringify({ game: invalid }) }), /玩家委托记录/);
  assert.deepEqual(values, cabinet);
});
