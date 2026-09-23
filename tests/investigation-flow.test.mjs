import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGame, EMPTY_CHARACTER } from '../src/system/game.js';
import { executeToolCalls } from '../src/engine/tools.js';
import { processTriggers } from '../src/engine/triggerEngine.js';
import { getTriggerDefinition } from '../src/engine/triggerDefinitions.js';
import { migrateSave } from '../src/services/storage.js';
import { moneyToPence, moneyFromPence } from '../src/system/money.js';
import { triggerGuidance } from '../src/engine/triggerGuidance.js';
import { minutesForTurn, resolveTurnProgress } from '../src/engine/turn.js';
import { SPECIAL_ACTIONS, ACTIVE_CONTENT, validateContentPack } from '../src/content/index.js';
import { RENARD_AUCTION_MEDICINE } from '../src/content/index.js';
import { executeSpecialAction } from '../src/engine/specialActions.js';
import { appendFixedRenardTreatmentScene } from '../src/services/narrativeEvents.js';

const WATCH = 'watch.heirloom.late-hour';
const DRAIN = 'side.bridge.ebb-iron-door';
const RENARD = 'side.queens.renard-fall';
function fresh(definitionId, stage, pathway = '占卜家（序列9）') {
  const game = createInitialGame({ ...EMPTY_CHARACTER, name: '流程测试员', talent: 'heirloom-watch', extraordinary: 'low', pathway });
  game.location = { id: 'bridge-docks', name: '南岸货栈', district: '桥区' };
  game.triggerState.active.push({ instanceId: 'case', definitionId, status: 'engaged', category: 'personal-story', stage, createdTurn: 0, engagedTurn: 0, stageHistory: [], presentation: getTriggerDefinition(definitionId).presentation });
  return game;
}
let serial = 0;
function act(game, objectiveId, action, { count = 1, turn = game.turn + 1 } = {}) {
  const calls = objectiveId ? Array.from({ length: count }, () => ({ id: `flow-test-${++serial}`, name: 'trigger.progress', args: { instanceId: 'case', objectiveId, evidence: '本轮实际行动完成并取得可靠现场证据' }, reason: '玩家主动推进' })) : [];
  const execution = executeToolCalls(game, calls, { playerAction: action });
  processTriggers(execution.game, { action, toolCalls: calls, toolResults: execution.results, turn });
  execution.game.turn = turn;
  return { ...execution, calls };
}
const stageOf = game => game.triggerState.active.find(entry => entry.instanceId === 'case')?.stage;
const mark = (game, key) => { game.triggerState.facts[key] = { value: true, firstTurn: game.turn, evidenceIds: ['test'] }; };

test('ordinary entrance requires preparation; apprentice can scout and stake out without side quests', () => {
  let game = fresh(WATCH, 'enter-south-warehouse');
  assert.equal(act(game, 'enter-south-warehouse', '进入货栈').results[0].ok, false);
  mark(game, 'side.renard.completed');
  assert.equal(act(game, 'enter-south-warehouse', '进入货栈').results[0].ok, false);
  mark(game, 'side.silent-detonator.completed');
  assert.equal(stageOf(act(game, 'enter-south-warehouse', '进入货栈').game), 'warehouse-bomb');
  game = fresh(WATCH, 'enter-south-warehouse', '学徒（序列9）');
  ({ game } = act(game, 'enter-with-door-ability', '使用开门能力穿过障碍'));
  assert.equal(stageOf(game), 'empty-warehouse');
  ({ game } = act(game, 'scout-warehouse', '侦察布局与交接记录'));
  assert.equal(game.triggerState.facts['watch.warehouse-scouted'].value, true);
  const waited = act(game, 'stakeout-warehouse', '蹲守等待交接');
  assert.equal(stageOf(waited.game), 'warehouse-bomb');
  assert.equal(minutesForTurn('蹲守等待交接', waited.calls, waited.results), 60);
});

test('Renard assessment requires the fixed Lily Street estate rather than any Queens location', () => {
  let game = fresh(RENARD, 'assess-injury');
  game.location = { id: 'queen-archive', name: '皇后区·市政档案馆', district: '皇后区' };
  assert.equal(act(game, 'assess-renard-injury', '询问雷纳德女儿的伤势').results[0].ok, false);
  game.location = { id: 'queen-renard-estate', name: '皇后区·百合街·雷纳德子爵宅邸', district: '皇后区' };
  ({ game } = act(game, 'assess-renard-injury', '在门厅与子爵交谈，询问女儿的伤势'));
  assert.equal(stageOf(game), 'secure-treatment');
});

