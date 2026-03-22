console.log("⚡ ColabGO: [Popup] Initializing UI...");

const btn = document.getElementById('mainToggle');
const optionsBtn = document.getElementById('optionsBtn');

const sessionTimeUI = document.getElementById('sessionTime');
const cellTimeUI = document.getElementById('cellTime');

const ramText = document.getElementById('ramText');
const diskText = document.getElementById('diskText');
const ramBar = document.getElementById('ramBar');
const diskBar = document.getElementById('diskBar');
const diskBarBg = document.getElementById('diskBarBg');
const gpuContainer = document.getElementById('gpuContainer');
const gpuText = document.getElementById('gpuText');
const gpuBar = document.getElementById('gpuBar');

let uiUpdateInterval;

function formatTime(ms) {
    if (ms < 0) ms = 0;
    let totalSeconds = Math.floor(ms / 1000);
    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

optionsBtn.onclick = () => { chrome.runtime.openOptionsPage(); };

chrome.storage.local.get(['isActive', 'sessionStart'], (data) => {
    updateUI(!!data.isActive);
});

function startUIDataLoop() {
    uiUpdateInterval = setInterval(() => {
        // Update Session Time locally
        chrome.storage.local.get(['isActive', 'sessionStart'], (data) => {
            if (data.isActive && data.sessionStart) {
                sessionTimeUI.innerText = formatTime(Date.now() - data.sessionStart);
            } else {
                sessionTimeUI.innerText = "00:00:00";
            }
        });

        // Fetch Live Stats & Cell Time from Content Script
        chrome.tabs.query({url: "https://colab.research.google.com/*"}, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "getStats" }, (response) => {
                    if (chrome.runtime.lastError) return;
                    if (response) {
                        ramText.innerText = response.ram;
                        diskText.innerText = response.disk;
                        if (response.ramPercent) ramBar.style.width = response.ramPercent + "%";
                        if (response.diskPercent) diskBar.style.width = response.diskPercent + "%";

                        if (response.gpu) {
                            gpuContainer.style.display = "block";
                            diskBarBg.style.marginBottom = "10px";
                            gpuText.innerText = response.gpu;
                            if (response.gpuPercent) gpuBar.style.width = response.gpuPercent + "%";
                        } else {
                            gpuContainer.style.display = "none";
                            diskBarBg.style.marginBottom = "0";
                        }

                        if (response.isCellRunning && response.cellStartTime) {
                            cellTimeUI.innerText = formatTime(Date.now() - response.cellStartTime);
                            cellTimeUI.style.color = "#00e676"; 
                        } else {
                            cellTimeUI.innerText = "IDLE";
                            cellTimeUI.style.color = "#ffb300"; 
                        }
                    }
                });
            } else {
                ramText.innerText = "Colab not open.";
                diskText.innerText = "Colab not open.";
            }
        });
    }, 1000);
}

btn.onclick = () => {
    chrome.storage.local.get('isActive', (data) => {
        const active = !data.isActive;
        const startData = active ? { isActive: true, sessionStart: Date.now() } : { isActive: false, sessionStart: null };
        
        chrome.storage.local.set(startData, () => {
            updateUI(active);
            chrome.tabs.query({url: "https://colab.research.google.com/*"}, (tabs) => {
                tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { action: "updateState", isActive: active }).catch(()=>{}));
            });
        });
    });
};

function updateUI(active) {
    btn.innerText = active ? "GHOST MODE: ON" : "INACTIVE";
    btn.className = active ? "main-btn on" : "main-btn off";
    if (active && !uiUpdateInterval) startUIDataLoop();
    else if (!active && uiUpdateInterval) { clearInterval(uiUpdateInterval); uiUpdateInterval = null; sessionTimeUI.innerText = "00:00:00"; cellTimeUI.innerText = "IDLE"; cellTimeUI.style.color = "#ffb300"; }
}

startUIDataLoop();