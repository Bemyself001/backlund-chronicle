import { VISITABLE_PEOPLE } from "../content/index.js";
import { activeEnemies } from "../system/combat.js";
import { normalizeTriggerState } from "./triggerState.js";
import { syncKnownPeople } from "./people.js";

export function visitablePerson(id) {
  return VISITABLE_PEOPLE.find(person => person.id === id) || null;
}

export function requestedPersonVisit(game, action) {
  const text = String(action || "").replace(/\s+/g, "");
  // Only an immediate action can bypass AI planning. Questions and plans stay conversational.
  if (!/^(?:我)?(?:现在|立即|直接|上前)?(?:去)?(?:敲门|拜访|登门)/.test(text)
    || /[?？]|是否|能否|可否|要不要|能不能|可不可以|明天|改天|下次|明早|以后|稍后/.test(text)
    || /(?:不|别|取消|放弃|拒绝|暂缓|考虑|打算).{0,20}(?:敲门|拜访|登门)/.test(text)) return null;
  return VISITABLE_PEOPLE.find(person => person.locationId === game.location?.id
    && [person.name, ...person.name.split("·")].some(name => text.includes(name))) || null;
}

export function hasMetPerson(game, person) {
  return Boolean(person && game.triggerState?.facts?.[person.metFact]?.value === true);
}

export function visitPersonGate(game, id, { conversation = false } = {}) {
  const person = visitablePerson(id);
  if (!person) return "这位人物尚未开放拜访";
  if (game.location?.id !== person.locationId) return `需先到达${person.address}`;
  if (activeEnemies(game).length) return "请先结束当前遭遇，再拜访交谈";
  if (!(game.character?.stats?.health > 0) || !(game.character?.stats?.sanity > 0)) return "当前身心状态无法进行拜访，请先获得照料";
  if (conversation && !hasMetPerson(game, person)) return "请先敲门拜访，与侦探见面";
  return "";
}

// Called only on the special-action clone after the UI revision has been checked.
export function visitPerson(game, id) {
  const reason = visitPersonGate(game, id);
  if (reason) throw new Error(reason);
  const person = visitablePerson(id);
  const met = hasMetPerson(game, person);
  game.triggerState = normalizeTriggerState(game);
  if (!met) game.triggerState.facts[person.metFact] = {
    value: true, firstTurn: game.turn + 1, lastTurn: game.turn + 1,
    source: "登门拜访", evidenceIds: [`visit:${person.id}:${game.turn + 1}`],
  };
  syncKnownPeople(game);
  return { action: `拜访${person.name}`, narrative: met ? person.greeting : person.introduction, minutes: 10 };
}

export function nearbyPeopleContext(game) {
  return VISITABLE_PEOPLE.filter(person => person.locationId === game.location?.id).map(person => ({
    id: person.id, name: person.name, role: person.role, address: person.address,
    met: hasMetPerson(game, person), behavior: person.behavior,
    interaction: hasMetPerson(game, person) ? "可以当面交谈，玩家自行决定话题" : "地址已知，请先使用人物拜访入口敲门；未见面不代表对方已经接待或相识",
  }));
}
