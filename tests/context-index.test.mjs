import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createInitialGame, EMPTY_CHARACTER } from "../src/data/defaults.js";
import { retrieveContext, clearContextIndex, prepareContextIndex } from "../src/services/contextIndex.js";
import { lookupContext, progressiveContext } from "../src/engine/contextLookup.js";

const fresh = () => createInitialGame({ ...EMPTY_CHARACTER, name: "关联资料测试员" });
const lookup = (game, options = {}) => retrieveContext(game, { includeAmbient: false, ...options });

test("an indirect detective reference retrieves disclosed person, past service and address", () => {
  const game = fresh();
  game.storyHistory.push({ id: "identified-bottle", role: "assistant", turn: 4, content: "夏洛克·莫里亚蒂为你鉴定了那瓶魔药，费用一镑。" });
  const before = JSON.stringify(game);
  const result = lookup(game, { query: "找之前帮我鉴定魔药的侦探" });
  const person = result.entries.find(entry => entry.id === "person:sherlock-moriarty");
  assert.ok(person);
  assert.ok(person.entityIds.includes("minsk-street-15"));
  const history = result.entries.find(entry => entry.id === "history:identified-bottle");
  assert.deepEqual(history.sourceTurns, [4]);
  assert.equal(history.authority, "historical");
  assert.ok(history.entityIds.includes("sherlock-moriarty"));
  assert.match(history.text, /鉴定/);
  assert.equal(JSON.stringify(game), before);
  assert.deepEqual(lookup(game, { query: "找之前帮我鉴定魔药的侦探" }), result);
});

test("matching is performed after disclosure, including potion IDs and person aliases", () => {
  const game = fresh();
  game.triggerState.facts["watch.formal-quest-unlocked"] = { value: true, firstTurn: 1 };
  game.inventory.push({ instanceId: "bottle-1", itemId: "secret-potion-seer", name: "占卜家魔药", quantity: 1,
    description: "秘密身份说明", hiddenInfo: "秘密配方", properties: { secret: "不可检索" },
    potion: { pathwayId: "seer", sequence: 9, identified: false } });
  assert.equal(lookup(game, { ids: ["secret-potion-seer"] }).entries.some(entry => entry.type === "item"), false);
  const bottle = lookup(game, { ids: ["bottle-1"] }).entries.find(entry => entry.id === "item:bottle-1");
  assert.match(bottle.text, /未鉴定魔药/);
  assert.doesNotMatch(JSON.stringify(bottle), /seer|占卜家|秘密|不可检索/);
  const unknownAlias = lookup(game, { query: "塞西莉亚·沃恩" });
  assert.equal(unknownAlias.entries.some(entry => entry.id === "person:white-iris"), false);
  const whiteIris = lookup(game, { ids: ["white-iris"] }).entries.find(entry => entry.type === "person");
  assert.ok(whiteIris);
  assert.doesNotMatch(JSON.stringify(whiteIris), /塞西莉亚|序列7/);
  game.triggerState.facts["demoness.white-iris.true-name"] = { value: true, firstTurn: 8 };
  assert.ok(lookup(game, { query: "塞西莉亚·沃恩" }).entries.some(entry => entry.id === "person:white-iris"));
});

test("undiscovered and rumored locations are not identified through an explicit ID", () => {
  const game = fresh();
  game.mapExtensions.locations.push({ id: "private-room", name: "密藏金库", district: "东区", scope: "interior", kind: "interior", anchorId: "east-station", description: "密室真相" });
  game.locationKnowledge["private-room"] = { status: "rumored", note: "附近有一处传闻" };
  assert.deepEqual(lookup(game, { ids: ["private-room"] }).missing, ["private-room"]);
  assert.equal(lookup(game, { query: "密藏金库" }).entries.some(entry => entry.id === "location:private-room"), false);
  game.locationKnowledge["private-room"].status = "discovered";
  assert.ok(lookup(game, { ids: ["private-room"] }).entries.some(entry => entry.id === "location:private-room"));
});

test("current terminal task status accompanies an old account and cannot become active again", () => {
  const game = fresh();
  game.turn = 9;
  game.quests.push({ id: "missing-parcel", title: "失落的邮包", summary: "替侦探找回邮包", status: "completed", objective: "邮包已送还" });
  game.storyHistory.push({ id: "old-parcel", role: "assistant", turn: 2, content: "你刚接受失落的邮包任务，需要替侦探找回邮包。" });
  const result = lookup(game, { query: "失落的邮包之前发生了什么" });
  const current = result.entries.find(entry => entry.type === "task");
  assert.equal(current.status, "completed");
  assert.equal(current.authority, "current");
  assert.match(current.text, /任务已完成/);
  assert.ok(result.entries.some(entry => entry.type === "history" && entry.authority === "historical"));
  assert.equal(game.quests[0].status, "completed");
});

