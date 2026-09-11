import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame, DEFAULT_API_SETTINGS, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { equipmentSlot, loadoutInput, localLoadout, validateLoadout } from "../src/data/loadout.js";
import { generateLoadout } from "../src/services/loadout.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { migrateSave } from "../src/services/storage.js";

const profile = { ...EMPTY_CHARACTER, name: "行装测试员", talent: "heirloom-watch", carriedItemName: "旧相机", carriedItemDescription: "镜头有一道划痕。" };

test("confirmed clothes, one personal item and bonus watch are independent and survive reload", () => {
  const loadout = localLoadout(profile);
  const game = createInitialGame(profile, loadout);
  assert.equal(game.inventory.filter((entry) => entry.category === "随身物品").length, 1);
  assert.ok(game.inventory.some((entry) => entry.name === "旧相机" && entry.quantity === 1));
  assert.ok(game.inventory.some((entry) => entry.itemId === "heirloom-watch" && entry.hiddenInfo));
  assert.equal(game.inventory.filter((entry) => entry.equipped).length, 4);
  assert.equal(Object.keys(game.equipment).length, 4);
  assert.equal(game.inventory.some((entry) => ["brass-compass", "pocket-notebook", "matchbox"].includes(entry.itemId)), false);
  const loaded = migrateSave(structuredClone(game));
  assert.deepEqual(loaded.inventory, game.inventory);
  assert.deepEqual(loaded.equipment, game.equipment);
  assert.equal(loaded.character.carriedItemName, "旧相机");
});

test("loadout validates limits and discards model abilities, money and nested inventory", () => {
  const raw = localLoadout(profile);
  raw.clothes[0].properties = { health: 999 };
  raw.clothes[0].potion = { pathwayId: "seer", sequence: 9 };
  raw.clothes[0].hiddenInfo = "超凡力量";
  raw.money = { pounds: 999 };
  raw.carriedItem.contents = [{ name: "金条" }];
  const checked = validateLoadout(raw, profile);
  assert.equal(checked.clothes[0].properties, undefined);
  assert.equal(checked.clothes[0].potion, undefined);
  assert.equal(checked.carriedItem.contents, undefined);
  assert.equal(checked.money, undefined);
  assert.throws(() => validateLoadout({ ...raw, clothes: [...raw.clothes, raw.clothes[0]] }, profile), /部位/);
  assert.throws(() => validateLoadout({ ...raw, clothes: [{ ...raw.clothes[0], weight: -1 }] }, profile), /重量/);
  assert.throws(() => validateLoadout({ ...raw, clothes: [{ ...raw.clothes[0], quantity: 9 }] }, profile), /数量/);
  assert.throws(() => validateLoadout({ ...raw, carriedItem: { accepted: false } }, profile), /普通物品/);
  assert.throws(() => loadoutInput({ ...profile, carriedItemName: "相机、手枪" }), /一件/);
  assert.throws(() => loadoutInput({ ...profile, carriedItemName: "占卜家序列9魔药" }), /剧情/);
  assert.equal(localLoadout(EMPTY_CHARACTER).carriedItem, null);
});

test("changing one clothing slot preserves other clothes and removal clears the equipment record", () => {
  let game = createInitialGame(profile);
  const coat = game.inventory.find((entry) => entry.slot === "外套");
  game = executeToolCalls(game, [{ id: "off", name: "item.unequip", args: { instanceId: coat.instanceId }, reason: "脱下外套" }]).game;
  assert.equal(game.inventory.filter((entry) => entry.equipped).length, 3);
  game = executeToolCalls(game, [{ id: "on", name: "item.equip", args: { instanceId: coat.instanceId }, reason: "穿回外套" }]).game;
  assert.equal(game.inventory.filter((entry) => entry.equipped).length, 4);
  const newCoat = { ...coat, instanceId: "replacement-coat", itemId: "replacement-coat", equipped: false };
  game.inventory.push(newCoat);
  game = executeToolCalls(game, [{ id: "replace", name: "item.equip", args: { instanceId: newCoat.instanceId }, reason: "更换外套" }]).game;
  assert.equal(game.inventory.find((entry) => entry.instanceId === coat.instanceId).equipped, false);
  assert.equal(game.inventory.filter((entry) => entry.equipped).length, 4);
  assert.equal(game.equipment[equipmentSlot(coat)], newCoat.instanceId);
  game = executeToolCalls(game, [{ id: "remove", name: "inventory.remove", args: { instanceId: coat.instanceId, quantity: 1 }, reason: "放弃外套" }]).game;
  assert.equal(game.equipment[equipmentSlot(coat)], newCoat.instanceId);
  game = executeToolCalls(game, [{ id: "remove-worn", name: "inventory.remove", args: { instanceId: newCoat.instanceId, quantity: 1 }, reason: "放下新外套" }]).game;
  assert.equal(game.equipment[equipmentSlot(newCoat)], undefined);
  assert.equal(Object.keys(game.equipment).length, 3);
});

test("AI loadout uses configured transport and only submits clothing and personal item descriptions", async (t) => {
  const raw = localLoadout(profile);
  let request;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(raw) } }] }), { headers: { "content-type": "application/json" } });
  });
  const result = await generateLoadout({ ...profile, avatar: "private-portrait", secret: "private-secret" }, { ...DEFAULT_API_SETTINGS, mockMode: false });
  assert.equal(result.mode, "ai");
  assert.equal(result.clothes.length, 4);
  assert.equal(request.stream, false);
  assert.equal(request.tools, undefined);
  assert.doesNotMatch(JSON.stringify(request.messages), /private-portrait|private-secret/);
});

test("generation failures and cancellation do not silently create fallback items", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ choices: [{ message: { content: "没有清单" } }] }), { headers: { "content-type": "application/json" } }));
  await assert.rejects(generateLoadout(profile, { ...DEFAULT_API_SETTINGS, mockMode: false }), /JSON/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(generateLoadout(profile, DEFAULT_API_SETTINGS, controller.signal), { name: "AbortError" });
  const result = await generateLoadout(profile, DEFAULT_API_SETTINGS);
  assert.equal(result.mode, "local");
});
