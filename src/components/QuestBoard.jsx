import { useEffect, useRef, useState } from "react";
import { projectQuestJournal, questAssistance } from "../engine/questRuntime.js";
import { triggerGuidance } from "../engine/triggerGuidance.js";
import { getMapLocation } from "../system/map.js";
import { inspectQuestTracking } from "../services/questTracking.js";
import { formatMoney, moneyFromPence } from "../system/money.js";
import styles from "./QuestBoard.module.css";

const FILTERS = [["active", "进行中"], ["issued", "我发布的委托"], ["opportunities", "可接机会"], ["archive", "归档"]];
const STATUS = { available: "尚未接受", engaged: "正在追踪", completed: "已完成", failed: "已失败", abandoned: "已放下", expired: "已过期" };
const duration = minutes => minutes >= 60 ? `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分钟` : ""}` : `${minutes}分钟`;

function CommissionDetails({ task, relatedTitle }) {
  const view = task.commission;
  return <div className={styles.commission}>
    <p className={styles.hint}>委托人 · 你 ／ 受托人 · {view.executorName}</p>
    <div className={styles.terms}><span>费用 <strong>{formatMoney(moneyFromPence(view.feePence))}</strong> · {view.feePaid ? "已支付" : "未支付"}</span><span>调查时间 {duration(view.durationMinutes)}</span></div>
    {view.dueAt && <p className={styles.hint}>约定交付 · {view.dueAt}</p>}
    {["investigating", "ready"].includes(view.phase) && <label className={styles.progress}>约定时间进度 · {view.progress}%{view.phase === "investigating" ? ` · 剩余${duration(view.remainingMinutes)}` : " · 报告可领取"}<progress max="100" value={view.progress} /></label>}
    {view.phase === "offered" && <p className={styles.hint}>确认后一次支付费用并开始计时。取消已开展的调查，费用不退还；报告包含1—2条线索。</p>}
    {relatedTitle && <p className={styles.hint}>关联调查 · {relatedTitle}</p>}
    <details open={view.phase === "collected"}><summary>{view.report ? "调查报告与委托记录" : "委托记录"}</summary>
      {view.report && <div className={styles.report}><p>{view.report.summary}</p><ol>{view.report.clues.map(clue => <li key={clue.id}><strong>{clue.title}</strong><p>{clue.detail}</p></li>)}</ol><p>领取时间 · {view.report.collectedAt}</p></div>}
      <ul className={styles.history}>{view.history.slice(-6).map((entry, index) => <li key={index}><span>{entry.note}</span><small>{entry.worldTime}</small></li>)}</ul>
    </details>
  </div>;
}

export default function QuestBoard({ game, onAction, disabled, selectedId }) {
  const [filter, setFilter] = useState("active");
  const [routeTask, setRouteTask] = useState(null);
  const [notice, setNotice] = useState("");
  const [cancellingId, setCancellingId] = useState(null);
  const focused = useRef(null);
  const projection = projectQuestJournal(game);
  const selectedGroup = selectedId && FILTERS.find(([key]) => projection[key].some(task => task.id === selectedId))?.[0];
  const [visitedSelection, setVisitedSelection] = useState(null);
  const shownFilter = selectedId && selectedId !== visitedSelection && selectedGroup ? selectedGroup : filter;
  useEffect(() => {
    if (selectedId && focused.current) {
      focused.current.focus();
      focused.current.scrollIntoView({ block: "nearest" });
    }
  }, [selectedId, shownFilter]);
  const tasks = projection[shownFilter];
  const track = (task, routeId) => {
    const request = { id: task.id, revision: task.revision, ...(routeId ? { routeId } : {}) };
    const plan = inspectQuestTracking(game, request);
    if (!plan.ok) { setNotice(plan.reason); return; }
    if (plan.kind === "choice") { setRouteTask(task.id); setNotice(plan.reason); return; }
    setNotice(plan.kind === "commission-status" ? plan.reason : ""); setRouteTask(null); setCancellingId(null);
    onAction(plan.action || `继续追踪任务「${task.title}」`, { questTrackingRequest: request });
  };
  return <section className={styles.board} aria-label="任务簿">
    <div className={styles.heading}><div><p>调查手记</p><h3>每次，推进一件事</h3></div><span>{projection.active.length} 项进行中</span></div>
    <nav className={styles.filters} aria-label="任务状态">{FILTERS.map(([key, label]) => <button key={key} type="button" aria-pressed={shownFilter === key} onClick={() => { setFilter(key); setVisitedSelection(selectedId); }}>{label}<span>{projection[key].length}</span></button>)}</nav>
    <p className={styles.hint}>{shownFilter === "active" ? "选择一个目标，继续它的剧情。" : shownFilter === "issued" ? "你发布、受托人执行。查看进度不耗回合；当面确认、询问或领取报告消耗1回合。" : shownFilter === "opportunities" ? "这些只是机会。是否接受，由你决定。" : "已结束的任务保留在这里，方便回顾。"}</p>
    {notice && <p role="status" className={styles.timer}>{notice}</p>}
    {!tasks.length && <div className={styles.empty}>{shownFilter === "active" ? "暂时没有正在追踪的任务。去看看可接机会，或自由探索这座城市。" : shownFilter === "issued" ? "还没有登记你发布的委托。到人物面板拜访夏洛克，提出寻人或调查请求；旧剧情中已接单的委托也可在那里补录。" : shownFilter === "opportunities" ? "目前没有新的可接机会。" : "这里还没有结束的任务。"}</div>}
    {tasks.map(task => {
      const instance = [...(game.triggerState?.active || []), ...(game.triggerState?.history || [])].find(event => event.instanceId === task.id);
      const guidance = instance ? triggerGuidance(game, instance) : { timers: [] };
      const assistance = questAssistance(game, task);
      const tracked = game.trackedQuestId === task.id;
      const locationId = task.locationId || task.targetLocationId;
      const expires = task.expiresAtTurn ?? task.expiresTurn;
      const remaining = Number.isInteger(expires) ? Math.max(0, expires - game.turn) : null;
      return <article key={task.id} className={styles.card} data-tracked={tracked || undefined} tabIndex={-1} ref={task.id === selectedId ? focused : null}>
        <div className={styles.meta}><span>{task.commission ? `${tracked ? "当前追踪 · " : ""}${task.commission.label}` : tracked ? "当前追踪" : STATUS[task.status] || task.status}</span><span>{task.commission ? "我发布的委托" : task.policy?.finale ? "终章" : task.source === "特殊行动" ? "日常委托" : "案件"}</span></div>
        <h4>{task.title}</h4><p className={styles.objective}>{task.objective || task.summary}</p>
        {locationId && <p className={styles.hint}>地点 · {getMapLocation(locationId, game)?.name || "待调查"}</p>}
        {shownFilter === "opportunities" && remaining != null && <p className={styles.timer}>剩余 {remaining} 回合可接受</p>}
        {guidance.timers.map(timer => <p key={timer.id} className={styles.timer} role="status">剩余 {timer.remaining} 次行动{timer.remaining <= 1 ? " · 请立即脱离危险" : ""}</p>)}
        {task.treatmentReady != null && task.status === "engaged" && <p className={styles.hint}>{task.treatmentReady ? "已具备治疗条件 · 返回雷纳德宅邸" : "治疗准备 0/1 · 寻找治疗药剂或药师埃德蒙"}</p>}
        {task.commission ? <CommissionDetails task={task} relatedTitle={Object.values(game.questJournal?.entries || {}).find(entry => entry.id === task.commission.relatedQuestId)?.title} /> : <details><summary>案件详情</summary><p>{task.summary}</p>{assistance?.text && <p>{assistance.text}</p>}</details>}
        {task.commission && task.status === "engaged" ? <div className={styles.routes}>
          <button className={styles.track} type="button" disabled={disabled || !onAction} onClick={() => track(task)}>查看并追踪进度 · 不耗回合</button>
          <button className={styles.primary} type="button" disabled={disabled || !onAction} onClick={() => track(task, `commission:${task.commission.phase === "offered" ? "accept" : task.commission.phase === "ready" ? "collect" : "check"}`)}>{game.location.id !== task.locationId ? "前往受托人处 · 到达后再操作" : task.commission.phase === "offered" ? `确认委托 · ${formatMoney(moneyFromPence(task.commission.feePence))}` : task.commission.phase === "ready" ? "领取调查报告 · 1回合" : "当面询问进度 · 1回合"}</button>
          {cancellingId === task.id ? <div><p className={styles.timer}>{task.commission.feePaid ? "已开展调查的费用不退还。确认取消这项委托？" : "尚未付款，取消不会扣费。确认取消这项委托？"}</p><div className={styles.routes}><button type="button" disabled={disabled || !onAction} onClick={() => track(task, "commission:cancel")}>确认取消委托</button><button type="button" onClick={() => setCancellingId(null)}>保留委托</button></div></div>
            : <button type="button" disabled={disabled} onClick={() => setCancellingId(task.id)}>取消委托</button>}
        </div> : !task.commission && shownFilter !== "archive" && <button className={tracked ? styles.primary : styles.track} type="button" disabled={disabled || !onAction} onClick={() => track(task)}>{shownFilter === "opportunities" ? "开始追踪任务" : "继续追踪任务"}<span aria-hidden="true"> →</span></button>}
        {routeTask === task.id && <div className={styles.routes}>{(inspectQuestTracking(game, { id: task.id, revision: task.revision }).choices || []).map(route => <button type="button" key={route.routeId} disabled={disabled} onClick={() => track(task, route.routeId)}>{route.label}</button>)}<button type="button" onClick={() => { setRouteTask(null); setNotice(""); }}>暂不行动</button></div>}
      </article>;
    })}
  </section>;
}
