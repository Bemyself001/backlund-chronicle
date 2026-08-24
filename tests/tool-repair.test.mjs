import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { repairToolCallsConcurrently } from "../src/services/toolRepair.js";

function invalidRepairableCalls() {
  return [
    { id: "status-call", name: "status.add", args: {}, reason: "异常让人保持警觉" },
    { id: "clue-call", name: "clue.add", args: {}, reason: "检查现场获得线索" },
    { id: "quest-call", name: "quest.add", args: {}, reason: "接受一项明确委托" },
    { id: "item-call", name: "inventory.add", args: {}, reason: "取得一件普通物品" },
  ];
}

function repairedCall(call) {
  const argsByName = {
    "status.add": { status: { id: "alert", name: "警觉" } },
    "clue.add": { clue: { id: "clue-repaired", title: "修复后的线索" } },
    "quest.add": { quest: { id: "quest-repaired", title: "修复后的委托" } },
  };
  return [{ ...call, args: argsByName[call.name] }];
}

test("repairable tool calls start concurrently with a bounded limit and retain order", async () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "并发修复测试员" });
  const started = [];
  let releaseRepairs;
  const repairGate = new Promise((resolve) => { releaseRepairs = resolve; });

  const pending = repairToolCallsConcurrently(game, invalidRepairableCalls(), async ({ call, index }) => {
    started.push(index);
    await repairGate;
    return repairedCall(call);
  }, { maxRepairs: 3 });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, [0, 1, 2]);
  releaseRepairs();

  const result = await pending;
  assert.equal(result.repairCount, 3);
  assert.deepEqual(result.calls.map((call) => call.name), ["status.add", "clue.add", "quest.add", "inventory.add"]);
  assert.equal(result.calls[0].args.status.name, "警觉");
  assert.equal(result.calls[1].args.clue.title, "修复后的线索");
  assert.equal(result.calls[2].args.quest.title, "修复后的委托");
  assert.deepEqual(result.calls[3].args, {});
});

test("a failed repair preserves its original call while other repairs complete", async () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "失败隔离测试员" });
  const result = await repairToolCallsConcurrently(game, invalidRepairableCalls().slice(0, 2), async ({ call }) => {
    if (call.name === "status.add") throw new Error("temporary repair failure");
    return repairedCall(call);
  });

  assert.deepEqual(result.calls[0].args, {});
  assert.equal(result.calls[1].args.clue.title, "修复后的线索");
});

test("an aborted repair cancels the concurrent repair group", async () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "取消修复测试员" });
  const abortError = new Error("cancelled");
  abortError.name = "AbortError";

  await assert.rejects(
    repairToolCallsConcurrently(game, invalidRepairableCalls().slice(0, 2), async ({ index }) => {
      if (index === 0) throw abortError;
      return repairedCall(invalidRepairableCalls()[index]);
    }),
    { name: "AbortError" },
  );
});
