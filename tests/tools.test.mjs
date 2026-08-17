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

test("empty tool names are rejected as incomplete calls instead of unknown empty tools", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "空工具测试员" });
  const execution = executeToolCalls(game, [{ id: "empty-tool", args: {} }]);
  assert.equal(execution.results[0].ok, false);
  assert.match(execution.results[0].reason, /缺少名称/);
  assert.doesNotMatch(execution.results[0].reason, /未知工具/);
});

test("invalid JSON arguments are distinguished from model-omitted parameters", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "参数诊断员" });
  const malformed = normalizeToolCall({ name: "status.add", arguments: '{"name":"警' }, game);
  assert.equal(malformed.argsInvalid, true);

  const malformedExecution = executeToolCalls(game, [malformed]);
  assert.match(malformedExecution.results[0].reason, /不是合法 JSON/);

  const missingExecution = executeToolCalls(game, [{ name: "status.add", args: {}, reason: "尝试更新状态" }]);
  assert.match(missingExecution.results[0].reason, /模型未提供/);
});

test("relationship updates repair a numeric alias and uniquely resolve an NPC", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "关系工具测试员" });
  game.relationships = [{ id: "npc-porter", name: "阿尔文", role: "搬运工", value: 0, note: "" }];
  const normalized = normalizeToolCall({ name: "relationship.update", args: { name: "阿尔文", change: "关系提升 3" }, reason: "主动帮助对方" }, game);
  assert.equal(normalized.args.npcId, "npc-porter");
  assert.equal(normalized.args.delta, 3);
  assert.match(normalized.repairNote, /delta|匹配 NPC/);

  const execution = executeToolCalls(game, [{ id: "relationship-repair", name: "relationship.update", args: { name: "阿尔文", change: "关系提升 3" }, reason: "主动帮助对方" }]);
  assert.equal(execution.results[0].ok, true);
  assert.equal(execution.game.relationships[0].value, 3);
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

test("occult contact gates reveal and occult character updates", () => {
  const ordinary = createInitialGame({ ...EMPTY_CHARACTER, name: "普通人测试员", extraordinary: "ordinary" });
  const lowSequence = createInitialGame({ ...EMPTY_CHARACTER, name: "非凡者测试员", extraordinary: "low", pathway: "窥秘人（序列9）" });
  assert.equal(ordinary.occult.contact, 0);
  assert.equal(lowSequence.occult.contact, 1);

  const blockedReveal = executeToolCalls(ordinary, [{ id: "blocked-reveal", name: "occult.reveal", args: { topic: "仪式", evidence: "残页" }, reason: "试图理解残页" }]);
  assert.equal(blockedReveal.results[0].ok, false);
  assert.match(blockedReveal.results[0].reason, /尚未接触/);

  const withEntry = { ...ordinary, occult: { ...ordinary.occult, entryAvailable: true, currentEntry: { id: "occult-entry-5", title: "非凡入口" } } };
  const contacted = executeToolCalls(withEntry, [{ id: "contact", name: "occult.contact", args: { entryId: "occult-entry-5" }, reason: "主动追查入口" }]);
  assert.equal(contacted.results[0].ok, true);
  assert.equal(contacted.game.occult.contact, 1);
  assert.equal(contacted.game.occult.entryAvailable, false);

  const revealed = executeToolCalls(contacted.game, [{ id: "reveal", name: "occult.reveal", args: { topic: "仪式痕迹", evidence: "入口收据" }, reason: "整理已确认证据" }]);
  assert.equal(revealed.results[0].ok, true);
  assert.equal(revealed.game.occult.revealLevel, 1);

  const blockedUpdate = executeToolCalls(ordinary, [{ id: "blocked-update", name: "character.update", args: { requiresOccult: true, patch: { spirituality: 5 } }, reason: "非凡影响" }]);
  assert.equal(blockedUpdate.results[0].ok, false);
  assert.match(blockedUpdate.results[0].reason, /尚未接触/);
});
