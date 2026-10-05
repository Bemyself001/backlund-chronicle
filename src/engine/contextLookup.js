import { LORE_ENTRIES, getLoreEntry } from "../content/index.js";
import { allConditionsMatch } from "./triggerConditions.js";
import { normalizeTriggerState } from "./triggerState.js";
import { renderContentText } from "./contentTemplates.js";
import { retrieveContext } from "../services/contextIndex.js";

const normalizeText = (value) => String(value || "").toLowerCase().replace(/\s+/g, "");

function visibleLore(game, entry) {
  const state = normalizeTriggerState(game);
  return allConditionsMatch(entry.revealWhen || [], { game, state, signals: [], action: "", turn: Number(game.turn || 0) });
}

function relevanceScore(game, entry, query) {
  const text = normalizeText(query);
  let score = 0;
  for (const term of entry.relevance?.terms || []) if (text.includes(normalizeText(term))) score += 20;
  for (const itemId of entry.relevance?.itemIds || []) {
    const item = (game.inventory || []).find((candidate) => candidate.itemId === itemId);
    if (item && text.includes(normalizeText(item.name))) score += 30;
  }
  for (const definitionId of entry.relevance?.definitionIds || []) {
    const active = (game.triggerState?.active || []).find((candidate) => candidate.definitionId === definitionId);
    if (active && (text.includes(normalizeText(active.presentation?.title)) || !text)) score += 25;
  }
  return score;
}

function playerSafeLore(game, entry) {
  return { id: entry.id, type: "loreFact", text: renderContentText(entry.text, { game }) };
}

function lookupLore(game, { query = "", ids = [], limit = 6 } = {}) {
  const requested = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))];
  const candidates = requested.length
    ? requested.map(getLoreEntry).filter(Boolean)
    : LORE_ENTRIES;
  const available = candidates
    .filter((entry) => visibleLore(game, entry))
    .map((entry) => ({ entry, score: requested.length ? 100 : relevanceScore(game, entry, query) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id))
    .slice(0, Math.max(1, Math.min(8, Number(limit) || 6)))
    .map(({ entry }) => playerSafeLore(game, entry));
  return { query: String(query || ""), entries: available, missing: requested.filter((id) => !available.some((entry) => entry.id === id)) };
}

export function lookupContext(game, { query = "", ids = [], limit = 6, maxChars = 6000 } = {}) {
  const requested = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))];
  const count = Math.max(1, Math.min(8, Number(limit) || 6));
  const budget = Math.max(0, Math.min(24000, Number(maxChars) || 0));
  const lore = lookupLore(game, { query, ids: requested, limit: count }).entries;
  const entries = [];
  let used = 0;
  for (const entry of lore) {
    const cost = JSON.stringify(entry).length;
    if (entries.length >= count) break;
    if (used + cost > budget) continue;
    entries.push(entry);
    used += cost;
  }
  const local = retrieveContext(game, { query, ids: requested, limit: count - entries.length, maxChars: budget - used, includeAmbient: false });
  entries.push(...local.entries);
  return { query: String(query || ""), entries, missing: requested.filter(id => !entries.some(entry => entry.id === id || entry.entityIds?.[0] === id)) };
}

export function progressiveContext(game, action = "") {
  const state = normalizeTriggerState(game);
  // Keep authored evidence even for vague actions such as “继续”.
  const pinned = LORE_ENTRIES.filter(entry => entry.alwaysInclude && visibleLore(game, entry)).map(entry => playerSafeLore(game, entry));
  const relevant = lookupLore(game, { query: action, limit: 6 }).entries;
  return {
    hardFacts: Object.fromEntries(Object.entries(state.facts || {}).map(([id, fact]) => [id, fact?.value ?? true])),
    loreFacts: [...pinned, ...relevant.filter(entry => !pinned.some(fact => fact.id === entry.id))],
    sceneDetailPolicy: "可补充不影响机制的临时场景细节；不得把临场细节当作永久事实、任务条件或奖励依据。",
  };
}
