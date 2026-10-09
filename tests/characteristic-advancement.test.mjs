import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { collectImportantItemConfirmations, createAuditBaseline, auditTurnChanges } from "../src/engine/audit.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { resolveTurnProgress } from "../src/engine/turn.js";
import { ensureRequestedAdvancementToolCall, getAdvancementRequestGate, getCharacteristicUseGate } from "../src/services/advancement.js";
import { inferPotionRequest, validatePlayerActions } from "../src/services/playerActions.js";
import { cleanGame, migrateSave } from "../src/services/saveCodec.js";
import { createTurnResolution } from "../src/services/turnResolution.js";
import { requestAI } from "../src/services/api.js";
import { buildPlanningContext, visibleGameState } from "../src/services/memory.js";
import { DEFAULT_API_SETTINGS, DEFAULT_SYSTEM_PROMPT, migrateSystemPrompt } from "../src/system/game.js";
import { getAdvancement, isExplicitAdvancementIntent } from "../src/system/character.js";
import { normalizeCharacteristic } from "../src/system/characteristics.js";
import { normalizeInventoryItem, playerVisibleItem } from "../src/system/items.js";

const action = "吸收已确认的非凡特性，正式晋升";

test("native tool transport offers characteristic promotion without requiring a potion ID", async context => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let body;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "NO_STATE_CHANGE" }, finish_reason: "stop" }] }), { headers: { "Content-Type": "application/json" } });
  };
  await requestAI({ ...DEFAULT_API_SETTINGS, apiKey: "test", baseUrl: "https://test.invalid/v1", model: "test", nativeTools: true, stream: false }, [{ role: "user", content: action }], undefined, undefined, { toolSet: "state" });
  const schema = name => body.tools.find(tool => tool.function.name === name).function.parameters;
  const promote = schema("advancement__promote");
  assert.equal(promote.required.includes("potionInstanceId"), false);
  assert.equal(promote.properties.characteristicInstanceId.type, "string");
  assert.match(promote.properties.characteristicInstanceId.description, /50%/);
  const characteristicSchema = schema("inventory__add").properties.item.properties.characteristic;
  assert.deepEqual(characteristicSchema.required, ["pathwayId", "sequence", "identified"]);
  assert.equal(characteristicSchema.properties.pathwayId.enum.length, 22);
});

test("planning and migrated default prompts carry canonical names and the characteristic cost", () => {
  const { game, item } = ready();
  const context = buildPlanningContext(game, action, DEFAULT_SYSTEM_PROMPT, { advancementRequest: { characteristicInstanceId: item.instanceId } });
  const text = JSON.stringify(context);
  assert.match(text, /characteristicInstanceId/);
  assert.match(text, /新上限50%|晋升后上限50%/);
  assert.equal(visibleGameState(game).sequenceFourDossier.potionName, "诡法师魔药");
  assert.equal(visibleGameState(fresh(9)).sequenceFourDossier, null);
  const previous = DEFAULT_SYSTEM_PROMPT.replace(/【非凡特性晋升】[^\n]*/, "");
  const migrated = migrateSystemPrompt(previous);
  assert.match(migrated, /【非凡特性晋升】/);
  assert.equal(migrateSystemPrompt(migrated), migrated);
  assert.equal(migrateSystemPrompt("自定义叙事规则"), "自定义叙事规则");
});

test("only identified sequence-four potions receive their canonical profession name", () => {
  const raw = { ...potion(4), name: "占卜家途径序列4魔药" };
  assert.equal(normalizeInventoryItem(raw).name, "诡法师魔药");
  assert.equal(normalizeInventoryItem({ ...raw, potion: { ...raw.potion, identified: false }, name: "陌生的紫色魔药" }).name, "陌生的紫色魔药");
  assert.equal(playerVisibleItem({ ...raw, potion: { ...raw.potion, identified: false } }).name, "未鉴定魔药");
  assert.equal(normalizeInventoryItem({ ...potion(5), name: "秘偶大师魔药" }).name, "秘偶大师魔药");
});

function fresh(sequence = 5) {
  return createInitialGame({
    ...EMPTY_CHARACTER, name: "特性晋升验收员", talent: "none",
    extraordinary: sequence === null ? "ordinary" : "low",
    pathway: sequence === null ? "无" : "占卜家（序列" + sequence + "）",
  });
}

