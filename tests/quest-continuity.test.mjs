import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGame, EMPTY_CHARACTER } from '../src/system/game.js';
import { executeToolCalls, validateToolCall } from '../src/engine/tools.js';
import { registerQuest } from '../src/engine/questLifecycle.js';
import { resolveQuestAction } from '../src/engine/questActions.js';
import { chooseQuestFocus } from '../src/engine/questFocus.js';
import { findQuestReference } from '../src/engine/questIdentity.js';
import { syncQuestJournal } from '../src/engine/questRuntime.js';
import { resolveTurnProgress } from '../src/engine/turn.js';
import { createTurnResolution } from '../src/services/turnResolution.js';
import { pendingQuestNarration, markNarrativeEventsDelivered } from '../src/services/narrativeEvents.js';
import { buildPlanningContext, buildRenderingContext, buildChoiceRegenerationContext } from '../src/services/memory.js';
import { getTriggerDefinition } from '../src/engine/triggerDefinitions.js';
import { moneyToPence } from '../src/system/money.js';
import { migrateSave } from '../src/services/storage.js';
import { inspectQuestTracking } from '../src/services/questTracking.js';
import { repairToolCallsConcurrently } from '../src/services/toolRepair.js';
import { applyChoiceRecovery } from '../src/services/choiceRecovery.js';
import { advanceWorldTime, formatWorldTime, parseWorldTime } from '../src/engine/worldTime.js';
import { triggerAppointment } from '../src/engine/triggerAppointments.js';
import { inspectQuestRoutes } from '../src/engine/questRoutes.js';

const fresh = () => createInitialGame({ ...EMPTY_CHARACTER, name: '支线测试员' });
const choices = title => [1, 2, 3].map(index => ({ label: `${title}行动${index}`, intent: 'investigate', risk: 'low' }));
function ordinary(game, id = 'letter', extra = {}) {
  const input = { id, title: id === 'letter' ? '送信支线' : '舅舅主线', summary: '交还信件', objective: '交还信件', status: 'engaged', kind: 'side',
    contract: { coreGoal: '交还信件', nodes: [{ id: 'deliver', objective: '交还信件', conditions: [{ type: 'action', terms: ['交还信件'] }], minutes: 5 }], rewards: [{ type: 'money', amountPence: 240 }], ...extra } };
  const result = registerQuest(game, input, game.turn + 1, '我接受这项委托');
  assert.equal(result.ok, true, result.reason);
  syncQuestJournal(game);
  return result.quest;
}
const args = (id, action, extra = {}) => ({ instanceId: id, actionQuote: action, evidence: '本轮已实际履行约定并核对结果', outcome: 'progress', steps: [{ objectiveId: 'deliver' }], ...extra });
function fixed(game, stage = 'assess-injury') {
  const definition = getTriggerDefinition('side.queens.renard-fall');
  const instance = { instanceId: 'renard-case', definitionId: definition.id, status: 'engaged', category: definition.category, stage, createdTurn: 0, engagedTurn: 0, stageHistory: [], presentation: definition.presentation };
  game.triggerState.active.push(instance);
  game.location = { id: 'queen-renard-estate', name: '雷纳德宅邸', district: '皇后区' };
  return instance;
}

test('raw ordinary ID and exact title resolve to the registered journal; ambiguous names never guess', () => {
  for (const id of ['letter', 'quest:letter', '送信支线']) {
    const game = fresh(); ordinary(game);
    const before = moneyToPence(game.money);
    assert.equal(resolveQuestAction(game, args(id, '交还信件'), '交还信件', 1).ok, true);
    assert.equal(moneyToPence(game.money), before + 240);
  }
  const game = fresh(); ordinary(game); ordinary(game, 'other');
  game.quests[1].title = '送信支线';
  assert.equal(findQuestReference(game, '送信支线').ok, false);
  assert.equal(findQuestReference(game, 'quest:letter').ok, true);
});

