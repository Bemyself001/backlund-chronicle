// 快速模式 vs 两段式 基准对比脚本
// 用法：
//   1. 复制 scripts/bench-settings.example.json 为 scripts/bench-settings.json 并填入真实 API 配置
//      （该文件已加入 .gitignore，密钥不会提交）
//   2. node scripts/benchmark-fast-mode.mjs [轮数，默认 5]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInitialGame, DEFAULT_SYSTEM_PROMPT } from "../src/data/defaults.js";
import { buildPlanningContext, buildRenderingContext, buildUnifiedContext, updateMemory } from "../src/services/memory.js";
import { requestAIWithReasoningFallback } from "../src/services/api.js";
import { dedupeToolCalls, executeToolCalls, normalizeToolCalls, validateToolCall } from "../src/engine/tools.js";
import { resolveTurnProgress } from "../src/engine/turn.js";
import { createTurnResolution } from "../src/services/turnResolution.js";

const here = dirname(fileURLToPath(import.meta.url));
const settingsPath = join(here, "bench-settings.json");
let settings;
try {
  settings = JSON.parse(readFileSync(settingsPath, "utf8"));
} catch {
  console.error("缺少 scripts/bench-settings.json，请先按 scripts/bench-settings.example.json 创建。");
  process.exit(1);
}
settings = { stream: true, nativeTools: true, jsonMode: true, mockMode: false, temperature: 0.8, maxTokensMode: "auto", contextLength: 12000, reasoningMode: "auto", customHeaders: "{}", ...settings, mockMode: false };

const TURNS = Math.max(1, Number(process.argv[2]) || 5);
const ACTIONS = [
  "在站台附近观察人群，留意任何可疑的动静",
  "向售票员打听最近有没有奇怪的乘客",
  "沿着站台走到货运区，检查堆放的木箱",
  "找一家附近的咖啡馆坐下，整理目前掌握的线索",
  "回车站大厅，假装看时刻表，暗中留意有没有人跟踪",
  "记下今天观察到的一切，决定下一步调查方向",
];

const baseGame = createInitialGame({
  name: "测试员",
  gender: "女",
  age: "24",
  occupation: "速记员",
  background: "刚从外省来到贝克兰德谋生。",
  extraordinary: "none",
});

async function runTurnOnce(game, action, fastMode) {
  const controller = new AbortController();
  const metric = { action, firstChunkMs: null, planningMs: 0, renderMs: 0, totalMs: 0, repairs: 0, narrativeChars: 0, choices: 0, fallback: false };
  const t0 = performance.now();
  const onChunk = () => { if (metric.firstChunkMs === null) metric.firstChunkMs = performance.now() - t0; };
  const request = (messages, options) => requestAIWithReasoningFallback(settings, messages, controller.signal, onChunk, options);

  const planningMessages = fastMode
    ? buildUnifiedContext(game, action, DEFAULT_SYSTEM_PROMPT, { nativeTools: settings.nativeTools })
    : buildPlanningContext(game, action, DEFAULT_SYSTEM_PROMPT, { nativeTools: settings.nativeTools });
  const planningResponse = await request(planningMessages, {
    toolSet: fastMode ? "unified" : "state",
    disableJsonMode: Boolean(settings.nativeTools),
  });
  metric.planningMs = performance.now() - t0;

  const proposedToolCalls = dedupeToolCalls(normalizeToolCalls(planningResponse.toolCalls, game));
  for (const call of proposedToolCalls) {
    const checked = validateToolCall(game, call);
    if (checked.error) metric.repairs += 1; // 仅计数，不做修复请求，避免引入额外方差
  }
  const execution = executeToolCalls(game, proposedToolCalls);
  const progress = resolveTurnProgress(execution.game, action, undefined, proposedToolCalls, execution.results);
  const resolvedGame = { ...execution.game, turn: game.turn + 1, worldTime: progress.worldTime, occult: progress.occult, hiddenDanger: progress.hiddenDanger };
  const resolution = createTurnResolution(proposedToolCalls, execution.results, progress);

  let response = planningResponse;
  if (!fastMode || !response.hasNarrative) {
    if (fastMode) metric.fallback = true;
    const renderStart = performance.now();
    const renderMessages = buildRenderingContext(game, resolvedGame, action, DEFAULT_SYSTEM_PROMPT, resolution, { nativeTools: settings.nativeTools });
    response = await request(renderMessages, { toolSet: "choices", disableJsonMode: Boolean(settings.nativeTools) });
    metric.renderMs = performance.now() - renderStart;
  }

  metric.totalMs = performance.now() - t0;
  metric.narrativeChars = (response.narrative || "").length;
  metric.choices = (response.choices || []).length;
  const memory = updateMemory(execution.game, action, response.narrative, resolution);
  return { nextGame: { ...resolvedGame, ...memory }, metric };
}

