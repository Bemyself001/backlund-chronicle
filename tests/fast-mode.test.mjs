import assert from "node:assert/strict";
import test from "node:test";
import { finalizeFastPresentation, launchFastModeTasks, throwIfFastTaskAborted } from "../src/services/fastMode.js";
import { buildFastNarrativeContinuationContext } from "../src/services/memory.js";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { resolveTurnProgress } from "../src/engine/turn.js";
import { createTurnResolution } from "../src/services/turnResolution.js";

test("a tool-free fast turn corrects the entire stale draft against the settled clock", async () => {
  const before = createInitialGame({ ...EMPTY_CHARACTER, name: "快速时钟" });
  before.worldTime = "1349年 10月17日 · 周二 · 23:55";
  const after = structuredClone(before);
  const progress = resolveTurnProgress(after, "观察周围", "low");
  const resolution = createTurnResolution([], [], progress, after);
  const draft = { hasNarrative: true, narrative: "周二的凌晨，你观察完了站台。", choices: [{ label: "继续观察" }] };
  let calls = 0;
  const final = await finalizeFastPresentation(draft, resolution, async (text, settled) => {
    calls++;
    assert.equal(text, draft.narrative);
    assert.equal(settled.derivedEffects.worldTime, "1349年 10月18日 · 周三 · 00:20");
    const messages = buildFastNarrativeContinuationContext(before, after, "观察周围", text, "", settled);
    assert.match(messages.at(-1).content, /周三 · 00:20/);
    assert.ok(messages.some(message => /此文本将替换草稿/.test(message.content)));
    return { hasNarrative: true, narrative: "午夜已过，你在周三零点二十分结束观察。" };
  });
  assert.equal(calls, 1);
  assert.doesNotMatch(final.narrative, /周二/);
  assert.match(final.narrative, /周三/);
  assert.deepEqual(final.choices, []);
  assert.equal(draft.choices.length, 1);
});

test("failed fast correction requires full rendering instead of committing the draft", async () => {
  const draft = { narrative: "未经结算的旧时间", hasNarrative: true };
  assert.equal(await finalizeFastPresentation(draft, {}, async () => ({ hasNarrative: false })), null);
  assert.equal(await finalizeFastPresentation(draft, {}, async () => ({ hasNarrative: true, narrative: " " })), null);
  await assert.rejects(finalizeFastPresentation(draft, {}, async () => { throw new DOMException("取消", "AbortError"); }), { name: "AbortError" });
});

test("fast mode tasks launch together and settle independently", async () => {
  const started = [];
  let releasePlanning;
  let releasePresentation;
  const planningGate = new Promise((resolve) => { releasePlanning = resolve; });
  const presentationGate = new Promise((resolve) => { releasePresentation = resolve; });
  const tasks = launchFastModeTasks({
    planning: async () => { started.push("planning"); await planningGate; return "plan"; },
    presentation: async () => { started.push("presentation"); await presentationGate; return "draft"; },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["planning", "presentation"]);

  releasePlanning();
  assert.deepEqual(await tasks.planning, { status: "fulfilled", value: "plan", error: null });
  releasePresentation();
  assert.deepEqual(await tasks.presentation, { status: "fulfilled", value: "draft", error: null });
});

test("one failed fast mode task does not discard the other result", async () => {
  const tasks = launchFastModeTasks({
    planning: async () => { throw new Error("planner unavailable"); },
    presentation: async () => ({ narrative: "雨还在下。" }),
  });
  const [planning, presentation] = await Promise.all([tasks.planning, tasks.presentation]);

  assert.equal(planning.status, "rejected");
  assert.match(planning.error.message, /planner unavailable/);
  assert.equal(presentation.value.narrative, "雨还在下。");
  assert.doesNotThrow(() => throwIfFastTaskAborted(planning, presentation));
});

test("aborted fast mode tasks still abort the whole turn", async () => {
  const abortError = new Error("cancelled");
  abortError.name = "AbortError";
  const tasks = launchFastModeTasks({
    planning: async () => { throw abortError; },
    presentation: async () => ({ narrative: "不会提交的草稿" }),
  });
  const outcomes = await Promise.all([tasks.planning, tasks.presentation]);

  assert.throws(() => throwIfFastTaskAborted(outcomes), { name: "AbortError" });
});
