import test from "node:test";
import assert from "node:assert/strict";
import { MAINLINE, ACTIVE_CONTENT, validateContentPack } from "../src/content/index.js";
import { TAROT_CLUB_NAME_CARDS } from "../src/content/backlund/easterEggs.js";
import { AZIK_WHISTLE_REWARD } from "../src/content/backlund/specialQuests/watch.js";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { mainlineView, mainlineInstance, tarotMembership } from "../src/engine/mainline.js";
import { conversationState, conversationView, conversationGate, validateLetter, validateReply } from "../src/engine/conversations.js";
import { specialState, executeSpecialAction } from "../src/engine/specialActions.js";
import { resolveSpecialAction } from "../src/services/specialActions.js";
import { prepareConversationRequest, buildConversationContext, generateConversationReply } from "../src/services/conversations.js";
import { migrateSave, cleanGame } from "../src/services/saveCodec.js";
import { parseWorldTime } from "../src/engine/worldTime.js";
import { processTriggers, progressTrigger, settleQuestStep, abandonTrigger } from "../src/engine/triggerEngine.js";
import { resolveQuestAction } from "../src/engine/questActions.js";
import { executeToolCalls } from "../src/engine/tools.js";
import { visibleGameState } from "../src/services/memory.js";
import { executeCombatTool } from "../src/engine/combat.js";
import { recordUsageEvent, usageSnapshot } from "../src/services/usageHistory.js";

const fresh = () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: "主线测试员", talent: "none", extraordinary: "ordinary", pathway: "" });
  game.capacity.maxWeight = 100;
  return game;
};
const whistle = game => { game.inventory.push(structuredClone(AZIK_WHISTLE_REWARD.item)); return game; };
const request = (game, operation, extra = {}) => ({ operation, revision: specialState(game).revision,
  mainlineRevision: mainlineView(game).revision, expectedTurn: game.turn, expectedWorldTime: game.worldTime,
  stepId: mainlineView(game).current?.id, ...extra });
const act = (game, operation, extra) => resolveSpecialAction(game, request(game, operation, extra));
const step = game => act(game, "mainline-step");
const onSite = game => mainlineView(game).current.onSite ? game : act(game, "mainline-travel");
const reach = (target, game = fresh()) => {
  if (mainlineView(game).status === "unstarted") game = act(game, "mainline-start");
  for (let count = 0; count < MAINLINE.steps.length; count++) {
    game = onSite(game);
    if (mainlineView(game).current.id === target) return game;
    game = step(game);
  }
  throw new Error(`未找到节点 ${target}`);
};
const send = (game, text = "今天我在图书馆见到一份旧档案。", reply = "谢谢你的来信，请先核对记录的出处，照顾好自己。") => resolveSpecialAction(game, { ...prepareConversationRequest(game, "azik-eggers", text), reply });
const minutes = (before, after) => (parseWorldTime(after.worldTime) - parseWorldTime(before.worldTime)) / 60000;

test("three original chapters have valid destinations and reserve existing Tarot member identities", () => {
  assert.deepEqual(validateContentPack(), []);
  assert.equal(MAINLINE.chapters.length, 3);
  assert.equal(MAINLINE.steps.length, 12);
  for (const chapter of MAINLINE.chapters) assert.equal(MAINLINE.steps.filter(entry => entry.chapter === chapter.id).length, 4);
  assert.ok(MAINLINE.codenames.every(code => !TAROT_CLUB_NAME_CARDS.some(member => member.code === code)));
  assert.deepEqual(JSON.parse(JSON.stringify(MAINLINE)), MAINLINE);
  for (const change of [
    pack => { pack.mainline.steps[0].locationId = "unknown"; },
    pack => { pack.mainline.steps[0].minutes = -5; },
    pack => { pack.dialoguePeople[0].requiredItemId = "unknown"; },
  ]) {
    const broken = structuredClone(ACTIVE_CONTENT); change(broken);
    assert.ok(validateContentPack(broken).length);
  }
});

