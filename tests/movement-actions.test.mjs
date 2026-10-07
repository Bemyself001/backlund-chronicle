import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER } from "../src/system/game.js";
import { executeToolCalls, normalizeToolCalls } from "../src/engine/tools.js";
import { resolveTurnProgress } from "../src/engine/turn.js";
import { ensureMapMoveToolCall, inferMapDestination } from "../src/services/mapTravel.js";
import { buildPlanningContext, buildRenderingContext } from "../src/services/memory.js";
import { createTurnResolution } from "../src/services/turnResolution.js";
import { actionRequest, retryRequest } from "../src/services/actionRequest.js";
import { registerQuest, acceptOrdinaryQuest } from "../src/engine/questLifecycle.js";

const fresh = () => createInitialGame({ ...EMPTY_CHARACTER, name: "行动选项回归" });

test("travel choice labels resolve full names, shortened names and transport wording", () => {
  const game = fresh();
  const before = structuredClone(game);
  for (const [action, expected] of [
    ["前往桥区·雾鸦旅店", "soot-lamp"], ["乘公共马车前往雾鸦旅店", "soot-lamp"],
    ["前往乔伍德区公共图书馆查阅资料", "queen-library"], ["去图书馆", "queen-library"],
    ["从雾鸦旅店返回桥区的铁门街", "iron-gate"], ["进入「明斯克街15号」", "minsk-street-15"],
    ["暂不前往图书馆，改为前往铁门街", "iron-gate"],
  ]) assert.equal(inferMapDestination(game, action)?.id, expected, action);
  assert.deepEqual(game, before);
});

test("route questions, negation, history, future plans and multiple destinations do not auto-travel", () => {
  const game = fresh();
  for (const action of [
    "询问老板前往雾鸦旅店的路线", "查询前往图书馆的路线", "我不想现在前往图书馆",
    "暂不前往雾鸦旅店", "如果前往雾鸦旅店", "昨天前往雾鸦旅店", "去过雾鸦旅店",
    "明天前往图书馆", "准备前往图书馆", "考虑前往雾鸦旅店", "能否前往雾鸦旅店？",
    "跳过前往雾鸦旅店的步骤", "前往图书馆之前先问路", "前往图书馆或雾鸦旅店",
    "前往图书馆，再去雾鸦旅店", "前往灰墙公寓", "前往未知的咖啡馆",
  ]) assert.equal(inferMapDestination(game, action), null, action);
});

