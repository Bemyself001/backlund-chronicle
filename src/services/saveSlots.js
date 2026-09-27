export const MAX_MANUAL_SAVES = 3;

// Keep slot numbers stable when saving, deleting, or loading older archives.
export function normalizeSaveSlots(saves) {
  const occupied = new Set();
  const assigned = new Map();
  for (const save of saves) {
    if (save.slotId === "autosave" || save.archivedManual) continue;
    if (Number.isInteger(save.manualSlot) && save.manualSlot >= 1 && save.manualSlot <= MAX_MANUAL_SAVES && !occupied.has(save.manualSlot)) {
      occupied.add(save.manualSlot);
      assigned.set(save, save.manualSlot);
    }
  }
  return saves.map((save) => {
    if (save.slotId === "autosave") return save;
    let number = assigned.get(save);
    if (!number && !save.archivedManual) {
      number = Array.from({ length: MAX_MANUAL_SAVES }, (_, i) => i + 1).find((n) => !occupied.has(n));
      if (number) occupied.add(number);
    }
    return { ...save, manualSlot: number || null, archivedManual: !number };
  });
}

export function getSaveCabinet(saves) {
  const normalized = normalizeSaveSlots(saves);
  return {
    slots: Array.from({ length: MAX_MANUAL_SAVES }, (_, index) => ({
      number: index + 1,
      save: normalized.find((save) => save.slotId !== "autosave" && save.manualSlot === index + 1) || null,
    })),
    autosave: normalized.find((save) => save.slotId === "autosave") || null,
    archived: normalized.filter((save) => save.slotId !== "autosave" && save.archivedManual),
  };
}