function characteristic(sequence = 4, overrides = {}) {
  return normalizeInventoryItem({
    instanceId: "characteristic-seer-" + sequence,
    itemId: "characteristic-seer-" + sequence,
    name: "占卜家途径序列" + sequence + "非凡特性",
    description: "完整封存且已有可靠途径与序列记录的非凡特性。",
    category: "非凡物品", quantity: 1, weight: 0.1, equipped: false,
    importance: "normal", tags: [],
    characteristic: { pathwayId: "seer", sequence, identified: true },
    ...overrides,
  });
}

function potion(sequence) {
  return normalizeInventoryItem({
    instanceId: "potion-seer-" + sequence, itemId: "potion-seer-" + sequence,
    name: "占卜家途径序列" + sequence + "魔药", description: "可靠鉴定的成品魔药。",
    category: "非凡物品", quantity: 1, weight: 0.1, tags: [],
    potion: { pathwayId: "seer", sequence, identified: true },
  });
}

function promotionCall(item, sequence, method = "characteristic") {
  return {
    id: "promote-" + method + "-" + sequence,
    name: "advancement.promote",
    args: {
      pathwayId: "seer", sequence,
      [method === "characteristic" ? "characteristicInstanceId" : "potionInstanceId"]: item.instanceId,
      evidence: "玩家已可靠确认物品身份，并明确选择本轮吸收或服用后正式晋升",
    },
    reason: "玩家选择本轮永久晋升，并进入重要物品确认流程",
  };
}

function ready(sequence = 4) {
  const game = fresh(sequence + 1);
  game.turn = 7;
  game.character.stats.sanity = 2;
  game.character.stats.spirituality -= 4;
  const item = characteristic(sequence);
  game.inventory.push(item);
  return { game, item, call: promotionCall(item, sequence) };
}

function settle(game, calls, options = {}) {
  const execution = executeToolCalls(game, calls, { playerAction: action, ...options });
  const progress = resolveTurnProgress(execution.game, action, "low", calls, execution.results);
  return { ...execution, progress };
}

for (const [sequence, maxHealth, health] of [[4, 40, 20], [3, 47, 23], [2, 55, 27], [1, 64, 32], [0, 74, 37]]) {
  for (const extraHealth of [0, 1]) {
    test("characteristic promotion to sequence " + sequence + " sets exact half of max HP " + (maxHealth + extraHealth), () => {
      const { game, item, call } = ready(sequence);
      game.character.stats.maxHealth += extraHealth;
      game.character.stats.health = game.character.stats.maxHealth;
      const original = structuredClone(game);
      const result = settle(game, [call]);
      assert.equal(result.results[0].ok, true);
      const stats = result.game.character.stats;
      assert.equal(stats.maxHealth, maxHealth + extraHealth);
      assert.equal(stats.health, extraHealth && maxHealth % 2 ? health + 1 : health);
      assert.equal(stats.sanity, stats.maxSanity);
      assert.equal(stats.maxSanity, game.character.stats.maxSanity + 10 - sequence);
      assert.equal(stats.maxSpirituality, game.character.stats.maxSpirituality + 10 - sequence);
      assert.equal(stats.spirituality, game.character.stats.spirituality + 10 - sequence);
      assert.equal(stats.maxSpirituality - stats.spirituality, 4);
      assert.equal(getAdvancement(result.game.character).sequence, sequence);
      assert.equal(result.results[0].data.advancement.method, "characteristic");
      assert.equal(result.results[0].data.inventoryChange.delta, -1);
      assert.equal(result.game.inventory.some(entry => entry.instanceId === item.instanceId), false);
      assert.deepEqual(game, original, "tentative execution must leave the committed original untouched");
    });
  }
}

test("an injured character is still set to the exact new half-health target", () => {
  const { game, call } = ready();
  game.character.stats.health = 1;
  const result = settle(game, [call]);
  assert.equal(result.results[0].ok, true);
  assert.equal(result.game.character.stats.health, 20);
});

test("characteristic promotion consumes exactly one unit and neither call replay nor old rank reuse consumes twice", () => {
  const { game, item, call } = ready();
  item.quantity = 2;
  const accepted = settle(game, [call]);
  assert.equal(accepted.results[0].ok, true);
  assert.equal(accepted.game.inventory.find(entry => entry.instanceId === item.instanceId).quantity, 1);
  accepted.game.turn += 1;
  accepted.game.character.stats.health = 7;
  accepted.game.character.stats.sanity = 4;
  for (const retry of [call, { ...call, id: "different-id-same-old-rank" }]) {
    const replay = settle(accepted.game, [retry]);
    assert.equal(replay.results[0].ok, false);
    assert.deepEqual(replay.game.character, accepted.game.character);
    assert.deepEqual(replay.game.inventory, accepted.game.inventory);
    assert.deepEqual(replay.progress.advancementRecovery, []);
  }
});

