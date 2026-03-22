let timeoutId = null;
let lastResourceWarning = 0; 
let isCellRunning = false;
let cellStartTime = null;

console.log("⚡ ColabGO: [Content] Script Injected.");

// Function to synchronously check cell status to bypass Chrome background throttling
function checkCellStatus() {
    // Expanded query to catch multiple possible "running" states in Colab DOM
    const runningIndicator = document.querySelector('colab-run-button[icon-state="running"], colab-run-button[class*="running"], [aria-label*="Interrupt"], [title*="Interrupt"], .cell-running');
    
    if (runningIndicator && !isCellRunning) {
        isCellRunning = true;
        cellStartTime = Date.now();
        console.log("⚡ ColabGO: [Cell Tracker] Execution STARTED.");
    } 
    else if (!runningIndicator && isCellRunning) {
        isCellRunning = false;
        const elapsed = Math.floor((Date.now() - cellStartTime) / 1000);
        console.log(`⚡ ColabGO: [Cell Tracker] Execution FINISHED. Took ${elapsed}s.`);
        
        chrome.storage.local.get(['settings'], (data) => {
            const settings = data.settings || { notifyCell: true };
            if (settings.notifyCell) {
                chrome.runtime.sendMessage({ action: "triggerNotification", title: "✅ Colab Cell Complete", message: `Execution finished. Time elapsed: ${elapsed}s.` });
            }
        });
        cellStartTime = null;
    }
}

// Background loop (can be throttled by Chrome, but useful for triggering notifications)
setInterval(checkCellStatus, 2000);

async function ghostAction() {
  console.log("⚡ ColabGO: [ghostAction] Waking up...");
  try {
    const data = await chrome.storage.local.get(['isActive', 'settings']);
    if (!data.isActive) return;

    const dialogButtons = document.querySelectorAll('mwc-button, paper-button');
    dialogButtons.forEach(btn => {
      const text = btn.innerText.toLowerCase();
      if (text.includes("reconnect") || text.includes("ok") || text.includes("yes")) {
        console.log(`⚡ ColabGO: [ghostAction] Clicking dialog '${text}'.`);
        btn.click();
      }
    });

    const roll = Math.random();
    if (roll < 0.6) { document.querySelector("colab-connect-button")?.shadowRoot?.querySelector("#connect")?.click(); } 
    else if (roll < 0.9) { window.scrollBy(0, 10); setTimeout(() => window.scrollBy(0, -10), 500); } 
    else { document.querySelector(".code-cell")?.focus(); }

    const settings = data.settings || { interval: 'medium' };
    let minT = 45000, maxT = 90000;
    if (settings.interval === 'fast') { minT = 15000; maxT = 30000; }
    if (settings.interval === 'slow') { minT = 120000; maxT = 300000; }

    const nextRun = Math.floor(Math.random() * (maxT - minT) + minT);
    console.log(`⚡ ColabGO: [ghostAction] Next run in ${Math.round(nextRun/1000)}s.`);
    timeoutId = setTimeout(ghostAction, nextRun);

  } catch (error) {
    if (error.message && error.message.includes("invalidated")) return;
    timeoutId = setTimeout(ghostAction, 60000); 
  }
}

function scrapeResources() {
    // ⚡ FORCE A SYNCHRONOUS CHECK RIGHT NOW. 
    // This fixes the bug where Colab stops showing info because the background tab was frozen!
    checkCellStatus();

    let stats = { ram: "Connecting...", disk: "Connecting...", gpu: null, ramPercent: 0, diskPercent: 0, gpuPercent: 0, isCellRunning: isCellRunning, cellStartTime: cellStartTime };

    try {
        const toolbarBtn = document.querySelector("colab-connect-button")?.shadowRoot?.querySelector("#connect");
        if (toolbarBtn) {
            const tooltipText = toolbarBtn.getAttribute("tooltiptext");
            if (tooltipText) {
                let ramMatch = tooltipText.match(/RAM:\s*([\d.]+)\s*[a-zA-Z]+\/([\d.]+)\s*[a-zA-Z]+/i);
                if (ramMatch) { stats.ram = `${ramMatch[1]} / ${ramMatch[2]} GB`; stats.ramPercent = (parseFloat(ramMatch[1]) / parseFloat(ramMatch[2])) * 100; }

                let diskMatch = tooltipText.match(/Disk:\s*([\d.]+)\s*[a-zA-Z]+\/([\d.]+)\s*[a-zA-Z]+/i);
                if (diskMatch) { stats.disk = `${diskMatch[1]} / ${diskMatch[2]} GB`; stats.diskPercent = (parseFloat(diskMatch[1]) / parseFloat(diskMatch[2])) * 100; }

                let gpuMatch = tooltipText.match(/GPU RAM:\s*([\d.]+)\s*[a-zA-Z]+\/([\d.]+)\s*[a-zA-Z]+/i);
                if (gpuMatch) { stats.gpu = `${gpuMatch[1]} / ${gpuMatch[2]} GB`; stats.gpuPercent = (parseFloat(gpuMatch[1]) / parseFloat(gpuMatch[2])) * 100; }

                chrome.storage.local.get(['settings'], (data) => {
                    const settings = data.settings || { notifyResource: true };
                    const now = Date.now();
                    if (settings.notifyResource && (stats.ramPercent > 90 || stats.gpuPercent > 90 || stats.diskPercent > 90)) {
                        if (now - lastResourceWarning > 300000) { 
                            console.log("⚡ ColabGO: [Warning] High Resource Usage Detected!");
                            chrome.runtime.sendMessage({ action: "triggerNotification", title: "⚠️ Colab Resource Warning", message: `High usage detected! RAM: ${Math.round(stats.ramPercent)}% | GPU: ${Math.round(stats.gpuPercent)}%` });
                            lastResourceWarning = now;
                        }
                    }
                });
            }
        }
    } catch (e) { console.error(e); }
    return stats;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateState") {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        if (request.isActive) ghostAction();
        sendResponse({status: "ok"});
    }
    if (request.action === "getStats") {
        sendResponse(scrapeResources());
    }
    return true; 
});

ghostAction();