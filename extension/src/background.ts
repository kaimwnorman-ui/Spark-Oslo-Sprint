// Spark's service worker. M0: the toolbar button (and Alt+Shift+B) opens the game tab.
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('game.html') });
});
