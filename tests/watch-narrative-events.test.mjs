import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGame, EMPTY_CHARACTER } from '../src/system/game.js';
import { executeToolCalls } from '../src/engine/tools.js';
import { resolveTurnProgress } from '../src/engine/turn.js';
import { createTurnResolution } from '../src/services/turnResolution.js';
import { buildRenderingContext, buildFastNarrativeContinuationContext } from '../src/services/memory.js';
import { migrateSave } from '../src/services/storage.js';
import { processTriggers } from '../src/engine/triggerEngine.js';
import { pendingWatchNarration, markNarrativeEventsDelivered } from '../src/services/narrativeEvents.js';
import { hasValidModelChoices } from '../src/services/choices.js';

test('inventory button inspections at the same turn queue narration, recover missed saves and retry until delivered', () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: '行囊测试', talent: 'heirloom-watch' });
  const instanceId = game.inventory.find(item => item.itemId === 'heirloom-watch').instanceId;
  const originalTurn = game.turn;
  for (let i = 0; i < 4; i++) {
    const calls = [{ id: `local-${i}`, name: 'item.inspect', args: { instanceId }, reason: '检查家传怀表' }];
    const execution = executeToolCalls({ ...game, turn: originalTurn - 1 }, calls);
    processTriggers(execution.game, { action: '检查家传怀表', toolCalls: calls, toolResults: execution.results, turn: originalTurn });
    game = { ...execution.game, turn: originalTurn };
    assert.equal(pendingWatchNarration(game).length, i === 3 ? 1 : 0);
  }
  game = migrateSave(structuredClone(game));
  assert.equal(pendingWatchNarration(game).length, 1);
  const events = pendingWatchNarration(game);
  const originalChoices = structuredClone(game.choices);
  const originalLocation = structuredClone(game.location);
  const originalTriggers = structuredClone(game.triggerState);
  assert.equal(pendingWatchNarration(game).length, 1, 'failed/cancelled generation must not acknowledge delivery');
  assert.deepEqual(game.choices, originalChoices, 'pending narration must not replace choices before success');
  game = migrateSave(markNarrativeEventsDelivered(game, events));
  assert.deepEqual(game.choices.map(choice => choice.label), [
    '前往皇后区公共图书馆，查找文字与符号资料',
    '前往希尔斯顿区商会街，打听舅舅工作过的钟表行',
    '暂时收起纸条，处理其他事情',
  ]);
  assert.equal(game.choiceMeta.source, 'story-event');
  assert.ok(hasValidModelChoices(game), 'valid story choices must not trigger AI replacement');
  assert.deepEqual(game.location, originalLocation);
  assert.deepEqual(game.triggerState, originalTriggers);
  assert.deepEqual(pendingWatchNarration(game), []);
  assert.deepEqual(markNarrativeEventsDelivered(game, []).choices, game.choices);
  assert.equal(game.turn, originalTurn);
});

test('fourth watch inspection emits one story event in both rendering modes, survives reload without repeating', () => {
  let game = createInitialGame({ ...EMPTY_CHARACTER, name: '调查员', talent: 'heirloom-watch' });
  const instanceId = game.inventory.find(item => item.itemId === 'heirloom-watch').instanceId;
  for (let turn = 1; turn <= 5; turn++) {
    const before = structuredClone(game);
    const calls = [{ id: `watch-${turn}`, name: 'item.inspect', args: { instanceId, reveal: true }, reason: '检查怀表夹层' }];
    const execution = executeToolCalls(game, calls, { playerAction: '继续检查家传怀表' });
    assert.equal(execution.results[0].ok, true);
    const progress = resolveTurnProgress(execution.game, '继续检查家传怀表', 'low', calls, execution.results);
    const resolution = createTurnResolution(calls, execution.results, progress);
    assert.equal(resolution.derivedEffects.narrativeEvents.length, turn === 4 ? 1 : 0);
    game = execution.game;
    game.turn = turn;
    if (turn === 4) {
      const event = resolution.derivedEffects.narrativeEvents[0];
      assert.deepEqual(event.routes.map(route => route.locationId), ['queen-library', 'hillston-market']);
      for (const messages of [buildRenderingContext(before, game, '检查怀表', '', resolution), buildFastNarrativeContinuationContext(before, game, '检查怀表', '检查过程', '', resolution)]) {
        assert.ok(messages.some(message => message.role === 'system' && message.content.includes('必须在本轮剧情正文')));
        const payload = messages.at(-1).content;
        assert.match(payload, /皇后区公共图书馆/);
        assert.match(payload, /希尔斯顿区商会街/);
        assert.match(payload, /任选其一/);
      }
      game = migrateSave(markNarrativeEventsDelivered(game, [event]));
      assert.deepEqual(game.choices, event.choices);
      assert.notEqual(game.choices, event.choices);
    }
  }
});

test('rejected inspections and unrelated turns cannot request watch narration', () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: '调查员' });
  const calls = [{ id: 'invalid', name: 'item.inspect', args: { instanceId: 'missing' }, reason: '检查怀表' }];
  const execution = executeToolCalls(game, calls, { playerAction: '检查怀表' });
  const progress = resolveTurnProgress(execution.game, '检查怀表', 'low', calls, execution.results);
  assert.deepEqual(createTurnResolution(calls, execution.results, progress).derivedEffects.narrativeEvents, []);
  assert.deepEqual(createTurnResolution().derivedEffects.narrativeEvents, []);
});