test("tracked task and current location survive a vague continuation but unrelated archive stays optional", () => {
  const game = fresh();
  game.quests.push({ id: "parcel", title: "寻找邮包", summary: "取回邮包", status: "active", objective: "询问邮局" },
    { id: "old", title: "古旧钟楼", summary: "已经完成", status: "completed" });
  game.trackedQuestId = "quest:parcel";
  const result = retrieveContext(game, { query: "继续", maxChars: 2400, limit: 6 });
  assert.ok(result.entries.some(entry => entry.id === "task:quest:parcel"));
  assert.ok(result.entries.some(entry => entry.id === `location:${game.location.id}`));
  assert.equal(result.entries.some(entry => entry.id === "task:quest:old"), false);
});

test("budget counts serialized metadata, handles tiny budgets, and uses deterministic tie breaks", () => {
  const game = fresh();
  game.clues.push({ id: "b", title: "信封线索", detail: "蓝色印章" }, { id: "a", title: "信封证据", detail: "红色印章" });
  const options = { query: "信封", limit: 1, maxChars: 400 };
  assert.equal(lookup(game, options).entries[0].id, "clue:a");
  assert.deepEqual(lookup(game, options), lookup(structuredClone(game), options));
  const result = lookup(game, { query: "信封", limit: 24, maxChars: 200 });
  assert.ok(result.entries.reduce((sum, entry) => sum + JSON.stringify(entry).length, 0) <= 200);
  assert.equal(lookup(game, { query: "信封", maxChars: 1 }).entries.length, 0);
  assert.equal(lookup(game, { query: "信封", limit: 0 }).entries.length, 0);
});

test("history cache cannot leak between saves, rollback, or replaced imports with the same ID", () => {
  clearContextIndex();
  const first = fresh();
  first.storyHistory = [{ id: "same-message", role: "assistant", turn: 3, content: "琥珀发夹藏在旧钟楼。" }];
  assert.ok(lookup(first, { query: "琥珀发夹" }).entries.some(entry => /旧钟楼/.test(entry.text)));
  const second = fresh();
  assert.equal(lookup(second, { query: "琥珀发夹" }).entries.some(entry => /旧钟楼/.test(entry.text)), false);
  const imported = structuredClone(first);
  imported.storyHistory[0].content = "琥珀发夹已经送回邮局。";
  const replaced = lookup(imported, { query: "琥珀发夹" });
  assert.ok(replaced.entries.some(entry => /邮局/.test(entry.text)));
  assert.equal(replaced.entries.some(entry => /旧钟楼/.test(entry.text)), false);
  imported.storyHistory = [];
  imported.recentDialogues = [];
  assert.equal(lookup(imported, { query: "琥珀发夹" }).entries.some(entry => entry.type === "history"), false);
});

test("old stories outside the bounded cache remain searchable and private transport records are excluded", () => {
  const game = fresh();
  game.storyHistory = Array.from({ length: 1500 }, (_, index) => ({ id: `message-${index}`, role: "assistant", turn: index, content: `这是普通街景记录，第${index}轮。` }));
  game.storyHistory[0].content = "苍银信物交给钟楼守望人。";
  game.storyHistory.push({ id: "transport", role: "system", turn: 1501, content: "苍银信物 API_KEY_PRIVATE" });
  const result = lookup(game, { query: "苍银信物", limit: 3 });
  assert.ok(result.entries.some(entry => entry.id === "history:message-0" && entry.sourceTurns.includes(0)));
  assert.doesNotMatch(JSON.stringify(result), /API_KEY_PRIVATE/);
  const cancel = prepareContextIndex(game, { batchSize: 1 });
  cancel();
  assert.deepEqual(lookup(game, { query: "苍银信物", limit: 3 }), result);
});

