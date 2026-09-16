import { OPENINGS } from "./openings.js";
import { TALENTS } from "./talents.js";
import { PATHWAYS } from "./pathways.js";
import { DEFAULT_CHARACTER, RANDOM_CHARACTERS } from "./characters.js";
import {
  MAP_LOCATIONS, MAP_ROUTES, MAP_DISTRICTS, DISTRICT_LAYOUT,
  INITIAL_DISCOVERED_LOCATION_IDS, INITIAL_RUMORED_LOCATION_IDS,
  LOCATION_KNOWLEDGE_STATUSES, DYNAMIC_LOCATION_SCOPES, DYNAMIC_LOCATION_KINDS,
} from "./map.js";
import { ITEM_BEHAVIORS } from "./itemBehaviors.js";
import { ORGANIZATIONS } from "./organizations.js";
import { OCCULT_ENTRY_DEFINITIONS } from "./occultEntries.js";
import { LORE_ENTRIES } from "./lore.js";
import { CONTENT_MIGRATIONS } from "./migrations.js";
import { BACKLUND_SCENARIO_RULES } from "./narrative.js";
import { SPECIAL_QUEST_DEFINITIONS } from "./specialQuests/index.js";
import { PATHWAY_QUEST_DEFINITIONS } from "./pathwayQuests/index.js";
import { SPECIAL_ACTIONS, SPECIAL_RECIPES, SPECIAL_CONTACTS } from "./specialActions.js";

export const BACKLUND_CONTENT = {
  id: "backlund-core",
  name: "贝克兰德核心内容",
  schemaVersion: 2,
  contentVersion: "2026.09.16.5",
  specialActions: SPECIAL_ACTIONS,
  specialRecipes: SPECIAL_RECIPES,
  specialContacts: SPECIAL_CONTACTS,
  openings: OPENINGS,
  talents: TALENTS,
  pathways: PATHWAYS,
  characters: { default: DEFAULT_CHARACTER, random: RANDOM_CHARACTERS },
  organizations: ORGANIZATIONS,
  itemBehaviors: ITEM_BEHAVIORS,
  triggers: [
    ...OCCULT_ENTRY_DEFINITIONS,
    ...SPECIAL_QUEST_DEFINITIONS,
    ...PATHWAY_QUEST_DEFINITIONS,
  ],
  lore: LORE_ENTRIES,
  migrations: CONTENT_MIGRATIONS,
  narrative: { scenarioRules: BACKLUND_SCENARIO_RULES },
  map: {
    locations: MAP_LOCATIONS,
    routes: MAP_ROUTES,
    districts: MAP_DISTRICTS,
    districtLayout: DISTRICT_LAYOUT,
    initialDiscoveredLocationIds: INITIAL_DISCOVERED_LOCATION_IDS,
    initialRumoredLocationIds: INITIAL_RUMORED_LOCATION_IDS,
    locationKnowledgeStatuses: LOCATION_KNOWLEDGE_STATUSES,
    dynamicLocationScopes: DYNAMIC_LOCATION_SCOPES,
    dynamicLocationKinds: DYNAMIC_LOCATION_KINDS,
  },
};
