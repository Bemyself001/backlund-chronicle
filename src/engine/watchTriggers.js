function hasFact(game, key) {
  return Boolean(game.triggerState?.facts?.[key]);
}

function appendDiscovery(item, text) {
  const current = String(item.discoveredInfo || item.description || "").trim();
  if (!current.includes(text)) item.discoveredInfo = `${current} ${text}`.trim();
}

export function inspectHeirloomWatch(game, item, turn) {
  const evidenceId = `watch-inspect-${turn}-${item.instanceId}`;
  let factId;
  let text;
  if (!hasFact(game, "watch.exterior-inspected")) {
    factId = "watch.exterior-inspected";
    text = "擦去表盖边缘的暗垢后，你发现内盖有一圈并非装饰的浅刻痕，部分笔画被长期摩挲得发亮。";
  } else if (!hasFact(game, "watch.inscription-found")) {
    factId = "watch.inscription-found";
    text = "顺着浅刻痕逐字辨认，你认出缩写“R.A.”与年份“1332”；上紧发条后，秒针每逢整点都会无故迟滞半拍。";
  } else if (!hasFact(game, "watch.mechanism-opened")) {
    factId = "watch.mechanism-opened";
    text = "你谨慎掀开机芯护盖，发现一枚螺钉的磨损方向与其余不同，下面压着一片可以活动的薄黄铜隔板。";
  } else if (!hasFact(game, "watch.note-recovered")) {
    factId = "watch.note-recovered";
    text = "移开隔板后，一卷极薄的纸条从机芯夹层里松脱出来；纸上是陌生速记符号，末尾重复着与内盖相同的“R.A.”。";
  } else {
    text = "怀表的刻字、整点迟滞与机芯夹层都已经检查过；那卷速记纸条仍需要可靠的人或资料来辨认。";
  }
  appendDiscovery(item, text);
  return {
    text,
    data: factId ? {
      discovery: { factId, itemId: item.itemId, instanceId: item.instanceId },
      triggerSignals: [{
        id: `signal:${evidenceId}:${factId}`,
        kind: "fact.discovered",
        factId,
        itemId: item.itemId,
        instanceId: item.instanceId,
        evidenceIds: [evidenceId],
        text,
      }],
    } : { discovery: null, triggerSignals: [] },
  };
}

export const WATCH_TRIGGER_DEFINITIONS = [{
  id: "watch.heirloom.hidden-note",
  category: "personal-story",
  priority: 80,
  oncePerSave: true,
  eligibility: [{ type: "item", itemId: "heirloom-watch" }],
  appearWhen: [{ type: "signal", kind: "fact.discovered", factId: "watch.exterior-inspected" }],
  initialStage: "exterior-inspected",
  expiresAfterTurns: null,
  presentation: {
    title: "家传怀表：磨浅的刻痕",
    text: "怀表外壳上的浅刻痕显然不是普通划痕。你已经看见这条线索，但只有继续拆查，才会正式进入这段家族旧事。",
    choice: { label: "继续检查家传怀表的刻痕（可选）", intent: "trigger", risk: "low" },
  },
  engagedStage: "inscription-found",
  stages: [
    { id: "inscription-found", advanceWhen: [{ type: "fact", key: "watch.mechanism-opened", value: true }], nextStage: "mechanism-opened" },
    { id: "mechanism-opened", advanceWhen: [{ type: "fact", key: "watch.note-recovered", value: true }], nextStage: "note-recovered" },
    {
      id: "note-recovered",
      transitions: [{
        objectiveId: "decode-watch-note",
        description: "寻找可靠的人或资料，译出夹层纸条",
        actionTerms: ["译", "辨认", "解读", "速记", "请教", "查阅"],
        nextStage: "decoded",
        complete: true,
      }],
    },
  ],
  rewards: [
    { id: "watch.hidden-note.formal-quest", type: "fact", key: "watch.formal-quest-unlocked", value: true },
    { id: "watch.hidden-note.decoded-clue", type: "clue", clue: { id: "clue-watch-note-decoded", title: "怀表夹层纸条的译文", detail: "纸条由雷金纳德·阿博特（R.A.）留下，记录了南岸货栈、被替换的整点交接暗号，以及一句仓促写下的警告：不要相信白鸢尾。", kind: "personal_story", locationId: "bridge-docks" } },
  ],
}];
