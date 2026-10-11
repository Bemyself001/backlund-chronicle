import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { normalizeInventoryItem } from "../src/system/items.js";
import { BEYONDER_EQUIPMENT_SLOTS, isBeyonderEquipment } from "../src/system/beyonderItems.js";
import { beyonderEquipmentSlots, canEquipItem } from "../src/system/equipment.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { migrateSave } from "../src/services/storage.js";
import { visibleGameState } from "../src/services/memory.js";
import { equippedWeapon } from "../src/system/weapons.js";

let callIndex = 0;
const call = (name, args) => ({ id: `beyonder-equipment:${++callIndex}`, name, args, reason: "玩家实际获得或操作该物品" });
const fresh = () => createInitialGame({ ...EMPTY_CHARACTER, name: "非凡装备测试员" });
const artifact = (id, overrides = {}) => normalizeInventoryItem({
  instanceId: id, itemId: id, name: `非凡道具${id}`, description: "已确认的神奇道具。",
  category: "非凡物品", tags: [], quantity: 1, equipped: false, weight: 0.1, ...overrides,
});
const ordinaryWeapon = () => normalizeInventoryItem({
  instanceId: "normal-gun", itemId: "normal-gun", name: "普通手枪", quantity: 1, equipped: false,
  weapon: { version: 1, kind: "firearm", quality: "common", bonusPercent: 15 },
});
const equip = (game, id) => executeToolCalls(game, [call("item.equip", { instanceId: id })]);
const unequip = (game, id) => executeToolCalls(game, [call("item.unequip", { instanceId: id })]);
function withArtifacts() {
  const game = fresh();
  game.inventory.push(artifact("a"), artifact("b"), artifact("c"));
  return game;
}
const equippedIds = game => beyonderEquipmentSlots(game).map(entry => entry.item?.instanceId || null);

test("registered artifacts receive a separate equipment tag while ordinary descriptions confer no powers", () => {
  for (const category of ["非凡物品", "神奇物品", "封印物"]) {
    const item = artifact(category, { category });
    assert.ok(item.tags.includes("非凡物品") && item.tags.includes("装备"));
    assert.equal(item.beyonder, true);
    assert.equal(item.importance, "important");
    assert.equal(canEquipItem(item), true);
    assert.deepEqual(normalizeInventoryItem(JSON.parse(JSON.stringify(item))), item);
  }
  const tagged = artifact("tagged", { category: "饰品", tags: ["神奇物品"] });
  assert.equal(isBeyonderEquipment(tagged), true);
  const ordinary = normalizeInventoryItem({ name: "非凡故事纪念徽章", category: "随身物品", description: "非凡者的普通纪念品。", tags: [] });
  assert.equal(isBeyonderEquipment(ordinary), false);
  assert.equal(canEquipItem(ordinary), false);
});

test("potions, characteristics, talismans and materials cannot occupy slots even with forged equipment tags", () => {
  const items = [
    artifact("potion", { name: "魔术师魔药", potion: { pathwayId: "seer", sequence: 7, identified: true }, tags: ["非凡物品", "装备"] }),
    artifact("characteristic", { name: "魔术师非凡特性", characteristic: { pathwayId: "seer", sequence: 7, identified: true }, tags: ["非凡物品", "装备"] }),
    artifact("talisman", { category: "符咒", tags: ["非凡物品", "装备"] }),
    artifact("material", { category: "非凡材料", tags: ["非凡物品", "装备"] }),
  ];
  const game = fresh();
  game.inventory.push(...items);
  for (const item of items) {
    assert.equal(isBeyonderEquipment(item), false, item.instanceId);
    assert.equal(canEquipItem(item), false, item.instanceId);
    assert.equal(equip(game, item.instanceId).results[0].ok, false);
  }
  assert.deepEqual(equippedIds(game), [null, null]);
});

test("shared equip tools fill two independent slots and reject a third atomically", () => {
  let game = withArtifacts();
  for (const id of ["a", "b"]) {
    const result = equip(game, id);
    assert.equal(result.results[0].ok, true);
    game = result.game;
  }
  const before = structuredClone(game);
  const third = equip(game, "c");
  assert.equal(third.results[0].ok, false);
  assert.match(third.results[0].reason, /最多同时装备两件/);
  assert.deepEqual(third.game.inventory, before.inventory);
  assert.deepEqual(third.game.equipment, before.equipment);
  assert.deepEqual(game, before, "tools never mutate the supplied state");
  assert.deepEqual(equippedIds(game), ["a", "b"]);
});

