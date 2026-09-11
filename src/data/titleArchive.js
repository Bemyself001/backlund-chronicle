// Keep the preview and primary action tied to the same save, including manual slots.
export function recentArchives(saves = []) {
  return [...saves].sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
}

export function archiveLocation(slot) {
  const location = slot?.game?.location;
  return [location?.district, location?.name].filter(Boolean).join(" · ") || "地点未记录";
}
