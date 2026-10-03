import { useId, useRef, useState } from "react";
import { getOrganization } from "../content/index.js";
import { activeEnemies, isEnemyStunned } from "../system/combat.js";
import { getChurchTalisman } from "../system/talismans.js";
import styles from "./EnemyEncounter.module.css";

export function TalismanControl({ game, item, onAction, disabled, tone = "paper" }) {
  const [targetId, setTargetId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const busyRef = useRef(false);
  const targetLabelId = useId();
  const noteId = useId();
  const definition = getChurchTalisman(item);
  if (!definition) return null;
  const enemies = activeEnemies(game);
  const needsEnemy = definition.effect !== "clue";
  const target = enemies.length === 1 ? enemies[0] : enemies.find(enemy => enemy.id === targetId);
  const organization = getOrganization(definition.organizationId);
  const unavailable = needsEnemy && !enemies.length;
  const blocked = disabled || submitting || item.quantity <= 0 || unavailable || (needsEnemy && !target);
  const useTalisman = async () => {
    if (blocked || busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    try {
      await onAction(needsEnemy ? `对${target.name}使用${definition.name}` : "使用通识符咒，寻找当前场景中的一条新线索", {
        talismanRequest: { instanceId: item.instanceId, ...(needsEnemy ? { enemyId: target.id } : {}) },
      });
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  };
  return <div className={styles.talisman} data-tone={tone}>
    <div className={styles.talismanHeading}><strong>{definition.name}</strong><span>持有 {item.quantity} 枚</span></div>
    <p className={styles.source}>{organization ? `${organization.church} · ${organization.name}` : "教会符咒"}</p>
    <p>{definition.description}</p>
    {needsEnemy && enemies.length > 1 && <label className={styles.target} htmlFor={targetLabelId}><span>选择符咒目标</span><select id={targetLabelId} value={target?.id || ""} disabled={disabled || submitting} onChange={event => setTargetId(event.target.value)}><option value="">请选择一名敌人</option>{enemies.map(enemy => <option key={enemy.id} value={enemy.id}>{enemy.name} · {enemy.health}/{enemy.maxHealth}</option>)}</select></label>}
    {needsEnemy && enemies.length === 1 && <p className={styles.targetNote}>目标：{target.name}</p>}
    <button type="button" disabled={blocked} aria-describedby={noteId} onClick={useTalisman}>{submitting ? "正在使用…" : `使用${definition.name}`}</button>
    <small id={noteId} className={styles.note}>{unavailable ? "当前没有可选敌人，遭遇敌人后可以使用。" : needsEnemy && !target ? "先选择目标，再使用符咒。" : "消耗 1 枚符咒，并推进一轮行动。"}</small>
  </div>;
}

export default function EnemyEncounter({ game, onAction, disabled }) {
  const enemies = (game.combat?.enemies || []).filter(enemy => enemy.status === "active" || (enemy.status === "defeated" && enemy.lastUpdatedTurn === game.turn));
  if (!enemies.length) return null;
  const active = activeEnemies(game);
  const charms = game.inventory.filter(item => item.quantity > 0 && ["stun", "damage"].includes(getChurchTalisman(item)?.effect));
  return <section className={styles.encounter} aria-label="当前遭遇">
    <div className={styles.heading}><h2>{active.length ? "当前遭遇" : "遭遇结果"}</h2><span>{active.length ? `${active.length} 名敌人仍在场` : "敌人已被击败"}</span></div>
    <div className={styles.enemies}>{enemies.map(enemy => {
      const defeated = enemy.status === "defeated" || enemy.health <= 0;
      const stunned = !defeated && isEnemyStunned(enemy, game.turn);
      const status = defeated ? "已击败" : stunned ? "眩晕 · 本回合无法行动" : "可行动";
      const maximum = Math.max(1, Number(enemy.maxHealth) || 1);
      const health = Math.max(0, Math.min(maximum, Number(enemy.health) || 0));
      return <article key={enemy.id} className={styles.enemy} data-status={defeated ? "defeated" : stunned ? "stunned" : "active"}>
        <div className={styles.enemyHeading}><h3>{enemy.name}</h3><span>{status}</span></div>
        <div className={styles.healthLabel}><span>生命</span><strong>{health} <span>/ {maximum}</span></strong></div>
        <div className={styles.health} role="meter" aria-label={`${enemy.name}的生命`} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={health} aria-valuetext={`${health} / ${maximum}，${status}`}><span style={{ width: `${health / maximum * 100}%` }} /></div>
      </article>;
    })}</div>
    {active.length > 0 && charms.length > 0 && <details className={styles.quickActions}><summary>使用战斗符咒 <span>{charms.reduce((total, item) => total + item.quantity, 0)} 枚可用</span></summary><div className={styles.charms}>{charms.map(item => <TalismanControl key={item.instanceId} game={game} item={item} onAction={onAction} disabled={disabled} />)}</div></details>}
  </section>;
}