test("invalid characteristic promotions reject without consuming or changing character stats", async t => {
  const cases = [
    ["low sequence", ({ game, item, call }) => {
      game.character = fresh(6).character; item.characteristic.sequence = 5; call.args.sequence = 5;
    }],
    ["ordinary character", ({ game }) => { game.character = fresh(null).character; }],
    ["already sequence zero", ({ game }) => { game.character = fresh(0).character; }],
    ["wrong characteristic pathway", ({ item, call }) => {
      item.characteristic.pathwayId = "generalist"; call.args.pathwayId = "generalist";
    }],
    ["wrong requested pathway", ({ call }) => { call.args.pathwayId = "generalist"; }],
    ["skipped sequence", ({ item, call }) => { item.characteristic.sequence = 3; call.args.sequence = 3; }],
    ["repeated current sequence", ({ item, call }) => { item.characteristic.sequence = 5; call.args.sequence = 5; }],
    ["unidentified", ({ item }) => { item.characteristic.identified = false; }],
    ["unknown identity", ({ item }) => { item.characteristic = { identified: false }; }],
    ["invalid identity", ({ item }) => { item.characteristic.pathwayId = "not-a-pathway"; }],
    ["wrong item type", ({ item }) => { delete item.characteristic; item.name = "普通封存物"; }],
    ["missing inventory instance", ({ call }) => { call.args.characteristicInstanceId = "missing"; }],
    ["zero quantity", ({ item }) => { item.quantity = 0; }],
    ["fractional quantity", ({ item }) => { item.quantity = 1.5; }],
    ["string quantity", ({ item }) => { item.quantity = "1"; }],
    ["both resource IDs", ({ game, call }) => {
      const bottle = potion(4); game.inventory.push(bottle); call.args.potionInstanceId = bottle.instanceId;
    }],
    ["neither resource ID", ({ call }) => { delete call.args.characteristicInstanceId; }],
  ];
  for (const [label, mutate] of cases) {
    await t.test(label, () => {
      const fixture = ready();
      mutate(fixture);
      const original = structuredClone(fixture.game);
      const result = settle(fixture.game, [fixture.call]);
      assert.equal(result.results[0].ok, false);
      assert.deepEqual(result.game.character, original.character);
      assert.deepEqual(result.game.inventory, original.inventory);
      assert.deepEqual(result.progress.advancementRecovery, []);
      assert.deepEqual(fixture.game, original);
    });
  }
});

for (const [firstMethod, nextMethod] of [["characteristic", "characteristic"], ["characteristic", "potion"], ["potion", "characteristic"]]) {
  test("one turn cannot chain " + firstMethod + " and " + nextMethod + " promotions with different call IDs", () => {
    const { game } = ready();
    game.inventory = game.inventory.filter(entry => !normalizeCharacteristic(entry));
    const firstItem = firstMethod === "potion" ? potion(4) : characteristic(4);
    const nextItem = nextMethod === "potion" ? potion(3) : characteristic(3);
    game.inventory.push(firstItem, nextItem);
    const calls = [promotionCall(firstItem, 4, firstMethod), promotionCall(nextItem, 3, nextMethod)];
    const result = settle(game, calls);
    assert.equal(result.results[0].ok, true);
    assert.equal(result.results[1].ok, false);
    assert.match(result.results[1].reason, /同一回合/);
    assert.equal(getAdvancement(result.game.character).sequence, 4);
    assert.equal(result.game.inventory.find(entry => entry.instanceId === nextItem.instanceId).quantity, 1);
    assert.equal(result.game.character.stats.maxHealth, 40);
    assert.equal(result.game.character.stats.health, firstMethod === "characteristic" ? 20 : 40);
    assert.equal(collectImportantItemConfirmations(calls, result.results).length, 1);
  });
}

test("item.use and inventory.remove cannot bypass characteristic advancement confirmation", () => {
  for (const name of ["item.use", "inventory.remove"]) {
    for (const reason of ["吸收非凡特性并晋升", "整理背包"]) {
      const { game, item } = ready();
      item.tags.push("消耗品");
      item.properties = { consumable: true, health: 100 };
      const result = executeToolCalls(game, [{
        id: name + "-" + reason, name, args: { instanceId: item.instanceId, quantity: 1 }, reason,
      }], { playerAction: action });
      assert.equal(result.results[0].ok, false);
      assert.match(result.results[0].reason, /晋升.*确认|晋升验证/);
      assert.deepEqual(result.game.character, game.character);
      assert.deepEqual(result.game.inventory, game.inventory);
    }
  }
});

