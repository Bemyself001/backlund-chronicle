import { ACTIVE_CONTENT, CONTENT_SCHEMA_VERSION, CONTENT_VERSION } from "../content/index.js";
import { hydrateActiveTriggerDefinitions } from "./triggerDefinitions.js";

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