test('rescue and search interleave, take one objective per turn, persist and total 7.5 pounds plus materials', () => {
  let game = fresh(DRAIN, 'find-iron-door');
  ({ game } = act(game, 'enter-before-tide', '进入排水道铁门'));
  assert.equal(triggerGuidance(game, game.triggerState.active.find(e => e.instanceId === 'case')).timers[0].remaining, 10);
  const initial = moneyToPence(game.money);
  const twice = act(game, 'search-drain-cash', '搜查柜子清点现金', { count: 2 });
  assert.deepEqual(twice.results.map(result => result.ok), [true, false]);
  game = migrateSave(twice.game);
  assert.equal(moneyToPence(game.money) - initial, 480);
  ({ game } = act(game, 'rescue-dock-boy', '救出男孩'));
  assert.equal(stageOf(game), 'exit-drain');
  assert.equal(act(game, 'search-drain-cash', '搜查柜子现金').results[0].ok, false);
  for (const id of ['gold', 'gems', 'materials']) ({ game } = act(game, `search-drain-${id}`, '搜查密室暗格与小盒'));
  const value = game.inventory.reduce((sum, item) => sum + (item.properties?.estimatedValuePence || 0), 0);
  assert.equal(value + moneyToPence(game.money) - initial, 1800);
  assert.ok(game.inventory.some(item => item.itemId === 'drain-materials' && item.properties.identified === false));
  ({ game } = act(game, 'exit-before-flood', '带男孩离开出口'));
  assert.equal(game.triggerState.history.find(e => e.instanceId === 'case').status, 'completed');
  assert.equal(game.triggerState.facts['route.south-warehouse-drain'].value, true);
});

test('tide expires after ten actions, final-action escape works, reload/retry cannot extend it', () => {
  let start = fresh(DRAIN, 'find-iron-door');
  ({ game: start } = act(start, 'enter-before-tide', '进入排水道铁门'));
  let game = structuredClone(start);
  for (let i = 0; i < 9; i++) ({ game } = act(game, null, '等待片刻'));
  game = migrateSave(game);
  const before = structuredClone(game.triggerState.active.find(e => e.instanceId === 'case').timers);
  processTriggers(game, { action: '重试同一回合', turn: game.turn });
  assert.deepEqual(game.triggerState.active.find(e => e.instanceId === 'case').timers, before);
  ({ game } = act(game, null, '继续等待'));
  assert.equal(game.triggerState.history.find(e => e.instanceId === 'case').status, 'failed');
  assert.equal(game.triggerState.facts['route.south-warehouse-drain'], undefined);
  game = structuredClone(start);
  ({ game } = act(game, 'rescue-dock-boy', '救出男孩'));
  for (let i = 0; i < 8; i++) ({ game } = act(game, null, '等待片刻'));
  ({ game } = act(game, 'exit-before-flood', '带男孩离开出口'));
  assert.equal(game.triggerState.history.find(e => e.instanceId === 'case').status, 'completed');
});

test('explicit refusal never kills uncle; two-action warning survives reload and withdrawal prevents forced ambush', () => {
  const initial = fresh(WATCH, 'mercy-decision');
  assert.equal(act(initial, 'release-uncle', '我拒绝开枪，不杀舅舅').results[0].ok, false);
  let { game } = act(initial, 'attempt-uncle-rescue', '不杀舅舅，尝试救他');
  assert.equal(stageOf(game), 'last-chance');
  const warning = structuredClone(game);
  ({ game } = act(game, null, '继续劝说'));
  game = migrateSave(game);
  assert.equal(stageOf(game), 'last-chance');
  ({ game } = act(game, null, '继续等待'));
  assert.equal(stageOf(game), 'double-ambush');
  assert.equal(game.triggerState.facts['watch.uncle-released'], undefined);
  ({ game } = act(warning, 'withdraw-from-uncle', '撤离房间'));
  for (let i = 0; i < 3; i++) ({ game } = act(game, null, '等待'));
  assert.equal(stageOf(game), 'outside-warehouse');
  let restrained = act(warning, 'restrain-uncle', '夺枪制住舅舅').game;
  ({ game: restrained } = act(restrained, null, '等待'));
  assert.equal(stageOf(restrained), 'white-iris-confrontation');
  assert.equal(restrained.triggerState.facts['watch.uncle-restrained'].value, true);
});

