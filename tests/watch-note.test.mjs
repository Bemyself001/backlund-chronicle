import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGame, EMPTY_CHARACTER } from '../src/system/game.js';
import { progressiveContext, lookupContext } from '../src/engine/contextLookup.js';
import { migrateSave } from '../src/services/storage.js';
import { getContentTrigger } from '../src/content/index.js';
import { WATCH_NOTE_TEXT, WATCH_NOTE_DETAIL } from '../src/content/backlund/watchNote.js';
import { buildPlanningContext, buildFastPresentationContext, buildRenderingContext, buildFastNarrativeContinuationContext } from '../src/services/memory.js';

const make = () => createInitialGame({ ...EMPTY_CHARACTER, name: '测试', talent: 'heirloom-watch' });
const mark = (game, key) => { game.triggerState.facts[key] = { value: true, firstTurn: 1 }; };

test('note stays hidden until local decoding, then remains pinned for unrelated actions', () => {
  const game = make();
  mark(game, 'watch.note-recovered');
  assert.ok(!JSON.stringify(progressiveContext(game, '继续')).includes(WATCH_NOTE_TEXT));
  assert.match(JSON.stringify(progressiveContext(game, '继续')), /不得提前透露或编造译文/);
  assert.equal(lookupContext(game, { ids: ['lore.watch.fixed-note'] }).entries.length, 0);
  mark(game, 'watch.formal-quest-unlocked');
  const context = progressiveContext(game, '休息');
  assert.ok(JSON.stringify(context).includes(WATCH_NOTE_TEXT));
  assert.ok(!context.loreFacts.some(entry => entry.id === 'lore.watch.recovered-note'));
});

test('planning and both narrative modes receive canonical text despite conflicting history', () => {
  const game = make();
  mark(game, 'watch.formal-quest-unlocked');
  game.recentDialogues = [{ role: 'assistant', content: '纸条写着不要相信白鸢尾，整点交接。' }];
  for (const messages of [buildPlanningContext(game, '继续', ''), buildFastPresentationContext(game, '继续', ''), buildRenderingContext(game, game, '继续', '', {}), buildFastNarrativeContinuationContext(game, game, '继续', '错误译文', '', {})]) {
    assert.ok(messages.at(-1).content.includes(WATCH_NOTE_TEXT));
    assert.ok(messages.at(-1).content.includes('优先于旧剧情'));
  }
});

test('old saves repair the decoded clue without resetting progress or issuing rewards', () => {
  const game = make();
  game.content.contentVersion = '2026.09.16.2';
  game.turn = 42;
  mark(game, 'watch.formal-quest-unlocked');
  game.clues.push({ id: 'clue-watch-note-decoded', detail: '不要相信白鸢尾，整点交接', title: '纸条' });
  const migrated = migrateSave(game);
  assert.ok(migrated.clues.find(entry => entry.id === 'clue-watch-note-decoded').detail.includes(WATCH_NOTE_TEXT));
  assert.equal(migrated.turn, 42);
  assert.equal(migrated.inventory.length, game.inventory.length);
  assert.equal(migrateSave(migrated).clues.length, migrated.clues.length);
  const hidden = make();
  hidden.content.contentVersion = '2026.09.16.2';
  assert.ok(!migrateSave(hidden).clues.some(entry => entry.id === 'clue-watch-note-decoded'));
});

test('local decoding reward and quest guidance share the fixed text', () => {
  const definition = getContentTrigger('watch.heirloom.hidden-note');
  assert.equal(definition.rewards.find(entry => entry.type === 'clue').clue.detail, WATCH_NOTE_DETAIL);
  assert.ok(definition.completionGuidance.guidance.includes(WATCH_NOTE_TEXT));
  assert.equal(definition.version, 5);
  assert.ok(getContentTrigger('watch.heirloom.late-hour').presentation.text.includes(WATCH_NOTE_TEXT));
});
