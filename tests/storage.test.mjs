import assert from "node:assert/strict";
import test from "node:test";
import { migrateSave } from "../src/services/storage.js";

test("version 1 saves migrate from Grayharbor to Backlund without losing progress", () => {
  const migrated = migrateSave({
    version: 1,
    turn: 8,
    title: "艾琳的灰檐港档案",
    character: { name: "艾琳", background: "在灰檐港生活三年" },
    location: { name: "煤灯街·雾鸦旅店", district: "灰檐港旧钟区" },
    inventory: [{ instanceId: "item-1", name: "旧呢外套" }],
    recentDialogues: [{ role: "assistant", content: "灰檐港市档案馆已经关门。" }],
  });
  assert.equal(migrated.version, 2);
  assert.equal(migrated.turn, 8);
  assert.equal(migrated.title, "艾琳的贝克兰德档案");
  assert.equal(migrated.location.district, "贝克兰德桥区·旧钟街");
  assert.match(migrated.recentDialogues[0].content, /贝克兰德市政档案分馆/);
  assert.equal(migrated.inventory[0].name, "旧呢外套");
});
