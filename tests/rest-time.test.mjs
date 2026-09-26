import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { restMinutes } from "../src/engine/restTime.js";
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
  assert.match(app, /const fastMode = .*restMinutes\(action, game.worldTime\) === null/);
});
