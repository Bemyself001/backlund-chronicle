import { useEffect, useRef, useState } from "react";
import { projectQuestJournal, questAssistance } from "../engine/questRuntime.js";
import { triggerGuidance } from "../engine/triggerGuidance.js";
import { getMapLocation } from "../system/map.js";
import { inspectQuestTracking } from "../services/questTracking.js";
import styles from "./QuestBoard.module.css";

const FILTERS = [["active", "进行中"], ["opportunities", "可接机会"], ["archive", "归档"]];
const STATUS = { available: "尚未接受", engaged: "正在追踪", completed: "已完成", failed: "已失败", abandoned: "已放下", expired: "已过期" };

export default function QuestBoard({ game, onAction, disabled, selectedId }) {
  const [filter, setFilter] = useState("active");
  const [routeTask, setRouteTask] = useState(null);
  const [notice, setNotice] = useState("");
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
    setNotice(""); setRouteTask(null);
    onAction(plan.action || `继续追踪任务「${task.title}」`, { questTrackingRequest: request });
  };
  return <section className={styles.board} aria-label="任务簿">
    <div className={styles.heading}><div><p>调查手记</p><h3>每次，推进一件事</h3></div><span>{projection.active.length} 项进行中</span></div>
    <nav className={styles.filters} aria-label="任务状态">{FILTERS.map(([key, label]) => <button key={key} type="button" aria-pressed={shownFilter === key} onClick={() => { setFilter(key); setVisitedSelection(selectedId); }}>{label}<span>{projection[key].length}</span></button>)}</nav>
    <p className={styles.hint}>{shownFilter === "active" ? "选择一个目标，继续它的剧情。" : shownFilter === "opportunities" ? "这些只是机会。是否接受，由你决定。" : "已结束的任务保留在这里，方便回顾。"}</p>
    {notice && <p role="status" className={styles.timer}>{notice}</p>}
    {!tasks.length && <div className={styles.empty}>{shownFilter === "active" ? "暂时没有正在追踪的任务。去看看可接机会，或自由探索这座城市。" : shownFilter === "opportunities" ? "目前没有新的可接机会。" : "这里还没有结束的任务。"}</div>}
    {tasks.map(task => {
      const instance = [...(game.triggerState?.active || []), ...(game.triggerState?.history || [])].find(event => event.instanceId === task.id);
      const guidance = instance ? triggerGuidance(game, instance) : { timers: [] };
      const assistance = questAssistance(game, task);
      const tracked = game.trackedQuestId === task.id;
      const locationId = task.locationId || task.targetLocationId;
      const expires = task.expiresAtTurn ?? task.expiresTurn;
      const remaining = Number.isInteger(expires) ? Math.max(0, expires - game.turn) : null;
      return <article key={task.id} className={styles.card} data-tracked={tracked || undefined} tabIndex={-1} ref={task.id === selectedId ? focused : null}>
        <div className={styles.meta}><span>{tracked ? "当前追踪" : STATUS[task.status] || task.status}</span><span>{task.policy?.finale ? "终章" : task.source === "特殊行动" ? "日常委托" : "案件"}</span></div>
        <h4>{task.title}</h4><p className={styles.objective}>{task.objective || task.summary}</p>
        {locationId && <p className={styles.hint}>地点 · {getMapLocation(locationId, game)?.name || "待调查"}</p>}
        {shownFilter === "opportunities" && remaining != null && <p className={styles.timer}>剩余 {remaining} 回合可接受</p>}
        {guidance.timers.map(timer => <p key={timer.id} className={styles.timer} role="status">剩余 {timer.remaining} 次行动{timer.remaining <= 1 ? " · 请立即脱离危险" : ""}</p>)}
        {task.treatmentReady != null && task.status === "engaged" && <p className={styles.hint}>{task.treatmentReady ? "已具备治疗条件 · 返回雷纳德宅邸" : "治疗准备 0/1 · 寻找治疗药剂或药师埃德蒙"}</p>}
        <details><summary>案件详情</summary><p>{task.summary}</p>{assistance?.text && <p>{assistance.text}</p>}</details>
        {shownFilter !== "archive" && <button className={tracked ? styles.primary : styles.track} type="button" disabled={disabled || !onAction} onClick={() => track(task)}>{shownFilter === "opportunities" ? "开始追踪任务" : "继续追踪任务"}<span aria-hidden="true"> →</span></button>}
        {routeTask === task.id && <div className={styles.routes}>{(inspectQuestTracking(game, { id: task.id, revision: task.revision }).choices || []).map(route => <button type="button" key={route.routeId} disabled={disabled} onClick={() => track(task, route.routeId)}>{route.label}</button>)}<button type="button" onClick={() => { setRouteTask(null); setNotice(""); }}>暂不行动</button></div>}
      </article>;
    })}
  </section>;
}
