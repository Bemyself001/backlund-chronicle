import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { auditInventoryChanges, auditTurnChanges, createAuditBaseline } from "../src/engine/audit.js";

test("inventory audit detects quantity changes, new items, removal, and equipment", () => {
  const before = [
    { instanceId: "coat", itemId: "coat", name: "旧呢外套", quantity: 1, equipped: false, condition: "良好" },
    { instanceId: "matches", itemId: "matches", name: "防潮火柴", quantity: 3, equipped: false, condition: "良好" },
  ];
  const after = [
    { instanceId: "coat", itemId: "coat", name: "旧呢外套", quantity: 1, equipped: true, condition: "良好" },
    { instanceId: "matches", itemId: "matches", name: "防潮火柴", quantity: 1, equipped: false, condition: "良好" },
    { instanceId: "whistle", itemId: "brass-whistle", name: "风化的铜哨", quantity: 1, equipped: false, condition: "良好" },
  ];
  const audit = auditInventoryChanges(before, after);
  assert.deepEqual(audit.gained.map((item) => [item.name, item.quantity]), [["风化的铜哨", 1]]);
  assert.deepEqual(audit.lost.map((item) => [item.name, item.quantity]), [["防潮火柴", 2]]);
  assert.deepEqual(audit.equipped.map((item) => item.name), ["旧呢外套"]);
  assert.equal(audit.hasChanges, true);
});

test("turn audit compares a retained baseline and exposes structured advancement", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "审计员" });
  const baseline = createAuditBaseline(game, 1);
  game.inventory[0].quantity += 1;
  const audit = auditTurnChanges(baseline, game);
  assert.equal(audit.turn, 1);
  assert.equal(audit.inventory.gained[0].name, game.inventory[0].name);
  assert.equal(audit.character.afterAdvancement.sequenceLabel, "普通人");
  assert.equal(audit.character.advancementChanged, false);
});
