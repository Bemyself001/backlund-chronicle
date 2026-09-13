import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { updateMemory } from "../src/services/memory.js";
import {
  applyMemorySummary,
  composeMemorySummary,
  createMemorySummaryJob,
  memoryPromptState,
  parseMemoryDigestPayload,
} from "../src/services/memoryState.js";

function completeTurn(game, index) {
  const settled = {
    ...game,
    turn: game.turn + 1,
    worldTime: `1349年 10月${17 + index}日 · 18:30`,
  };
  const updates = updateMemory(
    game,
    `第${index}次询问玛莎`,
    `玛莎说明了第${index}件事，并提醒玩家之后再来确认。`,
    { accepted: [], rejected: [], derivedEffects: {} },
    { settledGame: settled },
  );
  return { ...settled, ...updates };
}

test("memory summary jobs count ten completed turns rather than dialogue messages", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "十轮记忆测试员" });
  assert.equal(game.memoryState.version, 2);
  assert.deepEqual(game.storyHistory, game.recentDialogues);

  for (let index = 1; index <= 9; index += 1) game = completeTurn(game, index);
  assert.equal(game.memoryState.pending.length, 9);
  assert.equal(createMemorySummaryJob(game), null);

  game = completeTurn(game, 10);
  const job = createMemorySummaryJob(game);
  assert.deepEqual(job.episodes.map((episode) => episode.turn), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(game.storyHistory.length, 21);
  assert.equal(game.recentDialogues.length, 10);
});

test("summary payload must use known source turns and explicit certainty", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "来源校验员" });
  for (let index = 1; index <= 10; index += 1) game = completeTurn(game, index);
  const job = createMemorySummaryJob(game);
  const valid = parseMemoryDigestPayload({ memory: {
    people: [{ name: "玛莎", summary: "向玩家提供消息，但其说法仍待核实。", sourceTurns: [1, 4] }],
    events: [{ summary: "玩家连续向玛莎追问线索。", certainty: "confirmed", sourceTurns: [1, 10] }],
    openThreads: [{ summary: "核实玛莎提到的地点。", kind: "question", sourceTurns: [10] }],
  } }, job);
  assert.equal(valid.events[0].certainty, "confirmed");
  assert.equal(parseMemoryDigestPayload({ memory: {
    people: [],
    events: [{ summary: "凭空出现的事件", certainty: "confirmed", sourceTurns: [99] }],
    openThreads: [],
  } }, job), null);
  assert.equal(parseMemoryDigestPayload({ memory: { people: [], events: [], openThreads: [] } }, job), null);
});

test("a completed summary can merge after a newer turn without losing that turn", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "并发记忆测试员" });
  for (let index = 1; index <= 10; index += 1) game = completeTurn(game, index);
  const job = createMemorySummaryJob(game);
  const digest = parseMemoryDigestPayload({ memory: {
    people: [{ name: "玛莎", summary: "多次向玩家提供尚待核实的消息。", sourceTurns: [1, 10] }],
    events: [{ summary: "玩家完成了十轮连续询问。", certainty: "confirmed", sourceTurns: [1, 10] }],
    openThreads: [{ summary: "继续核实玛莎的说法。", kind: "plan", sourceTurns: [10] }],
  } }, job);

  game = completeTurn(game, 11);
  const merged = applyMemorySummary(game, job, digest);
  assert.equal(merged.turn, 11);
  assert.equal(merged.memoryState.revision, 1);
  assert.equal(merged.memoryState.throughTurn, 10);
  assert.deepEqual(merged.memoryState.pending.map((episode) => episode.turn), [11]);
  assert.match(merged.longTermSummary, /【人物】玛莎/);
  assert.match(merged.longTermSummary, /【事件】/);
  assert.equal(applyMemorySummary(merged, job, digest), merged);
});

test("prompt memory leaves the latest three turns to raw dialogue context", () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: "上下文去重员" });
  for (let index = 1; index <= 10; index += 1) game = completeTurn(game, index);
  assert.deepEqual(memoryPromptState(game).unsummarizedEvents.map((episode) => episode.turn), [1, 2, 3, 4, 5, 6, 7]);
});

test("composed memory stays concise and centers people, events and open threads", () => {
  const summary = composeMemorySummary({
    people: [{ name: "玛莎", summary: "认识玩家并提供消息。", sourceTurns: [2] }],
    events: [{ summary: "玩家在车站与玛莎交谈。", certainty: "confirmed", sourceTurns: [2] }],
    openThreads: [{ summary: "查证她提到的灰呢帽男人。", kind: "question", sourceTurns: [2] }],
  });
  assert.match(summary, /【人物】/);
  assert.match(summary, /【事件】\[已确认\]/);
  assert.match(summary, /【未完成事项】\[问题\]/);
  assert.ok(summary.length < 300);
});
