import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGame, EMPTY_CHARACTER } from '../src/system/game.js';
import { acceptOrdinaryQuest, migrateQuestLifecycle, registerQuest, resolveOrdinaryQuest, validateQuestPatch } from '../src/engine/questLifecycle.js';
import { projectQuestJournal, syncQuestJournal, visibleQuestJournal } from '../src/engine/questRuntime.js';
import { resolveQuestAction } from '../src/engine/questActions.js';
import { inspectQuestTracking, resolveQuestTrackingRequest } from '../src/services/questTracking.js';
import { processTriggers } from '../src/engine/triggerEngine.js';
import { moneyToPence } from '../src/system/money.js';

const fresh = () => createInitialGame({ ...EMPTY_CHARACTER, name: '生命周期测试' });
function add(game, options = {}) {
  const result = registerQuest(game, { id: 'delivery', title: '交付信件', summary: '把信交到已知地点', objective: '交付信件', ...options }, game.turn);
  assert.equal(result.ok, true, result.reason);
  return result.quest;
}
const requestFor = (game, id = 'quest:delivery') => { const entry = visibleQuestJournal(game).find(item => item.id === id); return { id, revision: entry.revision }; };

test('journal separates active, opportunities and archive without losing memory history or mutating readers', () => {
  const game = fresh();
  add(game);
  game.quests.push({ id: 'legacy', title: '旧调查', objective: '核对旧调查', status: '进行中' }, { id: 'done', title: '已完成调查', status: 'completed' });
  const before = structuredClone(game);
  game.trackedQuestId = 'quest:legacy';
  const projection = projectQuestJournal(game);
  assert.equal(projection.active[0].id, 'quest:legacy');
  assert.ok(projection.opportunities.some(entry => entry.id === 'quest:delivery'));
  assert.ok(projection.archive.some(entry => entry.id === 'quest:done'));
  assert.ok(visibleQuestJournal(game).some(entry => entry.id === 'quest:done'));
  assert.deepEqual(game.quests, before.quests);
});

test('random opportunities expire exactly after ten turns; fixed and unknown old provenance persist; acceptance uses its own deadline', () => {
  const game = fresh();
  const random = add(game, { deadlineTurns: 20 });
  add(game, { id: 'fixed', kind: 'side' });
  game.quests.push({ id: 'old', title: '来源不明', status: 'available' });
  migrateQuestLifecycle(game, 9);
  assert.equal(random.status, 'available');
  assert.equal(acceptOrdinaryQuest(game, random, 9).ok, true);
  migrateQuestLifecycle(game, 10);
  assert.equal(random.status, 'engaged');
  assert.equal(random.lifecycle.deadlineTurn, 29);
  assert.equal(game.quests.find(quest => quest.id === 'fixed').status, 'available');
  assert.equal(game.quests.find(quest => quest.id === 'old').status, 'available');
  const expired = add(game, { id: 'expired' });
  migrateQuestLifecycle(game, 10);
  assert.equal(expired.status, 'expired');
  const once = structuredClone(game);
  migrateQuestLifecycle(game, 10);
  assert.deepEqual(game, once);
  migrateQuestLifecycle(game, 30);
  assert.equal(random.status, 'expired');
});

test('new hooks require explicit acceptance, cannot enter engaged status from mere model prose', () => {
  const game = fresh();
  assert.equal(registerQuest(game, { id: 'forced', title: '强加的任务', status: 'engaged' }, 0).ok, false);
  assert.equal(registerQuest(game, { id: 'refused', title: '拒绝的任务', status: 'engaged' }, 0, '我不想接受这个委托').ok, false);
  assert.equal(registerQuest(game, { id: 'chosen', title: '送信任务', status: 'engaged' }, 0, '我接受这个委托').ok, true);
});

test('legacy complex and dangerous goals stay investigable but cannot be completed by repeating their title', () => {
  for (const task of [
    { objective: '查明失踪案的幕后真相' },
    { objective: '交付密信', dangerous: true },
  ]) {
    const game = fresh();
    game.quests.push({ id: 'delivery', title: '旧任务', status: 'engaged', ...task });
    const plan = inspectQuestTracking(game, requestFor(game));
    assert.equal(plan.kind, 'investigate');
    assert.ok(plan.action.includes(task.objective));
    const result = resolveQuestAction(game, { instanceId: 'quest:delivery', actionQuote: task.objective, outcome: 'progress', evidence: '重复目标文字不能代表实际解决', steps: [{ objectiveId: 'fulfil-original-agreement' }] }, task.objective, 1);
    assert.equal(result.ok, false);
    assert.equal(game.quests[0].status, 'engaged');
  }
});