test("viewing archives and ordinary actions cannot silently accept or advance the mainline", () => {
  const game = fresh(), before = structuredClone(game);
  assert.equal(mainlineView(game).status, "unstarted");
  assert.equal(conversationView(game, "azik-eggers").messages.length, 0);
  visibleGameState(game);
  assert.deepEqual(game, before);
  const ordinary = structuredClone(game);
  processTriggers(ordinary, { action: MAINLINE.steps[0].label, turn: 1 });
  assert.equal(mainlineView(ordinary).status, "unstarted");
  const started = onSite(act(game, "mainline-start"));
  const id = mainlineInstance(started).instanceId;
  assert.equal(started.trackedQuestId, id);
  assert.equal(started.questJournal.entries[id].localModule, "mainline");
  processTriggers(started, { action: MAINLINE.steps[0].label, turn: started.turn + 1 });
  assert.equal(mainlineView(started).done, 0);
  assert.equal(mainlineView(started).current.id, "newspaper");
});

test("each confirmed node has one saved result, actual travel time, and the whistle arrives only in the middle chapter", () => {
  const original = fresh(), untouched = structuredClone(original);
  let game = act(original, "mainline-start");
  assert.deepEqual(original, untouched);
  assert.equal(minutes(original, game), 5);
  for (let index = 0; index < 11; index++) {
    const view = mainlineView(game), node = MAINLINE.steps[index];
    assert.equal(view.current.id, node.id);
    if (!view.current.onSite) {
      const beforeTravel = game;
      game = act(game, "mainline-travel");
      assert.equal(game.location.id, node.locationId);
      assert.equal(mainlineView(game).done, index);
      assert.ok(minutes(beforeTravel, game) > 0);
    }
    const before = game;
    game = step(game);
    assert.equal(game.turn, before.turn + 1);
    assert.equal(minutes(before, game), node.minutes);
    assert.equal(mainlineView(game).done, index + 1);
    assert.equal(mainlineView(game).lastResult, node.narrative);
    assert.equal(mainlineView(game).hasWhistle, index >= 7);
    assert.equal(game.occult.contact, index >= 7 ? 1 : 0);
    assert.equal(game.character.advancement.type, "ordinary");
    assert.equal(game.storyHistory.at(-1).source, "fixed");
    assert.deepEqual(game.money, original.money);
    assert.equal(tarotMembership(game), null);
    const loaded = migrateSave(game);
    assert.deepEqual(mainlineView(loaded), mainlineView(game));
    game = loaded;
  }
  assert.equal(conversationView(game, "azik-eggers").messages.length, 2);
  assert.ok(conversationView(game, "azik-eggers").messages.every(message => message.source === "fixed"));
  assert.equal(mainlineView(game).aboveGrayFog, true);
  assert.equal(game.location.id, "soot-lamp");
});

test("joining requires explicit consent and an unused codename; deferring preserves a return route and existing organization", () => {
  let game = reach("tarot-oath");
  game.organizationState = { membership: { organizationId: "mi9", name: "军情九处", status: "active", tags: ["official", "government", "combat-support"] } };
  const before = structuredClone(game);
  for (const extra of [{ codename: "高塔" }, { codename: "愚者", confirmed: true }, { codename: "", confirmed: true }, { codename: "高塔", confirmed: false }]) {
    assert.throws(() => act(game, "mainline-step", extra));
    assert.deepEqual(game, before);
  }
  assert.throws(() => send(game), /灰雾会面/);
  assert.throws(() => act(game, "trade-travel", { channelId: "dock" }), /灰雾会面/);
  game = act(game, "mainline-defer");
  assert.equal(tarotMembership(game), null);
  assert.equal(mainlineView(game).current.id, "gray-fog");
  assert.equal(mainlineView(game).aboveGrayFog, false);
  assert.equal(conversationGate(game, "azik-eggers"), "");
  game = step(migrateSave(game));
  const returned = game;
  game = act(game, "mainline-step", { codename: "高塔", confirmed: true });
  assert.equal(minutes(returned, game), 10);
  assert.equal(mainlineView(game).status, "completed");
  assert.equal(mainlineView(game).done, 12);
  assert.equal(tarotMembership(game).codename, "高塔");
  assert.equal(tarotMembership(game).joinedAt, game.worldTime);
  assert.deepEqual(game.organizationState, before.organizationState);
  assert.deepEqual(tarotMembership(migrateSave(game)), tarotMembership(game));
  assert.throws(() => act(game, "mainline-start"), /重复开始/);
  assert.throws(() => act(game, "mainline-step", { codename: "皇帝", confirmed: true }), /已经结束/);
  assert.equal(game.inventory.filter(item => item.itemId === "azik-copper-whistle").length, 1);
  const malformed = structuredClone(game); malformed.tarotClub.codename = "愚者";
  assert.equal(tarotMembership(malformed), null);
  delete malformed.triggerState.facts["mainline.tarot.joined"]; malformed.tarotClub.codename = "高塔";
  assert.equal(tarotMembership(malformed), null);
});

