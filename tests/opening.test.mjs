import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGame, DEFAULT_SYSTEM_PROMPT, EMPTY_CHARACTER, LOW_SEQUENCE_PATHWAYS } from "../src/data/defaults.js";
import { buildContext } from "../src/services/memory.js";
import { mockResponse } from "../src/services/mock.js";
import { OPENINGS } from "../src/data/openings.js";
import { getMapLocation, hexForLocation, MAP_DISTRICTS } from "../src/data/map.js";
import { migrateSave } from "../src/services/storage.js";
import { executeToolCalls } from "../src/engine/tools.js";

test("new characters begin freely at the East Borough railway station", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "测试旅客" });

  assert.equal(game.location.id, "east-station");
  assert.equal(game.location.district, "贝克兰德东区");
  assert.equal(game.chapter.title, "雾都来客");
  assert.deepEqual(game.quests, []);
  assert.match(game.recentDialogues[0].content, /可以先找住处/);
  assert.match(game.recentDialogues[0].content, /贝克兰德向四面八方展开/);
  assert.match(game.longTermSummary, /尚未接受任何委托/);
  assert.equal(game.choices.length, 3);
});

test("every district initializes a coherent, independent opening and survives save reload", () => {
  assert.deepEqual(OPENINGS.map((entry) => entry.district).sort(), [...MAP_DISTRICTS].sort());
  const games = OPENINGS.map((opening) => createInitialGame({ ...EMPTY_CHARACTER, name: "本地调查员", origin: "间海郡", startingDistrict: opening.district }));
  assert.equal(new Set(games.map((game) => game.recentDialogues[0].content)).size, 5);
  for (const game of games) {
    assert.equal(game.character.origin, "间海郡");
    assert.equal(game.location.district, `贝克兰德${game.character.startingDistrict}`);
    assert.deepEqual(game.world.player, hexForLocation(getMapLocation(game.location.id)));
    assert.equal(game.locationKnowledge[game.location.id].status, "visited");
    assert.ok(game.discoveredLocations.some((place) => place.id === game.location.id));
    assert.equal(game.choices.length, 3);
    assert.equal(new Set(game.choices.map((choice) => choice.label)).size, 3);
    assert.deepEqual(game.quests, []);
    assert.deepEqual(game.clues, []);
    assert.equal(game.hiddenDanger.stage, 0);
    assert.equal(game.hiddenDanger.revealed, false);
    const loaded = migrateSave(structuredClone(game));
    assert.deepEqual(loaded.opening, game.opening);
    assert.deepEqual(loaded.world.player, game.world.player);
    assert.deepEqual(loaded.choices, game.choices);
    assert.equal(loaded.longTermSummary, game.longTermSummary);
    const context = buildContext(game, "了解这里", DEFAULT_SYSTEM_PROMPT);
    assert.ok(context.some((message) => message.content.includes(game.opening.summary)));
    assert.ok(context.every((message) => !message.content.includes("这是从贝克兰德东区火车站开始的")));
  }
});

test("missing district defaults to East and legacy saves are not restarted", () => {
  const profile = { ...EMPTY_CHARACTER, name: "旧档案" };
  delete profile.startingDistrict;
  const legacy = createInitialGame(profile);
  assert.equal(legacy.location.id, "east-station");
  assert.equal(createInitialGame({ ...profile, startingDistrict: "无效地区" }).location.id, "east-station");
  delete legacy.opening;
  legacy.location = { id: "soot-lamp", name: "桥区·雾鸦旅店", district: "贝克兰德桥区" };
  legacy.longTermSummary = "已经在旅店生活数月。";
  legacy.turn = 30;
  const loaded = migrateSave(legacy);
  assert.equal(loaded.location.id, "soot-lamp");
  assert.equal(loaded.turn, 30);
  assert.equal(loaded.opening, undefined);
  assert.equal(loaded.longTermSummary, legacy.longTermSummary);
});

test("new openings do not share mutable clues, choices or map knowledge", () => {
  const profile = { ...EMPTY_CHARACTER, name: "隔离测试", startingDistrict: "北区" };
  const first = createInitialGame(profile);
  first.availableClues[0].title = "变更";
  first.choices[0].label = "变更";
  first.locationKnowledge["north-flats"].status = "unknown";
  const second = createInitialGame(profile);
  assert.notEqual(second.availableClues[0].title, "变更");
  assert.notEqual(second.choices[0].label, "变更");
  assert.equal(second.locationKnowledge["north-flats"].status, "visited");
});

test("Mock follows all non-East opening actions and permits travel to known places", async () => {
  await Promise.all(OPENINGS.filter((opening) => opening.district !== "东区").map(async (opening) => {
    const game = createInitialGame({ ...EMPTY_CHARACTER, name: "地区测试员", startingDistrict: opening.district });
    for (const [index, action] of opening.actions.entries()) {
      const response = await mockResponse(game, action);
      assert.doesNotMatch(response.narrative, /第七码头|站内公告|离开车站/);
      assert.equal(response.toolCalls.some((call) => call.name === "quest.add" || call.name === "location.move"), false);
      if (index === 2) {
        const result = executeToolCalls(game, response.toolCalls);
        assert.ok(result.game.clues.some((clue) => clue.id === opening.clues[0].id));
      }
    }
    const destination = game.discoveredLocations.find((place) => place.id !== game.location.id);
    const response = await mockResponse(game, `前往${destination.name}`);
    const result = executeToolCalls(game, response.toolCalls);
    assert.equal(result.game.location.id, destination.id);
    assert.deepEqual(result.game.world.player, hexForLocation(getMapLocation(destination.id)));
  }));
});

test("character creation exposes twelve distinct sequence 9 pathways", () => {
  assert.equal(LOW_SEQUENCE_PATHWAYS.length, 12);
  assert.equal(new Set(LOW_SEQUENCE_PATHWAYS).size, 12);
  LOW_SEQUENCE_PATHWAYS.forEach((pathway) => assert.match(pathway, /（序列9）$/));
  assert.ok(LOW_SEQUENCE_PATHWAYS.includes("窥秘人（序列9）"));
  assert.ok(LOW_SEQUENCE_PATHWAYS.includes("猎人（序列9）"));
});

test("low sequence characters keep a structured pathway and sequence record", () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "途径测试员", extraordinary: "low", pathway: "窥秘人（序列9）" });
  assert.equal(game.character.advancement.pathwayId, "mystery_pryer");
  assert.equal(game.character.advancement.pathwayName, "窥秘人");
  assert.equal(game.character.advancement.sequence, 9);
  assert.equal(game.character.advancement.sequenceLabel, "序列9");
  assert.equal(game.character.advancement.unlockedAbilities.length, 3);
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