test('whistle and ledger require a real search, and dead player cannot collect or escape', () => {
  let { game } = act(fresh(WATCH, 'mercy-decision'), 'release-uncle', '我决定开枪让他解脱');
  assert.ok(game.inventory.some(item => item.itemId === 'archaeologist-characteristic'));
  assert.equal(game.inventory.some(item => item.itemId === 'azik-copper-whistle'), false);
  ({ game } = act(game, 'search-warehouse-evidence', '搜查藏品柜和账册桌'));
  assert.ok(game.inventory.some(item => item.itemId === 'azik-copper-whistle'));
  assert.ok(game.clues.some(clue => clue.id === 'clue-demoness-south-bank-ledger'));
  assert.equal(act(game, 'search-warehouse-evidence', '再次搜查').results[0].ok, false);
  game.character.stats.health = 0;
  assert.equal(act(game, 'escape-white-iris', '撤退逃生').results[0].ok, false);
});

test('auction supports poor cooperation and optional paid medicine without duplicate charges', () => {
  let game = fresh(RENARD, 'secure-treatment');
  game.money = moneyFromPence(0);
  const attended = act(game, 'attend-renard-auction', '由子爵引荐参加拍卖会');
  game = attended.game;
  assert.ok(minutesForTurn('参加拍卖会', attended.calls, attended.results, game.worldTime) >= 5);
  assert.equal(act(game, 'buy-renard-medicine', '买药剂').results[0].ok, false);
  ({ game } = act(game, 'meet-edmund', '与埃德蒙交谈进入包厢'));
  assert.equal(game.triggerState.active.find(item => item.instanceId === 'case').treatmentReady, 1);
  ({ game } = act(game, 'recruit-apothecary', '同意与药师合作'));
  game.location = { id: 'queen-renard-estate', name: '雷纳德子爵宅邸', district: '皇后区' };
  ({ game } = act(game, null, '返回雷纳德子爵宅邸'));
  assert.equal(moneyToPence(game.money), 2400);
  assert.ok(game.triggerState.facts['knowledge.deep-control-irreversible']);
  game = fresh(RENARD, 'auction-conversation'); game.money = moneyFromPence(1200);
  ({ game } = act(game, 'buy-renard-medicine', '购买药剂'));
  assert.equal(moneyToPence(game.money), 240);
  assert.equal(game.inventory.find(item => item.itemId === RENARD_AUCTION_MEDICINE.itemId)?.name, RENARD_AUCTION_MEDICINE.name);
  assert.equal(game.triggerState.active.find(item => item.instanceId === 'case').treatmentReady, 1);
  assert.equal(act(game, 'buy-renard-medicine', '再买药剂').results[0].ok, false);
  ({ game } = act(game, 'meet-edmund', '与药师交谈'));
  game.location = { id: 'queen-renard-estate', name: '雷纳德子爵宅邸', district: '皇后区' };
  ({ game } = act(game, null, '返回宅邸'));
  assert.equal(moneyToPence(game.money), 5040);
  assert.equal(game.inventory.some(item => item.itemId === 'renard-healing-draught'), false);
});

test('auction potion names cannot mint another item and the fixed purchase keeps one ID', () => {
  const game = fresh(RENARD, 'auction-conversation');
  game.money = moneyFromPence(1200);
  for (const name of ['灵性治疗药剂', '创伤治疗药剂', '重伤治疗药剂']) {
    const added = executeToolCalls(game, [{ id: `invent-${name}`, name: 'inventory.add', args: { item: { itemId: `invented-${name}`, name, description: '拍卖所得药剂', category: '药剂', quantity: 1 } }, reason: '拍卖获得药剂' }]);
    assert.equal(added.results[0].ok, false, name);
    assert.equal(added.game.inventory.length, game.inventory.length);
  }
  const spoof = executeToolCalls(game, [{ id: 'spoof', name: 'inventory.add', args: { item: { itemId: RENARD_AUCTION_MEDICINE.itemId, name: '创伤治疗药剂', description: '仿冒任务药剂' } }, reason: '绕过拍卖' }]);
  assert.equal(spoof.results[0].ok, false);
  const early = fresh(RENARD, 'secure-treatment');
  const inventedBeforeAuction = executeToolCalls(early, [{ id: 'early', name: 'inventory.add', args: { item: { itemId: 'other-treatment', name: '灵性治疗药剂', description: '另一份治疗药剂', category: '药剂' } }, reason: '拍卖中取得' }], { playerAction: '参加拍卖会' });
  assert.equal(inventedBeforeAuction.results[0].ok, false);
  const bought = act(game, 'buy-renard-medicine', '花四镑购买拍卖会药剂').game;
  assert.equal(bought.inventory.filter(item => item.itemId === RENARD_AUCTION_MEDICINE.itemId).length, 1);
  assert.equal(bought.inventory.some(item => item.name === '灵性治疗药剂'), false);
  assert.equal(moneyToPence(bought.money), 240);
});