test("stale stages, remote actions, incapacitation and combat reject without changing the save", () => {
  const initial = act(fresh(), "mainline-start");
  assert.throws(() => step(initial), /到达/);
  const arrived = onSite(initial), args = request(arrived, "mainline-step");
  const after = step(arrived), before = structuredClone(after);
  assert.throws(() => resolveSpecialAction(after, args), /更新/);
  assert.deepEqual(after, before);
  for (const mutate of [
    (game, req) => { req.mainlineRevision = "stale"; },
    (game, req) => { req.expectedTurn--; },
    (game, req) => { req.expectedWorldTime = "yesterday"; },
    (game, req) => { req.stepId = "tarot-oath"; },
    game => { game.character.stats.health = 0; },
    game => { game.character.stats.sanity = 0; },
    game => { executeCombatTool(game, "enemy.encounter", { enemies: [{ id: "test-enemy", name: "敌人", maxHealth: 10 }] }); },
  ]) {
    const game = structuredClone(arrived), req = request(game, "mainline-step"); mutate(game, req);
    const snapshot = structuredClone(game);
    assert.throws(() => executeSpecialAction(game, req));
    assert.deepEqual(game, snapshot);
  }
});

test("the whistle reward obeys capacity, supports existing watch rewards and never duplicates on reload", () => {
  const game = reach("copper-whistle");
  game.capacity.maxWeight = game.inventory.reduce((sum, item) => sum + item.weight * item.quantity, 0) + 0.01;
  const before = structuredClone(game);
  assert.throws(() => step(game), /负重/);
  assert.deepEqual(game, before);
  whistle(game);
  const originalItem = structuredClone(game.inventory.at(-1));
  const delivered = step(game);
  assert.equal(delivered.inventory.filter(item => item.itemId === originalItem.itemId).length, 1);
  assert.deepEqual(delivered.inventory.find(item => item.itemId === originalItem.itemId), originalItem);
  assert.match(mainlineView(delivered).lastResult, /没有再交给你第二枚/);
  assert.equal(conversationGate(migrateSave(delivered), "azik-eggers"), "");
  assert.equal(mainlineView(whistle(fresh())).status, "unstarted");
  assert.equal(conversationGate(whistle(fresh()), "azik-eggers"), "");
  const fake = fresh(); fake.inventory.push({ ...AZIK_WHISTLE_REWARD.item, itemId: "lookalike" });
  assert.match(conversationGate(fake, "azik-eggers"), /获得/);
});

test("AI task tools, inferred actions and inventory grants cannot bypass player-controlled mainline steps", () => {
  const game = reach("copper-whistle"), id = mainlineInstance(game).instanceId;
  for (const attempt of [
    clone => progressTrigger(clone, id, "copper-whistle", clone.turn + 1, "交付档案副本并接过铜哨", "已经交付副本"),
    clone => settleQuestStep(clone, id, "copper-whistle", clone.turn + 1, "交付档案副本并接过铜哨", "已经交付副本", "交付档案副本并接过铜哨"),
    clone => abandonTrigger(clone, id, clone.turn + 1),
    clone => resolveQuestAction(clone, { instanceId: id, outcome: "progress", actionQuote: "交付副本", evidence: "已经完成交付", steps: [{ objectiveId: "copper-whistle" }] }, "交付副本", clone.turn + 1),
  ]) {
    const clone = structuredClone(game);
    assert.equal(attempt(clone).ok, false);
    assert.equal(mainlineView(clone).current.id, "copper-whistle");
    assert.equal(mainlineView(clone).hasWhistle, false);
  }
  for (const item of [AZIK_WHISTLE_REWARD.item, { ...AZIK_WHISTLE_REWARD.item, itemId: "forged-id" }]) {
    const result = executeToolCalls(game, [{ id: "unearned", name: "inventory.add", args: { item }, reason: "阿兹克在聊天里赠送" }]);
    assert.equal(result.results[0].ok, false);
    assert.equal(mainlineView(result.game).hasWhistle, false);
  }
});

