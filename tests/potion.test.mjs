import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, DEFAULT_SYSTEM_PROMPT, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { collectImportantItemConfirmations } from "../src/engine/audit.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { buildPlanningContext, buildRenderingContext } from "../src/services/memory.js";
import { createTurnResolution } from "../src/services/turnResolution.js";
import { isExplicitAdvancementIntent } from "../src/data/character.js";
import { ensureRequestedAdvancementToolCall, getPotionAdvancementEligibility } from "../src/services/advancement.js";

function ordinaryWithRecipeAndPotion() {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "晋升测试员", extraordinary: "ordinary" });
  game.occult = { ...game.occult, contact: 1, contactedEntryId: "entry-test" };
  game.clues.push({
    id: "recipe-seer-9",
    title: "占卜家序列9配方",
    detail: "经可靠来源与材料验证的完整配方。",
    kind: "potion_recipe",
    pathwayId: "seer",
    sequence: 9,
  });
  game.inventory.push({
    instanceId: "potion-seer-9-instance",
    itemId: "potion-seer-9",
    name: "深靛色玻璃瓶",
    description: "瓶中液体在暗处呈现缓慢旋涡。",
    category: "非凡物品",
    quantity: 1,
    weight: 0.2,
    rarity: "稀有",
    condition: "密封",
    equipped: false,
    tags: ["非凡物品"],
    importance: "important",
    potion: { pathwayId: "seer", pathwayName: "占卜家", sequence: 9, identified: false },
  });
  return game;
}

test("ordinary players can identify a sequence 9 potion with a matching recipe", () => {
  const game = ordinaryWithRecipeAndPotion();
  const execution = executeToolCalls(game, [{
    id: "inspect-potion",
    name: "item.inspect",
    args: { instanceId: "potion-seer-9-instance" },
    reason: "依据已确认的配方核对魔药",
  }]);
  assert.equal(execution.results[0].ok, true);
  assert.equal(execution.game.inventory.find((item) => item.instanceId === "potion-seer-9-instance").potion.identified, true);
  assert.match(execution.results[0].log, /占卜家.*序列9/);
});

test("promotion atomically consumes the confirmed potion and opens the extraordinary path", () => {
  const inspected = executeToolCalls(ordinaryWithRecipeAndPotion(), [{
    id: "inspect-before-promote",
    name: "item.inspect",
    args: { instanceId: "potion-seer-9-instance" },
    reason: "依据配方完成鉴定",
  }]).game;
  const call = {
    id: "promote-seer-9",
    name: "advancement.promote",
    args: {
      pathwayId: "seer",
      sequence: 9,
      potionInstanceId: "potion-seer-9-instance",
      recipeClueId: "recipe-seer-9",
      evidence: "在安全地点按配方完成准备并主动服用",
    },
    reason: "玩家确认承担风险并进入占卜家途径",
  };
  const preview = executeToolCalls(inspected, [call]);
  assert.equal(preview.results[0].ok, true);
  assert.equal(preview.game.inventory.some((item) => item.instanceId === "potion-seer-9-instance"), false);
  assert.equal(preview.game.character.advancement.pathwayId, "seer");
  assert.equal(preview.game.character.advancement.sequence, 9);
  assert.equal(preview.game.character.extraordinary, "low");
  assert.deepEqual(preview.game.character.advancement.unlockedAbilities.map((ability) => ability.name), ["灵视", "仪式占卜", "危险直觉"]);
  assert.equal(preview.results[0].data.inventoryChange.delta, -1);
  assert.deepEqual(preview.results[0].data.advancement.statChanges.maxSpirituality, { before: 5, after: 8 });

  const confirmations = collectImportantItemConfirmations([call], preview.results);
  assert.equal(confirmations.length, 1);
  assert.equal(confirmations[0].direction, "loss");
  assert.equal(confirmations[0].confirmationKind, "advancement");
  assert.equal(confirmations[0].advancement.after.pathwayName, "占卜家");

  const blocked = executeToolCalls(inspected, [call], { blockedCallIndexes: [0] });
  assert.equal(blocked.results[0].ok, false);
  assert.equal(blocked.game.inventory.some((item) => item.instanceId === "potion-seer-9-instance"), true);
  assert.equal(blocked.game.character.advancement.type, "ordinary");
});

