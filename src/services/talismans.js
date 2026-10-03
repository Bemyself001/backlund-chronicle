import { getChurchTalisman } from "../system/talismans.js";
import { activeEnemies } from "../system/combat.js";

export function validateTalismanRequest(game, request) {
  if (!request) return null;
  const item = game.inventory.find(entry => entry.instanceId === request.instanceId && entry.quantity > 0);
  const definition = getChurchTalisman(item);
  if (!definition) throw new Error("这枚符咒已不在行囊中，请重新选择。");
  if (definition.effect !== "clue" && !activeEnemies(game).some(enemy => enemy.id === request.enemyId)) throw new Error("请先选择当前遭遇中仍未被击败的敌人。");
  return { instanceId: item.instanceId, ...(definition.effect !== "clue" ? { enemyId: request.enemyId } : {}) };
}

// A click carries immutable item/target IDs through planning, repair and retries.
// Adopt a separate clue proposal atomically; never spend the charm without it.
export function ensureTalismanToolCall(calls, request, game) {
  let adjusted = [...calls];
  if (request) {
    const item = game.inventory.find(entry => entry.instanceId === request.instanceId);
    const definition = getChurchTalisman(item);
    const proposed = adjusted.find(call => call.name === "item.use" && call.args?.instanceId === request.instanceId);
    const clue = proposed?.args?.clue;
    adjusted = adjusted.filter(call => !(call.name === "item.use" && call.args?.instanceId === request.instanceId));
    adjusted.unshift({ id: `talisman:${game.turn + 1}:${request.instanceId}`, name: "item.use",
      args: { ...request, ...(clue ? { clue } : {}) }, reason: `玩家主动使用${definition?.name || "符咒"}` });
  }
  const usedClues = new Set();
  const casts = adjusted.filter(call => call.name === "item.use" && getChurchTalisman(game.inventory.find(item => item.instanceId === call.args?.instanceId)));
  adjusted = adjusted.map(call => {
    if (!casts.includes(call) || getChurchTalisman(game.inventory.find(item => item.instanceId === call.args.instanceId)).effect !== "clue" || call.args.clue) return call;
    const clueCall = adjusted.find(entry => entry.name === "clue.add" && !usedClues.has(entry));
    if (!clueCall) return call;
    usedClues.add(clueCall);
    return { ...call, args: { ...call.args, clue: clueCall.args.clue } };
  });
  const settledCasts = adjusted.filter(call => call.name === "item.use" && getChurchTalisman(game.inventory.find(item => item.instanceId === call.args?.instanceId)));
  adjusted = adjusted.filter(call => !usedClues.has(call) && !settledCasts.some(cast => {
    const definition = getChurchTalisman(game.inventory.find(item => item.instanceId === cast.args.instanceId));
    if (call.name === "inventory.remove" && call.args?.instanceId === cast.args.instanceId) return true;
    if (definition.effect === "damage" && call.name === "enemy.damage" && call.args?.enemyId === cast.args.enemyId) return true;
    return definition.effect === "clue" && call.name === "clue.add" && cast.args.clue
      && (call.args?.clue?.id === cast.args.clue.id || call.args?.clue?.title === cast.args.clue.title);
  }));
  // Enemy registration precedes casting; enemy reactions follow the player cast.
  const priority = call => call.name === "enemy.encounter" ? 0
    : call.name === "item.use" && getChurchTalisman(game.inventory.find(item => item.instanceId === call.args?.instanceId)) ? 1 : 2;
  return adjusted.map((call, index) => ({ call, index })).sort((a, b) => priority(a.call) - priority(b.call) || a.index - b.index).map(entry => entry.call);
}