test("free correspondence stores exactly one pair and only consumes its published time", () => {
  const game = reach("first-letter"), before = structuredClone(game);
  const req = prepareConversationRequest(game, "azik-eggers", "  我今天去了图书馆。  ");
  const next = resolveSpecialAction(game, { ...req, reply: "谢谢你的分享，请继续保留档案出处。", money: 999999, codename: "高塔", confirmed: true });
  assert.deepEqual(game, before);
  assert.equal(next.turn, game.turn + 1);
  assert.equal(minutes(game, next), 15);
  assert.equal(conversationView(next, "azik-eggers").messages.length, 2);
  assert.equal(conversationView(next, "azik-eggers").messages[0].content, "我今天去了图书馆。");
  assert.equal(conversationView(next, "azik-eggers").messages[1].worldTime, next.worldTime);
  assert.deepEqual(next.money, game.money); assert.deepEqual(next.inventory, game.inventory);
  assert.equal(mainlineView(next).revision, mainlineView(game).revision);
  assert.equal(tarotMembership(next), null);
  assert.equal(next.storyHistory.at(-1).source, "ai");
  assert.equal(next.triggerState.facts["person.azik-eggers.corresponded"].value, true);
  assert.throws(() => resolveSpecialAction(next, { ...req, reply: "迟到的重复回信" }), /更新/);
  const continued = send(migrateSave(next), "您上次说要保留出处，我记住了。");
  assert.equal(conversationView(continued, "azik-eggers").messages.length, 4);
  assert.equal(mainlineView(continued).current.id, "first-letter");
  const scripted = step(continued);
  assert.equal(conversationView(scripted, "azik-eggers").messages.length, 6);
  assert.equal(conversationView(scripted, "azik-eggers").messages.at(-1).source, "fixed");
  assert.equal(mainlineView(scripted).current.id, "invitation");
  assert.equal(send(whistle(fresh())).occult.contact, 1);
});

test("letter validation, expired snapshots, missing whistle and bad replies never create half a conversation", () => {
  for (const text of ["", "   ", "字".repeat(601)]) assert.throws(() => validateLetter(text));
  assert.equal(validateLetter("😀".repeat(600)).length, 1200);
  for (const text of ["", " ", "字".repeat(2001), '{"toolCalls":[]}', '["回信"]']) assert.throws(() => validateReply(text));
  for (const mutate of [
    (game, req) => { req.conversationRevision++; },
    (game, req) => { req.expectedTurn++; },
    (game, req) => { req.expectedWorldTime = "stale"; },
    (game, req) => { req.personId = "unknown"; },
    (game, req) => { req.reply = ""; },
    game => { game.inventory = game.inventory.filter(item => item.itemId !== "azik-copper-whistle"); },
    game => { game.character.stats.health = 0; },
    game => { game.character.stats.sanity = 0; },
    game => { executeCombatTool(game, "enemy.encounter", { enemies: [{ id: "foe", name: "敌人", maxHealth: 10 }] }); },
  ]) {
    const game = whistle(fresh()), req = { ...prepareConversationRequest(game, "azik-eggers", "一封测试信"), reply: "一封完整的回信" };
    mutate(game, req); const before = structuredClone(game);
    assert.throws(() => resolveSpecialAction(game, req)); assert.deepEqual(game, before);
  }
});

test("save migration retains full letter history and strips unregistered conversation fields", () => {
  let game = whistle(fresh());
  for (let i = 0; i < 10; i++) game = send(game, `第${i + 1}封信：今日仍在查访旧事。`);
  const before = structuredClone(game), loaded = migrateSave(JSON.parse(JSON.stringify(cleanGame(game))));
  assert.deepEqual(conversationState(loaded), conversationState(game));
  assert.equal(conversationView(loaded, "azik-eggers").messages.length, 20);
  assert.deepEqual(game, before);
  game.conversations.apiKey = "must-not-survive";
  game.conversations.threads["unknown-person"] = { messages: [] };
  game.conversations.threads["azik-eggers"].apiKey = "must-not-survive";
  game.conversations.threads["azik-eggers"].messages[0].apiKey = "must-not-survive";
  game.conversations.threads["azik-eggers"].messages.push({ id: "system", role: "system", content: "invalid authority" });
  const sanitized = conversationState(migrateSave(game));
  assert.doesNotMatch(JSON.stringify(sanitized), /must-not-survive|invalid authority|unknown-person/);
  assert.equal(sanitized.threads["azik-eggers"].messages.length, 20);
  const old = fresh(); delete old.conversations; delete old.tarotClub;
  assert.deepEqual(conversationState(migrateSave(old)), { version: 1, threads: {} });
  assert.equal(tarotMembership(migrateSave(old)), null);
});

