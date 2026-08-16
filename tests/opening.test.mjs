import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, DEFAULT_SYSTEM_PROMPT, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { buildContext } from "../src/services/memory.js";
import { mockResponse } from "../src/services/mock.js";

test("new characters begin freely at the East Borough railway station", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "测试旅客" });

  assert.equal(game.location.id, "east-station");
  assert.equal(game.location.district, "贝克兰德东区");
  assert.equal(game.chapter.title, "雾都来客");
  assert.deepEqual(game.quests, []);
  assert.match(game.recentDialogues[0].content, /没有人在这里等你/);
  assert.match(game.recentDialogues[0].content, /贝克兰德向四面八方展开/);
  assert.match(game.longTermSummary, /尚未接受任何委托/);
  assert.equal(game.choices.length, 3);
});

test("AI context treats mysteries as optional world threads", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "测试旅客" });
  const messages = buildContext(game, "先找一间便宜住处", DEFAULT_SYSTEM_PROMPT);
  const scenario = messages.find((message) => message.content.startsWith("【当前剧本】"));

  assert.match(scenario.content, /开放世界沙盒/);
  assert.match(scenario.content, /不是必须完成的主线/);
  assert.match(scenario.content, /不得自动添加任务/);
});

test("Mock mode supports leaving the station without attaching a main quest", async () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "测试旅客" });
  const response = await mockResponse(game, "先去铁门街找住处", new AbortController().signal);

  assert.match(response.narrative, /落脚处/);
  assert.equal(response.toolCalls[0].name, "location.move");
  assert.equal(response.toolCalls[0].args.locationId, "iron-gate");
  assert.equal(response.toolCalls.some((call) => call.name === "quest.add"), false);
});
