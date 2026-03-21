const btn = document.getElementById('mainToggle');
const log = document.getElementById('logBox');

chrome.storage.local.get('isActive', (data) => {
  updateUI(data.isActive);
});

btn.onclick = () => {
  chrome.storage.local.get('isActive', (data) => {
    const active = !data.isActive;
    chrome.storage.local.set({ isActive: active }, () => {
      updateUI(active);
      // Send a ping to the tab to refresh the loop
      chrome.tabs.query({url: "https://colab.research.google.com/*"}, (tabs) => {
        tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { action: "refresh" }));
      });
    });
  });
};

function updateUI(active) {
  btn.innerText = active ? "ACTIVE: GHOST MODE" : "INACTIVE";
  btn.className = active ? "on" : "off";
  log.innerText = active ? "System monitoring for idle popups..." : "System paused.";
}