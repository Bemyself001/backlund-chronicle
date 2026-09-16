import { WATCH_NOTE_DETAIL } from "./watchNote.js";

export const CONTENT_MIGRATIONS = [
  {
    id: "backlund.watch-note-runic-text", fromVersion: "2026.09.16.4", toVersion: "2026.09.16.5",
    cluePatches: [{ id: "clue-watch-note-decoded", patch: { detail: WATCH_NOTE_DETAIL } }],
    definitionRefreshes: [
      ...["watch.heirloom.hidden-note", "watch.heirloom.late-hour"].map(definitionId => ({ definitionId, toDefinitionVersion: 7, refreshPresentation: true })),
    ],
    textReplacementFields: ["recentDialogues", "storyHistory", "longTermSummary", "memoryState", "memoryNotes", "clues", "quests", "questJournal", "triggerState", "inventory", "changeLog", "choices"],
    textReplacements: [
      { from: "舅舅的速记", to: "鲁恩文字与神秘符号交错组成的文字" },
      { from: "陌生的速记符号", to: "错落在神秘符号之间的鲁恩文字" },
      { from: "陌生速记符号", to: "错落在神秘符号之间的鲁恩文字" },
      { from: "速记", to: "鲁恩文字与神秘符号" },
    ],
  },
  {
    id: "backlund.watch-note-white-iris", fromVersion: "2026.09.16.3", toVersion: "2026.09.16.4",
    cluePatches: [{ id: "clue-watch-note-decoded", patch: { detail: WATCH_NOTE_DETAIL } }],
    definitionRefreshes: [
      ...["watch.heirloom.hidden-note", "watch.heirloom.late-hour"].map(definitionId => ({ definitionId, toDefinitionVersion: 6, refreshPresentation: true })),
    ],
    textReplacementFields: ["recentDialogues", "storyHistory", "longTermSummary", "memoryState", "memoryNotes", "clues", "quests", "questJournal", "triggerState", "inventory", "changeLog", "choices"],
    textReplacements: [{ from: "白蔷薇", to: "白鸢尾" }],
  },
  {
    id: "backlund.fixed-watch-note", fromVersion: "2026.09.16.2", toVersion: "2026.09.16.3",
    cluePatches: [{ id: "clue-watch-note-decoded", patch: { detail: WATCH_NOTE_DETAIL } }],
    definitionRefreshes: [
      ...["watch.heirloom.hidden-note", "watch.heirloom.late-hour"].map(definitionId => ({ definitionId, toDefinitionVersion: 5, refreshPresentation: true })),
    ],
  },
  {
    id: "backlund.investigation-guidance", fromVersion: "2026.09.16.1", toVersion: "2026.09.16.2",
    definitionRefreshes: [
      ...["watch.heirloom.hidden-note", "watch.heirloom.late-hour"].map(definitionId => ({ definitionId, toDefinitionVersion: 4, refreshPresentation: true })),
      ...["side.queens.renard-fall", "side.bridge.silent-detonator", "side.bridge.ebb-iron-door"].map(definitionId => ({ definitionId, toDefinitionVersion: 3, refreshPresentation: true })),
    ],
  },
  {
    id: "backlund.investigation-flow", fromVersion: "2026.09.15.1", toVersion: "2026.09.16.1",
    definitionRefreshes: [
      { definitionId: "watch.heirloom.hidden-note", toDefinitionVersion: 3, refreshPresentation: true },
      { definitionId: "watch.heirloom.late-hour", toDefinitionVersion: 3, refreshPresentation: true },
      ...["side.queens.renard-fall", "side.bridge.silent-detonator", "side.bridge.ebb-iron-door"].map(definitionId => ({ definitionId, toDefinitionVersion: 2, refreshPresentation: true, clearExpiry: true })),
    ],
  },
  { id: "backlund.special-actions", fromVersion: "2026.09.14.1", toVersion: "2026.09.15.1", factRenames: [], triggerStages: [] },
  {
    id: "backlund.legacy-to-2026.09.14",
    fromVersion: "legacy",
    toVersion: "2026.09.14",
    triggerStages: [],
    factRenames: [],
  },
  {
    id: "backlund.2026.09.11-to-2026.09.14",
    fromVersion: "2026.09.11",
    toVersion: "2026.09.14",
    triggerStages: [],
    factRenames: [],
  },
  {
    id: "backlund.2026.09.14-to-2026.09.14.1",
    fromVersion: "2026.09.14",
    toVersion: "2026.09.14.1",
    factRenames: [
      { from: "watch.ra-found-alive", to: "watch.uncle-found-alive" },
      { from: "watch.ra-sequence-confirmed", to: "watch.uncle-sequence-confirmed" },
      { from: "watch.ra-release-chosen", to: "watch.uncle-release-chosen" },
      { from: "watch.ra-released", to: "watch.uncle-released" },
    ],
    textReplacementFields: ["recentDialogues", "storyHistory", "longTermSummary", "memoryState", "memoryNotes", "lastTurnAudit", "triggerState", "clues", "inventory"],
    textReplacements: [
      { from: "雷金纳德·阿博特", to: "雷金纳德{characterSurnameSuffix}" },
      { from: "R.A.", to: "雷金纳德{characterSurnameSuffix}" },
    ],
    definitionRefreshes: [
      {
        definitionId: "watch.heirloom.hidden-note",
        toDefinitionVersion: 2,
        refreshPresentation: true,
        deferAvailableUntil: [{ type: "fact", key: "watch.note-recovered", value: true }],
        stageMap: {
          "exterior-inspected": "note-recovered",
          "inscription-found": "note-recovered",
          "mechanism-opened": "note-recovered",
        },
      },
      {
        definitionId: "watch.heirloom.late-hour",
        toDefinitionVersion: 2,
        refreshPresentation: true,
        stageMap: {
          "trace-reginald": "trace-uncle",
          "find-reginald": "find-uncle",
        },
      },
    ],
    cluePatches: [
      { id: "clue-watch-note-decoded", patch: { title: "雷金纳德{characterSurnameSuffix}留下的怀表纸条", detail: WATCH_NOTE_DETAIL } },
      { id: "clue-reginald-abbott-history", patch: { id: "clue-missing-uncle-history", title: "雷金纳德{characterSurnameSuffix}失踪前的旧档", detail: "主角的舅舅雷金纳德{characterSurnameSuffix}曾是通识者途径序列9，失踪前在南岸货栈追查魔女会的军火与文物交接。" } },
      { id: "clue-reginald-forced-advancement", patch: { id: "clue-uncle-forced-advancement", detail: "雷金纳德{characterSurnameSuffix}已被魔女会强行从序列9通识者晋升为序列8考古学家；他仍会使用机械、枪械与炸药，却已失去自主行动能力。" } },
    ],
    itemPatches: [
      { itemId: "archaeologist-characteristic", patch: { description: "舅舅雷金纳德{characterSurnameSuffix}死后析出的序列8“考古学家”非凡特性。它不是可直接服用的魔药；通识者仍需配方、消化与调制，其他途径贸然使用极其危险。", source: "雷金纳德{characterSurnameSuffix}的遗留" } },
      { itemId: "heirloom-watch", requiredTags: ["已查明"], patch: { description: "舅舅雷金纳德{characterSurnameSuffix}留下的家传怀表。它已经停止走动，成为一件被查明来历的纪念物。" } },
    ],
  },
];
