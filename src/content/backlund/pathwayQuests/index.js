import { SEER_PATHWAY_QUESTS } from "./seer.js";

// 后续途径任务按内容文件逐条注册；底层触发引擎不需要随任务数量增长而改动。
export const PATHWAY_QUEST_DEFINITIONS = [
  ...SEER_PATHWAY_QUESTS,
];