test("explicit characteristic UI requests replace conflicting AI promotion and duplicate resource consumption", () => {
  const { game, item } = ready();
  const original = structuredClone(game);
  const proposed = [
    { id: "wrong-promotion", name: "advancement.promote", args: { pathwayId: "generalist", sequence: 0 } },
    { id: "double-use", name: "item.use", args: { instanceId: item.instanceId } },
    { id: "double-remove-by-id", name: "inventory.remove", args: { itemId: item.itemId, quantity: 1 } },
    { id: "double-remove-by-name", name: "inventory.remove", args: { name: item.name, quantity: 1 } },
    { id: "read-money", name: "money.inspect", args: {}, reason: "核对资金" },
  ];
  const request = { characteristicInstanceId: item.instanceId };
  assert.equal(getAdvancementRequestGate(game, request), "");
  assert.equal(getCharacteristicUseGate(game, item.instanceId), "");
  const calls = ensureRequestedAdvancementToolCall(proposed, request, game.turn + 1, game);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].id, "advancement-8-" + item.instanceId);
  assert.equal(calls[0].name, "advancement.promote");
  assert.equal(calls[0].args.pathwayId, "seer");
  assert.equal(calls[0].args.sequence, 4);
  assert.equal(calls[0].args.characteristicInstanceId, item.instanceId);
  assert.equal(Object.hasOwn(calls[0].args, "potionInstanceId"), false);
  assert.match(calls[0].args.evidence, /50%.*确认/);
  assert.equal(calls[1].id, "read-money");
  const result = settle(game, calls);
  assert.ok(result.results.every(entry => entry.ok));
  assert.deepEqual(game, original);
});

test("only unambiguous current affirmative prose becomes a characteristic advancement request", () => {
  const { game, item, call } = ready();
  for (const text of ["吸收这份非凡特性", "融合" + item.name + "并正式晋升", "吞服非凡特性，晋升至序列4"]) {
    assert.equal(isExplicitAdvancementIntent(text), true, text);
    assert.deepEqual(inferPotionRequest(game, text), { characteristicInstanceId: item.instanceId }, text);
    assert.deepEqual(validatePlayerActions(game, text, {}).advancementRequest, { characteristicInstanceId: item.instanceId });
  }
  for (const text of ["能不能吸收非凡特性？", "是否融合非凡特性", "明天吸收非凡特性",
    "以后再吸收非凡特性", "暂不吸收非凡特性", "取消融合非凡特性", "拒绝吞服非凡特性",
    "我打算吸收非凡特性", "我只是检查非凡特性", "考虑吸收非凡特性后晋升"]) {
    assert.equal(isExplicitAdvancementIntent(text), false, text);
    assert.equal(inferPotionRequest(game, text), null, text);
    const result = executeToolCalls(game, [call], { playerAction: text });
    assert.equal(result.results[0].ok, false, text);
    assert.deepEqual(result.game.character, game.character);
    assert.deepEqual(result.game.inventory, game.inventory);
  }
  game.inventory.push(characteristic(3));
  assert.equal(inferPotionRequest(game, "吸收这份非凡特性"), null, "multiple unnamed resources must not be guessed");
});

test("important confirmation and audit show permanent half-health promotion; declining reruns from the original", () => {
  const { game, item, call } = ready();
  item.quantity = 2;
  item.importance = "normal";
  item.tags = [];
  const original = structuredClone(game);
  const preview = settle(game, [call]);
  const confirmations = collectImportantItemConfirmations([call], preview.results);
  assert.equal(confirmations.length, 1, "structured characteristics must be important even without important tags");
  const confirmation = confirmations[0];
  assert.equal(confirmation.key, call.id);
  assert.equal(confirmation.callIndex, 0);
  assert.equal(confirmation.confirmationKind, "advancement");
  assert.equal(confirmation.direction, "loss");
  assert.equal(confirmation.quantity, 1);
  assert.equal(confirmation.advancement.method, "characteristic");
  assert.deepEqual(confirmation.advancement.statChanges.health, { before: 34, after: 20 });
  assert.deepEqual(confirmation.advancement.statChanges.sanity, { before: 2, after: 30 });
  assert.equal(confirmation.advancement.after.sequence, 4);
  assert.ok(Array.isArray(confirmation.advancement.newlyUnlockedAbilities));
  const audit = auditTurnChanges(createAuditBaseline(game), preview.game);
  assert.deepEqual(audit.character.stats.health, { before: 34, after: 20, delta: -14 });
  const blocked = settle(game, [call], { blockedCallIndexes: confirmations.map(entry => entry.callIndex) });
  assert.equal(blocked.results[0].ok, false);
  assert.deepEqual(blocked.game.character, original.character);
  assert.deepEqual(blocked.game.inventory, original.inventory);
  assert.deepEqual(blocked.progress.advancementRecovery, []);
  assert.deepEqual(collectImportantItemConfirmations([call], blocked.results), []);
  assert.deepEqual(game, original);
});

