import { CHURCH_PRAYERS } from "../content/backlund/prayers.js";
import { applyStatDelta } from "./statChanges.js";
import { resolveTurnProgress } from "./turn.js";

export function prayerAvailability(game, locationId = game.location?.id) {
  const church = CHURCH_PRAYERS[locationId];
  const last = game.prayer?.lastTurn;
  // 记录祷告开始轮次：在第 N 轮发起后，第 N+5 轮可再次发起。
  const remaining = Number.isInteger(last) ? Math.max(0, last + 5 - game.turn) : 0;
  const reason = !church ? "这里无法祷告" : game.location?.id !== locationId ? "到达教堂后可祷告" : remaining ? `还需 ${remaining} 回合可再次祷告` : "";
  return { church, remaining, reason, ok: !reason };
}

export function settlePrayer(game, locationId) {
  const available = prayerAvailability(game, locationId);
  if (!available.ok) throw new Error(available.reason);
  const next = structuredClone(game);
  const action = `向${available.church.deity}祷告`;
  const progress = resolveTurnProgress(next, action, "low");
  const recovery = applyStatDelta(next, "spirituality", 2);
  const sanityRecovery = applyStatDelta(next, "sanity", 2);
  next.turn = game.turn + 1;
  next.hiddenDanger = progress.hiddenDanger;
  next.prayer = { lastTurn: game.turn, locationId };
  return { next, action, progress, recovered: recovery?.delta || 0, sanityRecovered: sanityRecovery?.delta || 0 };
}
