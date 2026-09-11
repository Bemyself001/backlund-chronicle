import test from "node:test";
import assert from "node:assert/strict";
import { recentArchives, archiveLocation } from "../src/data/titleArchive.js";

test("title archive chooses newest actual slot without mutating storage order", () => {
  const saves = [{ slotId: "autosave", updatedAt: "2026-09-10T00:00:00Z" }, { slotId: "manual-1", updatedAt: "2026-09-11T00:00:00Z" }];
  assert.equal(recentArchives(saves)[0].slotId, "manual-1");
  assert.equal(saves[0].slotId, "autosave");
  assert.equal(recentArchives([saves[1]])[0].slotId, "manual-1");
});

test("title archive preserves all slots and tolerates missing legacy metadata", () => {
  assert.deepEqual(recentArchives(), []);
  const slots = Array.from({ length: 8 }, (_, i) => ({ slotId: `${i}`, updatedAt: i ? "invalid" : "2026-09-11" }));
  assert.equal(recentArchives(slots).length, 8);
  assert.equal(recentArchives(slots)[0].slotId, "0");
  assert.equal(archiveLocation({}), "地点未记录");
  assert.equal(archiveLocation({ game: { location: { district: "北区", name: "灰墙公寓" } } }), "北区 · 灰墙公寓");
});