test('meeting the auction apothecary sets readiness and returning to the estate pays ten pounds', () => {
  let game = fresh(RENARD, 'auction-conversation');
  const balance = moneyToPence(game.money);
  assert.equal(game.triggerState.active[0].treatmentReady ?? 0, 0);
  ({ game } = act(game, 'meet-edmund', '与序列九药师埃德蒙交谈'));
  assert.equal(game.triggerState.active[0].treatmentReady, 1);
  assert.equal(moneyToPence(game.money), balance);
  game.location = { id: 'queen-renard-estate', name: '雷纳德子爵宅邸', district: '皇后区' };
  ({ game } = act(game, null, '返回子爵宅邸'));
  assert.equal(game.triggerState.history.find(item => item.instanceId === 'case').status, 'completed');
  assert.equal(moneyToPence(game.money) - balance, 2400);
  assert.match(game.triggerState.history.find(item => item.instanceId === 'case').lastProgressEvidence, /子爵支付二十镑/);
});

test('handing over the quest medicine at the estate completes treatment and pays once', () => {
  const game = fresh(RENARD, 'secure-treatment');
  game.location = { id: 'queen-renard-estate', name: '雷纳德子爵宅邸', district: '皇后区' };
  game.inventory.push({ instanceId: 'renard-dose', itemId: 'renard-healing-draught', name: '重伤治疗药剂', quantity: 1, tags: ['消耗品'], weight: 0.1 });
  const directUse = executeToolCalls(game, [{ id: 'use', name: 'item.use', args: { instanceId: 'renard-dose' }, reason: '使用药剂' }]);
  assert.equal(directUse.results[0].ok, false);
  assert.equal(directUse.game.inventory.some(item => item.instanceId === 'renard-dose'), true);
  const next = structuredClone(game);
  const progress = resolveTurnProgress(next, '把重伤治疗药剂提交给雷纳德子爵', 'low');
  assert.ok(progress);
  assert.match(appendFixedRenardTreatmentScene('你返回了宅邸。', progress), /子爵当场将二十镑酬金交给你/);
  assert.equal(next.triggerState.active.some(item => item.instanceId === 'case'), false);
  assert.equal(next.triggerState.history.find(item => item.instanceId === 'case').status, 'completed');
  assert.equal(next.inventory.some(item => item.instanceId === 'renard-dose'), false);
  assert.equal(moneyToPence(next.money) - moneyToPence(game.money), 4800);
  assert.equal(next.triggerState.facts['side.renard.completed'].value, true);
  resolveTurnProgress(next, '再次提交药剂', 'low');
  assert.equal(moneyToPence(next.money) - moneyToPence(game.money), 4800);
});

test('medicine handoff needs the quest dose and estate; agreed cooperation pays the agreed share', () => {
  const game = fresh(RENARD, 'shared-treatment');
  game.inventory.push({ instanceId: 'salve', itemId: 'special-wound-salve', name: '外伤药膏', quantity: 1 });
  const missing = structuredClone(game);
  resolveTurnProgress(missing, '提交药剂', 'low');
  assert.equal(stageOf(missing), 'shared-treatment');
  game.inventory.push({ instanceId: 'renard-dose', itemId: 'renard-healing-draught', name: '重伤治疗药剂', quantity: 1 });
  const away = structuredClone(game);
  resolveTurnProgress(away, '提交药剂', 'low');
  assert.equal(stageOf(away), 'shared-treatment');
  game.location = { id: 'queen-renard-estate', name: '雷纳德子爵宅邸', district: '皇后区' };
  const next = structuredClone(game);
  const progress = resolveTurnProgress(next, '提交药剂', 'low');
  assert.match(appendFixedRenardTreatmentScene('你返回了宅邸。', progress), /你得到十镑/);
  assert.equal(moneyToPence(next.money) - moneyToPence(game.money), 2400);
  assert.equal(next.inventory.some(item => item.instanceId === 'renard-dose'), false);
  assert.equal(next.triggerState.history.find(item => item.instanceId === 'case').status, 'completed');
});

