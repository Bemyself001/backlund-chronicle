// 受限数值的统一改动入口：截断到 0 至上限，并在归零 / 恢复时自动维护对应状态。
export const STAT_KEYS = ["health", "sanity", "spirituality"];

export const STAT_LABELS = { health: "生命", sanity: "理智", spirituality: "灵性" };

const COLLAPSE_STATUSES = {
  health: { id: "collapse-health", name: "濒危", kind: "danger", description: "伤势已超出身体负荷，需要立刻获得照料。" },
  sanity: { id: "collapse-sanity", name: "精神恍惚", kind: "danger", description: "现实的轮廓开始晃动，任何刺激都可能留下裂痕。" },
  spirituality: { id: "collapse-spirituality", name: "灵性枯竭", kind: "neutral", description: "灵性暂时见底，非凡能力难以成形。" },
};

// 返回 { stat, label, before, after, delta, autoStatus } 或 null（无变化时）。
export function applyStatDelta(game, stat, requestedDelta) {
  if (!STAT_KEYS.includes(stat) || !Number.isFinite(Number(requestedDelta))) return null;
  const requested = Math.trunc(Number(requestedDelta));
  if (requested === 0) return null;
  const maxKey = `max${stat[0].toUpperCase()}${stat.slice(1)}`;
  const max = Number(game.character.stats[maxKey]);
  const before = Number(game.character.stats[stat]);
  const after = Math.max(0, Math.min(max, before + requested));
  if (after === before) return null;
  game.character.stats[stat] = after;
  const collapse = COLLAPSE_STATUSES[stat];
  const existing = game.statusEffects.find((entry) => entry.id === collapse.id);
  let autoStatus = null;
  if (after === 0 && !existing) {
    game.statusEffects.push({ ...collapse });
    autoStatus = `自动附加状态「${collapse.name}」`;
  } else if (after > 0 && existing) {
    game.statusEffects = game.statusEffects.filter((entry) => entry.id !== collapse.id);
    autoStatus = `自动解除状态「${collapse.name}」`;
  }
  return { stat, label: STAT_LABELS[stat], before, after, delta: after - before, requested, autoStatus };
}
