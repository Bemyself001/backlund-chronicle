import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { buildRejectedToolNarrative, executeToolCalls, normalizeToolCall } from "../src/engine/tools.js";

test("tool normalization moves reason out of args and repairs a flat clue proposal", () => {
  const call = normalizeToolCall({
    id: "clue-flat",
    name: "clue.add",
    args: { title: "被划去的站台", detail: "旧时刻表上有一行被反复涂抹。", reason: "检查车站公告" },
  });
  assert.equal(call.reason, "检查车站公告");
  assert.equal(call.args.reason, undefined);
  assert.equal(call.args.clue.title, "被划去的站台");
  assert.match(call.args.clue.id, /^clue-/);
});

test("repaired clue proposals execute, while incomplete clues remain rejected", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "工具测试员" });
  const repaired = executeToolCalls(game, [{ id: "clue-repair", name: "clue.add", args: { title: "被划去的站台", detail: "编号被墨水反复涂抹。" }, reason: "检查车站公告" }]);
  assert.equal(repaired.results[0].ok, true);
  assert.equal(repaired.game.clues.length, 1);
  assert.match(repaired.logs[0].text, /整理到 clue 对象|生成 id/);

  const rejected = executeToolCalls(game, [{ id: "clue-invalid", name: "clue.add", args: { clue: { detail: "没有标题" } }, reason: "检查现场" }]);
  assert.equal(rejected.results[0].ok, false);
  assert.equal(rejected.game.clues.length, 0);
  assert.match(buildRejectedToolNarrative("检查现场", rejected.results), /缺少|线索/);
});

test("item tools repair flat item proposals and resolve unique inventory references", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "物品工具测试员" });
  const coat = game.inventory.find((item) => item.name === "旧呢外套");
  const inspected = normalizeToolCall({ name: "item.inspect", args: { name: coat.name }, reason: "查看随身物品" }, game);
  assert.equal(inspected.args.instanceId, coat.instanceId);
  assert.match(inspected.repairNote, /匹配背包实例/);

  const removed = executeToolCalls(game, [{ id: "remove-by-name", name: "inventory.remove", args: { name: coat.name }, reason: "丢弃破旧外套" }]);
  assert.equal(removed.results[0].ok, true);
  assert.equal(removed.game.inventory.some((item) => item.instanceId === coat.instanceId), false);

  const added = executeToolCalls(game, [{ id: "add-flat-item", name: "inventory.add", args: { name: "风化的铜哨", description: "从旧木柜夹层取出。" }, reason: "发现隐藏物品" }]);
  assert.equal(added.results[0].ok, true);
  assert.equal(added.game.inventory.some((item) => item.name === "风化的铜哨" && item.itemId.startsWith("item-")), true);
});

test("ambiguous item names are rejected instead of changing the wrong instance", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "歧义测试员" });
  const duplicate = { ...game.inventory[0], instanceId: "item-duplicate-coat" };
  game.inventory.push(duplicate);
  const execution = executeToolCalls(game, [{ id: "ambiguous-inspect", name: "item.inspect", args: { name: duplicate.name }, reason: "检查外套" }]);
  assert.equal(execution.results[0].ok, false);
  assert.match(execution.results[0].reason, /多个实例|instanceId/);
  assert.equal(execution.game.inventory.length, game.inventory.length);
});
