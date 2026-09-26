import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame, DEFAULT_API_SETTINGS, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { CHURCH_PRAYERS } from "../src/content/backlund/prayers.js";
import { prayerAvailability, settlePrayer } from "../src/engine/prayer.js";
import { generatePrayer, validatePrayer } from "../src/services/prayer.js";
import { migrateSave } from "../src/services/storage.js";
import { applyTalent } from "../src/system/talents.js";

const fresh = (extraordinary = "ordinary", talent = "none") => createInitialGame({ ...EMPTY_CHARACTER, name: "祷告测试员", extraordinary, talent });

test("all starting stats are full for both origins and every stat talent", () => {
  for (const origin of ["ordinary", "low"]) for (const talent of ["none", "hardy", "steady-mind", "sensitive"]) {
    const { stats } = fresh(origin, talent).character;
    assert.equal(stats.health, stats.maxHealth);
    assert.equal(stats.sanity, stats.maxSanity);
    assert.equal(stats.spirituality, stats.maxSpirituality);
  }
});

test("only pristine legacy openings are restored, migration is idempotent", () => {
  for (const origin of ["ordinary", "low"]) for (const talent of ["none", "steady-mind", "sensitive"]) {
    const game = fresh(origin, talent);
    delete game.initialStatsVersion;
    const maxSpirituality = origin === "low" ? 8 : 5;
    game.character.stats = applyTalent({ health: 10, maxHealth: 10, sanity: 9, maxSanity: 10, spirituality: maxSpirituality - 1, maxSpirituality }, talent);
    const original = structuredClone(game);
    const migrated = migrateSave(game);
    assert.equal(migrated.character.stats.sanity, migrated.character.stats.maxSanity);
    assert.equal(migrated.character.stats.spirituality, migrated.character.stats.maxSpirituality);
    assert.deepEqual(game, original);
    assert.deepEqual(migrateSave(migrated).character.stats, migrated.character.stats);
    for (const changed of [{ turn: 1 }, { lastTurnAudit: {} }, { initialStatsVersion: 1 }]) {
      assert.deepEqual(migrateSave({ ...game, ...changed }).character.stats, game.character.stats);
    }
  }
});

test("prayer needs physical arrival, heals with cap, advances time and shared cooldown survives loading", () => {
  let game = fresh();
  assert.equal(prayerAvailability(game, "st-samuel").ok, false);
  assert.throws(() => settlePrayer(game, "st-samuel"));
  game.location.id = "st-samuel";
  game.character.stats.spirituality = 2;
  const original = structuredClone(game);
  const first = settlePrayer(game, "st-samuel");
  assert.deepEqual(game, original);
  game = first.next;
  assert.equal(game.character.stats.spirituality, 4);
  assert.equal(game.turn, 1);
  assert.notEqual(game.worldTime, original.worldTime);
  assert.equal(prayerAvailability(game).remaining, 4);
  game.location.id = "saint-wind";
  game = migrateSave(game);
  assert.equal(prayerAvailability(game).ok, false);
  game.turn = 4;
  assert.throws(() => settlePrayer(game, game.location.id));
  game.turn = 5;
  const second = settlePrayer(game, game.location.id);
  assert.equal(second.recovered, 1);
  assert.equal(second.next.character.stats.spirituality, 5);
});

test("prayer settles status ticks and clears spirituality collapse after recovery", () => {
  const game = fresh();
  game.location.id = "st-samuel";
  game.character.stats.spirituality = 0;
  game.statusEffects = [{ id: "collapse-spirituality" }, { id: "bleed", name: "流血", tick: { health: -1 } }];
  const { next } = settlePrayer(game, game.location.id);
  assert.equal(next.character.stats.health, 9);
  assert.equal(next.character.stats.spirituality, 2);
  assert.ok(!next.statusEffects.some((status) => status.id === "collapse-spirituality"));
});

test("each church requests AI prayer content; text limit and abort are enforced", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const body = JSON.parse(options.body);
    const church = JSON.parse(body.messages.at(-1).content);
    requests.push(church);
    return new Response(JSON.stringify({ choices: [{ message: { content: church.deity + "啊，愿我以清醒的心面对未知。" } }] }));
  });
  assert.equal(new Set(Object.values(CHURCH_PRAYERS).map((church) => church.environment)).size, 4);
  for (const church of Object.values(CHURCH_PRAYERS)) {
    const text = await generatePrayer(church, { ...DEFAULT_API_SETTINGS, mockMode: true });
    assert.ok(text.includes(church.deity));
    assert.ok(validatePrayer(text).length <= 200);
  }
  assert.throws(() => validatePrayer(" "));
  assert.throws(() => validatePrayer("祈".repeat(201)));
  assert.equal(validatePrayer("祈".repeat(200)).length, 200);
  assert.equal(requests.length, Object.keys(CHURCH_PRAYERS).length);
  await assert.rejects(generatePrayer(CHURCH_PRAYERS["st-samuel"], DEFAULT_API_SETTINGS, AbortSignal.abort()), { name: "AbortError" });
  assert.equal(requests.length, Object.keys(CHURCH_PRAYERS).length);
});
