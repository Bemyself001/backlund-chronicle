import test from "node:test";
import assert from "node:assert/strict";

import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { getTalent, TALENTS } from "../src/data/talents.js";
import { moneyToPence } from "../src/data/money.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { resolveTurnProgress } from "../src/engine/turn.js";

test("talents apply max-stat bonuses at character creation", () => {
  const hardy = createInitialGame({ ...EMPTY_CHARACTER, name: "体格测试员", talent: "hardy" });
  assert.equal(hardy.character.stats.maxHealth, 12);
  assert.equal(hardy.character.stats.health, 12);
  const sensitive = createInitialGame({ ...EMPTY_CHARACTER, name: "灵性测试员", talent: "sensitive" });
  assert.equal(sensitive.character.stats.maxSpirituality, 7);
  const none = createInitialGame({ ...EMPTY_CHARACTER, name: "普通测试员" });
  assert.equal(none.character.stats.maxHealth, 10);
  assert.equal(getTalent("不存在的天赋").id, "none");
  assert.ok(TALENTS.length >= 5);
});

test("savings talent adds one pound on top of starting money", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "积蓄测试员", talent: "savings", startingMoneyPence: 240 });
  assert.equal(moneyToPence(game.money), 480);
});

test("new games start without status effects", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "状态测试员" });
  assert.deepEqual(game.statusEffects, []);
});

test("status.add stores a validated tick clamped to ±3 and drops invalid keys", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "持续伤害测试员" });
  const added = executeToolCalls(game, [{ id: "bleed", name: "status.add", args: { status: { id: "bleeding", name: "失血", tick: { health: -9, luck: -1 } } }, reason: "伤口没有包扎" }]);
  assert.equal(added.results[0].ok, true);
  const status = added.game.statusEffects.find((entry) => entry.id === "bleeding");
  assert.deepEqual(status.tick, { health: -3 });
  const noTick = executeToolCalls(game, [{ id: "plain", name: "status.add", args: { status: { id: "calm", name: "平静", tick: {} } }, reason: "喝了热茶" }]);
  assert.equal(noTick.game.statusEffects.find((entry) => entry.id === "calm").tick, undefined);
});

test("status ticks settle every turn through resolveTurnProgress and respect bounds", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "结算测试员" });
  game.statusEffects.push({ id: "bleeding", name: "失血", kind: "danger", description: "", tick: { health: -2 } });
  game.statusEffects.push({ id: "warm-soup", name: "热汤余温", kind: "positive", description: "", tick: { sanity: 1 } });
  const progress = resolveTurnProgress(game, "等待片刻", "low", [], []);
  assert.equal(game.character.stats.health, 8);
  assert.equal(game.character.stats.sanity, 10); // 上限截断
  assert.equal(progress.statusTicks.length, 2);
  assert.match(progress.statusTickLogs[0], /状态「失血」结算：生命 10→8（-2）/);
  // 再结算两轮直至归零，触发自动状态
  game.character.stats.health = 2;
  const finalProgress = resolveTurnProgress(game, "等待片刻", "low", [], []);
  assert.equal(game.character.stats.health, 0);
  assert.ok(game.statusEffects.some((status) => status.id === "collapse-health"));
  assert.match(finalProgress.statusTickLogs[0], /自动附加状态「濒危」/);
});

test("heirloom-watch talent grants a checkable watch with hidden info", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "怀表测试员", talent: "heirloom-watch" });
  const watch = game.inventory.find((entry) => entry.itemId === "heirloom-watch");
  assert.ok(watch, "inventory should contain the heirloom watch");
  assert.ok(watch.tags.includes("可检查"));
  assert.match(watch.hiddenInfo, /纸条/);
  assert.equal(game.character.stats.maxHealth, 10); // 不影响数值
});
