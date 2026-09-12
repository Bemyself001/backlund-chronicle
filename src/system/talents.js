import { getTalent } from "../content/index.js";

export function applyTalent(stats, talentId) {
  const talent = getTalent(talentId);
  const next = { ...stats };
  if (talent.effects.maxHealth) { next.maxHealth += talent.effects.maxHealth; next.health = next.maxHealth; }
  if (talent.effects.maxSanity) { next.maxSanity += talent.effects.maxSanity; next.sanity = next.maxSanity; }
  if (talent.effects.maxSpirituality) { next.maxSpirituality += talent.effects.maxSpirituality; next.spirituality = next.maxSpirituality; }
  return next;
}

export function talentMoneyBonus(talentId) {
  return getTalent(talentId).effects.bonusMoneyPence || 0;
}

export function talentItemSpec(talentId) {
  return getTalent(talentId).effects.item || null;
}
