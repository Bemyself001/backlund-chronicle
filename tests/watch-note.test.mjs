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
  assert.match(JSON.stringify(progressiveContext(game, '继续')), /不得在解读前拼出完整句意/);
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
  assert.equal(definition.version, 8);
  assert.ok(getContentTrigger('watch.heirloom.late-hour').presentation.text.includes(WATCH_NOTE_TEXT));
});

test('version 1.6.0 saves correct white rose to white iris across clues, journal and memory without replaying progress', () => {
  assert.equal(WATCH_NOTE_TEXT, '不要相信白鸢尾，账本已经交还到南岸货栈。');
  const game = make();
  game.content.contentVersion = '2026.09.16.3';
  game.turn = 42;
  mark(game, 'watch.formal-quest-unlocked');
  game.clues.push({ id: 'clue-watch-note-decoded', title: '纸条', detail: '不要相信白蔷薇，账本已经交还到南岸货站。' });
  game.longTermSummary = '纸条警告不要相信白蔷薇。';
  game.storyHistory = [{ role: 'assistant', content: game.longTermSummary }];
  const definition = getContentTrigger('watch.heirloom.late-hour');
  game.triggerState.active.push({ instanceId: 'old-watch', definitionId: definition.id, definitionVersion: 5,
    definitionSnapshot: structuredClone(definition), status: 'engaged', stage: 'trace-uncle', createdTurn: 3,
    presentation: { title: definition.presentation.title, text: game.longTermSummary },
    lastProgressEvidence: '从白蔷薇的警告中确认货站方向', stageHistory: [], timers: { preserved: { deadline: 50 } },
  });
  game.triggerState.rewardsClaimed = ['watch.hidden-note.formal-quest'];
  const migrated = migrateSave(game);
  assert.equal(migrated.content.contentVersion, '2026.09.17.1');
  assert.doesNotMatch(JSON.stringify(migrated), /白蔷薇/);
  assert.doesNotMatch(JSON.stringify(migrated), /南岸货站/);
  assert.match(migrated.questJournal.entries['old-watch'].summary, /白鸢尾/);
  assert.equal(migrated.triggerState.active.find(entry => entry.instanceId === 'old-watch').stage, 'trace-uncle');
  assert.deepEqual(migrated.triggerState.active.find(entry => entry.instanceId === 'old-watch').timers, { preserved: { deadline: 50 } });
  assert.deepEqual(migrated.triggerState.rewardsClaimed, game.triggerState.rewardsClaimed);
  assert.equal(migrated.turn, 42);
  assert.deepEqual(migrateSave(migrated).clues, migrated.clues);
});

test('current saves migrate shorthand into interspersed Loen words without exposing the decoded sentence', () => {
  const game = make();
  game.content.contentVersion = '2026.09.16.4';
  mark(game, 'watch.note-recovered');
  game.storyHistory = [{ text: '舅舅的速记：纸上是陌生的速记符号。' }];
  const migrated = migrateSave(game);
  assert.match(JSON.stringify(migrated.storyHistory), /鲁恩文字/);
  assert.doesNotMatch(JSON.stringify(migrated.storyHistory), /速记/);
  assert.equal(migrated.triggerState.facts['watch.formal-quest-unlocked'], undefined);
  assert.ok(!JSON.stringify(progressiveContext(migrated, '查看纸条')).includes(WATCH_NOTE_TEXT));
  assert.match(JSON.stringify(progressiveContext(migrated, '查看纸条')), /鲁恩文字/);
  assert.deepEqual(migrateSave(migrated).storyHistory, migrated.storyHistory);
});

test('active Renard leads in current saves gain the fixed Lily Street estate address', () => {
  const game = make();
  game.content.contentVersion = '2026.09.16.5';
  const definition = getContentTrigger('side.queens.renard-fall');
  game.triggerState.active.push({
    instanceId: 'old-renard', definitionId: definition.id, definitionVersion: 3,
    definitionSnapshot: structuredClone(definition), status: 'available', stage: definition.initialStage,
    createdTurn: 3, presentation: structuredClone(definition.presentation), stageHistory: [],
  });
  const migrated = migrateSave(game);
  assert.ok(migrated.discoveredLocations.some(entry => entry.id === 'queen-renard-estate'));
  assert.equal(migrated.locationKnowledge['queen-renard-estate'].status, 'discovered');
});
