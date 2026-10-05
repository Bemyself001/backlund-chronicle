import { actionPreview, attackPreparation } from "../system/combatActions.js";
import { displayPercent } from "../system/healthRules.js";
import styles from "./CombatPreparation.module.css";

export default function CombatPreparation({ game, rule, target, stacks, onChange, disabled }) {
  const preparation = attackPreparation(game);
  const preview = actionPreview(game, rule, stacks, target);
  const next = stacks < 3 ? actionPreview(game, rule, stacks + 1, target) : null;
  const capped = next && next.damagePercent === preview.damagePercent;
  return <div className={styles.preparation}>
    {preparation && <>
      <div className={styles.heading}><strong>{preparation.name}</strong><span>{stacks}层 · ×{Number(preview.multiplier.toFixed(3))}</span></div>
      <div className={styles.controls}>
        <button type="button" disabled={disabled || stacks === 0} onClick={() => onChange(stacks - 1)} aria-label="减少一层强化">−</button>
        <button type="button" disabled={disabled || stacks === preparation.maxStacks || capped || next?.spiritualityCost > game.character.stats.spirituality} onClick={() => onChange(stacks + 1)}>强化＋1层</button>
        <button type="button" disabled={disabled || stacks === 0} onClick={() => onChange(0)}>取消准备</button>
      </div>
      <small>每层消耗{preparation.cost}点灵性，最多{preparation.maxStacks}层；提交行动时扣费，本回合结束清空。{capped ? "已达60%伤害上限，继续强化无收益。" : ""}</small>
    </>}
    <p aria-live="polite">预计伤害：目标最大生命值的<strong>{displayPercent(preview.effectivePercent)}</strong>{target ? `，实际扣除${preview.damage}点生命` : "（请选择目标）"}{preview.guarded ? "；目标正在防御" : ""}。</p>
    <small>本次共消耗{preview.spiritualityCost}点灵性{stacks ? `（强化${preview.preparationCost}＋技能${rule.cost || 0}）` : ""}。{preview.healthCost ? `另消耗${preview.healthCost}点生命。` : ""}</small>
  </div>;
}
