import { useState } from "react";
import { activeEnemies } from "../system/combat.js";
import { BASIC_ATTACK_RULE } from "../system/healthRules.js";
import { combatActionAvailability } from "../engine/combat.js";
import CombatPreparation from "./CombatPreparation.jsx";
import styles from "./EnemyEncounter.module.css";

export default function CombatActions({ game, onAction, disabled }) {
  const [targetId, setTargetId] = useState("");
  const [stacks, setStacks] = useState(0);
  const enemies = activeEnemies(game);
  const target = enemies.length === 1 ? enemies[0] : enemies.find(enemy => enemy.id === targetId);
  const request = { actionId: "attack", enemyId: target?.id, boostStacks: stacks };
  const reason = combatActionAvailability(game, request);
  const defendReason = combatActionAvailability(game, { actionId: "defend" });
  return <div className={styles.talisman} aria-label="本回合战斗行动">
    <strong>本回合行动</strong>
    {enemies.length > 1 && <label className={styles.target}><span>选择攻击目标</span><select disabled={disabled} value={target?.id || ""} onChange={event => setTargetId(event.target.value)}><option value="">请选择敌人</option>{enemies.map(enemy => <option key={enemy.id} value={enemy.id}>{enemy.name} · {enemy.health}/{enemy.maxHealth}</option>)}</select></label>}
    {enemies.length === 1 && <p>目标：{target.name}</p>}
    <CombatPreparation game={game} rule={BASIC_ATTACK_RULE} target={target} stacks={stacks} onChange={setStacks} disabled={disabled} />
    {reason && <p>{reason}</p>}
    <button type="button" disabled={disabled || !onAction || Boolean(reason)} onClick={() => onAction(`${stacks ? `狼人强化${stacks}次后，` : ""}普通攻击${target.name}`, { combatRequest: request })}>提交普通攻击</button>
    <button type="button" disabled={disabled || !onAction || Boolean(defendReason)} onClick={() => onAction("采取防御姿态，抵御敌人的下一轮攻击", { combatRequest: { actionId: "defend" } })}>防御 · 本回合直接受伤比例减半</button>
    <small className={styles.note}>强化与主要行动合并结算；每回合一次主要行动。防御不使用已选的攻击强化。</small>
  </div>;
}
