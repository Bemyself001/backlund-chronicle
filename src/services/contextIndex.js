import { knownPeople, visiblePeopleContext } from "../engine/people.js";
import { visibleQuestJournal } from "../engine/questRuntime.js";
import { getMapLocations, isDiscoveredLocationStatus, normalizeLocationKnowledge } from "../system/map.js";
import { playerVisibleItem } from "../system/items.js";
import { normalizeMemoryState } from "./memoryState.js";

const MAX_CACHED_GAMES = 3;
const MAX_CACHED_MESSAGES = 1024;
const caches = new Map();
const normalize = value => String(value || "").toLowerCase().replace(/\s+/g, "");
const clean = (value, max = 1800) => String(value || "").trim().slice(0, max);
const unique = values => [...new Set(values.filter(value => value != null && value !== ""))];
const compareId = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const turns = values => unique(values.map(value => typeof value === "number" ? value : Number(String(value || "").match(/^第\s*(\d+)\s*轮$/)?.[1])).filter(value => Number.isInteger(value) && value >= 0)).sort((a, b) => a - b);
const textOf = values => values.filter(value => value != null && value !== "").join("；");

// A trie scans each public text once. It avoids comparing every record with all
// other records when a long save contains hundreds of archived tasks.
function aliasMatcher(records) {
  const root = { children: new Map(), records: [] };
  for (const record of records) for (const alias of record.aliases) {
    let node = root;
    for (let index = 0; index < alias.length; index++) {
      const character = alias[index];
      if (!node.children.has(character)) node.children.set(character, { children: new Map(), records: [] });
      node = node.children.get(character);
    }
    node.records.push(record);
  }
  return text => {
    const found = new Set();
    for (let start = 0; start < text.length; start++) {
      let node = root;
      for (let index = start; index < text.length; index++) {
        node = node.children.get(text[index]);
        if (!node) break;
        for (const record of node.records) found.add(record);
      }
    }
    return [...found];
  };
}

function termsFor(value) {
  const text = normalize(value).replace(/之前|以前|帮我|那个|这个|一下|现在|继续|寻找|找一找|请问|已经/g, " ");
  const words = text.match(/[a-z0-9][a-z0-9._:-]+|[\u3400-\u9fff]+/g) || [];
  return unique(words.flatMap(word => /^[a-z0-9]/.test(word) ? [word] : [...Array(Math.max(0, word.length - 1))].map((_, index) => word.slice(index, index + 2)))).slice(0, 48);
}

function makeRecord(type, id, text, options = {}) {
  return {
    id: `${type}:${id}`, type, text: clean(text), sourceTurns: turns(options.sourceTurns || []),
    entityIds: unique([String(id), ...(options.entityIds || [])]), authority: options.authority || "current",
    ...(options.status ? { status: options.status } : {}),
    compactText: clean(options.compactText || text, 200),
    aliases: unique([...(options.aliases || []), String(id)]).map(normalize).filter(value => value.length > 1),
  };
}

