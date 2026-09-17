import assert from "node:assert/strict";
import test from "node:test";
import { migrateSave } from "../src/services/storage.js";

test("version 1 saves migrate from Grayharbor to Backlund without losing progress", () => {
  const migrated = migrateSave({
    version: 1,
    turn: 8,
    title: "艾琳的灰檐港档案",
    character: { name: "艾琳", background: "在灰檐港生活三年" },
    location: { name: "煤灯街·雾鸦旅店", district: "灰檐港旧钟区" },
    inventory: [{ instanceId: "item-1", name: "旧呢外套", tags: ["任务物品"] }],
    recentDialogues: [{ role: "assistant", content: "灰檐港市档案馆已经关门。" }],
    longTermSummary: "已经听说灰檐港市档案馆的传闻。",
  });
  assert.equal(migrated.version, 13);
  assert.equal(migrated.systemVersion, 2);
  assert.deepEqual(migrated.content, { packId: "backlund-core", schemaVersion: 2, contentVersion: "2026.09.17.1" });
  assert.equal(migrated.turn, 8);
  assert.equal(migrated.title, "艾琳的贝克兰德档案");
  assert.equal(migrated.location.district, "贝克兰德桥区·旧钟街");
  assert.match(migrated.recentDialogues[0].content, /贝克兰德市政档案分馆/);
  assert.deepEqual(migrated.storyHistory, migrated.recentDialogues);
  assert.equal(migrated.memoryState.version, 2);
  assert.equal(migrated.memoryState.throughTurn, 8);
  assert.equal(migrated.memoryState.pending.length, 0);
  assert.equal(migrated.memoryState.digest.events[0].certainty, "reported");
  assert.match(migrated.memoryState.digest.events[0].summary, /贝克兰德市政档案分馆/);
  assert.equal(migrated.inventory[0].name, "旧呢外套");
  assert.equal(migrated.inventory[0].importance, "important");
  assert.equal(migrated.character.advancement.sequenceLabel, "普通人");
  assert.equal(migrated.occult.contact, 0);
  assert.equal(migrated.lastTurnAudit, null);
  assert.deepEqual(migrated.discoveredLocations, []);
  assert.equal(migrated.locationKnowledge["queen-archive"].status, "rumored");
  assert.deepEqual(migrated.mapExtensions, { locations: [], routes: [] });
});

test("dynamic map nodes survive save migration with routes and knowledge intact", () => {
  const migrated = migrateSave({
    version: 8,
    character: { name: "动态地图迁移员" },
    inventory: [],
    location: { id: "east-station", name: "东区·贝克兰德火车站", district: "贝克兰德东区" },
    discoveredLocations: [{ id: "dyn-shop", name: "东区·晚钟书店", note: "已经确认地址。" }],
    locationKnowledge: { "dyn-shop": { status: "discovered", note: "已经确认地址。" } },
    mapExtensions: {
      locations: [{ id: "dyn-shop", name: "东区·晚钟书店", district: "东区", x: 73, y: 74, code: "E4", rumor: "有人听说过这家店。", description: "一家只在夜间营业的书店。", source: "dynamic", scope: "landmark", kind: "shop", anchorId: "iron-gate", temporary: false, lifecycle: "active", createdTurn: 4 }],
      routes: [{ from: "iron-gate", to: "dyn-shop", minutes: 11, transport: "步行", source: "dynamic" }],
    },
  });
  assert.equal(migrated.version, 13);
  assert.equal(migrated.mapExtensions.locations[0].id, "dyn-shop");
  assert.equal(migrated.mapExtensions.routes[0].to, "dyn-shop");
  assert.equal(migrated.locationKnowledge["dyn-shop"].status, "discovered");
});

test("structured advancement repairs contradictory legacy ordinary fields", () => {
  const migrated = migrateSave({
    version: 9,
    character: {
      name: "档案同步员",
      extraordinary: "ordinary",
      pathway: "无",
      stats: { health: 10, maxHealth: 10, sanity: 9, maxSanity: 10, spirituality: 7, maxSpirituality: 8 },
      advancement: { type: "extraordinary", pathwayId: "seer", pathwayName: "占卜家", sequence: 9, sequenceLabel: "序列9", status: "newly_promoted" },
    },
    inventory: [],
  });
  assert.equal(migrated.version, 13);
  assert.equal(migrated.character.extraordinary, "low");
  assert.equal(migrated.character.pathway, "占卜家（序列9）");
  assert.equal(migrated.character.advancement.unlockedAbilities.length, 3);
});

