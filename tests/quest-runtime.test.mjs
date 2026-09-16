import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGame, EMPTY_CHARACTER } from '../src/system/game.js';
import { executeToolCalls } from '../src/engine/tools.js';
import { processTriggers } from '../src/engine/triggerEngine.js';
import { syncQuestJournal, questAssistance, visibleQuestJournal, questJournalEvents, questStagePolicy } from '../src/engine/questRuntime.js';
import { migrateSave } from '../src/services/storage.js';
import { markNarrativeEventsDelivered } from '../src/services/narrativeEvents.js';
import { getTriggerDefinition } from '../src/engine/triggerDefinitions.js';
import { minutesForTurn } from '../src/engine/turn.js';
import { fixedNarrativeMessages } from '../src/system/narrativeContract.js';

function fixture(policy = {}) {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: '任务测试' });
  const definition = { id: 'test.investigation', category: 'personal-story', version: 1,
    presentation: { title: '遗失的信件', text: '调查一封遗失信件的去向。' }, engagedStage: 'ask',
    stages: [
      { id: 'ask', guidance: '向门房了解收信记录', ...policy, transitions: [{ objectiveId: 'ask', actionTerms: ['询问'], nextStage: 'read' }] },
      { id: 'read', guidance: '核对已找到的收信簿', transitions: [{ objectiveId: 'read', actionTerms: ['核对'], nextStage: 'return', requirements: [{ type: 'fact', key: 'test.ledger', value: true }], requirementMessage: '先找到收信簿' }] },
      { id: 'return', guidance: '交还信件', transitions: [{ objectiveId: 'return', nextStage: 'done', complete: true }] },
    ], rewards: [{ id: 'test.reward', type: 'fact', key: 'test.completed', value: true }],
  };
  game.triggerState.active.push({ instanceId: 'test-task', definitionId: definition.id, category: definition.category, status: 'available', stage: 'ask', createdTurn: 0, presentation: definition.presentation, definitionVersion: 1, definitionSnapshot: definition, stageHistory: [] });
  syncQuestJournal(game);
  return game;
}
function run(game, action, args, turn = game.turn + 1) {
  game.turn = turn - 1;
  const calls = [{ id: `quest-${turn}`, name: 'quest.resolve', args: { instanceId: 'test-task', actionQuote: action, evidence: '门房提供了具体的投递记录', ...args } }];
  const execution = executeToolCalls(game, calls, { playerAction: action });
  processTriggers(execution.game, { action, toolCalls: calls, toolResults: execution.results, turn });
  execution.game.turn = turn;
  return { ...execution, calls };
}

test('semantic pursuit registers a journal atomically and chains ordinary steps with local requirements', () => {
  const game = fixture();
  game.triggerState.facts['test.ledger'] = { value: true };
  const result = run(game, '把信封递给门房，请他帮忙看看，再把簿子里的内容读给我', { start: true, outcome: 'progress', steps: [{ objectiveId: 'ask' }, { objectiveId: 'read' }] });
  assert.equal(result.results[0].ok, true);
  assert.equal(result.results[0].data.completedSteps.length, 2);
  const journal = result.game.questJournal.entries['test-task'];
  assert.equal(journal.status, 'engaged');
  assert.equal(journal.title, '遗失的信件');
  assert.equal(journal.objective, '交还信件');
  assert.match(journal.summary, /投递记录/);
  assert.equal(migrateSave(result.game).questJournal.entries['test-task'].stage, 'return');
});

test('a later unmet requirement preserves earlier progress but does not skip or reward', () => {
  const result = run(fixture(), '请门房帮忙，再看记录', { start: true, outcome: 'progress', steps: [{ objectiveId: 'ask' }, { objectiveId: 'read' }] });
  assert.equal(result.results[0].data.completedSteps.length, 1);
  assert.match(result.results[0].data.blockedReason, /收信簿/);
  assert.equal(result.game.questJournal.entries['test-task'].stage, 'read');
  assert.equal(result.game.triggerState.facts['test.completed'], undefined);
});

test('two stalled related actions clarify goals, third offers an executable time-cost recovery; rest and reload do not count', () => {
  let result = run(fixture(), '向门房打听信件', { start: true, outcome: 'blocked' });
  let game = migrateSave(result.game);
  processTriggers(game, { action: '睡觉', turn: 2 });
  assert.equal(game.questJournal.attempts['test-task'].stalled, 1);
  result = run(game, '继续向门房打听信件', { outcome: 'blocked' }, 3);
  game = result.game;
  assert.equal(questAssistance(game, game.questJournal.entries['test-task']).level, 2);
  result = run(game, '请门房再次查找信件', { outcome: 'blocked' }, 4);
  game = migrateSave(result.game);
  const assistance = questAssistance(game, game.questJournal.entries['test-task']);
  assert.equal(assistance.level, 3);
  assert.equal(assistance.recoverable, true);
  processTriggers(game, { action: '请门房再次查找信件', toolCalls: result.calls, toolResults: result.results, turn: 4 });
  assert.equal(game.questJournal.attempts['test-task'].stalled, 3);
  result = run(game, assistance.recoveryAction, { outcome: 'recover', evidence: '门房建议找当天值班的邮差核实投递路线' }, 5);
  assert.equal(result.results[0].ok, true);
  assert.equal(minutesForTurn(assistance.recoveryAction, result.calls, result.results), 20);
  assert.equal(result.game.questJournal.attempts['test-task'].stalled, 0);
  assert.match(questAssistance(result.game, result.game.questJournal.entries['test-task']).text, /邮差/);
  assert.equal(result.game.questJournal.entries['test-task'].stage, 'ask');
  assert.deepEqual(result.game.triggerState.rewardsClaimed, []);
});

