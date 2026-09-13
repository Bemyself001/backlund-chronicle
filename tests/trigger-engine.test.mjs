import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { processTriggers } from "../src/engine/triggerEngine.js";
import { migrateSave } from "../src/services/storage.js";

function processTurn(game, turn, action, calls = []) {
  game.turn = turn - 1;
  const execution = executeToolCalls(game, calls, { playerAction: action });
  const progress = processTriggers(execution.game, { action, toolCalls: calls, toolResults: execution.results, turn });
  execution.game.turn = turn;
  return { game: execution.game, progress, results: execution.results };
}

test("initial occult guarantee is save-specific, bounded to turns 8-12, and offered once", () => {
  let left = createInitialGame({ ...EMPTY_CHARACTER, name: "保底甲" });
  const right = createInitialGame({ ...EMPTY_CHARACTER, name: "保底乙" });
  assert.ok(left.triggerState.nextInitialOccultWindow >= 8 && left.triggerState.nextInitialOccultWindow <= 12);
  assert.ok(right.triggerState.nextInitialOccultWindow >= 8 && right.triggerState.nextInitialOccultWindow <= 12);
  const window = left.triggerState.nextInitialOccultWindow;
  for (let turn = 1; turn < window; turn += 1) left = processTurn(left, turn, "等待片刻").game;
  assert.equal(left.triggerState.active.some((entry) => entry.status === "available"), false);
  assert.equal(left.triggerState.active.some((entry) => entry.status === "eligible"), true);
  left = processTurn(left, window, "继续处理日常事务").game;
  const entry = left.triggerState.active.find((item) => item.category === "occult-entry" && item.status === "available");
  assert.equal(entry.status, "available");
  assert.equal(entry.expiresTurn, window + 10);
  assert.ok(left.triggerState.facts["occult.initial-entry-offered"]);
});

test("explicit refusal closes an available entry without recording occult contact", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "拒绝入口测试员" });
  ({ game } = processTurn(game, 1, "调查路边的异常暗号"));
  const entry = game.triggerState.active.find((item) => item.category === "occult-entry" && item.status === "available");
  const abandon = { id: "abandon-entry", name: "trigger.abandon", args: { instanceId: entry.instanceId }, reason: "明确拒绝并不再追查" };
  const settled = processTurn(game, 2, "明确拒绝这条线索并停止追查", [abandon]);
  assert.equal(settled.results[0].ok, true);
  assert.equal(settled.game.triggerState.history.find((item) => item.instanceId === entry.instanceId)?.status, "abandoned");
  assert.equal(settled.game.occult.contact, 0);
  assert.equal(settled.game.occult.entryAvailable, false);
});

test("trigger instances remain stable across equivalent retries and survive save migration", () => {
  const source = createInitialGame({ ...EMPTY_CHARACTER, name: "稳定ID测试员" });
  const first = processTurn(structuredClone(source), 1, "调查异常物品").game;
  const retry = processTurn(structuredClone(source), 1, "调查异常物品").game;
  const firstEntry = first.triggerState.active.find((item) => item.status === "available");
  const retryEntry = retry.triggerState.active.find((item) => item.status === "available");
  assert.equal(firstEntry.instanceId, retryEntry.instanceId);
  const loaded = migrateSave(structuredClone(first));
  assert.equal(loaded.triggerState.active.find((item) => item.status === "available")?.instanceId, firstEntry.instanceId);
  assert.equal(loaded.triggerState.nextInitialOccultWindow, first.triggerState.nextInitialOccultWindow);
});

test("exploration can reveal an entry early; only available occupies the slot and it expires silently", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "入口测试员" });
  ({ game } = processTurn(game, 1, "调查车站公告上的异常符号"));
  const entry = game.triggerState.active.find((item) => item.category === "occult-entry" && item.status === "available");
  assert.equal(entry.status, "available");
  ({ game } = processTurn(game, 2, "继续调查另一则可疑传闻"));
  assert.equal(game.triggerState.active.filter((item) => item.category === "occult-entry" && item.status === "available").length, 1);
  for (let turn = 3; turn <= 11; turn += 1) ({ game } = processTurn(game, turn, "处理自己的日常计划"));
  assert.equal(game.triggerState.active.some((item) => item.instanceId === entry.instanceId), false);
  assert.equal(game.triggerState.history.find((item) => item.instanceId === entry.instanceId)?.status, "expired");
  assert.equal(game.occult.entryAvailable, false);
});

test("explicit pursuit engages an occult entry, records contact, and frees the available slot", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "追查测试员" });
  ({ game } = processTurn(game, 1, "调查异常收据"));
  const entryId = game.occult.currentEntry.id;
  const contact = { id: "contact-entry", name: "occult.contact", args: { entryId }, reason: "主动追查收据来源" };
  const settled = processTurn(game, 2, "深入追查灰手套留下的收据", [contact]);
  game = settled.game;
  assert.equal(settled.results[0].ok, true);
  assert.equal(game.occult.contact, 1);
  assert.equal(game.triggerState.active.find((item) => item.instanceId === entryId)?.status, "engaged");
  assert.equal(game.occult.entryAvailable, false);

  ({ game } = processTurn(game, 3, "调查另一处异常记号"));
  assert.equal(game.triggerState.active.some((item) => item.category === "occult-entry" && item.status === "available"), true);
});

