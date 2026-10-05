import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { publicStateChanges, updateMemory } from "../src/services/memory.js";
import { applyMemorySummary, createMemorySummaryJob, mergeLatestMemory } from "../src/services/memoryState.js";

const emptyContext = { entries: [], missing: [], truncated: false };

function completeTurn(game) {
  const turn = game.turn + 1;
  return { ...game, turn, ...updateMemory(game, `行动${turn}`, `确认第${turn}轮事件`) };
}

test("a foreground turn preserves a digest completed after its original snapshot", () => {
  let snapshot = createInitialGame({ ...EMPTY_CHARACTER, name: "并发摘要检查员" });
  for (let index = 0; index < 10; index += 1) snapshot = completeTurn(snapshot);
  const job = createMemorySummaryJob(snapshot);
  const current = applyMemorySummary(snapshot, job, { people: [], events: [{ summary: "前十轮事件已经整理", certainty: "confirmed", sourceTurns: [1, 10] }], openThreads: [] });
  const next = completeTurn(snapshot);
  const beforeCurrent = JSON.stringify(current);
  const merged = mergeLatestMemory(next, current);
  assert.equal(merged.memoryState.revision, 1);
  assert.equal(merged.memoryState.throughTurn, 10);
  assert.deepEqual(merged.memoryState.pending.map(item => item.turn), [11]);
  assert.equal(merged.longTermSummary, current.longTermSummary);
  assert.equal(merged.storyHistory, next.storyHistory);
  assert.equal(merged.recentDialogues, next.recentDialogues);
  assert.equal(merged.character, next.character);
  assert.equal(JSON.stringify(current), beforeCurrent);
  assert.equal(mergeLatestMemory(next, { ...current, id: "other-save" }), next);
  assert.equal(mergeLatestMemory(snapshot, { ...current, turn: 12 }), snapshot);
});

test("memory merge retains a newer foreground digest and does not revive consumed episodes", () => {
  let current = createInitialGame({ ...EMPTY_CHARACTER, name: "摘要优先级检查员" });
  for (let index = 0; index < 10; index += 1) current = completeTurn(current);
  const job = createMemorySummaryJob(current);
  const next = applyMemorySummary(completeTurn(current), job, { people: [], events: [{ summary: "已归纳前十轮", certainty: "confirmed", sourceTurns: [1, 10] }], openThreads: [] });
  const merged = mergeLatestMemory(next, current);
  assert.equal(merged.memoryState.revision, 1);
  assert.equal(merged.memoryState.throughTurn, 10);
  assert.deepEqual(merged.memoryState.pending.map(item => item.turn), [11]);
  assert.equal(merged.longTermSummary, next.longTermSummary);
});

test("crossing the clue projection limit does not claim existing clues were removed", () => {
  const before = createInitialGame({ ...EMPTY_CHARACTER, name: "差分检查员" });
  before.clues = Array.from({ length: 12 }, (_, index) => ({ id: `clue-${index}`, title: `旧线索${index}`, detail: `已确认记录${index}` }));
  const after = { ...before, clues: [...before.clues, { id: "new-clue", title: "新线索", detail: "本轮新发现" }] };
  const changes = publicStateChanges(before, after, "继续观察", emptyContext);
  assert.deepEqual(changes.knownClues.removed, []);
  assert.deepEqual(changes.knownClues.added.map(entry => entry.id), ["new-clue"]);
});

test("completed quests report a real status update instead of a projection removal", () => {
  const before = createInitialGame({ ...EMPTY_CHARACTER, name: "任务差分检查员" });
  before.quests = [{ id: "quest-example", title: "调查委托", status: "active", description: "调查街道" }];
  const after = { ...before, quests: [{ ...before.quests[0], status: "completed" }] };
  const changes = publicStateChanges(before, after, "结束调查", emptyContext);
  assert.deepEqual(changes.activeQuests.removed, []);
  assert.equal(changes.activeQuests.updated[0].fields.status.after, "completed");
});