test('existing 1.6.9 save upgrades its active Renard definition without rewriting history', () => {
  const game = fresh(RENARD, 'secure-treatment');
  game.content.contentVersion = '2026.09.17.1';
  game.triggerState.active[0].definitionVersion = 1;
  game.triggerState.active[0].definitionSnapshot = { id: RENARD, version: 1, stages: [{ id: 'secure-treatment', transitions: [] }] };
  game.inventory.push({ instanceId: 'auction-dose', itemId: RENARD_AUCTION_MEDICINE.itemId, name: '创伤治疗药剂', quantity: 1, weight: 0.1 });
  const loaded = migrateSave(game);
  const current = loaded.triggerState.active.find(item => item.instanceId === 'case');
  assert.equal(current.definitionVersion, getTriggerDefinition(RENARD).version);
  assert.ok(current.definitionSnapshot.stages.find(stage => stage.id === 'secure-treatment').transitions.some(item => item.objectiveId === 'submit-healing-medicine'));
  assert.equal(current.stage, 'secure-treatment');
  assert.equal(current.treatmentReady, 1);
  assert.equal(loaded.inventory.find(item => item.instanceId === 'auction-dose').name, '创伤治疗药剂');
  loaded.location = { id: 'queen-renard-estate', name: '雷纳德子爵宅邸', district: '皇后区' };
  const before = moneyToPence(loaded.money);
  resolveTurnProgress(loaded, '返回雷纳德宅邸', 'low');
  assert.equal(moneyToPence(loaded.money) - before, 4800);
  assert.equal(loaded.inventory.some(item => item.instanceId === 'auction-dose'), false);
});

test('old active definitions migrate, terminal history stays historical, reward claims persist', () => {
  const game = fresh(WATCH, 'mercy-decision');
  game.content.contentVersion = '2026.09.15.1';
  game.triggerState.active[0].definitionVersion = 2;
  game.triggerState.active[0].definitionSnapshot = { id: WATCH, version: 2, stages: [] };
  game.triggerState.rewardsClaimed = ['previous-reward'];
  game.triggerState.history.push({ ...game.triggerState.active[0], instanceId: 'old-finished', status: 'completed', stage: 'old-ending' });
  const loaded = migrateSave(game);
  assert.equal(loaded.triggerState.active.find(e => e.instanceId === 'case').definitionVersion, getTriggerDefinition(WATCH).version);
  assert.equal(stageOf(loaded), 'mercy-decision');
  assert.deepEqual(loaded.triggerState.rewardsClaimed, ['previous-reward']);
  assert.equal(loaded.triggerState.history[0].stage, 'old-ending');
});

test('wages are 10–15 solers with half pay for limited work; gambling unchanged; content validates', () => {
  for (const definition of SPECIAL_ACTIONS.filter(entry => !entry.stake)) {
    for (const offer of definition.pool) {
      assert.ok(offer.options[0].reward >= 120 && offer.options[0].reward <= 180);
      assert.equal(offer.options[1].reward, offer.options[0].reward / 2);
    }
  }
  assert.equal(SPECIAL_ACTIONS.find(entry => entry.stake).stake, 6);
  assert.deepEqual(validateContentPack(ACTIVE_CONTENT), []);
});

test('new wages are paid by settlement, sequence bonus is capped, UI visits do not advance timers', () => {
  for (const [sequence, bonus] of [[9, 0], [8, 12], [0, 72]]) {
    const start = fresh(WATCH, 'trace-uncle');
    start.location.id = 'divination-association';
    start.character.advancement.sequence = sequence;
    const before = moneyToPence(start.money);
    const accepted = executeSpecialAction(start, { operation: 'accept', id: 'work-seer', revision: 0 });
    const active = accepted.next.specialActions.active;
    const settled = executeSpecialAction(accepted.next, { operation: 'resolve', id: active.id, optionId: 'careful', revision: accepted.next.specialActions.revision });
    assert.equal(moneyToPence(settled.next.money) - before, active.offer.options[0].reward + bonus);
  }
  let { game } = act(fresh(DRAIN, 'find-iron-door'), 'enter-before-tide', '进入排水道铁门');
  const before = structuredClone(game);
  for (let i = 0; i < 5; i++) triggerGuidance(game, game.triggerState.active.find(entry => entry.instanceId === 'case'));
  assert.deepEqual(game, before);
});
