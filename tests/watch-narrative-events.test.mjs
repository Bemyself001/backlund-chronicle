import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGame, EMPTY_CHARACTER } from '../src/system/game.js';
import { executeToolCalls } from '../src/engine/tools.js';
import { resolveTurnProgress } from '../src/engine/turn.js';
import { createTurnResolution } from '../src/services/turnResolution.js';
import { buildRenderingContext, buildFastNarrativeContinuationContext } from '../src/services/memory.js';
import { migrateSave } from '../src/services/storage.js';

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
      game = migrateSave(structuredClone(game));
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
