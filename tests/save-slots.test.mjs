import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame, EMPTY_CHARACTER } from "../src/system/game.js";
import { saveGame, listSaves, deleteSave, loadGame } from "../src/services/storage.js";
import { getSaveCabinet, normalizeSaveSlots } from "../src/services/saveSlots.js";

const initial = () => createInitialGame({ ...EMPTY_CHARACTER, name: "存档测试" });
function setup(t, saves = []) {
  const values = new Map([["mist-chronicle-saves-v1", JSON.stringify(saves)]]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
  } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "localStorage", previous); else delete globalThis.localStorage; });
  return values;
}

test("three fixed slots stay in place through out-of-order saving, replacement and deletion", (t) => {
  setup(t);
  assert.deepEqual(getSaveCabinet([]).slots.map(({ number, save }) => [number, save]), [[1, null], [2, null], [3, null]]);
  const game = initial();
  saveGame(game, "third", "第三格", 3);
  saveGame(game, "first", "第一格", 1);
  saveGame({ ...game, turn: 9 }, "third", "第三格");
  deleteSave("first");
  const cabinet = getSaveCabinet(listSaves());
  assert.equal(cabinet.slots[0].save, null);
  assert.equal(cabinet.slots[1].save, null);
  assert.equal(cabinet.slots[2].save.slotId, "third");
  assert.equal(cabinet.slots[2].save.turn, 9);
});

test("eight legacy saves survive migration, autosave and deletion without moving retained archives", (t) => {
  const game = initial();
  const legacy = Array.from({ length: 8 }, (_, i) => ({ slotId: `old-${i}`, label: `旧档 ${i}`, game: { ...game, turn: i }, turn: i }));
  setup(t, legacy);
  assert.equal(listSaves().length, 8);
  assert.equal(getSaveCabinet(listSaves()).archived.length, 5);
  saveGame(game);
  deleteSave("old-1");
  const cabinet = getSaveCabinet(listSaves());
  assert.equal(cabinet.slots[1].save, null);
  assert.equal(cabinet.slots[2].save.slotId, "old-2");
  assert.equal(cabinet.archived.length, 5);
  saveGame(game, "new-second", "新第二格", 2);
  assert.equal(getSaveCabinet(listSaves()).slots[1].save.slotId, "new-second");
  for (let i = 3; i < 8; i++) assert.equal(loadGame(`old-${i}`).turn, i);
  assert.throws(() => saveGame(game, "old-3"), /旧版保留档案不能覆盖/);
  assert.equal(loadGame("old-3").turn, 3);
});

test("occupied, invalid and fourth slots cannot overwrite data or consume autosave capacity", (t) => {
  const values = setup(t);
  const game = initial();
  saveGame(game, "one", "一", 1);
  const snapshot = new Map(values);
  for (const number of [0, 4, -1, 1.5, 1]) assert.throws(() => saveGame(game, "invalid", "无效", number), /存档位不可用|手动存档已满/);
  assert.deepEqual(values, snapshot);
  saveGame(game, "two", "二", 2);
  saveGame(game, "three", "三", 3);
  assert.throws(() => saveGame(game, "four"), /手动存档已满/);
  saveGame({ ...game, turn: 8 });
  assert.equal(getSaveCabinet(listSaves()).autosave.turn, 8);
  assert.equal(getSaveCabinet(listSaves()).slots.filter(({ save }) => save).length, 3);
});

test("slot normalization is pure and idempotent with duplicate legacy slot numbers", () => {
  const saves = [{ slotId: "a", manualSlot: 2 }, { slotId: "b", manualSlot: 2 }, { slotId: "c", manualSlot: 9 }, { slotId: "d" }];
  const before = structuredClone(saves);
  const normalized = normalizeSaveSlots(saves);
  assert.deepEqual(saves, before);
  assert.deepEqual(normalizeSaveSlots(normalized), normalized);
  assert.equal(new Set(normalized.filter((s) => !s.archivedManual).map((s) => s.manualSlot)).size, 3);
  assert.equal(normalized.filter((s) => s.archivedManual).length, 1);
});
