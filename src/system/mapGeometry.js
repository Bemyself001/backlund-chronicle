import { CITY_GEOGRAPHY } from "../content/index.js";

export { CITY_GEOGRAPHY };
export const cellKey = ({ q, r }) => `${q},${r}`;
export const hexDistance = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
export const adjacentHexes = ({ q, r }) => [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => ({ q: q + dq, r: r + dr }));

export function mapPointForHex({ q, r }) {
  const { origin, step } = CITY_GEOGRAPHY;
  return { x: origin + step * q, y: origin + step * (r + q / 2) };
}

export function hexForMapPoint({ x, y }) {
  const { origin, step } = CITY_GEOGRAPHY;
  const q = (Number(x) - origin) / step;
  const r = (Number(y) - origin) / step - q / 2;
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r);
  const rs = Math.round(s);
  if (Math.abs(rq - q) > Math.abs(rr - r) && Math.abs(rq - q) > Math.abs(rs - s)) rq = -rr - rs;
  else if (Math.abs(rr - r) > Math.abs(rs - s)) rr = -rq - rs;
  return { q: rq || 0, r: rr || 0 };
}

const riverRows = new Map(CITY_GEOGRAPHY.river.cells);
const riverKeys = new Set(CITY_GEOGRAPHY.river.cells.map(([q, r]) => cellKey({ q, r })));
const crossingByKey = new Map(CITY_GEOGRAPHY.crossings.map(crossing => [cellKey(crossing), crossing]));
export const crossingAt = hex => crossingByKey.get(cellKey(hex)) || null;
export const isRiverHex = hex => riverKeys.has(cellKey(hex));

export function isCityHex(hex) {
  const { minQ, maxQ, minY, maxY } = CITY_GEOGRAPHY.bounds;
  const { y } = mapPointForHex(hex);
  return Number.isInteger(hex.q) && Number.isInteger(hex.r) && hex.q >= minQ && hex.q <= maxQ && y >= minY && y <= maxY;
}

export function districtAt(hex) {
  if (!isCityHex(hex) || isRiverHex(hex)) return crossingAt(hex) ? "桥区" : null;
  const { x, y } = mapPointForHex(hex);
  const bank = hex.r > riverRows.get(hex.q) ? "south" : "north";
  return CITY_GEOGRAPHY.districts.find(d => d.bank === bank && x >= d.minX && x < d.maxX && y >= d.minY && y < d.maxY)?.name || null;
}

export const isPassableCityHex = hex => isCityHex(hex) && (!isRiverHex(hex) || Boolean(crossingAt(hex)));

export const CITY_HEXES = [];
for (let q = CITY_GEOGRAPHY.bounds.minQ; q <= CITY_GEOGRAPHY.bounds.maxQ; q += 1) {
  for (let r = -20; r <= 20; r += 1) {
    if (isCityHex({ q, r })) CITY_HEXES.push({ q, r });
  }
}

export function nearestCityHex(origin, { district, occupied = new Set() } = {}) {
  return CITY_HEXES.filter(hex => isPassableCityHex(hex) && !isRiverHex(hex) && (!district || districtAt(hex) === district) && !occupied.has(cellKey(hex)))
    .sort((a, b) => hexDistance(a, origin) - hexDistance(b, origin) || a.q - b.q || a.r - b.r)[0] || null;
}

/** 单位边权的最短道路；预览与实际移动共用，水面只能经大桥通行。 */
export function cityRoute(from, to) {
  if (!isPassableCityHex(from) || !isPassableCityHex(to)) return null;
  const target = cellKey(to);
  const queue = [from];
  const previous = new Map([[cellKey(from), null]]);
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    if (cellKey(current) === target) {
      const path = [];
      for (let cursor = current; cursor; cursor = previous.get(cellKey(cursor))) path.push(cursor);
      return path.reverse();
    }
    for (const next of adjacentHexes(current)) {
      if (!isPassableCityHex(next) || previous.has(cellKey(next))) continue;
      previous.set(cellKey(next), current);
      queue.push(next);
    }
  }
  return null;
}
