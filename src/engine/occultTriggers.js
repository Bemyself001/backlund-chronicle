export function canReceiveNewOccultEntry(game) {
  const advancement = game.character?.advancement;
  if (advancement?.type !== "extraordinary") return true;
  return Number(advancement.sequence) === 9;
}