for (const delta of [-100, 100]) {
  test("final characteristic recovery overrides same-turn HP delta " + delta + " and ticks, then resumes normal ticks", () => {
    const { game, call } = ready();
    game.statusEffects.push({
      id: "bleeding", name: "失血与恐惧", kind: "danger",
      tick: { sanity: -2, spirituality: -1 },
      healthEffect: { percent: -5, remainingTurns: null, startsTurn: game.turn + 1, lastTickTurn: game.turn },
    }, { id: "curse", name: "仍未解除的诅咒", kind: "danger" });
    const calls = [call, { id: "same-turn-delta", name: "character.update", args: { patch: { health: delta, sanity: -100 } }, reason: "仪式环境的伤势变化" }];
    const result = settle(game, calls);
    assert.ok(result.results.every(entry => entry.ok));
    assert.equal(result.game.character.stats.health, 20);
    assert.equal(result.game.character.stats.sanity, 30);
    assert.equal(result.game.character.stats.spirituality, 23);
    assert.deepEqual(result.game.statusEffects.map(status => status.id), ["bleeding", "curse"]);
    assert.equal(result.game.statusEffects.find(status => status.id === "bleeding").healthEffect.lastTickTurn, game.turn + 1);
    if (delta > 0) assert.ok(result.progress.statusTicks.some(change => change.stat === "health"));
    assert.deepEqual(result.progress.advancementRecovery.map(change => change.stat), ["health", "sanity"]);
    const resolution = createTurnResolution(calls, result.results, result.progress, result.game);
    assert.deepEqual(resolution.derivedEffects.advancementRecovery, result.progress.advancementRecovery);
    result.game.turn += 1;
    const next = resolveTurnProgress(result.game, "等待片刻", "low");
    assert.equal(result.game.character.stats.health, 18);
    assert.equal(result.game.character.stats.sanity, 28);
    assert.equal(result.game.character.stats.spirituality, 22);
    assert.deepEqual(next.advancementRecovery, []);
  });
}

test("save export and repeated migration preserve characteristic consumption and wounds without repeating growth or half-health reset", () => {
  const { game, item, call } = ready();
  item.quantity = 2;
  const accepted = settle(game, [call]).game;
  accepted.turn += 1;
  accepted.character.stats.health = 7;
  accepted.character.stats.sanity = 4;
  accepted.character.stats.spirituality -= 2;
  const original = structuredClone(accepted);
  let loaded = JSON.parse(JSON.stringify(cleanGame(accepted)));
  for (let roundTrip = 0; roundTrip < 3; roundTrip += 1) {
    loaded = migrateSave(loaded);
    assert.deepEqual(loaded.character.stats, original.character.stats);
    assert.equal(getAdvancement(loaded.character).sequence, 4);
    const remaining = loaded.inventory.find(entry => entry.instanceId === item.instanceId);
    assert.equal(remaining.quantity, 1);
    assert.deepEqual(remaining.characteristic, item.characteristic);
    loaded = JSON.parse(JSON.stringify(cleanGame(loaded)));
  }
  assert.deepEqual(accepted, original);
  const nextItem = characteristic(3);
  loaded.inventory.push(nextItem);
  const next = settle(loaded, [promotionCall(nextItem, 3)]);
  assert.equal(next.results[0].ok, true, "a new turn can advance one further rank after loading");
  assert.equal(next.game.character.stats.maxHealth, 47);
  assert.equal(next.game.character.stats.health, 23);
  assert.equal(next.game.character.stats.maxSpirituality - next.game.character.stats.spirituality, 6);
});

