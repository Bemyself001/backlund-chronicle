/**
 * 生成层 —— 种子驱动的确定性世界生成
 * 未知地块在第一次被查询时，由 (seed, q, r) 哈希确定地形：
 * 同一坐标在任何时刻、任何设备上得到同一结果。
 */

/** FNV-1a 稳定哈希：任意字符串 → uint32 */
export function stableHash(...parts) {
  let hash = 2166136261;
  for (const character of parts.join("|")) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

/** 地形表：重复项即权重（平原最多，山地/河流最少） */
export const TERRAINS = [
  "plain", "plain", "plain",
  "forest", "forest",
  "hill", "hill",
  "mountain",
  "river",
];

export const TERRAIN_LABELS = {
  plain: "平原",
  forest: "森林",
  hill: "丘陵",
  mountain: "山地",
  river: "河流",
};

/** 不可通行的地形 */
export const IMPASSABLE_TERRAINS = new Set(["mountain"]);

/**
 * 查询某坐标的地形（惰性生成）。
 * 已存在于状态表中的直接返回；否则按种子哈希计算，不写状态。
 * 返回 tile 的普通对象，调用方决定是否登记/揭开。
 */
export function terrainAt(state, q, r) {
  const existing = state.tiles[`${q},${r}`];
  if (existing) return existing;
  const h = stableHash(state.seed, "terrain", q, r);
  return {
    terrain: TERRAINS[h % TERRAINS.length],
    name: null,
    discovered: false,
    features: [],
  };
}

/**
 * 从候选格集合中确定性抽签。
 * 以 (seed, salt, turn) 为熵源：同一提议在同一局同一轮永远选中同一格。
 */
export function deterministicPick(state, candidates, salt) {
  if (!candidates.length) return null;
  const h = stableHash(state.seed, "pick", String(salt), state.turn);
  return candidates[h % candidates.length];
}

export function terrainLabel(terrain) {
  return TERRAIN_LABELS[terrain] || terrain;
}
