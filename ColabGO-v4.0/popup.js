const btn = document.getElementById('mainToggle');
const logText = document.getElementById('logText');
const statusDot = document.getElementById('statusDot');
const ramText = document.getElementById('ramText');
const diskText = document.getElementById('diskText');
const ramBar = document.getElementById('ramBar');
const diskBar = document.getElementById('diskBar');
const ramPercent = document.getElementById('ramPercent');
const diskPercent = document.getElementById('diskPercent');

const gpuContainer = document.getElementById('gpuContainer');
const gpuText = document.getElementById('gpuText');
const gpuBar = document.getElementById('gpuBar');
const gpuPercent = document.getElementById('gpuPercent');

const sessionUptimeEl = document.getElementById('sessionUptime');
const totalExecTimeEl = document.getElementById('totalExecTime');
const cellListEl = document.getElementById('cellList');

let refreshInterval = null;
let displayTimers = [];
let cachedSessionStart = 0;
let cachedTotalExec = 0;

// SVG Icons (Lucide)
const iconCheck = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>`;
const iconError = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
const iconSpinner = `<svg class="spinning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`;
const iconEmpty = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3; margin-bottom: 2px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

console.log("ColabGO Popup: Initializing...");

// ===== HELPERS =====
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = n => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function setBarColor(barEl, pct) {
    barEl.classList.remove('warn', 'danger');
    if (pct > 85) barEl.classList.add('danger');
    else if (pct > 65) barEl.classList.add('warn');
}

// ===== INIT STATE =====
try {
    chrome.storage.local.get('isActive', (data) => {
        updateUI(!!data.isActive);
    });
} catch (error) {
    console.error("ColabGO Popup ERROR:", error);
}

// ===== FETCH STATS =====
function fetchStats() {
    chrome.tabs.query({ url: "https://colab.research.google.com/*" }, (tabs) => {
        if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "getStats" }, (response) => {
                if (chrome.runtime.lastError) {
                    ramText.innerText = "Connecting...";
                    diskText.innerText = "Connecting...";
                    ramPercent.innerText = "--%";
                    diskPercent.innerText = "--%";
                    return;
                }

                if (response) {
                    // RAM
                    ramText.innerText = response.ram;
                    if (response.ramPercent) {
                        const rp = Math.round(response.ramPercent);
                        ramBar.style.width = rp + "%";
                        ramPercent.innerText = rp + "%";
                        setBarColor(ramBar, rp);
                    }

                    // Disk
                    diskText.innerText = response.disk;
                    if (response.diskPercent) {
                        const dp = Math.round(response.diskPercent);
                        diskBar.style.width = dp + "%";
                        diskPercent.innerText = dp + "%";
                        setBarColor(diskBar, dp);
                    }

                    // GPU
                    if (response.gpu) {
                        gpuContainer.style.display = "flex";
                        gpuText.innerText = response.gpu;
                        if (response.gpuPercent) {
                            const gp = Math.round(response.gpuPercent);
                            gpuBar.style.width = gp + "%";
                            gpuPercent.innerText = gp + "%";
                            setBarColor(gpuBar, gp);
                        }
                    } else {
                        gpuContainer.style.display = "none";
                    }

                    // Merge cell timers
                    const tracked = response.cellTimers || [];
                    const scraped = response.scrapedTimers || [];
                    displayTimers = tracked.length > 0 ? tracked : scraped;

                    cachedSessionStart = response.sessionUptime || 0;
                    cachedTotalExec = response.totalExecTime || 0;

                    renderCellTimers();
                    updateTimerDisplays();
                }
            });
        }
    });
}

fetchStats();

