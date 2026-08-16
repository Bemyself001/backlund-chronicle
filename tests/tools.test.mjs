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
