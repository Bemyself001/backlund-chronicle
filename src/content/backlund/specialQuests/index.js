import { SIDE_QUEST_DEFINITIONS } from "./sideQuests.js";
import { WATCH_DISCOVERY_QUESTS, WATCH_MAIN_QUESTS } from "./watch.js";
import { configureWatchFlow, configureSideQuests } from "./investigationFlow.js";
import { configureInvestigationGuidance } from "./investigationGuidance.js";

configureWatchFlow(WATCH_DISCOVERY_QUESTS[0], WATCH_MAIN_QUESTS[0]);
configureSideQuests(SIDE_QUEST_DEFINITIONS);
configureInvestigationGuidance([...WATCH_DISCOVERY_QUESTS, ...WATCH_MAIN_QUESTS, ...SIDE_QUEST_DEFINITIONS]);

export const SPECIAL_QUEST_DEFINITIONS = [
  ...WATCH_DISCOVERY_QUESTS,
  ...WATCH_MAIN_QUESTS,
  ...SIDE_QUEST_DEFINITIONS,
];
