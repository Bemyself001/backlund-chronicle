import assert from "node:assert/strict";
import test from "node:test";
import { launchFastModeTasks, throwIfFastTaskAborted } from "../src/services/fastMode.js";

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