// Build from disclosure projections, never from private definitions, tool traces,
// unrevealed aliases, or arbitrary object serialization.
function currentRecords(game) {
  const records = [];
  const people = visiblePeopleContext(game);
  const dossiers = knownPeople(game);
  for (const person of people) {
    if (!person?.id || !person.name) continue;
    const dossier = dossiers.find(entry => entry.id === person.id)?.dossier;
    records.push(makeRecord("person", person.id, textOf([person.name, person.alias, person.role, person.contact, person.status,
      person.connection, person.note, person.lastKnownLocation && `最后已知地点（非实时位置）：${person.lastKnownLocation}`, ...(person.knownEvents || [])]), {
      aliases: [person.name, person.alias, ...String(person.name).split(/[·・]/)],
      sourceTurns: [dossier?.firstTurn, dossier?.updatedTurn], status: person.contact,
      compactText: textOf([person.name, person.role, person.contact, person.status, person.lastKnownLocation && `最后已知地点（非实时）：${person.lastKnownLocation}`]),
    }));
  }
  for (const item of (game.inventory || []).map(playerVisibleItem)) {
    if (!item.instanceId && !item.itemId) continue;
    records.push(makeRecord("item", item.instanceId || item.itemId, textOf([item.name, item.category, item.description,
      `当前数量：${item.quantity ?? 1}`, ...(item.tags || []), item.potion?.identified && `已鉴定：${item.potion.pathwayName}序列${item.potion.sequence}`,
      item.characteristic?.identified && `已确认特性：${item.characteristic.pathwayName}序列${item.characteristic.sequence}`].filter(Boolean)), {
      aliases: [item.name], entityIds: [item.itemId], sourceTurns: [item.acquiredAt], status: item.potionStatus || item.characteristicStatus,
      compactText: textOf([item.name, `当前数量：${item.quantity ?? 1}`, item.potionStatus || item.characteristicStatus]),
    }));
  }
  for (const quest of visibleQuestJournal(game)) {
    if (!quest.id || quest.status === "eligible") continue;
    records.push(makeRecord("task", quest.id, textOf([quest.title, `当前状态：${quest.status}`, quest.summary, `当前目标：${quest.objective}`]), {
      aliases: [quest.title], entityIds: [quest.questId], sourceTurns: [quest.startedTurn, quest.updatedTurn], status: quest.status,
      compactText: textOf([quest.title, `当前状态：${quest.status}`, `当前目标：${clean(quest.objective, 100)}`]),
    }));
  }
  for (const clue of game.clues || []) {
    if (!clue?.id) continue;
    records.push(makeRecord("clue", clue.id, textOf([clue.title, clue.name, clue.text, clue.detail, clue.description, clue.summary, clue.source]), {
      aliases: [clue.title, clue.name], sourceTurns: [clue.turn, clue.discoveredAt],
    }));
  }
  const knowledge = normalizeLocationKnowledge(game.locationKnowledge, game.discoveredLocations, game.location?.id, game);
  for (const location of getMapLocations(game)) {
    const status = knowledge[location.id]?.status;
    if (!isDiscoveredLocationStatus(status)) continue;
    records.push(makeRecord("location", location.id, textOf([location.name, location.district, location.description]), {
      aliases: [location.name, location.name.split("·").slice(-1)[0]], sourceTurns: [knowledge[location.id]?.discoveredAt], status,
    }));
  }
  // Authored quest links only become associations once both public records exist.
  const byId = new Map(records.map(record => [record.id, record]));
  for (const person of dossiers) {
    const personRecord = byId.get(`person:${person.id}`);
    for (const instance of [...(game.triggerState?.active || []), ...(game.triggerState?.history || [])]) {
      if (!personRecord || !(person.dossier?.questIds || []).includes(instance.definitionId)) continue;
      const taskRecord = byId.get(`task:${instance.instanceId}`);
      if (!taskRecord) continue;
      personRecord.entityIds.push(instance.instanceId);
      taskRecord.entityIds.push(person.id);
    }
  }
  // Associations are derived exclusively from already disclosed names and IDs.
  const matchAliases = aliasMatcher(records);
  for (const record of records) {
    for (const target of matchAliases(normalize(record.text))) {
      if (record === target) continue;
      record.entityIds.push(target.entityIds[0]);
    }
    record.entityIds = unique(record.entityIds);
  }
  return { records, matchAliases };
}

function cacheFor(game) {
  // Object identity isolates ID-less legacy imports; payload equality is always
  // checked below, so loading another revision with the same save ID is safe.
  const key = game.id || game;
  let cache = caches.get(key);
  if (!cache) cache = { messages: new Map() };
  caches.delete(key);
  caches.set(key, cache);
  while (caches.size > MAX_CACHED_GAMES) caches.delete(caches.keys().next().value);
  return cache;
}

function messageText(cache, message, position) {
  const key = `${message.id || position}:${message.role}:${message.turn ?? ""}`;
  const cached = cache.messages.get(key);
  if (cached?.content === message.content) return cached.text;
  const text = normalize(message.content);
  // Exceptionally large imported messages are searchable without retaining a
  // second copy of their entire text in the cache.
  if (text.length > 12000) return text;
  cache.messages.set(key, { content: message.content, text });
  while (cache.messages.size > MAX_CACHED_MESSAGES) cache.messages.delete(cache.messages.keys().next().value);
  return text;
}

