import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame, EMPTY_CHARACTER } from "../src/system/game.js";
import { saveGame, loadGame, listSaves, importSave, MAX_MANUAL_SAVES } from "../src/services/storage.js";
import { appendStoryMessages } from "../src/services/storyHistory.js";
import { computeMemoryUpdate } from "../src/services/memory.js";
import { actionRequest, retryRequest } from "../src/services/actionRequest.js";
import { ensureMapDiscoveryToolCall } from "../src/services/mapTravel.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { applyModelCatalog } from "../src/services/modelCatalog.js";

function storage(t) {
  const values = new Map();
  const old = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } });
  t.after(() => { if (old) Object.defineProperty(globalThis, "localStorage", old); else delete globalThis.localStorage; });
  return values;
}
const initial = () => createInitialGame({ ...EMPTY_CHARACTER, name: "回归测试" });
const file = (game) => ({ text: async () => JSON.stringify({ game }) });

test("manual save capacity never evicts archives or the independent autosave", (t) => {
  storage(t);
  const game = initial();
  saveGame(game);
  for (let n = 0; n < MAX_MANUAL_SAVES; n++) saveGame(game, `manual-${n}`);
  const before = listSaves();
  assert.equal(before.length, MAX_MANUAL_SAVES + 1);
  assert.throws(() => saveGame(game, "overflow"), /手动存档已满/);
  assert.deepEqual(listSaves(), before);
  saveGame({ ...game, turn: 2 });
  assert.equal(loadGame().turn, 2);
  assert.equal(loadGame("manual-0").turn, 0);
  saveGame({ ...game, turn: 3 }, "manual-0");
  assert.equal(loadGame("manual-0").turn, 3);
  assert.equal(listSaves().length, MAX_MANUAL_SAVES + 1);
});

test("invalid imports preserve the existing autosave byte for byte", async (t) => {
  const values = storage(t);
  const game = initial(); saveGame(game);
  const before = new Map(values);
  for (const transform of [
    (g) => { delete g.chapter; },
    (g) => { g.statusEffects = "broken"; },
    (g) => { g.storyHistory[0].content = {}; },
    (g) => { g.capacity = {}; },
    (g) => { g.character.name = {}; },
  ]) {
    const damaged = structuredClone(game); transform(damaged);
    await assert.rejects(importSave(file(damaged)));
    assert.deepEqual(values, before);
  }
  await assert.rejects(importSave({ text: async () => "null" }));
  assert.deepEqual(values, before);
});

test("missing optional UI collections are repaired before imported data is saved", async (t) => {
  storage(t);
  const game = initial();
  for (const key of ["statusEffects", "clues", "relationships", "changeLog", "worldEvents"]) delete game[key];
  const imported = await importSave(file(game));
  assert.deepEqual(imported.statusEffects.filter((entry) => entry.tick), []);
  const restored = loadGame();
  assert.deepEqual(restored.statusEffects, []);
  assert.equal(restored.character.name, game.character.name);
});

test("exploration remains visible after another turn and a save reload", (t) => {
  storage(t);
  const game = initial();
  const exploration = { id: "exploration", role: "assistant", turn: 0, content: "探索沿途见闻", source: "fixed" };
  const explored = { ...game, ...appendStoryMessages(game, [exploration]) };
  assert.ok(explored.storyHistory.includes(exploration));
  const next = { ...explored, ...computeMemoryUpdate(explored, "继续前行", "新的剧情").updates, turn: 1 };
  saveGame(next);
  const restored = loadGame();
  assert.equal(restored.storyHistory.filter((entry) => entry.id === exploration.id).length, 1);
  assert.ok(restored.recentDialogues.some((entry) => entry.id === exploration.id));
});

test("retry preserves deterministic investigation and does not turn it into ordinary text", () => {
  const game = initial();
  const locationId = Object.entries(game.locationKnowledge).find(([, entry]) => entry.status === "rumored")[0];
  const options = { mapInvestigation: { locationId, currentStatus: "rumored" }, mapDestination: { id: "iron-gate" }, advancementRequest: { potionInstanceId: "potion-1" } };
  const pending = actionRequest("调查地图传闻", options);
  options.mapInvestigation.locationId = "changed-after-start";
  const retry = retryRequest(pending);
  assert.equal(retry.options.mapInvestigation.locationId, locationId);
  assert.equal(retry.options.advancementRequest.potionInstanceId, "potion-1");
  assert.equal(retry.options.mapDestination.id, "iron-gate");
  const calls = ensureMapDiscoveryToolCall([], retry.options.mapInvestigation, 1, game);
  const settled = executeToolCalls(game, calls);
  assert.equal(settled.results[0].ok, true);
  assert.equal(settled.game.locationKnowledge[locationId].status, "discovered");
});

test("late model catalogs cannot replace a different provider or edited endpoint", async () => {
  const source = { provider: "deepseek", baseUrl: "https://example.test/v1", apiKey: "test-only", modelCatalogs: {} };
  let resolve; const pending = new Promise((done) => { resolve = done; });
  const current = { ...source, provider: "openai", modelCatalogs: { openai: ["existing"] } };
  resolve(["deepseek-model"]);
  const models = await pending;
  assert.equal(applyModelCatalog(current, source, models), current);
  const edited = { ...source, baseUrl: "https://new.example.test/v1" };
  assert.equal(applyModelCatalog(edited, source, models), edited);
  assert.deepEqual(applyModelCatalog(source, source, models).modelCatalogs.deepseek, models);
});