test('frozen node, obstacle and nested errand budgets reject expandable random quests at registration', () => {
  const node = index => ({ id: `node-${index}`, objective: '核对收信记录', conditions: [{ type: 'action', terms: ['核对'] }] });
  const game = fresh();
  for (const nodes of [Array.from({ length: 4 }, (_, index) => node(index)), [{ ...node(0), obstacle: true }, { ...node(1), obstacle: true }], [{ ...node(0), errandDepth: 2 }]]) {
    assert.equal(registerQuest(game, { id: 'budget', title: '送信', contract: { nodes } }, 0).ok, false);
  }
  assert.equal(game.quests.some(quest => quest.id === 'budget'), false);
});

test('frozen finite nodes consume old evidence and actual actions, settle promised rewards once and reject goal/reward rewrites', () => {
  const game = fresh();
  game.clues.push({ id: 'old-permission', title: '旧许可', discoveredTurn: -3 });
  const quest = add(game, { contract: { coreGoal: '交付信件', nodes: [
    { id: 'arrive', objective: '确认送信许可', conditions: [{ type: 'location', locationId: game.location.id }, { type: 'clue', clueId: 'old-permission' }] },
    { id: 'deliver', objective: '交付信件', conditions: [{ type: 'action', terms: ['交付信件'] }] },
  ], rewards: [{ type: 'money', amountPence: 24 }] } });
  acceptOrdinaryQuest(game, quest, 0);
  const rewardBefore = moneyToPence(game.money);
  quest.contract.rewards[0].amountPence = 9999;
  assert.equal(validateQuestPatch(quest, { status: 'completed' }).ok, false);
  assert.equal(validateQuestPatch(quest, { objective: '再跑一个地址' }).ok, false);
  const result = resolveQuestAction(game, { instanceId: 'quest:delivery', actionQuote: '确认许可并交付信件', outcome: 'progress', evidence: '旧许可仍有效，收件人已签收', steps: [{ objectiveId: 'arrive' }, { objectiveId: 'deliver' }] }, '确认许可并交付信件', 1);
  assert.equal(result.ok, true, result.reason);
  assert.equal(game.quests[0].status, 'completed');
  assert.equal(moneyToPence(game.money), rewardBefore + 24);
  assert.equal(projectQuestJournal(game).active.some(entry => entry.id === 'quest:delivery'), false);
  assert.equal(resolveQuestAction(game, { instanceId: 'quest:delivery', actionQuote: '交付信件', outcome: 'progress', evidence: '再次领取奖励', steps: [{ objectiveId: 'deliver' }] }, '交付信件', 2).ok, false);
  assert.equal(moneyToPence(game.money), rewardBefore + 24);
});

test('blocked and failed results require frozen verifiable conditions, not a fabricated NPC excuse', () => {
  const game = fresh();
  const quest = add(game, { contract: { nodes: [{ id: 'deliver', objective: '交付信件', conditions: [{ type: 'action', terms: ['交付信件'] }] }], failureConditions: [{ type: 'stat', key: 'health', max: 0 }] } });
  acceptOrdinaryQuest(game, quest, 0);
  assert.equal(resolveQuestAction(game, { instanceId: 'quest:delivery', actionQuote: '我不想交付信件', outcome: 'progress', evidence: '不能将否定当作实际交付', steps: [{ objectiveId: 'deliver' }] }, '我不想交付信件', 1).ok, false);
  for (const outcome of ['blocked', 'failed']) {
    const result = resolveQuestAction(game, { instanceId: 'quest:delivery', actionQuote: '交付信件', outcome, evidence: '收件人突然又要求新许可证' }, '交付信件', 1);
    assert.equal(result.ok, false);
  }
  game.character.stats.health = 0;
  assert.equal(resolveQuestAction(game, { instanceId: 'quest:delivery', actionQuote: '尝试交付信件', outcome: 'failed', evidence: '生命归零，失败条件已发生' }, '尝试交付信件', 1).ok, true);
  assert.equal(game.quests[0].status, 'failed');
});