test('fixed definition ID and visible title reuse the existing side quest instead of adding a duplicate', () => {
  for (const id of ['side.queens.renard-fall', '高窗之下']) {
    const game = fresh(); fixed(game);
    const action = '与雷纳德子爵交谈，询问女儿的伤势';
    const result = resolveQuestAction(game, args(id, action, { steps: [{ objectiveId: 'assess-renard-injury' }] }), action, 1);
    assert.equal(result.ok, true, result.reason);
    assert.equal(game.triggerState.active.find(item => item.instanceId === 'renard-case').stage, 'secure-treatment');
    assert.equal(game.quests.length, 0);
  }
  const game = fresh();
  assert.equal(registerQuest(game, { id: 'fake', title: '高窗之下', objective: '交还信件' }).ok, false);
  assert.equal(findQuestReference(game, '高窗之下').ok, false);
});

test('missing task identifiers enter parameter repair rather than failing only at settlement', () => {
  const checked = validateToolCall(fresh(), { name: 'quest.resolve', args: args('missing', '领取报酬'), reason: '按约领取' });
  assert.match(checked.error, /任务标识参数需要修复/);
  assert.doesNotMatch(checked.error, /必须已经可见/);
});

test('main story notices cannot replace focused side choices; everyday actions clear the focus', () => {
  const game = fresh(); ordinary(game); ordinary(game, 'main');
  game.trackedQuestId = 'quest:main';
  game.questFocus = chooseQuestFocus(game, '继续送信支线');
  game.choices = choices('送信支线');
  const events = [{ id: 'main-event', questId: 'quest:main', choices: choices('舅舅主线') }, { id: 'side-event', questId: 'quest:letter', choices: choices('送信支线') }];
  const next = markNarrativeEventsDelivered(game, events, { action: '继续送信支线' });
  assert.ok(next.choices.every(choice => !choice.label.includes('舅舅主线')));
  assert.equal(next.choiceMeta.questId, 'quest:letter');
  assert.equal(chooseQuestFocus(next, '继续向他询问').id, 'quest:letter');
  assert.equal(chooseQuestFocus(next, '暂时搁置送信支线，去吃饭'), null);
  assert.deepEqual(markNarrativeEventsDelivered({ ...next, questFocus: null }, events, { action: '吃饭' }).choices, next.choices);
});

test('side continuation is available even after its old journal notice was delivered', () => {
  const game = fresh(); ordinary(game); ordinary(game, 'main');
  game.questFocus = { id: 'quest:letter' }; game.choices = choices('舅舅主线');
  const next = markNarrativeEventsDelivered(game, [], { action: '继续送信支线' });
  assert.equal(next.choices.length, 3);
  assert.match(next.choices[0].label, /送信支线/);
  assert.ok(next.choices.every(choice => !choice.label.includes('舅舅主线')));
});

test('late choice regeneration cannot replace side actions with the main title abbreviation', () => {
  const game = fresh(); ordinary(game); ordinary(game, 'main');
  game.quests[1].title = '家传怀表：迟到的整点';
  game.questFocus = { id: 'quest:letter' };
  const next = applyChoiceRecovery(game, game, { choices: choices('迟到的整点'), choiceMeta: { source: 'model' } });
  assert.equal(next.choices.length, 3); assert.match(next.choices[0].label, /送信支线/);
  assert.ok(next.choices.every(choice => !choice.label.includes('迟到的整点')));
});

test('background narration is deferred while side context reaches planning, rendering and choice recovery', () => {
  const game = fresh(); ordinary(game); ordinary(game, 'main'); game.questFocus = { id: 'quest:letter' };
  const events = pendingQuestNarration(game, [], { action: '继续送信支线' });
  assert.ok(events.every(event => (event.questId || event.instanceId) === 'quest:letter'));
  const resolution = { derivedEffects: { narrativeEvents: events } };
  for (const messages of [buildPlanningContext(game, '继续送信支线', ''), buildRenderingContext(game, game, '继续送信支线', '', resolution), buildChoiceRegenerationContext(game, '继续送信支线', '正在交谈', '', '')]) {
    assert.match(messages.map(message => message.content).join('\n'), /当前行动优先/);
    assert.match(messages.at(-1).content, /currentQuestFocus/);
  }
});