test("artifacts coexist with ordinary weapons and clothes, including artifacts shaped as clothing", () => {
  let game = fresh();
  const coat = game.inventory.find(item => item.slot === "外套");
  game.inventory.push(ordinaryWeapon(), artifact("magic-coat", { name: "夜幕外套", category: "服装", slot: "外套", tags: ["非凡物品"] }), artifact("ring"));
  for (const id of ["normal-gun", "magic-coat", "ring"]) game = equip(game, id).game;
  assert.equal(game.equipment["服装:外套"], coat.instanceId);
  assert.equal(game.inventory.find(item => item.instanceId === coat.instanceId).equipped, true);
  assert.equal(game.equipment["武器"], "normal-gun");
  assert.deepEqual(equippedIds(game), ["magic-coat", "ring"]);
});

test("reequipping is idempotent and removing one artifact makes its exact slot reusable", () => {
  let game = withArtifacts();
  game = equip(equip(game, "a").game, "b").game;
  game = equip(game, "a").game;
  assert.deepEqual(equippedIds(game), ["a", "b"]);
  game = unequip(game, "a").game;
  assert.deepEqual(equippedIds(game), [null, "b"]);
  game = equip(game, "c").game;
  assert.deepEqual(equippedIds(game), ["c", "b"]);
  assert.equal(game.inventory.find(item => item.instanceId === "a").equipped, false);
});

test("partial removal keeps a slot while removing the last copy clears it without disturbing another", () => {
  let game = withArtifacts();
  game.inventory.find(item => item.instanceId === "b").quantity = 2;
  game = equip(equip(game, "a").game, "b").game;
  game = executeToolCalls(game, [call("inventory.remove", { instanceId: "b", quantity: 1 })]).game;
  assert.deepEqual(equippedIds(game), ["a", "b"]);
  game = executeToolCalls(game, [call("inventory.remove", { instanceId: "b", quantity: 1 })]).game;
  assert.deepEqual(equippedIds(game), ["a", null]);
  assert.equal(game.equipment[BEYONDER_EQUIPMENT_SLOTS[1]], undefined);
  assert.equal(game.inventory.some(item => item.instanceId === "b"), false);
  assert.equal(equip(game, "c").results[0].ok, true);
});

test("acquisition does not auto-equip or merge different artifact instances", () => {
  const item = { itemId: "same-ring", name: "雨幕指环", category: "封印物", description: "剧情中实际获得的指环。", weight: 0.1, equipped: true };
  const result = executeToolCalls(fresh(), [call("inventory.add", { item }), call("inventory.add", { item })]);
  assert.ok(result.results.every(entry => entry.ok));
  const rings = result.game.inventory.filter(entry => entry.itemId === "same-ring");
  assert.equal(rings.length, 2);
  assert.notEqual(rings[0].instanceId, rings[1].instanceId);
  assert.ok(rings.every(entry => !entry.equipped && entry.beyonder && entry.tags.includes("装备")));
  assert.deepEqual(equippedIds(result.game), [null, null]);
});

test("tag and property updates cannot erase confirmed artifact identity and bypass the limit", () => {
  let game = withArtifacts();
  game.inventory[game.inventory.length - 3] = artifact("a", { category: "饰品", tags: ["非凡物品"] });
  game = equip(equip(game, "a").game, "b").game;
  game = executeToolCalls(game, [call("inventory.update", { instanceId: "a", patch: { tags: [], description: "更新外观" } })]).game;
  assert.deepEqual(equippedIds(game), ["a", "b"]);
  assert.equal(isBeyonderEquipment(game.inventory.find(item => item.instanceId === "a")), true);
  assert.equal(equip(game, "c").results[0].ok, false);
  game = executeToolCalls(game, [call("inventory.update", { instanceId: "a", patch: { properties: { consumable: true }, tags: [] } })]).game;
  game = executeToolCalls(game, [call("inventory.update", { instanceId: "a", patch: { properties: {}, tags: [] } })]).game;
  assert.equal(isBeyonderEquipment(game.inventory.find(item => item.instanceId === "a")), true);
  game = equip(game, "c").game;
  assert.equal(equip(game, "a").results[0].ok, false);
  for (const tag of ["材料", "原料", "符咒"]) {
    game = executeToolCalls(game, [call("inventory.update", { instanceId: "a", patch: { tags: [tag, "装备"] } })]).game;
    assert.equal(equip(game, "a").results[0].ok, false, `${tag} cannot disguise an artifact as ordinary equipment`);
    assert.deepEqual(equippedIds(game), ["c", "b"]);
  }
  game = executeToolCalls(game, [call("inventory.update", { instanceId: "a", patch: { tags: ["装备"] } })]).game;
  assert.equal(isBeyonderEquipment(game.inventory.find(item => item.instanceId === "a")), true);
  assert.equal(equip(game, "a").results[0].ok, false);
});

