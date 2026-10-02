import test from "node:test";
import assert from "node:assert/strict";
import { advanceWorldTime, normalizeWorldTime } from "../src/engine/worldTime.js";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { migrateSave } from "../src/services/storage.js";

test("calendar derives weekdays from the game epoch, repairing stale text", () => {
  assert.equal(normalizeWorldTime("1349年 10月18日 · 周二 · 08:00"), "1349年 10月18日 · 周三 · 08:00");
  assert.equal(normalizeWorldTime("1349年 10月18日 · 星期天 · 08：00"), "1349年 10月18日 · 周三 · 08:00");
  assert.equal(advanceWorldTime("1349年 10月17日 · 周日 · 23:55", 10), "1349年 10月18日 · 周三 · 00:05");
  assert.equal(advanceWorldTime("1349年 10月17日 · 周二 · 00:00", 15 * 1440), "1349年 11月1日 · 周三 · 00:00");
  assert.equal(advanceWorldTime("1349年 12月31日 · 周日 · 23:55", 10), "1350年 1月1日 · 周一 · 00:05");
  assert.equal(advanceWorldTime("1349年 10月17日 · 周二 · 00:00", 7 * 1440), "1349年 10月24日 · 周二 · 00:00");
});

test("leap dates and repeated steps agree with a single advance", () => {
  const start = "1352年 2月28日 · 周日 · 23:00";
  const middle = advanceWorldTime(start, 60);
  assert.match(middle, /2月29日 .*00:00$/);
  assert.equal(advanceWorldTime(middle, 1440), advanceWorldTime(start, 1500));
  assert.match(advanceWorldTime(start, 1500), /3月1日/);
  for (const invalid of ["时间未知", "1350年 2月30日 · 周日 · 12:00", "1350年 2月28日 · 周日 · 25:00"]) {
    assert.equal(advanceWorldTime(invalid, 60), invalid);
  }
});

test("save migration corrects weekday without moving the saved date or time", () => {
  const original = createInitialGame({ ...EMPTY_CHARACTER, name: "旧时钟" });
  original.worldTime = "1349年 10月19日 · 周二 · 07:20";
  const migrated = migrateSave(original);
  assert.equal(migrated.worldTime, "1349年 10月19日 · 周四 · 07:20");
  assert.equal(migrateSave(migrated).worldTime, migrated.worldTime);
  assert.equal(original.worldTime, "1349年 10月19日 · 周二 · 07:20");
  assert.equal(migrated.turn, original.turn);
  assert.deepEqual(migrated.character.stats, original.character.stats);
});
