import { ACTIVE_CONTENT, CONTENT_SCHEMA_VERSION, CONTENT_VERSION } from "../content/index.js";
import { getTriggerDefinition, hydrateActiveTriggerDefinitions } from "./triggerDefinitions.js";
import { allConditionsMatch } from "./triggerConditions.js";
import { renderContentData } from "./contentTemplates.js";

function refreshDefinitions(game, step) {
  const state = game.triggerState;
  for (const refresh of step.definitionRefreshes || []) {
    const definition = getTriggerDefinition(refresh.definitionId);
    if (!definition) continue;
    for (const instance of [...(state.active || []), ...(state.history || [])]) {
      if (instance.definitionId !== refresh.definitionId) continue;
      const shouldDefer = instance.status === "available" && refresh.deferAvailableUntil?.length
        && !allConditionsMatch(refresh.deferAvailableUntil, { game, state, signals: [], action: "", turn: Number(game.turn || 0), instance });
      if (shouldDefer) {
        instance.status = "eligible";
        instance.stage = definition.eligibleStage || "eligible";
        instance.expiresTurn = null;
        instance.presentation = undefined;
      } else {
        instance.stage = refresh.stageMap?.[instance.stage] || instance.stage;
        const validStages = new Set((definition.stages || []).map((stage) => stage.id));
        if (["available", "engaged"].includes(instance.status) && !validStages.has(instance.stage)) {
          instance.stage = instance.status === "engaged"
            ? definition.engagedStage || definition.initialStage
            : definition.initialStage;
        }
        if (refresh.refreshPresentation && instance.status !== "eligible") {
          instance.presentation = renderContentData(definition.presentation || {}, { game });
        }
      }
      instance.definitionVersion = Number(refresh.toDefinitionVersion || definition.version || 1);
      delete instance.definitionSnapshot;
    }
  }
}

function replaceStoryText(value, replacements, context) {
  if (typeof value === "string") {
    return replacements.reduce((text, replacement) => (
      text.replaceAll(replacement.from, renderContentData(replacement.to, context))
    ), value);
  }
  if (Array.isArray(value)) return value.map((entry) => replaceStoryText(entry, replacements, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceStoryText(entry, replacements, context)]));
  }
  return value;
}

function patchStoryRecords(game, step) {
  for (const field of step.textReplacementFields || []) {
    if (game[field] != null) game[field] = replaceStoryText(game[field], step.textReplacements || [], { game });
  }
  for (const update of step.cluePatches || []) {
    const clue = (game.clues || []).find((entry) => entry.id === update.id);
    if (clue) Object.assign(clue, renderContentData(update.patch || {}, { game }));
  }
  for (const update of step.itemPatches || []) {
    const item = (game.inventory || []).find((entry) => entry.itemId === update.itemId);
    if (!item || (update.requiredTags || []).some((tag) => !(item.tags || []).includes(tag))) continue;
    Object.assign(item, renderContentData(update.patch || {}, { game, item }));
  }
}

function applyMigrationStep(game, step) {
  const state = game.triggerState;
  for (const rename of step.factRenames || []) {
    if (!state.facts?.[rename.from] || state.facts[rename.to]) continue;
    state.facts[rename.to] = state.facts[rename.from];
    delete state.facts[rename.from];
  }
  for (const mapping of step.triggerStages || []) {
    const instances = [...(state.active || []), ...(state.history || [])];
    for (const instance of instances) {
      if (instance.definitionId !== mapping.definitionId || instance.stage !== mapping.fromStage) continue;
      instance.stage = mapping.toStage;
      if (mapping.toDefinitionVersion != null) instance.definitionVersion = Number(mapping.toDefinitionVersion);
      if (instance.status === "eligible" || instance.status === "available" || instance.status === "engaged") delete instance.definitionSnapshot;
    }
  }
  refreshDefinitions(game, step);
  patchStoryRecords(game, step);
}

function migrationPath(fromVersion) {
  const path = [];
  const seen = new Set();
  let version = String(fromVersion || "legacy");
  while (version !== CONTENT_VERSION && !seen.has(version)) {
    seen.add(version);
    const step = (ACTIVE_CONTENT.migrations || []).find((entry) => entry.fromVersion === version);
    if (!step) return null;
    path.push(step);
    version = step.toVersion;
  }
  return version === CONTENT_VERSION ? path : null;
}

export function migrateContentState(game) {
  const current = game.content || { packId: ACTIVE_CONTENT.id, schemaVersion: 1, contentVersion: "legacy" };
  if (current.packId !== ACTIVE_CONTENT.id) {
    hydrateActiveTriggerDefinitions(game.triggerState);
    return { migrated: false, reason: "content-pack-mismatch", content: current };
  }
  const path = migrationPath(current.contentVersion);
  if (!path) {
    hydrateActiveTriggerDefinitions(game.triggerState);
    return { migrated: false, reason: "missing-migration", content: current };
  }
  for (const step of path) applyMigrationStep(game, step);
  hydrateActiveTriggerDefinitions(game.triggerState);
  game.content = { packId: ACTIVE_CONTENT.id, schemaVersion: CONTENT_SCHEMA_VERSION, contentVersion: CONTENT_VERSION };
  return { migrated: path.length > 0, reason: path.length ? "migrated" : "current", content: game.content };
}
