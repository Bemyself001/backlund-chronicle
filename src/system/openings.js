import { MAP_LOCATIONS, getOpening } from "../content/index.js";
import { getMapLocation, normalizeLocationKnowledge } from "./map.js";

export function openingMapState(opening) {
  const discoveredLocations = opening.knownIds.map((id) => {
    const location = getMapLocation(id);
    return { id, name: location.name, note: location.description };
  });
  const rumors = Object.fromEntries(MAP_LOCATIONS.map((location) => [location.id, {
    status: "rumored", note: location.rumor,
  }]));
  return {
    discoveredLocations,
    locationKnowledge: normalizeLocationKnowledge(opening.district === "东区" ? {} : rumors, discoveredLocations, opening.locationId),
  };
}

export function openingChoices(opening) {
  return opening.actions.map((label, index) => ({ label,
    intent: ["investigate", "social", "dangerous"][index], risk: ["low", "medium", "high"][index],
  }));
}

export { getOpening };