// ===== RENDER CELL LIST =====
function renderCellTimers() {
    if (!displayTimers || displayTimers.length === 0) {
        cellListEl.innerHTML = `<div class="cell-empty">${iconEmpty}<span>No cells executed yet</span></div>`;
        return;
    }

    const reversed = [...displayTimers].reverse();
    let html = '';

    reversed.forEach(cell => {
        const isRunning = cell.status === 'running';
        const isError = cell.status === 'error';
        
        let icon = iconCheck;
        let iconColor = 'var(--green)';
        if (isRunning) {
            icon = iconSpinner;
            iconColor = 'var(--text)';
        } else if (isError) {
            icon = iconError;
            iconColor = 'var(--red)';
        }
        
        const tClass = isRunning ? 'cell-time active' : (isError ? 'cell-time error' : 'cell-time');
        const eClass = isRunning ? 'cell-entry running' : (isError ? 'cell-entry error' : 'cell-entry');

        html += `<div class="${eClass}">
            <div class="cell-left">
                <div class="cell-icon" style="color: ${iconColor}">${icon}</div>
                <div class="cell-name">${cell.label}</div>
            </div>
            <div class="${tClass}" style="${isError ? 'color: var(--red);' : ''}">${cell.elapsedFormatted}</div>
        </div>`;
    });

    cellListEl.innerHTML = html;
}

function updateTimerDisplays() {
    sessionUptimeEl.innerText = formatTime(cachedSessionStart);
    totalExecTimeEl.innerText = formatTime(cachedTotalExec);
}

// ===== TOGGLE BUTTON =====
btn.addEventListener('click', () => {
    chrome.storage.local.get('isActive', (data) => {
        const active = !data.isActive;
        chrome.storage.local.set({ isActive: active }, () => {
            updateUI(active);
            chrome.tabs.query({ url: "https://colab.research.google.com/*" }, (tabs) => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, { action: "updateState", isActive: active })
                        .catch(() => console.log(`ColabGO: Tab ${tab.id} not ready.`));
                });
            });
        });
    });
});

// ===== UPDATE UI =====
function updateUI(active) {
    btn.innerText = active ? "ACTIVE" : "INACTIVE";
    btn.className = active ? "toggle-btn on" : "toggle-btn off";
    logText.innerText = active ? "Monitoring session..." : "System paused.";
    statusDot.className = active ? "status-dot active" : "status-dot inactive";

    if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
    if (active) {
        refreshInterval = setInterval(fetchStats, 1500);
    }
}

// ===== SETTINGS VIEW LOGIC =====
const mainView = document.getElementById('mainView');
const settingsView = document.getElementById('settingsView');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');

const themeSelect = document.getElementById('themeSelect');
const notifToggle = document.getElementById('notifToggle');
const antiIdleMode = document.getElementById('antiIdleMode');

// View Switching
openSettingsBtn.addEventListener('click', () => {
    mainView.style.display = 'none';
    settingsView.style.display = 'flex';
});

closeSettingsBtn.addEventListener('click', () => {
    settingsView.style.display = 'none';
    mainView.style.display = 'flex';
});

// Apply Theme Function
function applyTheme(theme) {
    if (theme === 'oled') {
        document.documentElement.setAttribute('data-theme', 'oled');
    } else if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

// Load Saved Settings on Init
try {
    chrome.storage.local.get(['theme', 'notifEnabled', 'antiIdleMode'], (data) => {
        if (data.theme) {
            themeSelect.value = data.theme;
            applyTheme(data.theme);
        }
        
        // Notifications default to true if never set
        if (data.notifEnabled !== undefined) {
            notifToggle.checked = data.notifEnabled;
        } else {
            notifToggle.checked = true; 
            chrome.storage.local.set({ notifEnabled: true });
        }
        
        // AntiIdle mode defaults to balanced
        if (data.antiIdleMode) {
            antiIdleMode.value = data.antiIdleMode;
        } else {
            antiIdleMode.value = 'balanced';
            chrome.storage.local.set({ antiIdleMode: 'balanced' });
        }
    });
} catch (e) { console.error("Could not load settings:", e); }

// Save & Apply Settings on Change
themeSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    chrome.storage.local.set({ theme: val });
    applyTheme(val);
});

notifToggle.addEventListener('change', (e) => {
    chrome.storage.local.set({ notifEnabled: e.target.checked });
});

antiIdleMode.addEventListener('change', (e) => {
    chrome.storage.local.set({ antiIdleMode: e.target.value });
});