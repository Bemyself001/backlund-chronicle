const condition = { type: "object", required: ["type"], properties: {
  type: { type: "string", enum: ["location", "item", "fact", "clue", "stat", "relationship", "trigger", "organization", "action", "quest-proof"] },
  locationId: { type: "string" }, itemId: { type: "string" }, instanceId: { type: "string" }, key: { type: "string" },
  clueId: { type: "string" }, npcId: { type: "string" }, name: { type: "string" }, definitionId: { type: "string" }, organizationId: { type: "string" },
  value: { anyOf: [{ type: "boolean" }, { type: "number" }, { type: "string" }] }, status: { type: "string" },
  min: { type: "number" }, max: { type: "number" }, minValue: { type: "number" }, not: { type: "boolean" }, terms: { type: "array", items: { type: "string" } },
  nodeId: { type: "string" }, minPaidPence: { type: "integer", minimum: 0 }, quantity: { type: "integer", minimum: 1 },
} };
const conditions = { type: "array", items: condition };
export const QUEST_INPUT_SCHEMA = { type: "object", required: ["id", "title", "summary", "objective"], properties: {
  id: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, objective: { type: "string" },
  status: { type: "string", enum: ["available", "engaged"] }, kind: { type: "string", enum: ["random", "side", "main"] },
  locationId: { type: "string" }, deadlineTurns: { type: "integer", minimum: 1 }, finale: { type: "boolean" }, dangerous: { type: "boolean" }, majorDecision: { type: "boolean" },
  contract: { type: "object", properties: {
    coreGoal: { type: "string" }, rewardClaim: { type: "object", required: ["objective", "locationId"], properties: { objective: { type: "string" }, locationId: { type: "string" } }, description: "仅在原约定要求返回交差时填写；目标完成后保留待领奖，玩家领取后再归档。不填则完成时自动发放。" }, nodes: { type: "array", maxItems: 5, items: { type: "object", required: ["id", "objective", "conditions"], properties: {
      id: { type: "string" }, objective: { type: "string" }, conditions, minutes: { type: "integer", minimum: 5 },
      dangerous: { type: "boolean" }, majorDecision: { type: "boolean" }, obstacle: { type: "boolean" }, errandDepth: { type: "integer", minimum: 0, maximum: 1 },
      cost: { type: "object", properties: { amountPence: { type: "integer", minimum: 0 }, itemId: { type: "string" }, quantity: { type: "integer", minimum: 1 } }, description: "本步骤实际支付/交付，原子扣除并记录永久任务凭证；不要再另调money.remove或inventory.remove重复扣除" },
    } } }, completionConditions: conditions, failureConditions: conditions,
    rewards: { type: "array", items: { type: "object", required: ["type", "amountPence"], properties: { type: { type: "string", enum: ["money"] }, amountPence: { type: "integer", minimum: 0 } } } },
  } },
} };
export const QUEST_RESOLVE_PROPERTIES = {
  recovery: { type: "object", required: ["quest", "agreement", "acceptance"], properties: {
    quest: QUEST_INPUT_SCHEMA,
    agreement: { type: "object", required: ["turn", "quote"], properties: { turn: { type: "integer" }, quote: { type: "string" } }, description: "原始assistant委托原话，包含逐字核心目标与约定报酬" },
    acceptance: { type: "object", required: ["turn", "quote"], properties: { turn: { type: "integer" }, quote: { type: "string" } }, description: "历史user明确接取原话" },
    completedSteps: { type: "array", maxItems: 5, items: { type: "object", required: ["objectiveId", "turn", "actionQuote", "resultQuote"], properties: { objectiveId: { type: "string" }, turn: { type: "integer" }, actionQuote: { type: "string" }, resultQuote: { type: "string" } } } },
  }, description: "仅恢复漏登记的历史普通委托。原文逐字核验，已完成步骤须有历史行动、结果和当前本地条件；不能用来绕过固定支线或重复领取。" },
  instanceId: { type: "string", description: "复制taskJournal.id；普通任务是quest:原ID，固定任务使用实例ID。不要自行编造或用阶段ID。" }, actionQuote: { type: "string" }, evidence: { type: "string" }, start: { type: "boolean" },
  outcome: { type: "string", enum: ["progress", "blocked", "failed", "recover", "claim"] },
  steps: { type: "array", maxItems: 3, items: { type: "object", required: ["objectiveId"], properties: {
    objectiveId: { type: "string" }, actionQuote: { type: "string" }, evidence: { type: "string" },
  } } },
  legacyPlan: { type: "object", required: ["coreGoal", "nodes", "completionConditions", "evidenceIds"], additionalProperties: false, properties: {
    coreGoal: { type: "string", description: "必须逐字保留旧任务当前冻结的原核心目标，不能改写" },
    nodes: { ...QUEST_INPUT_SCHEMA.properties.contract.properties.nodes, maxItems: 3, minItems: 1 },
    completionConditions: { ...conditions, minItems: 1 }, evidenceIds: { type: "array", minItems: 1, items: { type: "string" }, description: "已经登记的线索ID或triggerState事实key" },
  }, description: "仅针对无有限契约的旧复杂任务，玩家真实调查时一次性补录1—3个可验证阶段。不能修改原目标/奖励。须有具体事实完成条件，补录本身不推进、不自动领奖；后续按steps实际执行。" },
};