test('finales neither chain nor receive guaranteed recovery; old snapshots keep current safety policy', () => {
  let result = run(fixture({ finale: true }), '询问门房再核对记录', { start: true, outcome: 'progress', steps: [{ objectiveId: 'ask' }, { objectiveId: 'read' }] });
  assert.equal(result.results[0].data.completedSteps.length, 1);
  let game = fixture({ finale: true });
  for (let turn = 1; turn <= 3; turn++) game = run(game, '询问门房', { start: turn === 1, outcome: 'failed' }, turn).game;
  assert.equal(questAssistance(game, game.questJournal.entries['test-task']).recoverable, false);
  result = run(game, '整理证据并请教门房', { outcome: 'recover' }, 4);
  assert.equal(result.results[0].ok, false);
  const watch = getTriggerDefinition('watch.heirloom.late-hour');
  assert.equal(questStagePolicy({ ...watch, stages: [] }, { id: 'mercy-decision' }).finale, true);
});

test('unrelated quotations and negative intent cannot start or complete a task', () => {
  let result = run(fixture(), '我不想调查这封信', { start: true, outcome: 'progress', steps: [{ objectiveId: 'ask' }] });
  assert.equal(result.results[0].ok, false);
  result = run(fixture(), '去休息', { actionQuote: '询问信件', start: true, outcome: 'blocked' });
  assert.equal(result.results[0].ok, false);
});

test('all completed records survive reload without the previous five-entry history cutoff; choices track confirmed goals', () => {
  const game = fixture();
  game.quests = Array.from({ length: 9 }, (_, index) => ({ id: `old-${index}`, title: `旧任务${index}`, status: '已完成' }));
  const loaded = migrateSave(game);
  assert.equal(visibleQuestJournal(loaded).filter(entry => entry.status === 'completed').length, 9);
  assert.ok(visibleQuestJournal(loaded).every(entry => entry.title && entry.summary && entry.objective));
  const result = run(fixture(), '询问信件', { start: true, outcome: 'blocked' });
  const events = questJournalEvents(result.game);
  const delivered = markNarrativeEventsDelivered(result.game, events);
  assert.match(delivered.choices[0].label, /门房/);
  assert.deepEqual(questJournalEvents(delivered), []);
  assert.ok(fixedNarrativeMessages().some(message => message.role === 'system' && message.content.includes('最高优先级：任务引擎')));
});

test('completed tasks reward once and cannot be replayed under a new tool id', () => {
  const game = fixture();
  game.triggerState.facts['test.ledger'] = { value: true };
  const result = run(game, '询问门房、读记录并交还信件', { start: true, outcome: 'progress', steps: [{ objectiveId: 'ask' }, { objectiveId: 'read' }, { objectiveId: 'return' }] });
  assert.equal(result.results[0].data.completedSteps.length, 3);
  assert.equal(result.game.questJournal.entries['test-task'].status, 'completed');
  const loaded = migrateSave(result.game);
  const retry = run(loaded, '再次交还信件', { outcome: 'progress', steps: [{ objectiveId: 'return' }] });
  assert.equal(retry.results[0].ok, false);
  assert.equal(retry.game.triggerState.rewardsClaimed.filter(id => id === 'test.reward').length, 1);
});

test('entering a dangerous stage cannot consume its step in the same turn', () => {
  const game = fixture();
  game.triggerState.active[0].definitionSnapshot.stages[1].dangerous = true;
  game.triggerState.facts['test.ledger'] = { value: true };
  const result = run(game, '询问门房并核对记录', { start: true, outcome: 'progress', steps: [{ objectiveId: 'ask' }, { objectiveId: 'read' }] });
  assert.equal(result.results[0].data.completedSteps.length, 1);
  const duplicate = run(result.game, '核对记录', { outcome: 'progress', steps: [{ objectiveId: 'read' }] }, 1);
  assert.equal(duplicate.game.questJournal.entries['test-task'].stage, 'read');
});

test('ordinary created tasks always have summary and goal; managed commissions cannot be altered by AI', () => {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: '任务测试' });
  const created = executeToolCalls(game, [{ id: 'new', name: 'quest.add', args: { quest: { id: 'letter', title: '送信' } }, reason: '答应把信交给旅店老板' }]);
  assert.equal(created.game.questJournal.entries['quest:letter'].status, 'engaged');
  assert.match(created.game.questJournal.entries['quest:letter'].summary, /旅店老板/);
  const updated = run(created.game, '找到旅店老板，请他收下信件', { instanceId: 'quest:letter', outcome: 'progress', evidence: '老板已收下信件并要求核对寄件人', nextObjective: '核对寄件人的姓名' });
  assert.equal(updated.game.questJournal.entries['quest:letter'].objective, '核对寄件人的姓名');
  game.quests.push({ id: 'managed', title: '途径委托', summary: '现场调查', source: '特殊行动', status: 'active' });
  syncQuestJournal(game);
  assert.equal(game.questJournal.entries['quest:managed'].status, 'engaged');
  const changed = executeToolCalls(game, [{ id: 'rewrite', name: 'quest.update', args: { questId: 'managed', patch: { status: '已完成' } } }]);
  assert.equal(changed.results[0].ok, false);
});