async function runMode(fastMode) {
  let game = structuredClone(baseGame);
  const metrics = [];
  for (let index = 0; index < TURNS; index += 1) {
    const action = ACTIONS[index % ACTIONS.length];
    try {
      const result = await runTurnOnce(game, action, fastMode);
      game = result.nextGame;
      metrics.push(result.metric);
      console.log(`  第${index + 1}轮  总耗时 ${(result.metric.totalMs / 1000).toFixed(1)}s  首字 ${result.metric.firstChunkMs === null ? "—" : `${(result.metric.firstChunkMs / 1000).toFixed(1)}s`}  规划 ${(result.metric.planningMs / 1000).toFixed(1)}s  渲染 ${(result.metric.renderMs / 1000).toFixed(1)}s  剧情 ${result.metric.narrativeChars} 字  选项 ${result.metric.choices}${result.metric.fallback ? "  (回退两段式)" : ""}`);
    } catch (error) {
      console.log(`  第${index + 1}轮  失败：${error.message}`);
      metrics.push({ action, failed: true, totalMs: 0, planningMs: 0, renderMs: 0, firstChunkMs: null, repairs: 0, narrativeChars: 0, choices: 0 });
    }
  }
  return metrics;
}

function average(metrics, key) {
  const values = metrics.filter((m) => !m.failed && m[key] !== null).map((m) => m[key]);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function fmt(ms) { return ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`; }

const MODE = process.argv[3] || "both"; // both | standard | fast —— 分段运行时把结果写入 scripts/bench-result-<mode>.json
import { writeFileSync } from "node:fs";

console.log(`模型：${settings.model}  ·  服务商：${settings.provider || settings.baseUrl}  ·  每种模式 ${TURNS} 轮（相同行动序列、相同初始存档）\n`);
let standard = null;
let fast = null;
if (MODE === "both" || MODE === "standard") {
  console.log("【两段式（关闭快速模式）】");
  standard = await runMode(false);
  writeFileSync(join(here, "bench-result-standard.json"), JSON.stringify(standard));
}
if (MODE === "both" || MODE === "fast") {
  console.log("\n【快速模式】");
  fast = await runMode(true);
  writeFileSync(join(here, "bench-result-fast.json"), JSON.stringify(fast));
}
if (!standard || !fast) {
  try { standard = standard || JSON.parse(readFileSync(join(here, "bench-result-standard.json"), "utf8")); } catch { standard = []; }
  try { fast = fast || JSON.parse(readFileSync(join(here, "bench-result-fast.json"), "utf8")); } catch { fast = []; }
}

const sTotal = average(standard, "totalMs");
const fTotal = average(fast, "totalMs");
console.log("\n===== 平均值对比 =====");
console.log(`总耗时        两段式 ${fmt(sTotal)}   快速 ${fmt(fTotal)}   ${sTotal && fTotal ? `节省 ${((1 - fTotal / sTotal) * 100).toFixed(0)}%` : ""}`);
console.log(`首字时间      两段式 ${fmt(average(standard, "firstChunkMs"))}   快速 ${fmt(average(fast, "firstChunkMs"))}`);
console.log(`规划阶段      两段式 ${fmt(average(standard, "planningMs"))}   快速 ${fmt(average(fast, "planningMs"))}`);
console.log(`渲染阶段      两段式 ${fmt(average(standard, "renderMs"))}   快速 ${fmt(average(fast, "renderMs"))}`);
console.log(`失败轮数      两段式 ${standard.filter((m) => m.failed).length}   快速 ${fast.filter((m) => m.failed).length}`);
console.log(`工具校验失败  两段式 ${standard.reduce((a, m) => a + m.repairs, 0)} 次   快速 ${fast.reduce((a, m) => a + m.repairs, 0)} 次（真实流程中每次对应一次修复请求）`);
