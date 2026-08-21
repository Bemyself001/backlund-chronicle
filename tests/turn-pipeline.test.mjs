import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, DEFAULT_SYSTEM_PROMPT, EMPTY_CHARACTER, migrateSystemPrompt } from "../src/data/defaults.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { buildChoiceRegenerationContext, buildPlanningContext, buildRenderingContext, buildUnifiedContext, composeSummary, parseSectionedSummary, updateMemory, visibleGameState } from "../src/services/memory.js";
import { createTurnResolution } from "../src/services/turnResolution.js";

test("system prompt map rules migrate idempotently", () => {
  assert.equal(migrateSystemPrompt(DEFAULT_SYSTEM_PROMPT), DEFAULT_SYSTEM_PROMPT);
  const previousRule = DEFAULT_SYSTEM_PROMPT.replace("仅当 temporary=true 的地点在剧情中确认失效且没有关联档案时，才使用 location.archive。", "");
  const migrated = migrateSystemPrompt(previousRule);
  assert.match(migrated, /location\.archive/);
  assert.match(migrated, /本轮明确决定服用魔药/);
  assert.equal((migrated.match(/location\.grow/g) || []).length, 1);
});

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
  // 普通观察回合不注入地图候选清单，节省输入 token
  assert.doesNotMatch(data.content, /mapDiscoveryCandidates/);
});

test("planning context exposes map candidates only for map-related turns", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "地图测试员" });
  const byOption = buildPlanningContext(game, "继续调查", DEFAULT_SYSTEM_PROMPT, { nativeTools: true, mapInvestigation: "queen-archive" }).at(-1).content;
  assert.match(byOption, /mapDiscoveryCandidates/);
  assert.match(byOption, /queen-archive/);

  const byKeyword = buildPlanningContext(game, "打听一下哪里能租到便宜的公寓", DEFAULT_SYSTEM_PROMPT, { nativeTools: true }).at(-1).content;
  assert.match(byKeyword, /mapDiscoveryCandidates/);
  assert.match(byKeyword, /mapGrowthAnchors/);
  assert.match(byKeyword, /east-station/);

  const byName = buildPlanningContext(game, "我想去市政档案馆碰碰运气", DEFAULT_SYSTEM_PROMPT, { nativeTools: true }).at(-1).content;
  assert.match(byName, /queen-archive/);

  const unified = buildUnifiedContext(game, "在房间里整理线索", DEFAULT_SYSTEM_PROMPT, { nativeTools: true }).at(-1).content;
  assert.doesNotMatch(unified, /mapDiscoveryCandidates/);
  assert.doesNotMatch(unified, /mapGrowthAnchors/);
});

test("rumored dynamic places stay private during rendering but remain available to planning", () => {
  const before = createInitialGame({ ...EMPTY_CHARACTER, name: "传闻隐私测试员" });
  const call = {
    id: "grow-private-rumor", name: "location.grow", reason: "不同跑腿人提到同一处传闻",
    args: { location: { name: "红烟囱药材铺", district: "东区", kind: "shop", scope: "landmark", anchorId: "iron-gate", rumor: "铁门街深处据说有一家傍晚开门的药材铺。", description: "一间门面狭窄、装有红铜烟管的药材铺。", status: "rumored", temporary: false } },
  };
  const execution = executeToolCalls(before, [call]);
  const visible = JSON.stringify(visibleGameState(execution.game));
  assert.doesNotMatch(visible, /红烟囱药材铺|红铜烟管/);

  const planning = buildPlanningContext(execution.game, "调查地图上的药材铺传闻", DEFAULT_SYSTEM_PROMPT, { nativeTools: true }).at(-1).content;
  assert.match(planning, /红烟囱药材铺/);

  const resolution = createTurnResolution([call], execution.results, { elapsedMinutes: 10 });
  const rendering = buildRenderingContext(before, execution.game, "打听新的店铺", DEFAULT_SYSTEM_PROMPT, resolution, { nativeTools: true }).map((message) => message.content).join("\n");
  assert.doesNotMatch(rendering, /红烟囱药材铺|红铜烟管/);
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

test("sectioned summary parses markers, drops empty sections and round-trips", () => {
  const text = "【案件与调查】黑函的笔迹指向市政档案馆。\n【人物与关系】售票员答应留意灰呢帽男人。\n【承诺与伏笔】无\n【居住与日常】租下灰墙公寓单间。";
  const sections = parseSectionedSummary(text);
  assert.deepEqual(sections, {
    cases: "黑函的笔迹指向市政档案馆。",
    people: "售票员答应留意灰呢帽男人。",
    hooks: "",
    daily: "租下灰墙公寓单间。",
  });
  const composed = composeSummary(sections);
  assert.match(composed, /【案件与调查】黑函/);
  assert.match(composed, /【居住与日常】租下/);
  assert.doesNotMatch(composed, /【承诺与伏笔】/);
  assert.equal(parseSectionedSummary("没有分区标记的普通摘要"), null);
});
