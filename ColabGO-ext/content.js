const ACTIONS = {
  CLICK_CONNECT: 'connect',
  FOCUS_CELL: 'focus',
  SCROLL: 'scroll'
};

async function ghostAction() {
  const data = await chrome.storage.local.get(['isActive']);
  if (!data.isActive) return;

  // 1. Handle the "Are you still there?" or "Reconnect" popups
  const dialogButtons = document.querySelectorAll('mwc-button, paper-button');
  dialogButtons.forEach(btn => {
    const text = btn.innerText.toLowerCase();
    if (text.includes("reconnect") || text.includes("ok") || text.includes("yes")) {
      btn.click();
      console.log("👻 Sentinel: Smashed a popup dialog.");
    }
  });

  // 2. Perform a randomized "Human" action
  const roll = Math.random();
  if (roll < 0.6) {
    // 60% chance: Click the Connect button (the standard method)
    const connectBtn = document.querySelector("colab-connect-button")?.shadowRoot?.querySelector("#connect");
    connectBtn?.click();
  } else if (roll < 0.9) {
    // 30% chance: Scroll the notebook slightly and back
    window.scrollBy(0, 10);
    setTimeout(() => window.scrollBy(0, -10), 500);
  } else {
    // 10% chance: Focus the first visible code cell
    document.querySelector(".code-cell")?.focus();
  }

  // 3. Schedule next run with high entropy (45s to 90s)
  const nextRun = Math.floor(Math.random() * (90000 - 45000) + 45000);
  console.log(`👻 Sentinel: Action complete. Next in ${Math.round(nextRun/1000)}s`);
  setTimeout(ghostAction, nextRun);
}

// Start watching
ghostAction();