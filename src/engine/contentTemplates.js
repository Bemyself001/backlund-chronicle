function cleanNamePart(value) {
  return String(value || "").trim().replace(/^[·•・\s]+|[·•・\s]+$/g, "").slice(0, 40);
}

export function characterSurname(character = {}) {
  const explicit = cleanNamePart(character.surname);
  if (explicit) return explicit;
  const name = cleanNamePart(character.name);
  const parts = name.split(/[·•・\s]+/).map(cleanNamePart).filter(Boolean);
  return parts.length > 1 ? parts.at(-1) : "";
}

export function contentTemplateValues(game = {}, item = null) {
  const surname = characterSurname(game.character || {});
  return {
    characterName: cleanNamePart(game.character?.name),
    characterSurname: surname,
    characterSurnameSuffix: surname ? `·${surname}` : "",
    itemName: String(item?.name || item?.itemId || "物品"),
  };
}

export function renderContentText(value, { game = {}, item = null } = {}) {
  const values = contentTemplateValues(game, item);
  return String(value || "").replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, key) => (
    Object.hasOwn(values, key) ? values[key] : match
  ));
}

export function renderContentData(value, context = {}) {
  if (typeof value === "string") return renderContentText(value, context);
  if (Array.isArray(value)) return value.map((entry) => renderContentData(entry, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, renderContentData(entry, context)]));
  }
  return value;
}