test('tracking validates revision and pays actual travel as a separate step before completing the destination action', () => {
  const game = fresh();
  const destination = game.discoveredLocations.find(location => location.id !== game.location.id);
  add(game, { locationId: destination.id });
  const request = requestFor(game);
  assert.equal(inspectQuestTracking(game, { ...request, revision: 'stale' }).ok, false);
  const plan = resolveQuestTrackingRequest(game, request, 1);
  assert.equal(plan.kind, 'travel');
  assert.ok(plan.taskMinutes > 0);
  assert.equal(plan.independentTurn, true);
  assert.equal(game.location.id, destination.id);
  assert.equal(game.quests[0].status, 'engaged');
  assert.equal(game.quests[0].lifecycle.progressCount, 0);
  const arrival = resolveQuestTrackingRequest(game, requestFor(game), 2);
  assert.equal(arrival.kind, 'progress');
  assert.equal(game.quests[0].status, 'completed');
});

test('unknown destinations remain unknown and multiple known targets require a player choice', () => {
  const game = fresh();
  add(game, { locationId: 'unknown-secret-room' });
  const before = structuredClone(game);
  assert.equal(inspectQuestTracking(game, requestFor(game)).kind, 'investigate');
  assert.deepEqual(game, before);
  const known = game.discoveredLocations.filter(location => location.id !== game.location.id).slice(0, 2);
  assert.equal(known.length, 2);
  game.quests = [];
  add(game, { contract: { nodes: [{ id: 'deliver', objective: '前往任一收件点交付', conditions: [{ type: 'any', conditions: known.map(location => ({ type: 'location', locationId: location.id })) }] }] } });
  const plan = inspectQuestTracking(game, requestFor(game));
  assert.equal(plan.kind, 'choice');
  assert.equal(plan.choices.length, 2);
  assert.equal(resolveQuestTrackingRequest(game, { ...requestFor(game), routeId: plan.choices[1].routeId }, 1).kind, 'travel');
});

test('isolated fixed task tracking shows a decision, and selecting it executes only that step', () => {
  const game = fresh();
  const definition = { id: 'test.isolated', category: 'personal-story', stages: [{ id: 'choice', dangerous: true, guidance: '打开门', transitions: [{ objectiveId: 'open', description: '打开门', actionTerms: ['打开门'], nextStage: 'inside' }] }, { id: 'inside', guidance: '观察室内' }] };
  game.triggerState.active.push({ instanceId: 'isolated', definitionId: definition.id, definitionSnapshot: definition, status: 'engaged', stage: 'choice', presentation: { title: '危险房间' }, stageHistory: [] });
  const request = requestFor(game, 'isolated');
  const plan = inspectQuestTracking(game, request);
  assert.equal(plan.kind, 'choice');
  const resolved = resolveQuestTrackingRequest(game, { ...request, routeId: plan.choices[0].routeId }, 1);
  assert.equal(resolved.ok, true, resolved.reason);
  assert.equal(resolved.independentTurn, true);
  assert.equal(game.triggerState.active.find(item => item.instanceId === 'isolated').stage, 'inside');
});

test('travel-only trigger settlement cannot execute automatic scene completion on arrival', () => {
  const game = fresh();
  const definition = { id: 'arrival', category: 'side-quest', stages: [{ id: 'arrive', advanceWhen: [{ type: 'location', locationId: game.location.id }], nextStage: 'done', complete: true }] };
  game.triggerState.active.push({ instanceId: 'arrival', definitionId: definition.id, category: 'side-quest', definitionSnapshot: definition, status: 'engaged', stage: 'arrive', presentation: { title: '现场处理' }, stageHistory: [] });
  processTriggers(game, { action: '前往现场', travelOnly: true, turn: 1 });
  assert.equal(game.triggerState.active.find(item => item.instanceId === 'arrival').stage, 'arrive');
  processTriggers(game, { action: '处理现场', turn: 2 });
  syncQuestJournal(game);
  assert.equal(game.questJournal.entries.arrival.status, 'completed');
});