test("legacy copper coin items migrate into the separate money wallet", () => {
  const migrated = migrateSave({
    version: 3,
    character: { name: "钱币迁移员", extraordinary: "ordinary", pathway: "无" },
    inventory: [{ instanceId: "coins", itemId: "copper-coins", name: "铜便士", category: "货币", quantity: 18 }],
  });
  assert.deepEqual(migrated.money, { pounds: 0, solers: 1, pence: 6 });
  assert.equal(migrated.inventory.length, 0);
});

test("legacy occult entries migrate into trigger state with a fresh ten-turn grace period", () => {
  const migrated = migrateSave({
    version: 11,
    id: "legacy-entry-save",
    turn: 27,
    character: { name: "旧入口迁移员", extraordinary: "ordinary", pathway: "无" },
    inventory: [],
    occult: {
      contact: 0,
      entryAvailable: true,
      currentEntry: { id: "occult-entry-25", turn: 25, title: "旧非凡入口", text: "旧线索", choice: { label: "追查旧线索", intent: "occult", risk: "medium" } },
      entryHistory: [{ id: "occult-entry-20", turn: 20, title: "更早的入口" }],
    },
  });
  const active = migrated.triggerState.active.find((entry) => entry.instanceId === "occult-entry-25");
  assert.equal(active.status, "available");
  assert.equal(active.expiresTurn, 37);
  assert.equal(migrated.triggerState.history.find((entry) => entry.instanceId === "occult-entry-20")?.status, "expired");
  assert.equal(migrated.occult.currentEntry.id, "occult-entry-25");
});

test("watch story content migration inherits the player surname and defers premature memories", () => {
  const migrated = migrateSave({
    version: 13,
    systemVersion: 2,
    id: "watch-content-migration",
    turn: 6,
    content: { packId: "backlund-core", schemaVersion: 2, contentVersion: "2026.09.14" },
    character: { name: "克莱恩·莫雷蒂", extraordinary: "ordinary", pathway: "无" },
    inventory: [{ instanceId: "watch-1", itemId: "heirloom-watch", name: "家传怀表", description: "雷金纳德·阿博特留下的怀表。", tags: ["重要物品", "已查明"] }],
    clues: [{ id: "clue-reginald-abbott-history", title: "雷金纳德·阿博特的旧档", detail: "R.A.曾在南岸活动。" }],
    storyHistory: [{ role: "assistant", content: "雷金纳德·阿博特已经失踪。" }],
    longTermSummary: "R.A.是主角失踪的舅舅。",
    triggerState: {
      version: 2,
      active: [
        {
          instanceId: "watch-discovery-old",
          definitionId: "watch.heirloom.hidden-note",
          definitionVersion: 1,
          category: "personal-story",
          status: "available",
          stage: "exterior-inspected",
          createdTurn: 1,
          presentation: { title: "家传怀表", text: "雷金纳德·阿博特留下了一道刻痕。" },
        },
        {
          instanceId: "watch-main-old",
          definitionId: "watch.heirloom.late-hour",
          definitionVersion: 1,
          category: "personal-story",
          status: "engaged",
          stage: "trace-reginald",
          createdTurn: 3,
          engagedTurn: 4,
          presentation: { title: "迟到的整点", text: "追查雷金纳德·阿博特。" },
        },
      ],
      history: [],
      facts: { "watch.ra-released": { value: true, firstTurn: 5, evidenceIds: ["old-release"] } },
      rewardsClaimed: [],
      nextInitialOccultWindow: 10,
    },
  });

  assert.equal(migrated.content.contentVersion, "2026.09.17.1");
  const discovery = migrated.triggerState.active.find((entry) => entry.instanceId === "watch-discovery-old");
  assert.equal(discovery.status, "eligible");
  assert.equal(discovery.stage, "eligible");
  assert.equal(discovery.presentation, undefined);
  const main = migrated.triggerState.active.find((entry) => entry.instanceId === "watch-main-old");
  assert.equal(main.stage, "trace-uncle");
  assert.match(main.presentation.text, /雷金纳德·莫雷蒂/);
  assert.equal(migrated.triggerState.facts["watch.ra-released"], undefined);
  assert.equal(migrated.triggerState.facts["watch.uncle-released"].value, true);
  assert.match(migrated.storyHistory[0].content, /雷金纳德·莫雷蒂/);
  assert.match(migrated.longTermSummary, /雷金纳德·莫雷蒂/);
  assert.equal(migrated.clues[0].id, "clue-missing-uncle-history");
  assert.match(migrated.clues[0].detail, /雷金纳德·莫雷蒂/);
  assert.match(migrated.inventory[0].description, /雷金纳德·莫雷蒂/);
  assert.doesNotMatch(JSON.stringify(migrated), /雷金纳德·阿博特|R\.A\./);
});