test("promotion requires explicit player intent and potion consumption cannot bypass it", () => {
  const inspected = executeToolCalls(ordinaryWithRecipeAndPotion(), [{ id: "inspect-intent", name: "item.inspect", args: { instanceId: "potion-seer-9-instance" }, reason: "依据配方完成鉴定" }]).game;
  const promoteCall = {
    id: "promote-without-intent",
    name: "advancement.promote",
    args: { pathwayId: "seer", sequence: 9, potionInstanceId: "potion-seer-9-instance", recipeClueId: "recipe-seer-9", evidence: "已准备晋升仪式" },
    reason: "模型擅自推进晋升",
  };
  const unauthorized = executeToolCalls(inspected, [promoteCall], { playerAction: "继续观察瓶中的液体" });
  assert.equal(unauthorized.results[0].ok, false);
  assert.match(unauthorized.results[0].reason, /没有明确表示/);
  assert.equal(unauthorized.game.inventory.some((item) => item.instanceId === "potion-seer-9-instance"), true);
  assert.equal(unauthorized.game.character.advancement.type, "ordinary");

  const removeAsConsumption = executeToolCalls(inspected, [{ id: "remove-potion", name: "inventory.remove", args: { instanceId: "potion-seer-9-instance", quantity: 1 }, reason: "服用并消耗这份魔药" }]);
  assert.equal(removeAsConsumption.results[0].ok, false);
  assert.match(removeAsConsumption.results[0].reason, /晋升确认/);
  assert.equal(isExplicitAdvancementIntent("服用深靛色魔药并正式晋升"), true);
  assert.equal(isExplicitAdvancementIntent("继续检查魔药的颜色"), false);
});

test("inventory promotion requests produce a deterministic complete advancement call", () => {
  const inspected = executeToolCalls(ordinaryWithRecipeAndPotion(), [{ id: "inspect-ui", name: "item.inspect", args: { instanceId: "potion-seer-9-instance" }, reason: "依据配方完成鉴定" }]).game;
  const eligible = getPotionAdvancementEligibility(inspected, "potion-seer-9-instance");
  assert.equal(eligible.sequence, 9);
  assert.equal(eligible.recipe.id, "recipe-seer-9");

  const calls = ensureRequestedAdvancementToolCall([], { potionInstanceId: "potion-seer-9-instance" }, 7, inspected);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "advancement.promote");
  assert.equal(calls[0].id, "advancement-7-potion-seer-9-instance");
  assert.deepEqual(calls[0].args, {
    pathwayId: "seer",
    sequence: 9,
    potionInstanceId: "potion-seer-9-instance",
    recipeClueId: "recipe-seer-9",
    evidence: "玩家从物品栏明确选择服用已鉴定魔药，并进入永久晋升确认流程",
  });
});

test("promotion rejects missing story contact, mismatched recipe, and blind potion use", () => {
  const game = ordinaryWithRecipeAndPotion();
  game.occult.contact = 0;
  const blindUse = executeToolCalls(game, [{ id: "blind", name: "item.use", args: { instanceId: "potion-seer-9-instance" }, reason: "直接尝试服用" }]);
  assert.equal(blindUse.results[0].ok, false);
  assert.match(blindUse.results[0].reason, /未知魔药|鉴定/);

  const promote = executeToolCalls(game, [{
    id: "no-contact",
    name: "advancement.promote",
    args: { pathwayId: "seer", sequence: 9, potionInstanceId: "potion-seer-9-instance", recipeClueId: "recipe-seer-9", evidence: "准备并服用序列9魔药" },
    reason: "尝试跳过剧情入口",
  }]);
  assert.equal(promote.results[0].ok, false);
  assert.match(promote.results[0].reason, /剧情.*接触/);
});

test("unidentified potion truth is private to planning and redacted from final rendering", () => {
  const before = ordinaryWithRecipeAndPotion();
  const planning = buildPlanningContext(before, "检查瓶子", DEFAULT_SYSTEM_PROMPT, { nativeTools: true });
  assert.match(planning.at(-1).content, /potionFacts/);
  assert.match(planning.at(-1).content, /seer/);

  const result = {
    ok: true,
    data: { inventoryChange: { ...before.inventory.at(-1), delta: 1 } },
  };
  const resolution = createTurnResolution([{ name: "inventory.add", reason: "取得瓶子" }], [result]);
  const rendering = buildRenderingContext(before, before, "取得瓶子", DEFAULT_SYSTEM_PROMPT, resolution, { nativeTools: true });
  const finalData = rendering.at(-1).content;
  assert.doesNotMatch(finalData, /"potion":\{"pathwayId":"seer"/);
  assert.match(finalData, /potionStatus/);
});
