import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, DEFAULT_SYSTEM_PROMPT, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { buildChoiceRegenerationContext, buildPlanningContext, buildRenderingContext, updateMemory } from "../src/services/memory.js";
import { createTurnResolution } from "../src/services/turnResolution.js";

test("planning context injects private simulation data only as untrusted turn data", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "上下文测试员" });
  const messages = buildPlanningContext(game, "观察站台", DEFAULT_SYSTEM_PROMPT, { nativeTools: true });
  const stage = messages.find((message) => message.content.startsWith("【阶段 A"));
  const data = messages.at(-1);

  assert.equal(stage.role, "system");
  assert.match(stage.content, /不要生成最终剧情/);
  assert.equal(data.role, "user");
  assert.match(data.content, /privateSimulationState/);
  assert.match(data.content, /hiddenDanger/);
});

test("rendering context contains the authoritative resolution but excludes private danger state", () => {
  const before = createInitialGame({ ...EMPTY_CHARACTER, name: "叙事测试员" });
  const after = { ...before, turn: 1, worldTime: "1349年 10月17日 · 周二 · 18:35" };
  const resolution = { accepted: [], rejected: [], derivedEffects: { elapsedMinutes: 15 } };
  const messages = buildRenderingContext(before, after, "观察站台", DEFAULT_SYSTEM_PROMPT, resolution, { nativeTools: true });
  const serialized = messages.map((message) => message.content).join("\n");

  assert.match(serialized, /阶段 B：最终叙事/);
  assert.match(serialized, /turnResolution/);
  assert.match(serialized, /assistant\.content 只放纯文本剧情/);
  assert.doesNotMatch(messages.at(-1).content, /hiddenDanger/);
});

test("choice regeneration receives final narrative and cannot change state", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "选项重试员" });
  const messages = buildChoiceRegenerationContext(game, "检查门锁", "门锁没有被打开。", "选项重复", DEFAULT_SYSTEM_PROMPT, { nativeTools: true });
  assert.match(messages[1].content, /ui\.present_choices/);
  assert.match(messages[1].content, /不得改变游戏状态/);
  assert.match(messages.at(-1).content, /门锁没有被打开/);
});

test("turn resolution and memory are derived from local execution results", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "提交测试员" });
  const resolution = createTurnResolution(
    [{ name: "status.add", reason: "发现危险" }, { name: "money.add", reason: "没有来源" }],
    [{ ok: true, log: "添加警觉状态" }, { ok: false, reason: "没有确认资金来源", log: "变更被拒绝" }],
    { elapsedMinutes: 10, worldTime: "1349年 10月17日 · 周二 · 18:30", dangerDelta: 1 },
  );
  const memory = updateMemory(game, "检查暗门", "你确认暗门无法直接打开。", resolution);

  assert.deepEqual(resolution.accepted.map((entry) => entry.name), ["status.add"]);
  assert.deepEqual(resolution.rejected.map((entry) => entry.name), ["money.add"]);
  assert.match(memory.memoryNotes.at(-1), /确认 status\.add/);
  assert.match(memory.memoryNotes.at(-1), /拒绝 money\.add/);
});