test('promised hand-in reward remains pending across reload, then pays once at the agreed location', () => {
  let game = fresh(); ordinary(game, 'letter', { rewardClaim: { objective: '回旅店领取报酬', locationId: 'east-inn' } });
  const before = moneyToPence(game.money);
  const done = resolveQuestAction(game, args('letter', '交还信件'), '交还信件', 1);
  assert.equal(done.ok, true); assert.equal(done.rewardSettlement.pending, true);
  assert.equal(game.quests[0].stage, 'awaiting-reward'); assert.equal(moneyToPence(game.money), before);
  game = migrateSave(game);
  const claim = args('letter', '领取送信支线的报酬', { outcome: 'claim', steps: [] });
  assert.equal(resolveQuestAction(game, claim, claim.actionQuote, 2).ok, false);
  game.location.id = 'east-inn';
  const result = resolveQuestAction(game, claim, claim.actionQuote, 2);
  assert.equal(result.ok, true, result.reason); assert.equal(moneyToPence(game.money), before + 240);
  assert.equal(resolveQuestAction(game, claim, claim.actionQuote, 3).rewardSettlement.alreadyClaimed, true);
  assert.equal(moneyToPence(game.money), before + 240);
});

test('RP claiming an existing pending reward settles locally even if the model omits tools', () => {
  const game = fresh(); ordinary(game, 'letter', { rewardClaim: { objective: '回来领取报酬', locationId: game.location.id } });
  resolveQuestAction(game, args('letter', '交还信件'), '交还信件', 1);
  game.turn = 1; game.questFocus = { id: 'quest:letter' };
  const before = moneyToPence(game.money);
  const progress = resolveTurnProgress(game, '我向委托人领取约定报酬', 'low');
  assert.equal(moneyToPence(game.money), before + 240);
  assert.equal(progress.questRewardSettlements[0].amountPence, 240);
});

test('claiming never bypasses incomplete work, refusal, death or double money tools', () => {
  const game = fresh(); ordinary(game);
  assert.equal(resolveQuestAction(game, args('letter', '领取报酬', { outcome: 'claim' }), '领取报酬', 1).ok, false);
  const before = moneyToPence(game.money);
  const calls = [{ name: 'money.add', args: { amount: { pounds: 1 } }, reason: '发放任务报酬' }, { name: 'quest.resolve', args: args('letter', '交还信件'), reason: '完成约定' }];
  const result = executeToolCalls(game, calls, { playerAction: '交还信件' });
  assert.ok(result.results.every(entry => entry.ok)); assert.equal(moneyToPence(result.game.money), before + 240);
});

function missedQuest() {
  const game = fresh(); game.turn = 3;
  game.storyHistory = [
    { role: 'assistant', turn: 1, content: '送信支线：请交还信件，约定报酬一镑。' },
    { role: 'user', turn: 2, content: '我接受送信支线，答应交还信件。' },
    { role: 'assistant', turn: 2, content: '你接下了送信支线。' },
    { role: 'user', turn: 3, content: '我把信件交还信件收件人。' },
    { role: 'assistant', turn: 3, content: '收件人已经收下了信件，送信支线的交付完成。' },
  ];
  const recovery = { quest: { id: 'lost-letter', title: '送信支线', summary: '交还信件', objective: '交还信件', kind: 'side', contract: { coreGoal: '交还信件', nodes: [{ id: 'deliver', objective: '交还信件', conditions: [{ type: 'action', terms: ['交还信件'] }], minutes: 5 }], rewards: [{ type: 'money', amountPence: 240 }] } },
    agreement: { turn: 1, quote: game.storyHistory[0].content }, acceptance: { turn: 2, quote: game.storyHistory[1].content },
    completedSteps: [{ objectiveId: 'deliver', turn: 3, actionQuote: game.storyHistory[3].content, resultQuote: game.storyHistory[4].content }] };
  return { game, recovery };
}

test('a genuinely unregistered historical commission restores proven progress and pays without replaying it', () => {
  const { game, recovery } = missedQuest(), before = moneyToPence(game.money);
  const action = '我领取送信支线的约定报酬';
  const result = resolveQuestAction(game, args('lost-letter', action, { outcome: 'claim', recovery }), action, 4);
  assert.equal(result.ok, true, result.reason); assert.equal(moneyToPence(game.money), before + 240);
  assert.deepEqual(game.quests[0].lifecycle.completedNodeIds, ['deliver']);
  const loaded = migrateSave(game);
  assert.equal(resolveQuestAction(loaded, args('lost-letter', action, { outcome: 'claim' }), action, 5).ok, true);
  assert.equal(moneyToPence(loaded.money), before + 240);
});

