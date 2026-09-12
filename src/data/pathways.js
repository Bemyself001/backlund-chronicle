// 旧导入路径兼容层。
export {
  PATHWAYS, getPathway, pathwayIdForName, pathwayNameForId, getUnlockedAbilities,
} from "../content/index.js";

import { PATHWAYS } from "../content/index.js";
export const PATHWAY_IDS = Object.fromEntries(PATHWAYS.map((pathway) => [pathway.name, pathway.id]));
export const PATHWAY_NAMES = Object.fromEntries(PATHWAYS.map((pathway) => [pathway.id, pathway.name]));
