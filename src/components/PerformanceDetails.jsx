import { useSyncExternalStore } from "react";
import { recentUsage, subscribeUsage, usageSnapshot } from "../services/usageHistory.js";
import styles from "./GamePanels.module.css";

const phases = { planning: "状态规划", narrative: "最终叙事", draft: "剧情草稿", repair: "工具修复", choices: "行动选项", memory: "记忆整理", inspection: "物品检查", prayer: "祷文", loadout: "开局行装" };
const token = value => value == null ? "未返回" : String(value);
const rate = value => value == null ? "未返回" : `${value}%`;

export default function PerformanceDetails({ game }) {
  const events = useSyncExternalStore(subscribeUsage, () => usageSnapshot(game.id));
  const recent = recentUsage(events);
  const metrics = game.lastTurnMetrics;
  return <details><summary>技术详情与性能</summary>
    <p className={styles.muted}>状态记录以本地确认结果为准。用量来自接口实际返回，包含重试、失败及后台整理；不完整用量不等于零消耗。</p>
    {metrics ? <dl className={styles.dataList}>{[
      ["状态规划", `${metrics.planningMs} ms`], ["首段正文", metrics.firstNarrativeMs == null ? "—" : `${metrics.firstNarrativeMs} ms`],
      ["整轮完成", `${metrics.totalMs} ms`], ["本轮请求", metrics.modelRequests], ["本轮缓存命中", rate(metrics.cacheHitRate)],
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <p className={styles.muted}>暂无已完成回合计时。</p>}
    {metrics?.confirmationWaitMs > 0 && <p className={styles.muted}>其中等待确认 {metrics.confirmationWaitMs} ms</p>}
    {events.length > 0 && <>
      <h4>最近 {recent.turnCount} 个轮次的请求</h4>
      <p className={styles.muted}>最多保留160次请求，含未完成回合与后台请求；仅保存在本机，不随存档导出。</p>
      <dl className={styles.dataList}>{[
        ["实际请求", recent.modelRequests], ["重试", recent.retryRequests], ["失败 / 中止", `${recent.failedRequests} / ${recent.abortedRequests}`],
        ["输入 Token", token(recent.promptTokens)], ["命中 / 未命中", `${token(recent.cacheHitTokens)} / ${token(recent.cacheMissTokens)}`],
        ["完整明细的命中率", rate(recent.cacheHitRate)], ["输出 Token", token(recent.completionTokens)], ["其中推理 Token", token(recent.reasoningTokens)],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {(recent.incompleteUsageRequests > 0 || recent.incompleteCacheRequests > 0) && <p className={styles.muted}>统计不完整：{recent.incompleteUsageRequests} 次请求缺少完整用量，{recent.incompleteCacheRequests} 次缺少缓存明细。以上合计仅包含已返回数据。</p>}
      <h4>按阶段查看</h4>
      {Object.entries(recent.phases || {}).map(([phase, entry]) => <div className={styles.record} key={phase}><strong>{phases[phase] || "其他请求"} · {entry.requests} 次</strong><p className={styles.muted}>输入 {token(entry.promptTokens)} · 未命中 {token(entry.cacheMissTokens)} · 缓存 {rate(entry.cacheHitRate)}</p></div>)}
    </>}
  </details>;
}
