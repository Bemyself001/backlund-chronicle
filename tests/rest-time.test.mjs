import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { restMinutes, timedAction } from "../src/engine/restTime.js";
import { resolveTurnProgress, minutesForTurn } from "../src/engine/turn.js";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { buildPlanningContext, buildRenderingContext, buildFastPresentationContext } from "../src/services/memory.js";
import { createTurnResolution } from "../src/services/turnResolution.js";

const late = "1349年 12月31日 · 周日 · 23:20";
test("rest defaults and explicit Chinese or numeric durations", () => {
  for (const [action, expected] of [
    ["休息", 60], ["躺下休息一下", 60], ["睡觉", 480], ["入睡", 480], ["过夜", 480],
    ["休息两小时", 120], ["休息2小时30分钟", 150], ["休息一个半小时", 90],
    ["睡两个半小时", 150], ["休息半小时", 30], ["睡半个小时", 30],
    ["睡觉1.5小时", 90], ["休息十五分钟", 15], ["休息一百二十分钟", 120],
    ["睡8小时", 480], ["睡一个小时", 60], ["休息两小时半", 150],
  ]) assert.equal(restMinutes(action, late), expected, action);
});

test("rest end times use the actual clock and roll across dates", () => {
  for (const [action, clock, expected] of [
    ["睡到天亮", late, 400], ["睡到明早七点", late, 460],
    ["休息到明天早上7:30", late, 490],
    ["睡到天亮", "1349年 10月17日 · 周二 · 02:00", 240],
    ["睡到天亮", "1349年 10月17日 · 周二 · 06:00", 1440],
    ["睡到七点半", "1349年 10月17日 · 周二 · 02:00", 330],
    ["睡到明早七点", "1349年 10月17日 · 周二 · 02:00", 1740],
    ["休息到下午三点", "1349年 10月17日 · 周二 · 13:00", 120],
  ]) assert.equal(restMinutes(action, clock), expected, action + clock);
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "休息验证" });
  game.worldTime = late;
  const progress = resolveTurnProgress(game, "睡到天亮", "low");
  assert.equal(progress.elapsedMinutes, 400);
  assert.equal(progress.worldTime, "1350年 1月1日 · 周一 · 06:00");
  assert.equal(createTurnResolution([], [], progress).derivedEffects.worldTime, progress.worldTime);
});

test("unrelated, historical and negated rest text does not cause a time jump", () => {
  for (const action of ["不休息，继续调查", "不要睡觉", "我昨晚睡了八小时", "询问旅店老板能否休息", "购买两小时车程的车票", "整理装备"]) {
    assert.equal(restMinutes(action, late), null, action);
  }
  assert.equal(minutesForTurn("调查房间"), 25);
  assert.equal(minutesForTurn("前往已知地点", [{ name: "location.move" }], [{ ok: true, data: { travelMinutes: 27 } }], late), 27);
});

test("local fixed action timing still overrides generic rest detection", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "固定耗时" });
  game.worldTime = late;
  assert.equal(resolveTurnProgress(game, "休息", "low", [], [], { elapsedMinutes: 5 }).elapsedMinutes, 5);
});

test("planning and final narration share local timing and rest skips speculative streaming", async () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "叙事时钟" });
  game.worldTime = late;
  const planning = buildPlanningContext(game, "休息两小时", "");
  assert.match(planning.at(-1).content, /"plannedRestTime":\{"elapsedMinutes":120,"worldTime":"1350年 1月1日 · 周一 · 01:20"/);
  const progress = resolveTurnProgress(structuredClone(game), "休息两小时", "low");
  const resolution = createTurnResolution([], [], progress);
  const after = { ...game, worldTime: progress.worldTime };
  for (const messages of [planning, buildRenderingContext(game, after, "休息两小时", "", resolution), buildFastPresentationContext(game, "休息", "")]) {
    assert.ok(messages.some((message) => message.content.includes("【时间一致性】")));
  }
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /const fastMode = .*timedAction\(action, game.worldTime\) === null/);
});

test("sleep, rest and waiting share complete duration and end-time parsing", () => {
  for (const [action, kind, minutes] of [
    ["睡眠", "sleep", 480], ["睡", "sleep", 480], ["整夜休息", "sleep", 480],
    ["休息，直到明天早上", "rest", 400], ["休息，睡到明早", "sleep", 400],
    ["等待3小时", "wait", 180], ["等两个半小时", "wait", 150],
    ["等待，直到明早七点半", "wait", 490], ["睡到后天早上六点", "sleep", 1840],
    ["休息2天", "rest", 2880], ["小睡二十分钟", "sleep", 20],
    ["等待片刻", "wait", 5], ["等候", "wait", 5],
    ["睡眠八小时", "sleep", 480], ["休息大概三个小时", "rest", 180],
    ["睡到自然醒", "sleep", 480], ["等到明天", "wait", 400],
    ["不是休息，而是等待三小时", "wait", 180],
  ]) {
    const timing = timedAction(action, late);
    assert.equal(timing?.kind, kind, action);
    assert.equal(timing?.elapsedMinutes, minutes, action);
    assert.equal(minutesForTurn(action, [], [], late), minutes, action);
    if (kind === "wait") assert.equal(restMinutes(action, late), null, action);
  }
  assert.equal(timedAction("等到中午十一点", "1349年 10月17日 · 周二 · 10:00").elapsedMinutes, 60);
  for (const action of ["不要等待", "不打算休息", "不想再去休息", "询问老板能否睡觉", "如果睡到明早", "查看休息室", "询问睡眠不足的男人"]) {
    assert.equal(timedAction(action, late), null, action);
  }
});