test("digest sources and user intentions keep their historical certainty", () => {
  const game = fresh();
  game.turn = 12;
  game.memoryState = { version: 2, revision: 1, throughTurn: 10, pending: [], digest: { people: [], events: [], openThreads: [
    { summary: "答应寻找苍银信物", kind: "promise", sourceTurns: [4, 8] },
  ] } };
  game.storyHistory = [{ id: "intent", role: "user", turn: 11, content: "我打算取得苍银信物。" }];
  const result = lookup(game, { query: "苍银信物" });
  assert.ok(result.entries.some(entry => entry.type === "memory" && entry.sourceTurns.join() === "4,8" && /promise/.test(entry.text)));
  assert.ok(result.entries.some(entry => entry.type === "history" && /不代表已完成/.test(entry.text)));
  assert.ok(result.entries.every(entry => entry.authority === "historical"));
});

test("existing context tool expands retrieval while progressive lore remains separate", () => {
  const game = fresh();
  const result = lookupContext(game, { ids: ["sherlock-moriarty"] });
  assert.ok(result.entries.some(entry => entry.id === "person:sherlock-moriarty"));
  assert.deepEqual(result.missing, []);
  assert.ok(progressiveContext(game, "夏洛克").loreFacts.every(entry => entry.type === "loreFact"));
});

test("a tiny budget cannot admit an old active claim without its current terminal task", () => {
  const game = fresh();
  game.quests.push({ id: "parcel", title: "失落邮包", summary: "这是详细的旧任务经过。".repeat(180), status: "completed" });
  game.storyHistory = [{ id: "outdated", role: "assistant", turn: 2, content: "失落邮包任务仍未完成，灰色封蜡是继续调查的线索。" }];
  // The query exists only in the story. The task must be joined from that story,
  // even though it was not itself a keyword match.
  for (const maxChars of [100, 240, 320, 700, 1600]) for (const limit of [1, 2, 6]) {
    const result = lookup(game, { query: "灰色封蜡", maxChars, limit });
    const current = result.entries.find(entry => entry.id === "task:quest:parcel");
    if (maxChars >= 320) assert.equal(current?.status, "completed", `${maxChars}/${limit}`);
    if (result.entries.some(entry => entry.id === "history:outdated")) assert.equal(current?.status, "completed");
    assert.ok(result.usedChars <= maxChars);
  }
  const toolResult = lookupContext(game, { query: "灰色封蜡", maxChars: 320 });
  assert.equal(toolResult.entries.some(entry => entry.id === "history:outdated" && !toolResult.entries.some(current => current.id === "task:quest:parcel")), false);
});

test("large saves retrieve distant evidence with a bounded response and stable repeated lookups", t => {
  const game = fresh();
  game.turn = 2100;
  game.storyHistory = Array.from({ length: 2000 }, (_, index) => ({ id: `long-message-${index}`, role: "assistant", turn: index,
    content: `你走过街角，看到往来行人和报摊上的报纸。这是第${index}轮的街景。`.repeat(5) }));
  game.quests = Array.from({ length: 500 }, (_, index) => ({ id: `archive-${index}`, title: `已结案卷宗${index}号`, status: "completed", summary: "已经确认过的调查细节。".repeat(15) }));
  game.clues = Array.from({ length: 100 }, (_, index) => ({ id: `evidence-${index}`, title: `证物档案${index}号`, detail: "当地居民提供的已核实调查线索。".repeat(5) }));
  game.relationships = Array.from({ length: 100 }, (_, index) => ({ id: `resident-${index}`, name: `街坊档案${index}号`, role: "旧日相识", note: "曾在街区拜访。" }));
  game.storyHistory[4].content = "已结案卷宗499号调查仍在进行。苍银信物曾交给街坊档案99号保管。";
  clearContextIndex();
  const started = performance.now();
  const first = lookup(game, { query: "苍银信物", maxChars: 2400, limit: 6 });
  const cold = performance.now() - started;
  const repeatedAt = performance.now();
  const repeated = lookup(game, { query: "苍银信物", maxChars: 2400, limit: 6 });
  const warm = performance.now() - repeatedAt;
  assert.deepEqual(repeated, first);
  assert.ok(first.entries.some(entry => entry.id === "history:long-message-4"));
  assert.equal(first.entries.find(entry => entry.id === "task:quest:archive-499")?.status, "completed");
  assert.ok(first.entries.some(entry => entry.id === "person:resident-99"));
  assert.ok(first.usedChars <= 2400);
  t.diagnostic(`2000条历史 + 500条归档任务 + 100条线索 + 100名人物：首次 ${cold.toFixed(1)} ms，重复 ${warm.toFixed(1)} ms；结果 ${first.usedChars} 字符。仅为本机实测，非性能保证。`);
});
