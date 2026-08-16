import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { createContextualChoices, resolveChoices } from "../src/services/choices.js";

test("invalid model choices become contextual choices instead of fixed fallback text", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "选项测试员" });
  const resolved = resolveChoices({ narrative: "车站的钟声再次响起。", choices: [
    { label: "留在原地继续观察", intent: "investigate", risk: "low" },
    { label: "向在场的人谨慎打听", intent: "social", risk: "medium" },
    { label: "冒险追查最异常的迹象", intent: "dangerous", risk: "high" },
  ], choiceMeta: { source: "fallback", fallback: true, reason: "missing_choices" } }, game, "观察站台");
  assert.equal(resolved.choiceMeta.source, "local");
  assert.notDeepEqual(resolved.choices.map((choice) => choice.label), ["留在原地继续观察", "向在场的人谨慎打听", "冒险追查最异常的迹象"]);
  assert.equal(new Set(resolved.choices.map((choice) => choice.label)).size, 3);
});

test("tool follow-up reuses the previous valid model choices when it omits choices", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "后续测试员" });
  const previous = {
    choices: createContextualChoices(game, "观察公告"),
    meta: { source: "model", fallback: false },
  };
  const resolved = resolveChoices({ narrative: "本地规则已确认变化。", choices: [], choiceMeta: { source: "fallback", fallback: true, reason: "missing_choices" } }, game, "观察公告", previous);
  assert.equal(resolved.choiceMeta.source, "reused");
  assert.deepEqual(resolved.choices, previous.choices);
});

test("contextual choices change with the current location", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "地点测试员" });
  const stationChoices = createContextualChoices(game, "继续");
  const bridgeGame = { ...game, location: { ...game.location, name: "桥区·雾鸦旅店" } };
  const bridgeChoices = createContextualChoices(bridgeGame, "继续");
  assert.notEqual(stationChoices[1].label, bridgeChoices[1].label);
});

test("local choices rotate with story turns instead of staying on one fixed trio", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "轮次测试员" });
  const first = createContextualChoices(game, "继续");
  const later = createContextualChoices({ ...game, turn: game.turn + 1 }, "继续");
  assert.notDeepEqual(first.map((choice) => choice.label), later.map((choice) => choice.label));
});
