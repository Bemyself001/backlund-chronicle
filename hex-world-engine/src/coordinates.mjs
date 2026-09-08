/**
 * 坐标数学层 —— 六边形网格的"物理定律"
 * 采用轴坐标（axial coordinates）：每格 (q, r)。
 * 全部为纯函数，不读状态、不产生副作用。
 */

/** 六个邻接方向，顺序与名称固定，永不更改 */
export const DIRECTIONS = [
  { name: "东北", dq: 1, dr: -1 },
  { name: "东",   dq: 1, dr: 0 },
  { name: "东南", dq: 0, dr: 1 },
  { name: "西南", dq: -1, dr: 1 },
  { name: "西",   dq: -1, dr: 0 },
  { name: "西北", dq: 0, dr: -1 },
];

/** 格子的字符串键，用于状态表索引 */
export function key(q, r) {
  return `${q},${r}`;
}

/** 某格的六个邻居，携带方向名 */
export function neighbors(q, r) {
  return DIRECTIONS.map((d) => ({ q: q + d.dq, r: r + d.dr, direction: d.name }));
}

/** 两格之间的格数距离（六边形距离公式） */
export function distance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** 立方坐标螺旋：以 (cq, cr) 为中心、半径 radius 的完整环（radius 圈） */
export function ringAround(cq, cr, radius) {
  if (radius === 0) return [{ q: cq, r: cr }];
  const results = [];
  // 从西方向起点出发，沿六条边走
  let q = cq + DIRECTIONS[4].dq * radius;
  let r = cr + DIRECTIONS[4].dr * radius;
  for (let side = 0; side < 6; side += 1) {
    for (let step = 0; step < radius; step += 1) {
      results.push({ q, r });
      q += DIRECTIONS[side].dq;
      r += DIRECTIONS[side].dr;
    }
  }
  return results;
}

/** 中心格 radius 圈内的所有格子（含中心） */
export function areaWithin(cq, cr, radius) {
  const results = [];
  for (let dq = -radius; dq <= radius; dq += 1) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr += 1) {
      results.push({ q: cq + dq, r: cr + dr });
    }
  }
  return results;
}

/** 由方向名解析位移；找不到返回 null */
export function directionByName(name) {
  return DIRECTIONS.find((d) => d.name === name) || null;
}
