import { useState } from "react";
import { abilityAvailability } from "../engine/abilities.js";
import { activeEnemies } from "../system/combat.js";
import styles from "./GamePanels.module.css";

function Ability({ game, ability, onAction, disabled }) {
  const [selectedId, setSelectedId] = useState("");
  const kind = ability.target?.kind || ability.rule?.target?.kind;
  const targets = kind === "enemy" ? activeEnemies(game) : kind === "clue" ? game.clues : [];
  const targetId = targets.length === 1 ? targets[0].id : targets.some(target => target.id === selectedId) ? selectedId : "";
  const reason = abilityAvailability(game, ability.id, targetId);
  const cost = ability.spiritualityCost ?? ability.cost ?? 0;
  return <article className={styles.record}>
    <h4>{ability.name}{ability.upgraded ? <small>已强化</small> : null}</h4>
    <p>{ability.description}</p>
    <small>{ability.kind === "passive" ? "被动生效 · 相关检定自动核验" : `灵性 ${cost} · 消耗 1 回合${ability.cooldown ? " · 每回合一次能力" : ""}`}</small>
    {ability.kind !== "passive" && <>
      {targets.length > 1 && <label className={styles.abilityTarget}><span>{kind === "enemy" ? "选择敌人" : "选择已知线索"}</span><select value={targetId} onChange={event => setSelectedId(event.target.value)}><option value="">请选择目标</option>{targets.map(target => <option key={target.id} value={target.id}>{target.name || target.title}</option>)}</select></label>}
      {targets.length === 1 && <p className={styles.muted}>目标：{targets[0].name || targets[0].title}</p>}
      {reason && <p className={styles.muted}>{reason}</p>}
      <button type="button" disabled={disabled || !onAction || Boolean(reason)} onClick={() => onAction(`使用${ability.name}${targetId ? `，目标是${targets.find(target => target.id === targetId)?.name || targets.find(target => target.id === targetId)?.title}` : ""}`, { abilityRequest: { abilityId: ability.id, ...(targetId ? { targetId } : {}) } })}>使用能力</button>
    </>}
  </article>;
}

export default function CharacterAbilities({ game, abilities, onAction, disabled }) {
  return <>{abilities.map(ability => <Ability key={ability.id} game={game} ability={ability} onAction={onAction} disabled={disabled} />)}</>;
}