test("revealing an equipped ordinary item as an artifact cannot overfill the independent slots", () => {
  let game = withArtifacts();
  const ordinary = normalizeInventoryItem({ instanceId: "old-ring", itemId: "old-ring", name: "旧指环", category: "饰品", tags: ["装备"], quantity: 1, equipped: false });
  game.inventory.push(ordinary);
  for (const id of ["a", "b", "old-ring"]) game = equip(game, id).game;
  const result = executeToolCalls(game, [call("inventory.update", { instanceId: "old-ring", patch: { tags: ["非凡物品"] } })]);
  assert.equal(result.results[0].ok, true);
  assert.match(result.results[0].log, /栏位已满/);
  assert.deepEqual(equippedIds(result.game), ["a", "b"]);
  assert.equal(result.game.inventory.find(item => item.instanceId === "old-ring").equipped, false);
  assert.equal(result.game.equipment["饰品"], undefined);
});

test("legacy migration preserves two slots, keeps excess items in the bag and is repeatable", () => {
  const raw = withArtifacts();
  for (const item of raw.inventory.filter(isBeyonderEquipment)) { item.equipped = true; delete item.beyonder; item.tags = []; }
  raw.equipment["非凡物品"] = "a";
  raw.equipment[BEYONDER_EQUIPMENT_SLOTS[1]] = "b";
  raw.equipment["已失效"] = "missing";
  const before = structuredClone(raw);
  const migrated = migrateSave(raw);
  assert.deepEqual(raw, before);
  assert.deepEqual(equippedIds(migrated), ["a", "b"]);
  assert.ok(migrated.inventory.find(item => item.instanceId === "c"));
  assert.equal(migrated.inventory.find(item => item.instanceId === "c").equipped, false);
  assert.equal(migrated.equipment["非凡物品"], undefined);
  assert.equal(migrated.equipment["已失效"], undefined);
  const reloaded = migrateSave(JSON.parse(JSON.stringify(migrated)));
  assert.deepEqual(reloaded.inventory, migrated.inventory);
  assert.deepEqual(reloaded.equipment, migrated.equipment);
});

test("nonordinary weapons use artifact slots while damage comes from only one equipped weapon", () => {
  let game = fresh();
  game.inventory.push(ordinaryWeapon(), artifact("magic-blade", { name: "非凡长剑", weapon: { version: 1, kind: "melee", quality: "extraordinary", bonusPercent: 22 } }),
    artifact("magic-gun", { name: "非凡手枪", weapon: { version: 1, kind: "firearm", quality: "extraordinary", bonusPercent: 32 } }));
  for (const id of ["normal-gun", "magic-blade", "magic-gun"]) game = equip(game, id).game;
  assert.deepEqual(equippedIds(game), ["magic-blade", "magic-gun"]);
  assert.equal(equippedWeapon(game).instanceId, "normal-gun");
  assert.equal(equippedWeapon(game).bonusPercent, 15);
  game = unequip(game, "normal-gun").game;
  assert.equal(equippedWeapon(game).instanceId, "magic-blade");
  game = unequip(game, "magic-blade").game;
  assert.equal(equippedWeapon(game).bonusPercent, 32);
  assert.deepEqual(equippedIds(migrateSave(game)), [null, "magic-gun"]);
});

test("planning and rendering see exact slot occupancy, the two-item limit and no hidden item data", () => {
  let game = withArtifacts();
  game.inventory.find(item => item.instanceId === "a").hiddenInfo = "尚未发现的能力";
  game = equip(game, "a").game;
  const visible = visibleGameState(game);
  assert.equal(visible.beyonderEquipment.limit, 2);
  assert.deepEqual(visible.beyonderEquipment.slots.map(entry => entry.instanceId), ["a", null]);
  assert.equal(visible.equipment[BEYONDER_EQUIPMENT_SLOTS[0]], "a");
  assert.equal(JSON.stringify(visible).includes("尚未发现的能力"), false);
});