test("sequence 8 creates no new entry but can continue an entry that appeared at sequence 9", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "晋升边界", extraordinary: "low", pathway: "占卜家（序列9）" });
  ({ game } = processTurn(game, 1, "调查陌生的灵性符号"));
  const entry = game.triggerState.active.find((item) => item.category === "occult-entry" && item.status === "available");
  assert.ok(entry);
  assert.equal(entry.definitionId, "occult.entry.seer.reversed-reflection");
  game.character.advancement.sequence = 8;
  game.character.advancement.sequenceLabel = "序列8";
  game.character.pathway = "占卜家（序列8）";
  const call = { id: "continue-after-promotion", name: "occult.contact", args: { entryId: entry.instanceId }, reason: "继续追查晋升前发现的入口" };
  ({ game } = processTurn(game, 2, "继续追查晋升前发现的入口", [call]));
  assert.equal(game.triggerState.active.find((item) => item.instanceId === entry.instanceId)?.status, "engaged");
  ({ game } = processTurn(game, 3, "调查新的异常入口"));
  assert.equal(game.triggerState.active.some((item) => item.category === "occult-entry" && item.status === "available"), false);
});

test("heirloom watch inspection advances one local fact at a time and rewards only once", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "怀表阶段测试员", talent: "heirloom-watch" });
  const watch = game.inventory.find((item) => item.itemId === "heirloom-watch");
  for (const [index, fact] of ["watch.exterior-inspected", "watch.inscription-found", "watch.mechanism-opened", "watch.note-recovered"].entries()) {
    const call = { id: `watch-inspect-${index}`, name: "item.inspect", args: { instanceId: watch.instanceId, reveal: true }, reason: "继续检查家传怀表" };
    const settled = processTurn(game, index + 1, "继续检查家传怀表", [call]);
    game = settled.game;
    assert.equal(settled.results[0].ok, true);
    assert.ok(game.triggerState.facts[fact]);
    if (index === 0) assert.equal(game.triggerState.active.find((item) => item.definitionId === "watch.heirloom.hidden-note")?.status, "available");
  }
  const watchEvent = game.triggerState.active.find((item) => item.definitionId === "watch.heirloom.hidden-note");
  assert.equal(watchEvent.status, "engaged");
  assert.equal(watchEvent.stage, "note-recovered");
  assert.match(game.inventory.find((item) => item.instanceId === watch.instanceId).discoveredInfo, /速记符号/);

  const clueCall = { id: "decode-watch", name: "clue.add", args: { clue: { id: "watch-source", title: "怀表纸条速记对照", detail: "查到 R.A. 的速记对应表。" } }, reason: "找到可靠资料并完成辨认" };
  ({ game } = processTurn(game, 5, "查阅资料辨认怀表纸条", [clueCall]));
  assert.equal(game.triggerState.history.find((item) => item.instanceId === watchEvent.instanceId)?.status, "completed");
  assert.ok(game.triggerState.facts["watch.formal-quest-unlocked"]);
  assert.ok(game.clues.some((clue) => clue.id === "clue-watch-note-decoded"));
  assert.equal(game.triggerState.rewardsClaimed.filter((id) => id.startsWith("watch.hidden-note")).length, 2);

  processTriggers(game, { action: "重复提交", turn: 5 });
  assert.equal(game.clues.filter((clue) => clue.id === "clue-watch-note-decoded").length, 1);
  assert.equal(game.triggerState.rewardsClaimed.filter((id) => id.startsWith("watch.hidden-note")).length, 2);
});

test("seer example quest uses the shared format, explicit engagement, stages, and deduplicated rewards", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "占卜任务测试员", extraordinary: "low", pathway: "占卜家（序列9）" });
  ({ game } = processTurn(game, 1, "使用占卜记录反复出现的预兆"));
  const quest = game.triggerState.active.find((item) => item.definitionId === "pathway.seer.first-omen");
  assert.equal(quest.status, "available");
  const engage = { id: "engage-omen", name: "trigger.engage", args: { instanceId: quest.instanceId }, reason: "主动验证这组征兆" };
  ({ game } = processTurn(game, 2, "主动验证这组反复出现的征兆", [engage]));
  assert.equal(game.triggerState.active.find((item) => item.instanceId === quest.instanceId)?.stage, "trace-the-omen");
  const trace = { id: "trace-omen", name: "clue.add", args: { clue: { id: "omen-trace", title: "预兆的重复轨迹", detail: "三次占卜出现相同征兆。" } }, reason: "记录重复轨迹" };
  ({ game } = processTurn(game, 3, "追踪并记录预兆", [trace]));
  assert.equal(game.triggerState.active.find((item) => item.instanceId === quest.instanceId)?.stage, "record-fulfilment");
  const fulfilment = { id: "omen-result", name: "clue.add", args: { clue: { id: "omen-result", title: "征兆应验结果", detail: "现实结果完成印证。" } }, reason: "记录最终结果" };
  ({ game } = processTurn(game, 4, "记录征兆应验的结果", [fulfilment]));
  assert.equal(game.triggerState.history.find((item) => item.instanceId === quest.instanceId)?.status, "completed");
  assert.ok(game.triggerState.facts["pathway.seer.first-omen.completed"]);
  assert.equal(game.clues.filter((clue) => clue.id === "clue-seer-first-omen").length, 1);
});