test("dialogue context has known evidence and recent real letters without future mainline outcomes", () => {
  const game = send(reach("first-letter"), "我寄出这一封实际的信。", "我收到你这封信了。");
  const before = structuredClone(game), context = buildConversationContext(game, "azik-eggers", "这次想继续聊一聊。");
  assert.deepEqual(game, before);
  assert.equal(context.at(-1).content, "这次想继续聊一聊。");
  assert.ok(context.some(message => message.content === "我收到你这封信了。"));
  const serialized = JSON.stringify(context);
  assert.match(serialized, /被涂去的捐助人/);
  for (const node of MAINLINE.steps.slice(8)) assert.equal(serialized.includes(node.narrative), false);
  assert.doesNotMatch(serialized, /definitionSnapshot|灰雾会面的邀请|modelApiKey|死亡执政官/);
});

const settings = { provider: "custom", baseUrl: "https://example.test/v1", apiKey: "test-secret-never-in-game", customHeaders: "", model: "compatible-model",
  temperature: 0.7, maxTokens: 800, reasoningMode: "auto", autoRetryReasoning: true, jsonMode: true, nativeTools: true, stream: true };

test("letter transport uses the configured model without tools, JSON mode, or key-bearing save data", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [], game = whistle(fresh()), before = structuredClone(game), metrics = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ choices: [{ message: { content: "谢谢你的来信。未知的事可以慢慢查证，请先照顾好自己。" }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 40 } }), { headers: { "Content-Type": "application/json" } });
  };
  const req = prepareConversationRequest(game, "azik-eggers", "您好，阿兹克先生。");
  const reply = await generateConversationReply(game, req, settings, undefined, event => metrics.push(event));
  assert.match(reply, /谢谢你的来信/); assert.deepEqual(game, before);
  assert.equal(calls.length, 1); assert.equal(calls[0].body.model, settings.model);
  assert.equal(calls[0].body.tools, undefined); assert.equal(calls[0].body.response_format, undefined); assert.equal(calls[0].body.stream, false);
  assert.equal(metrics[0].phase, "conversation");
  recordUsageEvent(game.id, game.turn, metrics[0]);
  assert.equal(usageSnapshot(game.id)[0].phase, "conversation");
  const settled = resolveSpecialAction(game, { ...req, reply });
  assert.doesNotMatch(JSON.stringify(cleanGame(settled)), /test-secret-never-in-game/);
  assert.doesNotMatch(JSON.stringify(calls[0].body.messages), /test-secret-never-in-game/);
});

test("failed, empty and aborted model replies leave time, history and the mainline untouched", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  const game = whistle(fresh()), before = structuredClone(game), req = prepareConversationRequest(game, "azik-eggers", "请收下这封信。");
  globalThis.fetch = async () => new Response('{"error":{"message":"test failure"}}', { status: 400, headers: { "Content-Type": "application/json" } });
  await assert.rejects(generateConversationReply(game, req, settings), /400/); assert.deepEqual(game, before);
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "stop" }] }), { headers: { "Content-Type": "application/json" } });
  await assert.rejects(generateConversationReply(game, req, settings)); assert.deepEqual(game, before);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(generateConversationReply(game, req, settings, controller.signal), { name: "AbortError" });
  const late = new AbortController();
  globalThis.fetch = async () => { late.abort(); return new Response(JSON.stringify({ choices: [{ message: { content: "中止后到达的回信" } }] }), { headers: { "Content-Type": "application/json" } }); };
  await assert.rejects(generateConversationReply(game, req, settings, late.signal), { name: "AbortError" });
  assert.deepEqual(game, before);
});
