import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGame, EMPTY_CHARACTER } from '../src/system/game.js';
import { SPECIAL_QUEST_DEFINITIONS } from '../src/content/backlund/specialQuests/index.js';
import { triggerGuidance } from '../src/engine/triggerGuidance.js';
import { pendingQuestNarration, markNarrativeEventsDelivered, eventDirections } from '../src/services/narrativeEvents.js';
import { createTurnResolution } from '../src/services/turnResolution.js';
import { executeToolCalls } from '../src/engine/tools.js';
import { resolveTurnProgress } from '../src/engine/turn.js';
import { migrateSave } from '../src/services/storage.js';
import { buildRenderingContext, buildFastNarrativeContinuationContext, buildPlanningContext } from '../src/services/memory.js';

const WATCH = 'watch.heirloom.late-hour';
const RENARD = 'side.queens.renard-fall';
const DETONATOR = 'side.bridge.silent-detonator';
function make(definitionId, stage, status = 'engaged') {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: '流程测试', talent: 'heirloom-watch' });
  const definition = SPECIAL_QUEST_DEFINITIONS.find(entry => entry.id === definitionId);
  game.triggerState.active = [{ instanceId: 'case', definitionId, stage, status, createdTurn: 0, presentation: definition.presentation, stageHistory: [] }];
  return game;
}
function mark(game, key) { game.triggerState.facts[key] = { value: true, firstTurn: game.turn }; }
function settle(game, objectiveId, action) {
  const calls = [{ id: `${game.turn}:${objectiveId}`, name: 'trigger.progress', args: { instanceId: 'case', objectiveId, evidence: '本轮已完成现场调查并获得实际证据' }, reason: action }];
  const execution = executeToolCalls(game, calls, { playerAction: action });
  assert.equal(execution.results[0].ok, true, execution.results[0].reason);
  const progress = resolveTurnProgress(execution.game, action, 'low', calls, execution.results);
  const next = { ...execution.game, turn: game.turn + 1 };
  return { next, resolution: createTurnResolution(calls, execution.results, progress, next) };
}

test('every watch and side quest stage has player-facing directions and a narrative cue', () => {
  for (const definition of SPECIAL_QUEST_DEFINITIONS) {
    for (const stage of definition.stages) {
      const game = make(definition.id, stage.id);
      const hint = triggerGuidance(game, game.triggerState.active[0]);
      assert.ok(hint.text.length > 10, `${definition.id}/${stage.id}`);
      assert.ok(hint.narrativeCue.length > 10);
      assert.doesNotMatch(hint.text, /先完成.*支线|才能解锁|objectiveId|trigger\.progress/);
    }
    assert.ok(definition.completionGuidance?.guidance);
  }
});

test('decoded note leads to warehouse without requiring knowledge of the next task ID', () => {
  const game = make('watch.heirloom.hidden-note', 'note-recovered');
  game.location.id = 'queen-library';
  mark(game, 'watch.note-recovered');
  const { next, resolution } = settle(game, 'decode-watch-note', '查阅速记资料并解读纸条');
  assert.match(eventDirections(resolution.derivedEffects.narrativeEvents), /桥区南岸货栈/);
  assert.ok(next.triggerState.active.some(entry => entry.definitionId === WATCH && entry.status === 'available'));
  assert.equal(resolution.derivedEffects.narrativeEvents.some(event => event.id === 'watch.investigation-routes'), false);
  for (const messages of [buildRenderingContext(game, next, '解读', '', resolution), buildFastNarrativeContinuationContext(game, next, '解读', '此前正文', '', resolution)]) {
    assert.ok(messages.some(message => message.role === 'system' && message.content.includes('采用含蓄风格')));
    assert.match(messages.at(-1).content, /桥区南岸货栈/);
  }
});

test('each actual detonator transition supplies the next direction and a closing scene', () => {
  let game = make(DETONATOR, 'inspect-dud');
  for (const [objective, action, expected] of [
    ['inspect-dud', '检查哑火雷管', /交接记录/],
    ['trace-stolen-detonators', '追查被盗雷管的去向', /危险装置/],
    ['disarm-live-detonator', '请专业人员协助安全解除危险雷管', /承包商的酬谢/],
  ]) {
    const { next, resolution } = settle(game, objective, action);
    assert.match(eventDirections(resolution.derivedEffects.narrativeEvents), expected);
    game = markNarrativeEventsDelivered(next, resolution.derivedEffects.narrativeEvents);
  }
});