test("an omitted AI movement still reaches the selected location with exact route timing and rendering facts", () => {
  const before = fresh();
  before.worldTime = "1349年 10月17日 · 周二 · 23:50";
  const action = "乘公共马车跨区前往雾鸦旅店";
  const destination = inferMapDestination(before, action);
  const calls = ensureMapMoveToolCall([], destination, 1, before);
  const execution = executeToolCalls(before, calls, { playerAction: action });
  assert.ok(execution.results.every(result => result.ok));
  const progress = resolveTurnProgress(execution.game, action, "low", calls, execution.results);
  const resolution = createTurnResolution(calls, execution.results, progress, execution.game);
  assert.equal(execution.game.location.id, "soot-lamp");
  assert.equal(execution.game.locationKnowledge["soot-lamp"].status, "visited");
  assert.equal(resolution.accepted[0].data.locationId, "soot-lamp");
  assert.equal(progress.elapsedMinutes, 48);
  assert.equal(progress.worldTime, "1349年 10月18日 · 周三 · 00:38");
  assert.equal(before.location.id, "east-station");
  const planning = buildPlanningContext(before, action, "");
  assert.match(planning.at(-1).content, /"requestedMapDestination":\{"id":"soot-lamp"/);
  const messages = buildRenderingContext(before, execution.game, action, "", resolution);
  const data = JSON.parse(messages.at(-1).content.split("\n")[1]);
  assert.equal(data.visibleStateAfter.location.id, "soot-lamp");
  assert.equal(data.visibleStateAfter.worldTime, progress.worldTime);
});

test("explicit travel removes conflicting, duplicate and malformed AI movements and survives repair/retry", () => {
  const game = fresh();
  const destination = inferMapDestination(game, "前往雾鸦旅店");
  const proposed = normalizeToolCalls([
    { name: "location.move", arguments: "{broken", argsInvalid: true },
    { name: "location.move", args: { locationId: "queen-library" } },
    { name: "location.move", args: { locationId: "soot-lamp" } },
  ], game);
  const repaired = ensureMapMoveToolCall(proposed, destination, 1, game);
  assert.equal(repaired.length, 1);
  assert.deepEqual(repaired[0].args, { locationId: "soot-lamp" });
  assert.equal(executeToolCalls(game, repaired).results[0].ok, true);
  const request = actionRequest("前往雾鸦旅店", { mapDestination: destination });
  const retry = retryRequest(request);
  assert.equal(retry.options.mapDestination.id, destination.id);
  assert.equal(executeToolCalls(game, ensureMapMoveToolCall([], retry.options.mapDestination, 1, game)).game.location.id, destination.id);
  assert.deepEqual(ensureMapMoveToolCall(repaired, destination, 1, game), repaired);
});

test("local movement runs before a task step that requires arrival", () => {
  const game = fresh();
  const registered = registerQuest(game, { id: "arrival", title: "到旅店交信", objective: "将信交到旅店",
    contract: { nodes: [{ id: "deliver", objective: "交付信件", conditions: [
      { type: "location", locationId: "soot-lamp" }, { type: "action", terms: ["交付信件"] },
    ] }] } }, 0);
  assert.equal(registered.ok, true, registered.reason);
  assert.equal(acceptOrdinaryQuest(game, registered.quest, 0).ok, true);
  const action = "前往雾鸦旅店交付信件";
  const task = { name: "quest.resolve", args: { instanceId: "quest:arrival", actionQuote: action,
    outcome: "progress", evidence: "到达旅店并将信交给收件人", steps: [{ objectiveId: "deliver" }] } };
  const calls = ensureMapMoveToolCall([task], inferMapDestination(game, action), 1, game);
  const execution = executeToolCalls(game, calls, { playerAction: action });
  assert.ok(execution.results.every(result => result.ok), JSON.stringify(execution.results));
  assert.equal(execution.game.quests.find(quest => quest.id === "arrival").status, "completed");
  const progress = resolveTurnProgress(execution.game, action, "low", calls, execution.results);
  assert.ok(progress.elapsedMinutes >= execution.results[0].data.travelMinutes);
});

test("travel to the current location is a no-op rather than a rejected or duplicated movement", () => {
  const game = fresh();
  const destination = inferMapDestination(game, "回到贝克兰德火车站");
  assert.equal(destination.id, game.location.id);
  const calls = ensureMapMoveToolCall([{ name: "location.move", args: { locationId: destination.id } }], destination, 1, game);
  assert.deepEqual(calls, []);
});

test("dynamic known locations resolve by name and duplicate short names remain ambiguous", () => {
  const game = fresh();
  const location = { name: "红烟囱药材铺", district: "桥区", anchorId: "iron-gate", kind: "shop", scope: "landmark",
    status: "discovered", rumor: "铁门街上据说有一家红烟囱药材铺。", description: "从铁门街取得可靠地址的药材店。" };
  const grown = executeToolCalls(game, [{ name: "location.grow", args: { location }, reason: "确认药材铺地址" }]);
  assert.ok(grown.results[0].ok, grown.results[0].reason);
  assert.equal(inferMapDestination(grown.game, "前往红烟囱药材铺").id, grown.results[0].data.locationId);
  const duplicate = executeToolCalls(grown.game, [{ name: "location.grow", args: { location: {
    ...location, name: "公共图书馆", district: "桥区", scope: "interior",
  } }, reason: "确认另一间图书馆地址" }]);
  assert.ok(duplicate.results[0].ok, duplicate.results[0].reason);
  assert.equal(inferMapDestination(duplicate.game, "前往公共图书馆"), null);
  assert.equal(inferMapDestination(duplicate.game, "前往乔伍德区公共图书馆").id, "queen-library");
});