test("structured characteristic stacking never merges distinct pathway, rank, or identification identities", () => {
  const game = fresh();
  const identities = [
    { pathwayId: "seer", sequence: 4, identified: true },
    { pathwayId: "seer", sequence: 3, identified: true },
    { pathwayId: "generalist", sequence: 4, identified: true },
    { pathwayId: "seer", sequence: 4, identified: false },
    { pathwayId: "seer", sequence: 4, identified: true },
  ];
  const calls = identities.map((identity, index) => ({
    id: "add-characteristic-" + index, name: "inventory.add", reason: "获得有对应记录的封存物",
    args: { item: {
      itemId: "sealed-characteristic", name: "封存非凡特性", description: "外观相近的完整封存特性。",
      category: "非凡物品", quantity: 1, weight: 0.1, characteristic: identity,
    } },
  }));
  const result = executeToolCalls(game, calls);
  assert.ok(result.results.every(entry => entry.ok));
  const resources = result.game.inventory.filter(item => item.itemId === "sealed-characteristic");
  assert.equal(resources.length, 4);
  assert.equal(resources.reduce((sum, item) => sum + item.quantity, 0), 5);
  assert.equal(resources.find(item => item.characteristic.pathwayId === "seer" && item.characteristic.sequence === 4 && item.characteristic.identified).quantity, 2);
  for (const resource of resources.filter(item => !(item.characteristic.pathwayId === "seer" && item.characteristic.sequence === 4 && item.characteristic.identified))) assert.equal(resource.quantity, 1);
  assert.equal(resources.every(item => item.importance === "important"), true);
});

test("unknown characteristic truth is redacted and inspect or inventory.update cannot confirm or mutate its identity", () => {
  const { game, item } = ready();
  item.characteristic.identified = false;
  item.itemId = "secret-seer-sequence-four";
  item.description = "secret-description-seer-four";
  item.properties = { secret: "secret-property-seer-four", pathwayId: "seer", sequence: 4, identified: true };
  const visible = playerVisibleItem(item);
  assert.equal(visible.characteristicStatus, "unidentified");
  assert.doesNotMatch(JSON.stringify(visible), /secret-|pathwayId|sequence/);
  const result = executeToolCalls(game, [
    { id: "inspect-characteristic", name: "item.inspect", args: { instanceId: item.instanceId }, reason: "查清物品身份" },
    { id: "forge-characteristic", name: "inventory.update", args: { instanceId: item.instanceId, patch: {
      characteristic: { pathwayId: "generalist", sequence: 3, identified: true },
      properties: { pathwayId: "seer", sequence: 4, identified: true },
    } }, reason: "企图从普通更新确认身份" },
  ]);
  assert.ok(result.results.every(entry => entry.ok));
  const updated = result.game.inventory.find(entry => entry.instanceId === item.instanceId);
  assert.deepEqual(updated.characteristic, item.characteristic);
  assert.match(getCharacteristicUseGate(result.game, item.instanceId), /确认/);
  assert.doesNotMatch(JSON.stringify(result.results), /secret-|pathwayId|sequence/);
});

test("legacy uncle reward remains a sequence eight characteristic and unverified properties do not identify a higher-rank resource", () => {
  const game = fresh(9);
  const legacyReward = {
    instanceId: "reward-watch-archaeologist-characteristic", itemId: "archaeologist-characteristic",
    name: "考古学家非凡特性", description: "来自舅舅的序列8特性，并非成品魔药。",
    category: "非凡材料", quantity: 1, tags: ["重要物品", "非凡物品", "任务奖励"],
    importance: "important", properties: { pathwayId: "generalist", sequence: 8, consumableAsPotion: false },
  };
  const unverified = {
    instanceId: "legacy-unknown-characteristic", itemId: "legacy-unknown-characteristic",
    name: "封存非凡特性", description: "一份未可靠确认的封存物。", quantity: 1,
    properties: { pathwayId: "seer", sequence: 4, identified: true },
  };
  game.inventory.push(legacyReward, unverified);
  const loaded = migrateSave(JSON.parse(JSON.stringify(game)));
  const reward = loaded.inventory.find(entry => entry.instanceId === legacyReward.instanceId);
  assert.deepEqual(normalizeCharacteristic(reward), { pathwayId: "generalist", pathwayName: "通识者", sequence: 8, identified: true });
  assert.equal(Boolean(reward.potion), false);
  assert.match(getCharacteristicUseGate(loaded, reward.instanceId), /低序列/);
  const unknown = loaded.inventory.find(entry => entry.instanceId === unverified.instanceId);
  assert.deepEqual(normalizeCharacteristic(unknown), { identified: false });
  assert.match(getCharacteristicUseGate(loaded, unknown.instanceId), /确认/);
});