function storyMessages(game) {
  return game.storyHistory?.length ? game.storyHistory : game.recentDialogues || [];
}

// Optional idle preparation for long imported saves. It yields between batches;
// cancelling (for example when switching saves) cannot change game state.
export function prepareContextIndex(game, { batchSize = 64 } = {}) {
  const messages = storyMessages(game);
  const cache = cacheFor(game);
  let cancelled = false;
  let cursor = Math.max(0, messages.length - MAX_CACHED_MESSAGES);
  const size = Math.max(1, Math.min(128, Number(batchSize) || 64));
  const step = () => {
    if (cancelled) return;
    const end = Math.min(messages.length, cursor + size);
    for (; cursor < end; cursor++) {
      const entry = messages[cursor];
      if (["assistant", "user"].includes(entry?.role)) messageText(cache, entry, cursor);
    }
    if (cursor < messages.length) setTimeout(step, 0);
  };
  setTimeout(step, 0);
  return () => { cancelled = true; };
}

function historicalRecords(game, queryTerms, selectedEntities, matchAllAliases) {
  const cache = cacheFor(game);
  const candidates = [];
  const compare = (a, b) => b.score - a.score || Number(b.message.turn || 0) - Number(a.message.turn || 0) || a.index - b.index;
  const messages = storyMessages(game);
  const recentStart = Math.max(0, messages.length - MAX_CACHED_MESSAGES);
  const matchSelectedAliases = aliasMatcher(selectedEntities);
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (!["assistant", "user"].includes(message?.role) || typeof message.content !== "string") continue;
    // Older records remain searchable without retaining their entire index in RAM.
    const text = index >= recentStart ? messageText(cache, message, index) : normalize(message.content);
    const matched = matchSelectedAliases(text);
    const score = queryTerms.reduce((sum, term) => sum + Number(text.includes(term)), 0) + matched.length * 3;
    if (!score) continue;
    candidates.push({ message, index, score, matched });
    if (candidates.length > 48) {
      candidates.sort(compare);
      candidates.length = 24;
    }
  }
  const result = candidates.sort(compare)
    .slice(0, 24).map(({ message, index, score }) => {
      // An excerpt follows the first query match instead of silently losing an
      // old event at the end of a long narrative.
      const content = message.content;
      const lower = content.toLowerCase();
      const positions = queryTerms.map(term => lower.indexOf(term)).filter(position => position >= 0);
      const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 120);
      const excerpt = `${start ? "…" : ""}${content.slice(start, start + 1000)}${content.length > start + 1000 ? "…" : ""}`;
      const matched = matchAllAliases(normalize(excerpt));
      const prefix = message.role === "user" ? "历史玩家意图（不代表已完成）：" : "历史叙事（当前状态以本地数据为准）：";
      return { ...makeRecord("history", message.id || `${message.turn || 0}-${index}`, prefix + excerpt, {
        authority: "historical", sourceTurns: [message.turn], entityIds: matched.map(record => record.entityIds[0]),
      }), score: score * 10 };
    });
  const memory = normalizeMemoryState(game);
  for (const kind of ["people", "events", "openThreads"]) {
    (memory.digest[kind] || []).forEach((entry, index) => {
      const text = textOf([entry.name, entry.summary]);
      const normalized = normalize(text);
      const matched = matchAllAliases(normalized);
      const score = queryTerms.reduce((sum, term) => sum + Number(normalized.includes(term)), 0) + matchSelectedAliases(normalized).length * 3;
      if (!score) return;
      result.push({ ...makeRecord("memory", `${kind}-${index}`, `历史记忆（${entry.certainty || entry.kind || "人物摘要"}，当前状态以本地数据为准）：${text}`, {
        authority: "historical", sourceTurns: entry.sourceTurns, entityIds: matched.map(record => record.entityIds[0]),
      }), score: score * 10 });
    });
  }
  return result;
}

