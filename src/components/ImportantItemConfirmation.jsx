import { useState } from "react";
import Modal from "./Modal.jsx";
import styles from "./ImportantItemConfirmation.module.css";

export default function ImportantItemConfirmation({ changes, onConfirm, onCancel }) {
  const [approvedKeys, setApprovedKeys] = useState(() => new Set(changes.map((change) => change.key)));
  const promotion = changes.find((change) => change.confirmationKind === "advancement");
  const ordinaryPromotion = promotion?.advancement?.before?.type === "ordinary";
  const characteristicPromotion = promotion?.advancement?.method === "characteristic";
  const verb = characteristicPromotion ? "吸收" : "服用";
  const resourceName = characteristicPromotion ? "非凡特性" : "魔药";
  const otherChanges = promotion ? changes.filter((change) => change.key !== promotion.key) : changes;
  const toggle = (key) => {
    setApprovedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const approvedCount = approvedKeys.size;
  const confirmPromotion = () => onConfirm([...new Set([...approvedKeys, promotion.key])]);
  const declinePromotion = () => onConfirm([...approvedKeys].filter((key) => key !== promotion.key));

  return <Modal title={promotion ? ordinaryPromotion ? "确认成为非凡者" : "确认序列晋升" : "确认重要物品变更"} eyebrow={promotion ? "PERMANENT ADVANCEMENT · 永久变更" : "LOCAL AUDIT · 本地审计"} onClose={onCancel}>
    {promotion ? <>
      <div className={`${styles.intro} ${styles.advancementIntro}`}>
        <strong>{resourceName}尚未消耗，晋升也尚未写入存档</strong>
        <p>本地规则已验证{resourceName}身份、途径与目标序列。确认后生成晋升剧情；剧情完成后消耗{characteristicPromotion ? "一份非凡特性" : "一瓶魔药"}，更新人物类型与能力，增加三项上限。{characteristicPromotion ? "当前生命、理智和灵性先增加晋升增长值，再各自扣除50%（剩余值向下取整）；不会先回满，惩罚仅扣一次。" : "生命和理智回满，灵性保留已消耗部分。"}</p>
      </div>
      <section className={styles.advancement} aria-label="晋升结果预览">
        <div className={styles.advancementRoute}>
          <span>{promotion.advancement.before.type === "ordinary" ? "普通人" : `${promotion.advancement.before.sequenceName || promotion.advancement.before.pathwayName} · ${promotion.advancement.before.sequenceLabel}`}</span><i aria-hidden="true">→</i><strong>{promotion.advancement.after.sequenceName || promotion.advancement.after.pathwayName} · {promotion.advancement.after.sequenceLabel}</strong>
        </div>
        <div className={styles.potionCost}><span aria-hidden="true">−</span><p><strong>将消耗「{promotion.name}」×{promotion.quantity}</strong><small>{promotion.reason}</small></p></div>
        <dl className={styles.statPreview}>
          {[["maxHealth", "生命上限"], ["maxSanity", "理智上限"]].map(([key, label]) => promotion.advancement.statChanges[key] && <div key={key}><dt>{label}</dt><dd>{promotion.advancement.statChanges[key].before} → {promotion.advancement.statChanges[key].after}</dd></div>)}
          <div><dt>{characteristicPromotion ? "灵性 · 增长后减半" : "当前灵性"}</dt><dd>{promotion.advancement.statChanges.spirituality.before} → {promotion.advancement.statChanges.spirituality.after}</dd></div>
          <div><dt>灵性上限</dt><dd>{promotion.advancement.statChanges.maxSpirituality.before} → {promotion.advancement.statChanges.maxSpirituality.after}</dd></div>
          {promotion.advancement.statChanges.health && <div><dt>{characteristicPromotion ? "生命 · 增长后减半" : "生命回满"}</dt><dd>{promotion.advancement.statChanges.health.before} → {promotion.advancement.statChanges.health.after}</dd></div>}
          {promotion.advancement.statChanges.sanity && <div><dt>{characteristicPromotion ? "理智 · 增长后减半" : "理智回满"}</dt><dd>{promotion.advancement.statChanges.sanity.before} → {promotion.advancement.statChanges.sanity.after}</dd></div>}
        </dl>
        {promotion.advancement.newlyUnlockedAbilities.length > 0 && <div className={styles.abilities}><p>将解锁的非凡能力</p><ul>{promotion.advancement.newlyUnlockedAbilities.map((ability) => <li key={ability.id}><strong>{ability.name}</strong><span>{ability.description}</span></li>)}</ul></div>}
        {promotion.advancement.strengthenedAbilities?.length > 0 && <div className={styles.abilities}><p>将强化的非凡能力</p><ul>{promotion.advancement.strengthenedAbilities.map(ability => <li key={ability.id}><strong>{ability.name}</strong><span>{ability.description}</span></li>)}</ul></div>}
      </section>
    </> : <div className={styles.intro}>
      <strong>回合尚未写入存档</strong>
      <p>本地审计发现重要物品发生增减。只勾选与实际剧情相符的变更；同一行动的任一交付被拒绝，该行动的其他交付与报酬也会一并取消。</p>
    </div>}
    {otherChanges.length > 0 && <fieldset className={styles.list}>
      <legend>{promotion ? "同一回合的其他重要变更" : "待确认变更"}</legend>
      {otherChanges.map((change) => <label key={change.key} className={styles.change} data-direction={change.direction}>
        <input type="checkbox" checked={approvedKeys.has(change.key)} onChange={() => toggle(change.key)} />
        <span className={styles.mark} aria-hidden="true">{change.direction === "gain" ? "+" : "−"}</span>
        <span className={styles.copy}>
          <strong>{change.direction === "gain" ? "获得" : "失去"}「{change.name}」×{change.quantity}</strong>
          <small>{change.reason}</small>
        </span>
        <em>重要物品</em>
      </label>)}
    </fieldset>}
    <p className={styles.note}>{promotion ? `选择“暂不${verb}”会保留${resourceName}并继续本轮；关闭窗口则取消整个回合。` : "普通物品、装备变化与资金不会触发此确认，也不会显示在这里。"}</p>
    {promotion
      ? <div className={styles.actions}><button type="button" className={styles.cancel} onClick={declinePromotion}>暂不{verb}</button><button type="button" className={styles.confirm} onClick={confirmPromotion}>{ordinaryPromotion ? "确认服用并成为非凡者" : `确认${verb}并晋升${promotion.advancement.after.sequenceLabel}`}</button></div>
      : <div className={styles.actions}><button type="button" className={styles.cancel} onClick={onCancel}>取消整个回合</button><button type="button" className={styles.confirm} onClick={() => onConfirm([...approvedKeys])}>{approvedCount ? `确认所选变更（${approvedCount}）` : "拒绝全部并继续"}</button></div>}
  </Modal>;
}
