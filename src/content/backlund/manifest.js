import { OPENINGS } from "./openings.js";
import { TALENTS } from "./talents.js";
import { PATHWAYS } from "./pathways.js";
import { DEFAULT_CHARACTER, RANDOM_CHARACTERS } from "./characters.js";
import {
  MAP_LOCATIONS, MAP_ROUTES, MAP_DISTRICTS, DISTRICT_LAYOUT,
  INITIAL_DISCOVERED_LOCATION_IDS, INITIAL_RUMORED_LOCATION_IDS,
  LOCATION_KNOWLEDGE_STATUSES, DYNAMIC_LOCATION_SCOPES, DYNAMIC_LOCATION_KINDS,
} from "./map.js";

export const BACKLUND_CONTENT = {
  id: "backlund-core",
  name: "贝克兰德核心内容",
  schemaVersion: 1,
  contentVersion: "2026.09.11",
  openings: OPENINGS,
  talents: TALENTS,
  pathways: PATHWAYS,
  characters: { default: DEFAULT_CHARACTER, random: RANDOM_CHARACTERS },
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
