import { SAVE_VERSION } from "../system/version.js";
import { cleanGame, migrateSave, validatePlayableSave } from "./saveCodec.js";
export { migrateSave, validatePlayableSave } from "./saveCodec.js";
import { saveExportFileName, writeSaveExport } from "./saveExport.js";
import { MAX_MANUAL_SAVES, normalizeSaveSlots } from "./saveSlots.js";

const SAVES_KEY = "mist-chronicle-saves-v1";
const AUTOSAVE_ID = "autosave";
export { MAX_MANUAL_SAVES };

export function listSaves() {
  try {
    const saves = JSON.parse(localStorage.getItem(SAVES_KEY) || "[]");
    return Array.isArray(saves) ? normalizeSaveSlots(saves.filter((slot) => slot && typeof slot.slotId === "string" && slot.game)) : [];
  }
  catch { return []; }
}

export function saveGame(game, slotId = AUTOSAVE_ID, label = "自动存档", requestedSlot) {
  const existing = listSaves();
  const previous = existing.find((slot) => slot.slotId === slotId);
  const saves = existing.filter((slot) => slot.slotId !== slotId);
  let manualSlot;
  if (slotId !== AUTOSAVE_ID) {
    if (previous?.archivedManual) throw new Error("旧版保留档案不能覆盖，请将当前进度存入三个存档位之一。");
    const occupied = new Set(saves.filter((slot) => slot.slotId !== AUTOSAVE_ID).map((slot) => slot.manualSlot));
    manualSlot = previous?.manualSlot ?? requestedSlot ?? Array.from({ length: MAX_MANUAL_SAVES }, (_, i) => i + 1).find((number) => !occupied.has(number));
    if (!manualSlot) throw new Error("手动存档已满，请选择覆盖已有档案，或先导出并删除不需要的档案。");
    if (!Number.isInteger(manualSlot) || manualSlot < 1 || manualSlot > MAX_MANUAL_SAVES || occupied.has(manualSlot)) throw new Error("该存档位不可用，请重新打开存档柜后再试。");
  }
  const safeGame = cleanGame({ ...game, updatedAt: new Date().toISOString() });
  saves.unshift({ slotId, label, ...(manualSlot ? { manualSlot, archivedManual: false } : {}), updatedAt: safeGame.updatedAt, turn: safeGame.turn, characterName: safeGame.character?.name, game: safeGame });
  localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
  return safeGame;
}

export function loadGame(slotId = AUTOSAVE_ID) {
  const slot = listSaves().find((entry) => entry.slotId === slotId);
  return slot ? validatePlayableSave(migrateSave(slot.game)) : null;
}

export function deleteSave(slotId) {
  localStorage.setItem(SAVES_KEY, JSON.stringify(listSaves().filter((slot) => slot.slotId !== slotId)));
}

export async function exportSave(game) {
  const payload = JSON.stringify({ format: "backlund-chronicle-save", version: SAVE_VERSION, exportedAt: new Date().toISOString(), game: cleanGame(game) }, null, 2);
  return writeSaveExport(payload, saveExportFileName(game));
}

export async function importSave(file) {
  const text = await file.text();
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error("文件不是有效的 JSON 存档。"); }
  const game = validatePlayableSave(migrateSave(raw?.game || raw));
  return saveGame(game, AUTOSAVE_ID, "导入存档");
}

export { AUTOSAVE_ID };