export function clearContextIndex(gameId) {
  if (gameId == null) caches.clear();
  else caches.delete(gameId);
}

/** Synchronous, deterministic lookup; vector retrieval can later implement this API. */
export function retrieveContext(game, { query = "", ids = [], limit = 8, maxChars = 6000, includeAmbient = true } = {}) {
  const requested = unique((Array.isArray(ids) ? ids : []).map(String));
  const terms = termsFor(query);
  const queryText = normalize(query);
  const { records, matchAliases } = currentRecords(game);
  const requestedRecord = record => requested.some(id => record.id === id || record.entityIds[0] === id);
  const candidates = records.map(record => {
    const text = normalize(record.text);
    const explicit = requestedRecord(record);
    const named = record.aliases.some(alias => queryText.includes(alias));
    const score = (explicit ? 10000 : named ? 1000 : 0) + terms.reduce((sum, term) => sum + Number(text.includes(term)) * 5, 0)
      + (includeAmbient && record.type === "task" && record.entityIds.includes(game.trackedQuestId) ? 500 : 0)
      + (includeAmbient && record.type === "location" && record.entityIds[0] === game.location?.id ? 100 : 0);
    return { ...record, score };
  });
  const selected = candidates.filter(record => record.score >= 5 && (requestedRecord(record) || record.aliases.some(alias => queryText.includes(alias)) || terms.some(term => normalize(record.text).includes(term))));
  const relatedIds = new Set(selected.flatMap(record => record.entityIds.slice(1)));
  for (const record of candidates) if (relatedIds.has(record.entityIds[0])) record.score += 30;
  const historical = terms.length || requested.length ? historicalRecords(game, terms, selected, matchAliases) : [];
  // History can resolve an indirect reference to a person. Join against public
  // records again, so returning an old story cannot resurrect a stale status.
  for (const record of candidates) {
    const related = historical.filter(entry => entry.entityIds.includes(record.entityIds[0]));
    if (related.length) record.score = Math.max(record.score, ...related.map(entry => entry.score + 40));
  }
  const ranked = [...candidates.filter(record => record.score > 0), ...historical].sort((a, b) => {
    return Number(requestedRecord(b)) - Number(requestedRecord(a)) || b.score - a.score
      || Number(b.authority === "current") - Number(a.authority === "current") || compareId(a.id, b.id);
  });
  const count = Math.max(0, Math.min(24, Number(limit) || 0));
  const budget = Math.max(0, Math.min(24000, Number(maxChars) || 0));
  const entries = [];
  const seen = new Set();
  const includedIds = new Set();
  const currentByEntity = new Map();
  for (const record of candidates) {
    const id = record.entityIds[0];
    currentByEntity.set(id, [...(currentByEntity.get(id) || []), record]);
  }
  let used = 0;
  for (const { aliases: _aliases, score: _score, compactText, ...fullRecord } of ranked) {
    let record = fullRecord;
    if (entries.length >= count) break;
    if (seen.has(record.text)) continue;
    if (record.authority === "historical") {
      const current = record.entityIds.slice(1).flatMap(id => currentByEntity.get(id) || []).filter(entry => ["task", "person", "item"].includes(entry.type));
      // If a linked current fact did not fit, omit the old claim too. This also
      // protects tiny limits where a short stale story fits but a task does not.
      if (current.some(entry => !includedIds.has(entry.id))) continue;
    }
    let cost = JSON.stringify(record).length;
    if (used + cost > budget && record.authority === "current") {
      record = { ...record, text: compactText, entityIds: record.entityIds.slice(0, 8) };
      cost = JSON.stringify(record).length;
    }
    if (used + cost > budget) continue;
    entries.push(record);
    seen.add(record.text);
    includedIds.add(record.id);
    used += cost;
  }
  return { entries, missing: requested.filter(id => !entries.some(record => record.id === id || record.entityIds[0] === id)),
    truncated: entries.length < ranked.length, usedChars: used };
}