test('missing history, invented reward or unproven completion rolls recovery back completely', () => {
  for (const breakProof of [
    proof => { proof.agreement.quote = '另一条没有发生的委托，报酬一镑'; },
    proof => { proof.quest.contract.rewards[0].amountPence = 480; },
    proof => { proof.completedSteps[0].resultQuote = '任务已经成功完成，我应该拿钱'; },
    proof => { proof.quest.contract.nodes[0].cost = { amountPence: 12 }; },
  ]) {
    const { game, recovery } = missedQuest(); breakProof(recovery);
    const before = structuredClone(game), action = '领取送信支线的报酬';
    const result = resolveQuestAction(game, args('lost-letter', action, { outcome: 'claim', recovery }), action, 4);
    assert.equal(result.ok, false); assert.deepEqual(game, before);
  }
});

test('an unfinished historical task restores only confirmed steps, with no reward or extra invented stage', () => {
  const { game, recovery } = missedQuest(); recovery.completedSteps = [];
  const before = moneyToPence(game.money), action = '核对送信支线的原约定';
  const result = resolveQuestAction(game, args('lost-letter', action, { recovery, steps: [] }), action, 4);
  assert.equal(result.ok, true, result.reason); assert.equal(game.quests[0].stage, 'deliver');
  assert.equal(moneyToPence(game.money), before);
});

test('Renard notice fixes the auction to the following day at 20:00, with exact wait and entry timing', () => {
  for (const time of [Date.UTC(1349, 9, 17, 9), Date.UTC(1349, 9, 17, 21), Date.UTC(1349, 9, 31, 23, 55), Date.UTC(1349, 11, 31, 10)]) {
    const game = fresh(); fixed(game); game.worldTime = formatWorldTime(new Date(time));
    const action = '与雷纳德子爵交谈，询问女儿的伤势';
    const calls = [{ name: 'quest.resolve', args: args('高窗之下', action, { steps: [{ objectiveId: 'assess-renard-injury' }] }), reason: action }];
    const execution = executeToolCalls(game, calls, { playerAction: action });
    assert.equal(execution.results[0].ok, true);
    const progress = resolveTurnProgress(execution.game, action, 'low', calls, execution.results);
    assert.equal(execution.game.triggerState.facts['side.renard.auction-invited'].value, true);
    const resolution = createTurnResolution(calls, execution.results, progress, execution.game);
    const invitation = resolution.derivedEffects.narrativeEvents.find(event => event.id.startsWith('renard-auction-ready:'));
    const instance = execution.game.triggerState.active.find(entry => entry.instanceId === 'renard-case');
    const appointment = triggerAppointment(execution.game, instance);
    const expected = parseWorldTime(progress.worldTime);
    expected.setUTCDate(expected.getUTCDate() + 1); expected.setUTCHours(20, 0, 0, 0);
    assert.equal(appointment.startsAt, formatWorldTime(expected));
    assert.deepEqual(instance.appointments['renard-auction'], { notifiedAt: progress.worldTime, startsAt: appointment.startsAt });
    assert.match(invitation.direction, /次日/);
    assert.ok(invitation.direction.includes(appointment.startsAt));
    assert.ok(invitation.narrativeCue.includes(appointment.startsAt));
    assert.doesNotMatch(invitation.direction, /现在即可参加|即将开场/);
    const shown = markNarrativeEventsDelivered(execution.game, resolution.derivedEffects.narrativeEvents, { action });
    assert.match(shown.choices[0].label, /等待至.*20:00开场/);
    assert.ok(!pendingQuestNarration(shown).some(event => event.id === invitation.id));
    shown.turn = 1;
    for (const earlyAction of ['凭通知立即参加拍卖会', '询问拍卖会何时开场', '等待片刻再参加拍卖会', '询问能否等待至开场后参加拍卖会', '不等到开场，立即参加拍卖会']) {
      const refused = resolveQuestAction(structuredClone(shown), args('高窗之下', earlyAction, { steps: [{ objectiveId: 'attend-renard-auction' }] }), earlyAction, 2);
      assert.equal(refused.ok, false, earlyAction);
    }
    const attend = shown.choices[0].label;
    const attendCalls = [{ name: 'quest.resolve', args: args('高窗之下', attend, { steps: [{ objectiveId: 'attend-renard-auction' }] }), reason: attend }];
    const entered = executeToolCalls(shown, attendCalls, { playerAction: attend });
    assert.equal(entered.results[0].ok, true, JSON.stringify(entered.results));
    assert.equal(entered.results[0].data.taskMinutes, appointment.remainingMinutes + 10);
    const arrival = resolveTurnProgress(entered.game, attend, 'low', attendCalls, entered.results);
    assert.equal(arrival.worldTime, advanceWorldTime(appointment.startsAt, 10));
    assert.equal(entered.game.triggerState.active.find(entry => entry.instanceId === 'renard-case').stage, 'auction-conversation');
  }
});

