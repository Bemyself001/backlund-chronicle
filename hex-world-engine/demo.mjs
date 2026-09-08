/** 无 AI 的探索演示：模拟玩家在世界中行动，观察引擎如何结算 */
import { createWorld, move, placeLocation, revealArea, describeSurroundings, describeKnownLocations, saveWorld } from "./src/index.mjs";

const state = createWorld(2026);

console.log("=== 开局 ===");
console.log(describeSurroundings(state));

console.log("\n=== 剧情需要一座山里的瞭望塔 ===");
console.log(placeLocation(state, { name: "废弃瞭望塔", terrain: "hill", direction: "东北", maxDistance: 3 }));

console.log("\n=== 玩家向东、东南各走一格 ===");
console.log(move(state, "东"));
console.log(move(state, "东南"));

console.log("\n=== 登高远眺 ===");
revealArea(state, state.player.q, state.player.r, 1);
console.log(describeSurroundings(state));

console.log("\n=== 试图翻越山地（若有）===");
const attempt = move(state, "西南");
console.log(attempt.ok ? attempt.log : `被拒绝：${attempt.reason}`);

console.log("\n=== 远方地名索引 ===");
console.log(describeKnownLocations(state));

console.log("\n=== 存档（可直接写入 LocalStorage）===");
console.log(saveWorld(state).slice(0, 120) + "……");
