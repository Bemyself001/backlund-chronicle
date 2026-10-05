import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, DEFAULT_SYSTEM_PROMPT, EMPTY_CHARACTER } from "../src/system/game.js";
import { HISTORY_WINDOW_CHARS, historyWindow } from "../src/services/contextWindow.js";
import { buildPlanningContext, buildRenderingContext, buildFastPresentationContext, buildFastNarrativeContinuationContext, promptGameState, publicStateChanges, visibleGameState } from "../src/services/memory.js";
import { finalizeFastPresentation } from "../src/services/fastMode.js";

function sample(turn = 6) {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "缓存测试" });
  game.turn = turn;
  game.storyHistory = Array.from({ length: turn }, (_, i) => [
    { id: `u${i}`, turn: i + 1, role: "user", content: `第${i + 1}次调查门锁。` },
    { id: `a${i}`, turn: i + 1, role: "assistant", content: `你记录了第${i + 1}处门锁痕迹。` },
  ]).flat();
  game.recentDialogues = game.storyHistory.slice(-10);
  return game;
}
const payload = messages => JSON.parse(messages.at(-1).content.split("\n")[1]);

test("every fixed instruction precedes history and planning/rendering share their common prefix", () => {
  const game = sample();
  const builders = [buildPlanningContext(game, "调查", DEFAULT_SYSTEM_PROMPT), buildFastPresentationContext(game, "调查", DEFAULT_SYSTEM_PROMPT),
    buildRenderingContext(game, game, "调查", DEFAULT_SYSTEM_PROMPT, {}), buildFastNarrativeContinuationContext(game, game, "调查", "草稿", DEFAULT_SYSTEM_PROMPT, {})];
  for (const messages of builders) {
    const firstData = messages.findIndex(message => message.role !== "system");
    assert.ok(firstData > 5);
    assert.equal(messages.slice(firstData).some(message => message.role === "system"), false);
    assert.equal(messages.filter(message => message.content.includes("【不可信历史记忆")).length, 1);
  }
  assert.deepEqual(builders[0].slice(0, 9), builders[2].slice(0, 9));
});

test("history appends inside a segment instead of dropping the oldest turn every round", () => {
  const before = sample(6), after = sample(7);
  const old = historyWindow(before), next = historyWindow(after);
  assert.equal(old.firstTurn, next.firstTurn);
  assert.deepEqual(next.messages.slice(0, old.messages.length), old.messages);
  assert.deepEqual(before.storyHistory.map(entry => entry.content), old.messages.map(entry => entry.content));
  const moved = historyWindow(sample(11));
  assert.equal(moved.firstTurn, 9);
  assert.match(moved.messages.at(-1).content, /第11处/);
});

test("long and legacy histories are bounded without modifying the saved story", () => {
  const game = sample(500);
  game.storyHistory.forEach(message => { message.content += "长篇剧情".repeat(1500); });
  const snapshot = JSON.stringify(game);
  const selected = historyWindow(game);
  assert.ok(JSON.stringify(selected.messages).length <= HISTORY_WINDOW_CHARS);
  assert.match(selected.messages.at(-1).content, /第500处/);
  assert.equal(JSON.stringify(game), snapshot);
  const legacy = { turn: 0, recentDialogues: [{ role: "assistant", content: "\u0000".repeat(9000) }] };
  assert.ok(JSON.stringify(historyWindow(legacy).messages).length <= HISTORY_WINDOW_CHARS);
});

test("final narrative carries current state and exact changes instead of two full snapshots", () => {
  const before = sample(), after = structuredClone(before);
  after.character.stats.health -= 2;
  after.money.pounds += 1;
  after.worldTime = "1349年 10月18日 · 周三 · 00:20";
  const result = payload(buildRenderingContext(before, after, "检查伤势", DEFAULT_SYSTEM_PROMPT, { accepted: [], rejected: [] }));
  assert.equal(result.visibleStateBefore, undefined);
  assert.equal(result.visibleStateAfter.character.stats.health, after.character.stats.health);
  assert.deepEqual(result.stateChanges.character.stats, { before: before.character.stats, after: after.character.stats });
  assert.equal(result.stateChanges.inventory, undefined);
  const original = JSON.stringify({ visibleStateBefore: visibleGameState(before), visibleStateAfter: visibleGameState(after) }).length;
  assert.ok(JSON.stringify({ visibleStateAfter: result.visibleStateAfter, stateChanges: result.stateChanges }).length < original * .7);
});

test("inventory deltas preserve one removal and one change without copying the entire bag", () => {
  const before = sample(), after = structuredClone(before);
  const removed = after.inventory.pop();
  after.inventory[0].quantity += 1;
  const change = publicStateChanges(before, after);
  assert.equal(change.inventory.removed[0].instanceId, removed.instanceId);
  assert.deepEqual(change.inventory.updated[0].fields.quantity, { before: before.inventory[0].quantity, after: after.inventory[0].quantity });
});

test("long clue lists select current relevant evidence and retain potion recipes", () => {
  const game = sample();
  game.clues = Array.from({ length: 30 }, (_, index) => ({ id: `clue-${index}`, title: `调查档案${index}`, detail: `第${index}处调查记录` }));
  game.clues[1] = { id: "potion-recipe", title: "魔药配方", kind: "potion_recipe" };
  const state = promptGameState(game, "查看调查档案5", "rendering");
  assert.ok(state.knownClues.some(entry => entry.id === "clue-5"));
  assert.ok(state.knownClues.some(entry => entry.id === "potion-recipe"));
  assert.ok(state.knownClues.length < game.clues.length);
  assert.equal(game.clues.length, 30);
});

test("portrait bytes never enter prompts or public changes", () => {
  const game = sample();
  game.character.avatar = "PRIVATE_PORTRAIT_BYTES".repeat(2000);
  const before = structuredClone(game);
  game.character.avatar = "NEW_PRIVATE_PORTRAIT_BYTES";
  assert.equal(publicStateChanges(before, game).character, undefined);
  assert.doesNotMatch(JSON.stringify(buildPlanningContext(game, "观察", DEFAULT_SYSTEM_PROMPT)), /PRIVATE_PORTRAIT_BYTES/);
});

test("fast finalization keeps fresh final choices and does not reuse draft choices", async () => {
  const choices = [{ label: "查看门锁", intent: "inspect", risk: "low" }, { label: "询问房东", intent: "talk", risk: "low" }, { label: "离开公寓", intent: "leave", risk: "low" }];
  const result = await finalizeFastPresentation({ narrative: "草稿", choices: [{ label: "过时选择" }] }, {}, async () => ({ hasNarrative: true, narrative: "结算后的正文", choices }));
  assert.equal(result.choices.length, 3);
  assert.deepEqual(result.choices.map(choice => choice.label), choices.map(choice => choice.label));
});
