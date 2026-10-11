import { SEQUENCE_FOUR_PROFILES } from "../content/index.js";
import styles from "./GamePanels.module.css";

export default function SequenceFourDossier({ advancement }) {
  const profile = SEQUENCE_FOUR_PROFILES[advancement.pathwayId];
  if (!profile || advancement.type !== "extraordinary" || advancement.sequence > 5) return null;
  return <article className={styles.record} aria-label="序列四魔药档案">
    <h4>{advancement.sequence === 5 ? "下一序列 · 半神" : "序列四 · 半神档案"}<span>序列4</span></h4>
    <p className={styles.highlight}>{profile.potionName}</p>
    <p>{profile.summary}</p>
    <small>沿当前途径逐级晋升。服用对应魔药恢复生命和理智；从序列七起直接吸收对应非凡特性，当前生命、理智和灵性在增长后各自减半，上限正常增长。</small>
  </article>;
}
