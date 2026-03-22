let timeoutId = null;

async function ghostAction() {
  console.log("⚡ ColabGO: [ghostAction] Waking up to check status...");
  
  try {
    const data = await chrome.storage.local.get(['isActive']);
    console.log(`⚡ ColabGO: [ghostAction] Storage fetched. isActive status is: ${data.isActive}`);

    if (!data.isActive) {
      console.log("⚡ ColabGO: [ghostAction] Extension is INACTIVE. Halting routine.");
      return;
    }

    console.log("⚡ ColabGO: [ghostAction] Extension is ACTIVE. Executing routine...");

    // 1. Check for dialogs
    const dialogButtons = document.querySelectorAll('mwc-button, paper-button');
    console.log(`⚡ ColabGO: [ghostAction] Found ${dialogButtons.length} potential dialog buttons.`);
    
    dialogButtons.forEach(btn => {
      const text = btn.innerText.toLowerCase();
      if (text.includes("reconnect") || text.includes("ok") || text.includes("yes")) {
        console.log(`⚡ ColabGO: [ghostAction] Found target button '${text}'. Clicking!`);
        btn.click();
      }
    });

    // 2. Perform a randomized "Human" action
    const roll = Math.random();
    console.log(`⚡ ColabGO: [ghostAction] Rolled a ${roll.toFixed(2)} for random action selection.`);
    
    if (roll < 0.6) {
      console.log("⚡ ColabGO: [ghostAction] Action Selected -> Check 'Connect' button.");
      const connectBtn = document.querySelector("colab-connect-button")?.shadowRoot?.querySelector("#connect");
      if (connectBtn) {
          connectBtn.click();
          console.log("⚡ ColabGO: [ghostAction] Successfully clicked the 'Connect' button.");
      } else {
          console.log("⚡ ColabGO: [ghostAction] 'Connect' button not found in the DOM right now.");
      }
    } else if (roll < 0.9) {
      console.log("⚡ ColabGO: [ghostAction] Action Selected -> Simulating page scroll.");
      window.scrollBy(0, 10);
      setTimeout(() => {
          window.scrollBy(0, -10);
          console.log("⚡ ColabGO: [ghostAction] Scrolled back to original position.");
      }, 500);
    } else {
      console.log("⚡ ColabGO: [ghostAction] Action Selected -> Focusing a code cell.");
      const codeCell = document.querySelector(".code-cell");
      if (codeCell) {
          codeCell.focus();
          console.log("⚡ ColabGO: [ghostAction] Successfully focused the code cell.");
      } else {
          console.log("⚡ ColabGO: [ghostAction] No code cell found to focus.");
      }
    }

    // 3. Schedule next run
    const nextRun = Math.floor(Math.random() * (90000 - 45000) + 45000);
    console.log(`⚡ ColabGO: [ghostAction] Routine complete. Scheduling next run in ${Math.round(nextRun/1000)} seconds.`);
    
    timeoutId = setTimeout(ghostAction, nextRun);

  } catch (error) {
    if (error.message && error.message.includes("Extension context invalidated")) {
        console.warn("⚡ ColabGO: [ghostAction] Extension was updated. Shutting down old ghost script to prevent errors.");
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        return; 
    }
    console.error("⚡ ColabGO ERROR: [ghostAction] Routine failed!", error);
    timeoutId = setTimeout(ghostAction, 60000); 
  }
}

// 🔥 NEW TOOLTIP SCRAPER (Thanks to your HTML discovery!) 🔥
function scrapeResources() {
    console.log("⚡ ColabGO: [scrapeResources] Attempting to scrape from Connect Button tooltip...");
    
    let stats = {
        ram: "Connecting...", 
        disk: "Connecting...",
        gpu: null, 
        ramPercent: 0,
        diskPercent: 0,
        gpuPercent: 0
    };

    try {
        // Find the main connect button component
        const connectBtnBase = document.querySelector("colab-connect-button");
        
        if (connectBtnBase && connectBtnBase.shadowRoot) {
            // Dive into its shadowRoot to find the actual toolbar button with the tooltip
            const toolbarBtn = connectBtnBase.shadowRoot.querySelector("#connect");
            
            if (toolbarBtn) {
                const tooltipText = toolbarBtn.getAttribute("tooltiptext");
                console.log("⚡ ColabGO: [scrapeResources] Raw Tooltip Text Found:\n", tooltipText);

                if (tooltipText) {
                    // Extract RAM (e.g., "RAM: 1.70 GB/12.67 GB")
                    let ramMatch = tooltipText.match(/RAM:\s*([\d.]+)\s*[a-zA-Z]+\/([\d.]+)\s*[a-zA-Z]+/i);
                    if (ramMatch) {
                        stats.ram = `${ramMatch[1]} / ${ramMatch[2]} GB`;
                        stats.ramPercent = (parseFloat(ramMatch[1]) / parseFloat(ramMatch[2])) * 100;
                        console.log(`⚡ ColabGO: [scrapeResources] Extracted RAM: ${stats.ram}`);
                    }

                    // Extract Disk (e.g., "Disk: 24.19 GB/107.72 GB")
                    let diskMatch = tooltipText.match(/Disk:\s*([\d.]+)\s*[a-zA-Z]+\/([\d.]+)\s*[a-zA-Z]+/i);
                    if (diskMatch) {
                        stats.disk = `${diskMatch[1]} / ${diskMatch[2]} GB`;
                        stats.diskPercent = (parseFloat(diskMatch[1]) / parseFloat(diskMatch[2])) * 100;
                        console.log(`⚡ ColabGO: [scrapeResources] Extracted Disk: ${stats.disk}`);
                    }

                    // Extract GPU (if it exists in the tooltip text)
                    let gpuMatch = tooltipText.match(/GPU RAM:\s*([\d.]+)\s*[a-zA-Z]+\/([\d.]+)\s*[a-zA-Z]+/i);
                    if (gpuMatch) {
                        stats.gpu = `${gpuMatch[1]} / ${gpuMatch[2]} GB`;
                        stats.gpuPercent = (parseFloat(gpuMatch[1]) / parseFloat(gpuMatch[2])) * 100;
                        console.log(`⚡ ColabGO: [scrapeResources] Extracted GPU: ${stats.gpu}`);
                    }
                } else {
                     console.log("⚡ ColabGO: [scrapeResources] Tooltip attribute found, but it is empty.");
                }
            } else {
                 console.log("⚡ ColabGO: [scrapeResources] #connect button not found inside shadowRoot.");
            }
        } else {
             console.log("⚡ ColabGO: [scrapeResources] colab-connect-button not found on page.");
        }

    } catch (e) {
        console.error("⚡ ColabGO ERROR: [scrapeResources] Failed to scrape tooltip", e);
    }
    
    return stats;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`⚡ ColabGO: [onMessage] Received action request: '${request.action}'`);

    if (request.action === "updateState") {
        console.log(`⚡ ColabGO: [onMessage] State update received. New isActive: ${request.isActive}`);
        
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        
        if (request.isActive) {
            ghostAction();
        } 
        sendResponse({status: "ok"});
    }
    
    if (request.action === "getStats") {
        const currentStats = scrapeResources();
        console.log("⚡ ColabGO: [onMessage] Sending scraped stats back to popup:", currentStats);
        sendResponse(currentStats);
    }
    
    return true; 
});

console.log("⚡ ColabGO: Content script successfully injected and initialized.");
ghostAction();