test('old waiting saves refresh auction timing and deliver one notice without restarting or paying rewards', () => {
  const game = fresh(), instance = fixed(game, 'secure-treatment');
  instance.definitionVersion = 6; instance.definitionSnapshot = structuredClone(getTriggerDefinition(instance.definitionId));
  instance.definitionSnapshot.version = 6;
  instance.definitionSnapshot.stages.find(stage => stage.id === 'secure-treatment').transitions.find(step => step.objectiveId === 'attend-renard-auction').untilHour = 20;
  game.content.contentVersion = '2026.10.06';
  const before = moneyToPence(game.money), loaded = migrateSave(game);
  assert.equal(loaded.triggerState.active.find(entry => entry.instanceId === 'renard-case').stage, 'secure-treatment');
  const notice = pendingQuestNarration(loaded).find(event => event.id.startsWith('renard-auction-ready:'));
  assert.ok(notice); assert.equal(moneyToPence(loaded.money), before);
  const savedAppointment = structuredClone(loaded.triggerState.active.find(entry => entry.instanceId === 'renard-case').appointments);
  assert.ok(savedAppointment['renard-auction'].startsAt.endsWith('20:00'));
  assert.equal(pendingQuestNarration(migrateSave(markNarrativeEventsDelivered(loaded, [notice]))).some(event => event.id === notice.id), false);
  loaded.worldTime = advanceWorldTime(loaded.worldTime, 1440);
  const reloaded = migrateSave(loaded);
  assert.deepEqual(reloaded.triggerState.active.find(entry => entry.instanceId === 'renard-case').appointments, savedAppointment);
});

test('auction tracking waits for the saved appointment; reaching opening allows a ten-minute entry', () => {
  let game = fresh(); fixed(game, 'secure-treatment'); game = migrateSave(game);
  const instance = game.triggerState.active.find(entry => entry.instanceId === 'renard-case');
  const appointment = triggerAppointment(game, instance);
  const entry = syncQuestJournal(game).entries['renard-case'];
  const route = inspectQuestRoutes(game, entry).routes.find(item => item.objectiveId === 'attend-renard-auction');
  assert.ok(route.label.includes(appointment.startsAt));
  assert.equal(route.costMinutes, appointment.remainingMinutes + 10);
  assert.equal(resolveQuestAction(structuredClone(game), args('高窗之下', route.action, { steps: [{ objectiveId: 'attend-renard-auction' }] }), route.action, 1).ok, true);
  for (const late of [0, 30]) {
    const arrived = migrateSave({ ...game, worldTime: advanceWorldTime(appointment.startsAt, late) });
    const action = '凭子爵的引荐通知参加拍卖会';
    const result = resolveQuestAction(arrived, args('高窗之下', action, { steps: [{ objectiveId: 'attend-renard-auction' }] }), action, 1);
    assert.equal(result.ok, true, result.reason); assert.equal(result.taskMinutes, 10);
  }
});

