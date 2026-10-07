import { useId, useRef, useState } from "react";
import { MAX_WAIT_HOURS, MIN_WAIT_HOURS, quickWaitGate, quickWaitPreview } from "../engine/quickWait.js";
import styles from "./QuickWait.module.css";

const RADIUS = 114;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const clampHours = hours => Math.min(MAX_WAIT_HOURS, Math.max(MIN_WAIT_HOURS, hours));
const point = (angle, radius = RADIUS) => ({ x: 160 + Math.sin(angle * Math.PI / 180) * radius, y: 160 - Math.cos(angle * Math.PI / 180) * radius });

function pointerAngle(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left - rect.width / 2;
  const y = event.clientY - rect.top - rect.height / 2;
  if (Math.hypot(x, y) < rect.width * .25) return null;
  return (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
}

export default function QuickWait({ game, loading, onWait }) {
  const [hours, setHours] = useState(MIN_WAIT_HOURS);
  const drag = useRef(null);
  const helpId = useId();
  const preview = quickWaitPreview(game, hours);
  const reason = quickWaitGate(game, hours);
  const disabled = loading || Boolean(reason);
  const startAngle = (preview?.startHours || 0) * 15;
  const start = point(startAngle);
  const end = point(startAngle + hours * 15);

  const startDrag = event => {
    if (disabled || !event.isPrimary || event.button !== 0) return;
    const angle = pointerAngle(event);
    if (angle === null) return;
    const delta = (angle - startAngle + 360) % 360;
    // The current-time marker also represents the end of a complete 24-hour circle.
    const selected = clampHours(Math.round(delta / 15) || MAX_WAIT_HOURS);
    drag.current = { pointerId: event.pointerId, lastAngle: angle, rawHours: selected, originalHours: hours };
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    setHours(selected);
    event.preventDefault();
  };
  const moveDrag = event => {
    const current = drag.current;
    if (disabled || !current || current.pointerId !== event.pointerId) return;
    const angle = pointerAngle(event);
    if (angle === null) return;
    const delta = (angle - current.lastAngle + 540) % 360 - 180;
    current.rawHours = clampHours(current.rawHours + delta / 15);
    current.lastAngle = angle;
    setHours(Math.round(current.rawHours));
  };
  const endDrag = (event, cancelled = false) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    if (cancelled) setHours(drag.current.originalHours);
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const changeWithKeys = event => {
    if (disabled) return;
    const steps = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 6, PageDown: -6 };
    if (event.key in steps) setHours(current => clampHours(current + steps[event.key]));
    else if (event.key === "Home") setHours(MIN_WAIT_HOURS);
    else if (event.key === "End") setHours(MAX_WAIT_HOURS);
    else return;
    event.preventDefault();
  };
  const confirm = event => {
    if (disabled || event.detail > 1) return;
    const result = onWait(hours);
    if (result?.ok) setHours(MIN_WAIT_HOURS);
  };

  return <section className={styles.wait} aria-label="快速等待">
    <div className={styles.heading}><h3>跳过时间</h3><span>一圈 · 24小时</span></div>
    <p className={styles.intro}>拨动时针，选择想抵达的时刻。</p>
    <div className={styles.dial} role="slider" tabIndex={disabled ? -1 : 0} aria-label="等待时长"
      aria-valuemin={MIN_WAIT_HOURS} aria-valuemax={MAX_WAIT_HOURS} aria-valuenow={hours}
      aria-valuetext={preview ? `等待${hours}小时，${preview.dayLabel}${preview.endClock}结束` : `${hours}小时`}
      aria-disabled={disabled} aria-describedby={helpId}
      onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag}
      onPointerCancel={event => endDrag(event, true)} onLostPointerCapture={() => { drag.current = null; }} onKeyDown={changeWithKeys}>
      <svg viewBox="0 0 320 320" width="320" height="320" aria-hidden="true">
        <circle className={styles.bezel} cx="160" cy="160" r="143" />
        <circle className={styles.face} cx="160" cy="160" r="96" />
        <circle className={styles.track} cx="160" cy="160" r={RADIUS} />
        <circle className={styles.arc} cx="160" cy="160" r={RADIUS}
          strokeDasharray={`${CIRCUMFERENCE * hours / 24} ${CIRCUMFERENCE}`}
          transform={`rotate(${startAngle - 90} 160 160)`} />
        {Array.from({ length: 24 }, (_, hour) => {
          const a = point(hour * 15, hour % 6 === 0 ? 130 : 132);
          const b = point(hour * 15, 137);
          return <line className={hour % 6 === 0 ? styles.majorTick : styles.tick} key={hour} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
        })}
        {[0, 6, 12, 18].map(hour => {
          const position = point(hour * 15, 150);
          return <text className={styles.label} key={hour} x={position.x} y={position.y + 4}>{String(hour).padStart(2, "0")}</text>;
        })}
        <line className={styles.hand} x1="160" y1="160" x2={end.x} y2={end.y} />
        <circle className={styles.centerCover} cx="160" cy="160" r="87" />
        <circle className={styles.now} cx={start.x} cy={start.y} r="5" />
        <circle className={styles.handleHalo} cx={end.x} cy={end.y} r="17" />
        <circle className={styles.handle} cx={end.x} cy={end.y} r="9" />
        <circle className={styles.handleDot} cx={end.x} cy={end.y} r="2.5" />
      </svg>
      <div className={styles.dialCenter} aria-hidden="true"><span>等待时长</span><strong>{hours}<small>小时</small></strong><span className={styles.phase}>{preview?.phase || "—"}抵达</span></div>
    </div>
    <p id={helpId} className={styles.help}>拖动圆环，或用方向键每次调整1小时</p>
    <div className={styles.adjust}>
      <button type="button" aria-label="减少1小时" disabled={disabled || hours === MIN_WAIT_HOURS} onClick={() => setHours(current => clampHours(current - 1))}>−</button>
      <div className={styles.presets}>{[1, 6, 12, 24].map(value => <button type="button" key={value} aria-pressed={hours === value} disabled={disabled} onClick={() => setHours(value)}>{value}h</button>)}</div>
      <button type="button" aria-label="增加1小时" disabled={disabled || hours === MAX_WAIT_HOURS} onClick={() => setHours(current => clampHours(current + 1))}>＋</button>
    </div>
    {preview && <div className={styles.timeline}>
      <div><span>现在</span><strong>{preview.startClock}</strong><small>{preview.startDate}</small></div>
      <span className={styles.arrow} aria-hidden="true">→</span>
      <div><span>等待后 · {preview.dayLabel}</span><strong>{preview.endClock}</strong><small>{preview.endDate}</small></div>
    </div>}
    <button className={styles.confirm} type="button" disabled={disabled} onClick={confirm}>{loading ? "本轮正在处理中…" : `确认等待 ${hours} 小时`}</button>
    {reason && <p className={styles.reason} role="status">{reason}</p>}
    <p className={styles.rules}>推进1回合，持续状态与任务照常结算。等待本身不会恢复生命或理智。</p>
  </section>;
}