test('preparation handoff changes with either side quest and both, without spoiling grate opener', () => {
  for (const first of ['side.renard.completed', 'side.silent-detonator.completed']) {
    let game = make(WATCH, 'enter-south-warehouse');
    mark(game, 'watch.drain-found');
    game = markNarrativeEventsDelivered(game, pendingQuestNarration(game));
    assert.deepEqual(pendingQuestNarration(game), []);
    mark(game, first);
    let events = pendingQuestNarration(game);
    assert.equal(events.length, 1);
    assert.match(eventDirections(events), first.includes('renard') ? /拆除工地/ : /求医/);
    game = markNarrativeEventsDelivered(game, events);
    mark(game, first.includes('renard') ? 'side.silent-detonator.completed' : 'side.renard.completed');
    events = pendingQuestNarration(game);
    assert.match(eventDirections(events), /值得再看一眼/);
    assert.doesNotMatch(eventDirections(events), /官方|值夜者|已被撬开|先完成/);
  }
});

test('time warnings update at three, two and one actions, and reload does not replay delivered directions', () => {
  let game = make('side.bridge.ebb-iron-door', 'rescue-dock-boy');
  game.triggerState.active[0].timers = { 'rising-tide': { startedTurn: 0, deadline: 10 } };
  game = markNarrativeEventsDelivered(game, pendingQuestNarration(game));
  game.turn = 2;
  assert.deepEqual(pendingQuestNarration(game), []);
  for (const turn of [7, 8, 9]) {
    game.turn = turn;
    const events = pendingQuestNarration(game);
    assert.match(eventDirections(events), new RegExp(`剩余 ${10 - turn} 次行动`));
    game = migrateSave(markNarrativeEventsDelivered(game, events));
    assert.deepEqual(pendingQuestNarration(game), []);
  }
});

test('auction purchase leads straight to treatment; treatment guidance respects player pathway', () => {
  const game = make(RENARD, 'auction-conversation');
  game.inventory.push({ instanceId: 'medicine', itemId: 'renard-healing-draught', quantity: 1 });
  const { resolution } = settle(game, 'use-healing-medicine', '返回宅邸用治疗药剂救治小姐');
  assert.match(eventDirections(resolution.derivedEffects.narrativeEvents), /求医有了结果/);
  const apothecary = make(RENARD, 'secure-treatment');
  apothecary.character = createInitialGame({ ...EMPTY_CHARACTER, extraordinary: 'low', pathway: '药师（序列9）' }).character;
  assert.match(triggerGuidance(apothecary, apothecary.triggerState.active[0]).text, /你自己/);
});

test('available investigation accepts natural requests to consult and read', () => {
  for (const action of ['请教馆员纸条的含义', '查阅速记资料', '向工人打听雷管的事']) {
    const game = make(DETONATOR, 'dud-reported', 'available');
    const execution = executeToolCalls(game, [{ id: action, name: 'trigger.engage', args: { instanceId: 'case' }, reason: action }], { playerAction: action });
    assert.equal(execution.results[0].ok, true);
  }
});

test('a natural library inquiry can engage and decode in one turn, with no extra acceptance prompt', () => {
  const game = make('watch.heirloom.hidden-note', 'note-recovered', 'available');
  game.location.id = 'queen-library';
  mark(game, 'watch.note-recovered');
  const action = '请教馆员并查阅旧资料解读怀表纸条';
  const planning = buildPlanningContext(game, action, '').at(-1).content;
  assert.match(planning, /requiresEngagement.*true/);
  assert.match(planning, /decode-watch-note/);
  const calls = [
    { id: 'engage', name: 'trigger.engage', args: { instanceId: 'case' }, reason: action },
    { id: 'decode', name: 'trigger.progress', args: { instanceId: 'case', objectiveId: 'decode-watch-note', evidence: '馆员用旧速记表核对出了纸条的译文' }, reason: action },
  ];
  const execution = executeToolCalls(game, calls, { playerAction: action });
  assert.ok(execution.results.every(result => result.ok));
  resolveTurnProgress(execution.game, action, 'low', calls, execution.results);
  assert.equal(execution.game.triggerState.facts['watch.formal-quest-unlocked'].value, true);
});

test('active old snapshots refresh guidance without changing stages, timers or rewards', () => {
  const game = make(WATCH, 'last-chance');
  game.content.contentVersion = '2026.09.16.1';
  Object.assign(game.triggerState.active[0], { definitionVersion: 3, definitionSnapshot: { id: WATCH, version: 3, stages: [] }, timers: { 'approaching-enemy': { startedTurn: 3, deadline: 5 } } });
  game.triggerState.rewardsClaimed = ['old-payment'];
  const loaded = migrateSave(game);
  assert.equal(loaded.triggerState.active[0].stage, 'last-chance');
  assert.equal(loaded.triggerState.active[0].timers['approaching-enemy'].deadline, 5);
  assert.deepEqual(loaded.triggerState.rewardsClaimed, ['old-payment']);
  assert.match(triggerGuidance(loaded, loaded.triggerState.active[0]).text, /脚步/);
});