test("timed action completion and local interruption are explicit in final settlement", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "完整休息" });
  const completed = resolveTurnProgress(structuredClone(game), "睡眠八小时", "low");
  assert.equal(completed.timedAction.status, "completed");
  assert.equal(completed.elapsedMinutes, 480);
  const interrupted = resolveTurnProgress(structuredClone(game), "等待3小时", "low", [], [{ ok: true, log: "交接人员已抵达", data: { taskMinutes: 60 } }]);
  assert.equal(interrupted.elapsedMinutes, 60);
  assert.equal(interrupted.timedAction.status, "interrupted");
  assert.equal(interrupted.timedAction.interruptionReason, "交接人员已抵达");
  assert.deepEqual(createTurnResolution([], [], interrupted).derivedEffects.timedAction, interrupted.timedAction);
  const rejected = resolveTurnProgress(structuredClone(game), "等待3小时", "low", [], [{ ok: false, data: { taskMinutes: 60 } }]);
  assert.equal(rejected.elapsedMinutes, 180);
  const pending = resolveTurnProgress(structuredClone(game), "等待直到客人抵达", "low");
  assert.equal(pending.timedAction.status, "pending");
  const arrived = resolveTurnProgress(structuredClone(game), "等待直到客人抵达", "low", [], [{ ok: true, log: "客人抵达", data: { taskMinutes: 30 } }]);
  assert.equal(arrived.timedAction.status, "completed");
  assert.equal(resolveTurnProgress(structuredClone(game), "睡到自然醒", "low").timedAction.status, "completed");
});

test("time-skip choices settle explicit durations and calendar targets without being treated as rest", () => {
  for (const [action, expected] of [
    ["跳过时间到明天早上六点", 400], ["快进到明早", 400], ["直接跳到次日上午九点", 580],
    ["时间推进至第二天中午", 760], ["把时间快进到后天晚上八点半", 2710],
    ["跳过时间到明天", 400], ["跳转到翌日早晨", 400], ["快进2小时", 120],
    ["推进时间半小时", 30], ["跳过三个半小时", 210], ["跳过时间，直到明早七点半", 490],
  ]) {
    const timing = timedAction(action, late);
    assert.equal(timing?.kind, "skip", action);
    assert.equal(timing.elapsedMinutes, expected, action);
    assert.equal(minutesForTurn(action, [], [], late), expected, action);
    assert.equal(restMinutes(action, late), null, action);
  }
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "跳时回归" });
  game.worldTime = late;
  game.location = { id: "soot-lamp", name: "桥区·雾鸦旅店" };
  game.character.stats.health -= 2;
  game.character.stats.sanity -= 2;
  const progress = resolveTurnProgress(structuredClone(game), "跳过时间到明天早上六点", "low");
  assert.equal(progress.elapsedMinutes, 400);
  assert.equal(progress.worldTime, "1350年 1月1日 · 周一 · 06:00");
  assert.equal(progress.timedAction.status, "completed");
  assert.deepEqual(progress.restRecovery, []);
  const taskResult = { ok: true, data: { taskMinutes: 20 }, log: "普通调查已完成" };
  const withTask = resolveTurnProgress(structuredClone(game), "跳过时间到明天早上六点", "low", [], [taskResult]);
  assert.equal(withTask.worldTime, progress.worldTime);
  assert.equal(withTask.timedAction.status, "completed");
  const planning = buildPlanningContext(game, "跳过时间到明天早上六点", "");
  const data = JSON.parse(planning.at(-1).content.split("\n")[1]);
  assert.equal(data.plannedTimedAction.worldTime, progress.worldTime);
  assert.equal(data.plannedRestTime, null);
});

test("negated, historical, hypothetical or non-temporal skip text does not jump time", () => {
  for (const action of ["不要快进到明天", "不想现在快进到明天", "不跳过时间", "询问是否跳过两小时", "如果跳到明早", "昨天快进到晚上", "跳过这个话题", "跳过前往旅店的步骤", "考虑跳过时间到明天"]) {
    assert.equal(timedAction(action, late), null, action);
  }
});
