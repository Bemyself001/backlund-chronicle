import { SAVE_VERSION } from "../data/defaults.js";

const SAVES_KEY = "mist-chronicle-saves-v1";
const AUTOSAVE_ID = "autosave";

function cleanGame(game) {
  const cloned = structuredClone(game);
  delete cloned.apiKey;
  delete cloned.apiSettings;
  return cloned;
}

export function listSaves() {
  try { return JSON.parse(localStorage.getItem(SAVES_KEY) || "[]"); }
  catch { return []; }
}

export function saveGame(game, slotId = AUTOSAVE_ID, label = "自动存档") {
  const saves = listSaves().filter((slot) => slot.slotId !== slotId);
  const safeGame = cleanGame({ ...game, updatedAt: new Date().toISOString() });
  saves.unshift({ slotId, label, updatedAt: safeGame.updatedAt, turn: safeGame.turn, characterName: safeGame.character?.name, game: safeGame });
  localStorage.setItem(SAVES_KEY, JSON.stringify(saves.slice(0, 8)));
  return safeGame;
}

export function loadGame(slotId = AUTOSAVE_ID) {
  const slot = listSaves().find((entry) => entry.slotId === slotId);
  return slot ? migrateSave(slot.game) : null;
}

export function deleteSave(slotId) {
  localStorage.setItem(SAVES_KEY, JSON.stringify(listSaves().filter((slot) => slot.slotId !== slotId)));
}

export function migrateSave(raw) {
  if (!raw || typeof raw !== "object" || !raw.character || !Array.isArray(raw.inventory)) throw new Error("存档缺少角色或物品数据，无法读取。");
  const version = Number(raw.version || 0);
  if (version > SAVE_VERSION) throw new Error("该存档来自更高版本，请升级游戏后再试。");
  const migrateStoryValue = (value) => {
    if (typeof value === "string") {
      return value
        .replaceAll("灰檐港旧钟区", "贝克兰德桥区·旧钟街")
        .replaceAll("灰檐港市档案馆", "贝克兰德市政档案分馆")
        .replaceAll("灰檐港", "贝克兰德")
        .replaceAll("原创港城贝克兰德", "鲁恩王国首都贝克兰德")
        .replaceAll("旧钟区", "旧钟街");
    }
    if (Array.isArray(value)) return value.map(migrateStoryValue);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, migrateStoryValue(entry)]));
    return value;
  };
  const migrated = version < 2 ? migrateStoryValue(raw) : raw;
  return { ...migrated, version: SAVE_VERSION, processedToolCalls: migrated.processedToolCalls || [], memoryNotes: migrated.memoryNotes || [] };
}

export function exportSave(game) {
  const payload = JSON.stringify({ format: "backlund-chronicle-save", version: SAVE_VERSION, exportedAt: new Date().toISOString(), game: cleanGame(game) }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `贝克兰德纪事-${game.character.name}-第${game.turn}轮.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importSave(file) {
  const text = await file.text();
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error("文件不是有效的 JSON 存档。"); }
  const game = migrateSave(raw.game || raw);
  return saveGame(game, AUTOSAVE_ID, "导入存档");
}

export { AUTOSAVE_ID };
