import { SEFIRAH_ITEM_EASTER_EGGS } from "../content/backlund/easterEggs.js";

function normalizedItemName(value) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s/g, "") : "";
}

const eggsByItemName = new Map(SEFIRAH_ITEM_EASTER_EGGS.map(egg => [normalizedItemName(egg.itemName), egg]));

export function sefirahItemEasterEgg(name) {
  return eggsByItemName.get(normalizedItemName(name)) || null;
}
