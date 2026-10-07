import { useState } from "react";
import { visitPersonGate } from "../engine/visitablePeople.js";
import { inferCommissionInquiry } from "../services/commissions.js";
import { formatMoney, moneyFromPence } from "../system/money.js";
import styles from "./InvestigationCommission.module.css";

export default function InvestigationCommission({ game, person, disabled, onAction }) {
  const [scope, setScope] = useState("调查舅舅失踪的线索");
  const [fee, setFee] = useState("240");
  const [hours, setHours] = useState("24");
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const objective = /^(寻找|查找|查访|调查|核对|查明|找)/.test(scope.trim()) ? scope.trim() : `调查${scope.trim()}`;
  const gate = visitPersonGate(game, person.id, { conversation: true });
  const blocked = disabled || !onAction || Boolean(gate) || scope.trim().length < 4;
  const validRestore = confirmed && fee !== "" && hours !== "" && Number.isInteger(Number(fee)) && Number(fee) >= 0 && Number(fee) <= 240000
    && Number.isInteger(Number(hours)) && Number(hours) >= 0 && Number(hours) <= 168;
  const restore = async () => {
    const inquiry = inferCommissionInquiry(game, `委托${person.name}${objective}`);
    const ok = await onAction(`补录已委托${person.name}的调查：${objective}`, { commissionRestoreRequest: {
      npcId: person.id, objective, feePence: Number(fee), remainingMinutes: Number(hours) * 60, acceptedAndPaid: confirmed,
      relatedQuestId: inquiry?.relatedQuestId, sourceClueIds: inquiry?.sourceClueIds || [],
    } });
    setNotice(ok ? "旧委托已登记，请到任务簿查看进度。本次未扣费、未消耗回合。" : "补录未完成，请查看行动提示并核对信息。");
  };
  return <section className={styles.service} aria-label="发布调查委托">
    <h4>委托寻人或调查</h4>
    <p>请侦探查访，再交回含1—2条线索的调查报告。范围与报价先登记到任务簿，确认后开始调查。</p>
    <label className={styles.field}>调查范围<input maxLength={110} value={scope} onChange={event => setScope(event.target.value)} placeholder="例如：调查舅舅失踪的线索" /></label>
    <button type="button" disabled={blocked} onClick={() => onAction(`委托${person.name}${objective}，先商定费用与交付时间`, { personConversation: person.id })}>提出调查委托 · 先看报价</button>
    {gate && <p role="status">{gate}</p>}
    <details><summary>旧剧情已接单，但任务簿没有记录？</summary>
      <p>按旧剧情补录已经接单并付费的委托。请核对上方调查范围，并填写已付费用、从现在起还需等待的时间；报告已经到期可填0小时。</p>
      <div className={styles.fields}><label className={styles.field}>已付费用（便士）<input type="number" min="0" max="240000" step="1" value={fee} onChange={event => setFee(event.target.value)} /><small>1镑 = 240便士 · {formatMoney(moneyFromPence(Number(fee) || 0))}</small></label>
        <label className={styles.field}>剩余调查时间（小时）<input type="number" min="0" max="168" step="1" value={hours} onChange={event => setHours(event.target.value)} /></label></div>
      <label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>我确认旧剧情中侦探已经接单，约定费用已支付（免费委托填0）。</span></label>
      {confirmed && !validRestore && <p role="status">已付费用须为0—240000的整数便士，剩余时间须为0—168的整数小时。</p>}
      <p>补录不扣费、不耗回合；已有登记会沿用原记录，交付时间以本次填写的剩余时间为准。</p>
      <button type="button" disabled={blocked || !validRestore} onClick={restore}>补录已有委托 · 不再扣费</button>
    </details>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
