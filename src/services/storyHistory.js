export function appendStoryMessages(game, messages) {
  const storyHistory = [...(game.storyHistory?.length ? game.storyHistory : game.recentDialogues || []), ...messages];
  return { storyHistory, recentDialogues: storyHistory.slice(-10) };
}
