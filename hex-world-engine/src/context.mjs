/**
 * 查询层 —— 给 AI 打包上下文的出口
 * 把引擎真相翻译成自然语言；AI 只读这里的话，永远不读坐标。
 */
import { key, neighbors, areaWithin, distance } from "./coordinates.mjs";
import { terrainAt, terrainLabel } from "./generation.mjs";

/** 一格的一行描述（含未知遮蔽） */
function describeTile(state, q, r) {
  const tile = state.tiles[key(q, r)];
  if (!tile?.discovered) return "未知区域";
  return `${terrainLabel(tile.terrain)}${tile.name ? `「${tile.name}」` : ""}`;
}

/**
 * 当前位置包：当前格 + 六邻格，自然语言。
 * 每轮请求时拼进 AI 的上下文。
 */
export function describeSurroundings(state) {
  const here = state.tiles[key(state.player.q, state.player.r)] || terrainAt(state, state.player.q, state.player.r);
  const lines = neighbors(state.player.q, state.player.r).map(
    (n) => `- ${n.direction}：${describeTile(state, n.q, n.r)}`,
  );
  return [
    `【当前位置】${terrainLabel(here.terrain)}${here.name ? `「${here.name}」` : ""}`,
    "【周围】",
    ...lines,
  ].join("\n");
}

/**
 * 已知地名索引：所有已发现且有名称的格子，
 * 附方向与距离描述，供 AI 在叙事中引用远方目标。
 */
export function describeKnownLocations(state) {
  const entries = [];
  for (const [k, tile] of Object.entries(state.tiles)) {
    if (!tile.discovered || !tile.name) continue;
    const [q, r] = k.split(",").map(Number);
    const d = distance(state.player, { q, r });
    entries.push(`- 「${tile.name}」（${terrainLabel(tile.terrain)}，距此 ${d} 格）`);
  }
  return entries.length ? `【已知地点】\n${entries.join("\n")}` : "【已知地点】尚无";
}

/** 视野内已发现格的汇总统计（调试/界面用） */
export function mapSummary(state) {
  const total = Object.values(state.tiles).filter((t) => t.discovered).length;
  const named = Object.values(state.tiles).filter((t) => t.discovered && t.name).length;
  return { discoveredTiles: total, namedLocations: named, turn: state.turn };
}
