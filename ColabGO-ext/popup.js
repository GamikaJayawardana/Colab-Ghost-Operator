const btn = document.getElementById('mainToggle');
const log = document.getElementById('logBox');
const ramText = document.getElementById('ramText');
const diskText = document.getElementById('diskText');
const ramBar = document.getElementById('ramBar');
const diskBar = document.getElementById('diskBar');
const diskBarBg = document.getElementById('diskBarBg');

// GPU Elements
const gpuContainer = document.getElementById('gpuContainer');
const gpuText = document.getElementById('gpuText');
const gpuBar = document.getElementById('gpuBar');

console.log("⚡ ColabGO Popup: Initializing...");

try {
  chrome.storage.local.get('isActive', (data) => {
    updateUI(!!data.isActive);
  });
} catch (error) {
  console.error("⚡ ColabGO Popup ERROR:", error);
}

// Search for any open Colab tab anywhere in the browser
chrome.tabs.query({url: "https://colab.research.google.com/*"}, (tabs) => {
    if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "getStats" }, (response) => {
            
            if (chrome.runtime.lastError) {
                ramText.innerText = "Go to Colab & F5";
                diskText.innerText = "Go to Colab & F5";
                return;
            }

            if (response) {
                // Handle RAM and Disk
                ramText.innerText = response.ram;
                diskText.innerText = response.disk;
                if (response.ramPercent) ramBar.style.width = response.ramPercent + "%";
                if (response.diskPercent) diskBar.style.width = response.diskPercent + "%";

                // Handle GPU (Only show if a GPU is detected)
                if (response.gpu) {
                    gpuContainer.style.display = "block"; // Make GPU UI visible
                    diskBarBg.style.marginBottom = "10px"; // Add space below Disk bar
                    gpuText.innerText = response.gpu;
                    if (response.gpuPercent) gpuBar.style.width = response.gpuPercent + "%";
                } else {
                    gpuContainer.style.display = "none"; // Hide GPU UI
                    diskBarBg.style.marginBottom = "0"; // Reset spacing
                }
            }
        });
    } else {
        ramText.innerText = "Colab not open.";
        diskText.innerText = "Colab not open.";
    }
});

btn.onclick = () => {
  chrome.storage.local.get('isActive', (data) => {
    const active = !data.isActive;
    
    chrome.storage.local.set({ isActive: active }, () => {
      updateUI(active);
      
      chrome.tabs.query({url: "https://colab.research.google.com/*"}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { 
              action: "updateState", 
              isActive: active 
          }).catch(() => {
             console.log(`⚡ ColabGO: Tab ${tab.id} not ready.`);
          });
        });
      });
    });
  });
};

function updateUI(active) {
  btn.innerText = active ? "GHOST MODE: ON" : "INACTIVE";
  btn.className = active ? "on" : "off";
  log.innerText = active ? "> Monitoring session..." : "> System paused.";
}