test('rendering and choice inspection never accept tasks, while failed late acceptance rolls back all state', () => {
  const game = fresh();
  add(game, { dangerous: true, contract: { nodes: [{ id: 'open', objective: '打开门', conditions: [{ type: 'action', terms: ['打开门'] }] }] } });
  const request = requestFor(game);
  const before = structuredClone(game);
  assert.equal(inspectQuestTracking(game, request).kind, 'choice');
  assert.deepEqual(game, before);
  assert.equal(resolveQuestTrackingRequest(game, request, 1).kind, 'choice');
  assert.deepEqual(game, before);
  const destination = game.discoveredLocations.find(location => location.id !== game.location.id);
  game.quests = [];
  add(game, { locationId: destination.id });
  const travelRequest = requestFor(game);
  const travelBefore = structuredClone(game);
  assert.equal(resolveQuestTrackingRequest(game, travelRequest, 10).ok, false);
  assert.deepEqual(game, travelBefore);
});

test('a dangerous ordinary node receives a fresh isolated choice even when the overall quest is ordinary', () => {
  const game = fresh();
  add(game, { contract: { nodes: [{ id: 'open', objective: '查看封印门', dangerous: true, conditions: [{ type: 'action', terms: ['触碰封印'] }] }] } });
  const before = structuredClone(game);
  const request = requestFor(game);
  const plan = inspectQuestTracking(game, request);
  assert.equal(plan.kind, 'choice');
  assert.match(plan.choices[0].label, /触碰封印/);
  assert.deepEqual(game, before);
  assert.equal(resolveQuestTrackingRequest(game, { ...request, routeId: plan.choices[0].routeId }, 1).ok, true);
});

test('direct ordinary multi-step resolver rolls back prior node, payment, consumption and reward when a later node fails', () => {
  const game = fresh();
  game.inventory.push({ instanceId: 'letter', itemId: 'letter', quantity: 1 });
  const quest = add(game, { contract: { nodes: [
    { id: 'deliver', objective: '交付信件', conditions: [{ type: 'action', terms: ['交付信件'] }], cost: { itemId: 'letter', quantity: 1, amountPence: 1 } },
    { id: 'verify', objective: '核对签收凭证', conditions: [{ type: 'clue', clueId: 'not-yet-found' }] },
  ], rewards: [{ type: 'money', amountPence: 100 }] } });
  acceptOrdinaryQuest(game, quest, 0);
  const before = structuredClone(game);
  const result = resolveOrdinaryQuest(game, quest, { outcome: 'progress', evidence: '交付后准备核对', steps: [{ objectiveId: 'deliver' }, { objectiveId: 'verify' }] }, '交付信件并核对凭证', 1);
  assert.equal(result.ok, false);
  assert.deepEqual(game, before);
});

test('complex legacy investigation can register one finite original-goal plan, execute it and reach its existing reward exactly once', () => {
  const game = fresh();
  game.clues.push({ id: 'case-file', title: '失踪案卷宗' }, { id: 'case-proof', title: '已核实的目击记录' });
  game.quests.push({ id: 'delivery', title: '失踪案', status: 'engaged', objective: '查明失踪案真相', contract: { rewards: [{ type: 'money', amountPence: 12 }] } });
  migrateQuestLifecycle(game);
  const legacyPlan = { coreGoal: '查明失踪案真相', evidenceIds: ['case-file'], nodes: [
    { id: 'review', objective: '核对失踪案卷宗', conditions: [{ type: 'clue', clueId: 'case-file' }, { type: 'action', terms: ['核对失踪案卷宗'] }] },
    { id: 'confirm', objective: '核实目击记录并结案', conditions: [{ type: 'clue', clueId: 'case-proof' }, { type: 'action', terms: ['核实目击记录'] }] },
  ], completionConditions: [{ type: 'clue', clueId: 'case-proof' }] };
  const submit = (plan, action) => resolveQuestAction(game, { instanceId: 'quest:delivery', actionQuote: action, outcome: 'progress', evidence: '根据卷宗固定原调查所需步骤', legacyPlan: plan }, action, 1);
  const before = moneyToPence(game.money);
  assert.equal(submit({ ...legacyPlan, coreGoal: '改做另一宗案子' }, '整理失踪案').ok, false);
  assert.equal(submit({ ...legacyPlan, completionConditions: [] }, '整理失踪案').ok, false);
  assert.equal(submit(legacyPlan, '我不想调查失踪案').ok, false);
  assert.equal(submit(legacyPlan, '整理失踪案').outcome, 'planned');
  assert.equal(game.quests.at(-1).lifecycle.progressCount, 0);
  assert.equal(game.quests.at(-1).lifecycle.contract.coreGoal, legacyPlan.coreGoal);
  assert.equal(moneyToPence(game.money), before);
  assert.equal(submit(legacyPlan, '整理失踪案').ok, false);
  const completed = resolveQuestAction(game, { instanceId: 'quest:delivery', actionQuote: '核对失踪案卷宗并核实目击记录', outcome: 'progress', evidence: '目击记录与卷宗相符，完成原调查', steps: [{ objectiveId: 'review' }, { objectiveId: 'confirm' }] }, '核对失踪案卷宗并核实目击记录', 2);
  assert.equal(completed.ok, true, completed.reason);
  assert.equal(game.quests.at(-1).status, 'completed');
  assert.equal(moneyToPence(game.money), before + 12);
});

