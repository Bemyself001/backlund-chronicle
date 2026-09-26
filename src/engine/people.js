import { STORY_PEOPLE } from "../content/backlund/people.js";
import { renderContentData, renderContentText } from "./contentTemplates.js";

const validTurn = value => Number.isInteger(value) && value >= 0 ? value : null;
const recordedTurn = value => {
  const match = String(value || "").match(/^第\s*(\d+)\s*轮$/);
  return match ? Number(match[1]) : null;
};
const earliest = values => values.filter(value => value != null).sort((a, b) => a - b)[0] ?? null;

function evidenceFor(game, condition) {
  const yes = turn => ({ turn: validTurn(turn) });
  if (condition.any) {
    const evidence = condition.any.map(entry => evidenceFor(game, entry)).filter(Boolean);
    return evidence.length ? yes(earliest(evidence.map(entry => entry.turn))) : null;
  }
  if (condition.fact) {
    const fact = game.triggerState?.facts?.[condition.fact];
    return (fact && typeof fact === "object" ? fact.value : fact) ? yes(fact?.firstTurn) : null;
  }
  if (condition.clue) {
    const clue = game.clues?.find(entry => entry.id === condition.clue);
    return clue ? yes(recordedTurn(clue.discoveredAt)) : null;
  }
  if (condition.item) {
    const item = game.inventory?.find(entry => entry.itemId === condition.item);
    return item ? yes(recordedTurn(item.acquiredAt)) : null;
  }
  if (condition.reward) return game.triggerState?.rewardsClaimed?.includes(condition.reward) ? yes(null) : null;
  const instances = [...(game.triggerState?.active || []), ...(game.triggerState?.history || [])]
    .filter(entry => entry.definitionId === condition.quest && entry.status !== "eligible");
  const matches = instances.flatMap(instance => {
    if (!condition.stages) return [yes(instance.createdTurn)];
    // "available" is only an invitation; its stage must not imply a meeting.
    if (instance.status === "available") return [];
    const history = (instance.stageHistory || []).filter(entry => condition.stages.includes(entry.from) || condition.stages.includes(entry.to));
    if (history.length) return history.map(entry => yes(entry.turn));
    return condition.stages.includes(instance.stage) ? [yes(instance.progressTurn)] : [];
  });
  return matches.length ? yes(earliest(matches.map(entry => entry.turn))) : null;
}

function matchesPerson(entry, person, game) {
  const names = [person.name, ...(person.aliases || [])].map(name => renderContentText(name, { game }));
  return entry.id === person.id || names.includes(entry.name);
}

// Rebuild only disclosed fields. Unlocked discovery IDs persist after a clue or
// item is removed, and survive saves without duplicating rewards or relationships.
export function knownPeople(game) {
  const relationships = Array.isArray(game.relationships) ? game.relationships : [];
  return STORY_PEOPLE.flatMap(person => {
    const existing = relationships.filter(entry => entry && matchesPerson(entry, person, game));
    const unlocked = {};
    for (const discovery of person.discoveries) {
      const stored = existing.map(entry => entry.dossier?.discoveries?.[discovery.id]).filter(entry => entry && typeof entry === "object");
      const evidence = evidenceFor(game, discovery.when);
      if (stored.length || evidence) unlocked[discovery.id] = { turn: earliest([...stored.map(entry => validTurn(entry.turn)), evidence?.turn]) };
    }
    const discoveries = person.discoveries.filter(entry => Object.hasOwn(unlocked, entry.id));
    if (!discoveries.length && !existing.length) return [];
    const first = existing.find(entry => entry.id === person.id) || existing[0];
    const fields = { name: person.name, role: person.role, connection: person.connection, contact: "heard", status: "", lastKnownLocation: "" };
    if (!discoveries.length) Object.assign(fields, {
      name: first.name, role: first.role || "身份尚待了解", connection: "旧档中已经登记的人物。",
    });
    discoveries.forEach(entry => Object.assign(fields, entry.patch));
    const records = discoveries.map(entry => ({
      id: entry.id, turn: unlocked[entry.id].turn, source: entry.source, text: entry.text,
    }));
    const turns = records.map(entry => entry.turn).filter(turn => turn != null);
    return [{
      id: person.id, ...renderContentData(fields, { game }),
      value: Number.isFinite(first?.value) ? first.value : 0,
      note: first?.note || "",
      referenceIds: [...new Set(existing.flatMap(entry => [entry.id, ...(entry.referenceIds || [])]))].filter(id => id !== person.id),
      dossier: {
        version: 1, discoveries: unlocked, records: renderContentData(records, { game }),
        firstTurn: earliest(turns), updatedTurn: turns.length ? Math.max(...turns) : null,
        questIds: [...person.questIds],
      },
    }];
  }).sort((a, b) => (b.dossier.updatedTurn ?? -1) - (a.dossier.updatedTurn ?? -1));
}

export function syncKnownPeople(game) {
  if (game.relationships != null && !Array.isArray(game.relationships)) return;
  const people = knownPeople(game);
  const other = (game.relationships || []).filter(entry => !entry || !STORY_PEOPLE.some(person => matchesPerson(entry, person, game)));
  game.relationships = [...people, ...other];
}

export function visiblePeopleContext(game) {
  const projection = { ...game };
  syncKnownPeople(projection);
  return projection.relationships.map(person => {
    if (!person?.dossier) return person;
    const { dossier, ...fields } = person;
    return { ...fields, knownEvents: dossier.records.map(({ text }) => text) };
  });
}