test('brief waiting and reload keep the appointment, while older auction and completed saves are never rescheduled', () => {
  let game = fresh(); fixed(game, 'secure-treatment'); game = migrateSave(game);
  const scheduled = structuredClone(game.triggerState.active.find(entry => entry.instanceId === 'renard-case').appointments);
  resolveTurnProgress(game, '等待片刻，整理拍卖会的引荐通知', 'low');
  game = migrateSave(game);
  const waiting = game.triggerState.active.find(entry => entry.instanceId === 'renard-case');
  assert.equal(waiting.stage, 'secure-treatment'); assert.deepEqual(waiting.appointments, scheduled);
  for (const stage of ['auction-conversation', 'auction-box', 'shared-treatment', 'completed-medicine']) {
    const older = fresh(), instance = fixed(older, stage);
    if (stage === 'completed-medicine') { instance.status = 'completed'; older.triggerState.active = []; older.triggerState.history.push(instance); }
    older.content.contentVersion = '2026.10.06.1'; instance.definitionVersion = 7;
    const loaded = migrateSave(older);
    const current = [...loaded.triggerState.active, ...loaded.triggerState.history].find(entry => entry.instanceId === instance.instanceId);
    assert.equal(current.stage, stage); assert.deepEqual(current.appointments, {});
    assert.ok(!pendingQuestNarration(loaded).some(event => event.id.startsWith('renard-auction-ready:')));
  }
});

test('completed fixed side quest repairs only missing cash rewards, with stable receipts across reload', () => {
  let game = fresh(); const instance = fixed(game, 'completed-medicine');
  instance.status = 'completed'; instance.completedTurn = 3;
  instance.stageHistory = [{ id: 'renard-case:3:submit-healing-medicine', from: 'secure-treatment', to: 'completed-medicine', turn: 3 }];
  game.triggerState.active = []; game.triggerState.history.push(instance); game.turn = 3;
  const before = moneyToPence(game.money), inventory = structuredClone(game.inventory), action = '领取高窗之下的报酬';
  const result = resolveQuestAction(game, args('高窗之下', action, { outcome: 'claim' }), action, 4);
  assert.equal(result.ok, true, result.reason); assert.equal(result.rewardSettlement.amountPence, 4800);
  assert.equal(moneyToPence(game.money), before + 4800); assert.deepEqual(game.inventory, inventory);
  game = migrateSave(game);
  assert.equal(resolveQuestAction(game, args('高窗之下', action, { outcome: 'claim' }), action, 5).rewardSettlement.alreadyClaimed, true);
  assert.equal(moneyToPence(game.money), before + 4800);
});

test('pending reward tracks back to the hand-in location and refusal cannot claim it', () => {
  const game = fresh(); ordinary(game, 'letter', { rewardClaim: { objective: '回旅店领取报酬', locationId: 'soot-lamp' } });
  resolveQuestAction(game, args('letter', '交还信件'), '交还信件', 1);
  game.discoveredLocations.push({ id: 'soot-lamp', name: '旅店' });
  game.locationKnowledge['soot-lamp'] = { status: 'discovered' };
  const entry = syncQuestJournal(game).entries['quest:letter'];
  assert.equal(inspectQuestTracking(game, { id: entry.id, revision: entry.revision }).kind, 'travel');
  game.location.id = 'soot-lamp';
  const before = moneyToPence(game.money), action = '暂不领取送信支线的报酬';
  assert.equal(resolveQuestAction(game, args('letter', action, { outcome: 'claim' }), action, 2).ok, false);
  game.character.stats.health = 0;
  assert.equal(resolveQuestAction(game, args('letter', '领取报酬', { outcome: 'claim' }), '领取报酬', 3).ok, false);
  assert.equal(moneyToPence(game.money), before);
});

test('parameter repair respects an earlier quest.add dependency in the same plan', async () => {
  const game = fresh(); let repairs = 0;
  const calls = [{ name: 'quest.add', args: { quest: { id: 'new-letter', title: '新送信', objective: '交还信件' } }, reason: '登记新委托' }, { name: 'quest.resolve', args: args('new-letter', '接受委托并交还信件'), reason: '实际交付' }];
  const result = await repairToolCallsConcurrently(game, calls, async () => { repairs++; return []; });
  assert.equal(repairs, 0); assert.equal(result.calls.length, 2);
});