test('payment and delivery receipts remain valid after resources are consumed, while cancellation cannot spend them', () => {
  const game = fresh();
  game.inventory.push({ instanceId: 'letter', itemId: 'letter', quantity: 1 });
  const quest = add(game, { contract: { nodes: [
    { id: 'deliver', objective: '交付信件并支付邮资', conditions: [{ type: 'action', terms: ['交付信件'] }], cost: { itemId: 'letter', quantity: 1, amountPence: 2 } },
    { id: 'receipt', objective: '核对付款和交付回执', conditions: [{ type: 'quest-proof', nodeId: 'deliver', itemId: 'letter', quantity: 1, minPaidPence: 2 }, { type: 'action', terms: ['核对付款'] }] },
  ], completionConditions: [{ type: 'quest-proof', nodeId: 'deliver', itemId: 'letter', minPaidPence: 2 }] } });
  acceptOrdinaryQuest(game, quest, 0);
  const before = structuredClone(game);
  const execute = (action, id, turn) => resolveQuestAction(game, { instanceId: 'quest:delivery', actionQuote: action, outcome: 'progress', evidence: '实际执行约定付款或核对', steps: [{ objectiveId: id }] }, action, turn);
  assert.equal(execute('不要交付信件，取消付款', 'deliver', 1).ok, false);
  assert.equal(execute('取消交付信件', 'deliver', 1).ok, false);
  assert.deepEqual(game, before);
  const delivery = execute('交付信件并支付邮资', 'deliver', 1);
  assert.equal(delivery.ok, true);
  assert.equal(delivery.inventoryChanges[0].delta, -1);
  assert.equal(delivery.inventoryChange.itemId, 'letter');
  assert.equal(game.inventory.some(item => item.itemId === 'letter'), false);
  game.money = { pounds: 0, solers: 0, pence: 0 };
  const loaded = structuredClone(game);
  migrateQuestLifecycle(loaded);
  assert.equal(loaded.quests[0].lifecycle.nodeReceipts.deliver.paidPence, 2);
  assert.equal(execute('核对付款和交付回执', 'receipt', 2).ok, true);
  assert.equal(game.quests[0].status, 'completed');
});

test('a fixed task with a locally executable branch is not falsely blocked by another unavailable branch', () => {
  const game = fresh();
  const definition = { id: 'branching', category: 'side-quest', stages: [{ id: 'choose', guidance: '询问门房或查阅档案', transitions: [
    { objectiveId: 'ask', description: '询问门房', actionTerms: ['询问'], when: [{ type: 'action', terms: ['询问'] }], nextStage: 'done' },
    { objectiveId: 'archive', description: '查阅密档', requirements: [{ type: 'fact', key: 'unavailable-permission' }], nextStage: 'done' },
  ] }] };
  game.triggerState.active.push({ instanceId: 'branching', definitionId: definition.id, category: 'side-quest', definitionSnapshot: definition, status: 'engaged', stage: 'choose', presentation: { title: '卷宗调查' }, stageHistory: [] });
  const result = resolveQuestAction(game, { instanceId: 'branching', actionQuote: '询问门房', outcome: 'blocked', evidence: '缺少密档许可所以无法调查' }, '询问门房', 1);
  assert.equal(result.ok, false);
  assert.match(result.reason, /可执行/);
  assert.equal(inspectQuestTracking(game, requestFor(game, 'branching')).kind, 'progress');
});
