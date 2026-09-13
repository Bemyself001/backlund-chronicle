import { getAdvancement } from "../system/character.js";

const list = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const normalizedText = (value) => String(value || "").toLowerCase().replace(/\s+/g, "");

function textHasAny(value, terms = []) {
  const text = normalizedText(value);
  return list(terms).some((term) => text.includes(normalizedText(term)));
}

function matchesSignal(signal, condition) {
  if (condition.kind && signal.kind !== condition.kind) return false;
  if (condition.toolName && signal.toolName !== condition.toolName) return false;
  if (condition.itemId && signal.itemId !== condition.itemId) return false;
  if (condition.factId && signal.factId !== condition.factId) return false;
  if (condition.terms?.length && !textHasAny([signal.text, signal.action, signal.title, signal.detail].filter(Boolean).join(" "), condition.terms)) return false;
  return true;
}

function relationMatches(game, condition) {
  return (game.relationships || []).some((relation) => {
    if (condition.npcId && relation.id !== condition.npcId) return false;
    if (condition.name && relation.name !== condition.name) return false;
    return Number(relation.value || 0) >= Number(condition.minValue || 0);
  });
}

function clueMatches(game, condition) {
  return (game.clues || []).some((clue) => {
    if (condition.clueId && clue.id !== condition.clueId) return false;
    if (condition.kindName && clue.kind !== condition.kindName) return false;
    if (condition.pathwayId && clue.pathwayId !== condition.pathwayId) return false;
    if (condition.terms?.length && !textHasAny(`${clue.title || ""} ${clue.detail || ""}`, condition.terms)) return false;
    return true;
  });
}

function triggerMatches(state, condition) {
  const entries = [...(state.active || []), ...(state.history || [])];
  return entries.some((entry) => {
    if (condition.definitionId && entry.definitionId !== condition.definitionId) return false;
    if (condition.category && entry.category !== condition.category) return false;
    if (condition.status && !list(condition.status).includes(entry.status)) return false;
    if (condition.stage && !list(condition.stage).includes(entry.stage)) return false;
    return true;
  });
}

export function conditionMatches(condition = {}, context = {}) {
  const { game = {}, state = {}, signals = [], action = "", turn = Number(game.turn || 0) } = context;
  const advancement = getAdvancement(game.character || {});
  let matched = false;
  switch (condition.type) {
    case "always": matched = true; break;
    case "character": {
      if (condition.kind === "ordinary") matched = advancement.type === "ordinary";
      else if (condition.kind === "extraordinary") matched = advancement.type === "extraordinary";
      else matched = true;
      if (matched && condition.pathwayId) matched = advancement.pathwayId === condition.pathwayId;
      if (matched && condition.sequenceRange) {
        const [min, max] = condition.sequenceRange.map(Number);
        matched = Number.isInteger(advancement.sequence) && advancement.sequence >= min && advancement.sequence <= max;
      }
      break;
    }
    case "item": matched = (game.inventory || []).some((item) => (!condition.itemId || item.itemId === condition.itemId) && (!condition.instanceId || item.instanceId === condition.instanceId)); break;
    case "fact": matched = Boolean(state.facts?.[condition.key]) && (condition.value === undefined || state.facts[condition.key].value === condition.value); break;
    case "action": matched = textHasAny(action, condition.terms || []); break;
    case "signal": matched = signals.some((signal) => matchesSignal(signal, condition)); break;
    case "location": {
      const location = game.location || {};
      matched = (!condition.locationId || location.id === condition.locationId)
        && (!condition.districts?.length || condition.districts.some((district) => String(location.district || "").includes(district)))
        && (!condition.terms?.length || textHasAny(`${location.name || ""} ${location.district || ""}`, condition.terms));
      break;
    }
    case "time": {
      const hour = Number(String(game.worldTime || "").match(/·\s*(\d{1,2}):\d{2}/)?.[1]);
      matched = Number.isFinite(hour) && (condition.period === "night" ? (hour >= 18 || hour < 6) : hour >= Number(condition.startHour || 0) && hour < Number(condition.endHour || 24));
      if (matched && condition.minTurn != null) matched = turn >= Number(condition.minTurn);
      break;
    }
    case "weather": {
      const weather = game.weather;
      matched = Boolean(weather) && (!condition.value || list(condition.value).includes(weather.kind || weather.value || weather));
      break;
    }
    case "relationship": matched = relationMatches(game, condition); break;
    case "clue": matched = clueMatches(game, condition); break;
    case "trigger": matched = triggerMatches(state, condition); break;
    case "turn": matched = turn >= Number(condition.min || 0) && (condition.max == null || turn <= Number(condition.max)); break;
    case "available-slot": matched = !(state.active || []).some((entry) => entry.category === condition.category && entry.status === "available"); break;
    default: matched = false;
  }
  return condition.not ? !matched : matched;
}

export function allConditionsMatch(conditions = [], context = {}) {
  return list(conditions).every((condition) => conditionMatches(condition, context));
}

export function anyConditionMatches(conditions = [], context = {}) {
  return list(conditions).some((condition) => conditionMatches(condition, context));
}

export function hasActionTerms(value, terms) {
  return textHasAny(value, terms);
}
