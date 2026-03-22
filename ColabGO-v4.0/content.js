let timeoutId = null;
let keepAliveTimeoutId = null;
let scanTimeoutId = null;

let isExtensionActive = false;
let antiIdleMode = 'balanced';
let sessionStartTime = null;

// Initialize active state and preferences
chrome.storage.local.get(['isActive', 'antiIdleMode', 'sessionStartTime'], (data) => {
    isExtensionActive = !!data.isActive;
    if (data.antiIdleMode) antiIdleMode = data.antiIdleMode;
    
    // Safely restore or instantiate the session start time
    if (isExtensionActive) {
        if (data.sessionStartTime) {
            sessionStartTime = data.sessionStartTime;
            console.log("⚡ ColabGO: Restored session uptime timer.");
        } else {
            sessionStartTime = Date.now();
            chrome.storage.local.set({ sessionStartTime: sessionStartTime });
            console.log("⚡ ColabGO: Initialized new session uptime timer.");
        }
        ghostAction(); // Start background routines since active
    }
});

// Update preferences dynamically when Settings UI changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.antiIdleMode) {
        antiIdleMode = changes.antiIdleMode.newValue;
        console.log("⚡ ColabGO: [Settings] Keep-Alive mode dynamically updated to:", antiIdleMode);
    }
});

// ===== CELL EXECUTION TIME TRACKING =====
const activeCells = new Map(); // cell element -> { index, startTime, elapsed, label }
let completedCells = []; // array of finished cell records
let totalExecutionMs = 0;
let recentlyCompleted = new WeakSet();

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function getExecNumber(cell, fallbackIndex) {
    const selectors = ['.execution-count', '[class*="execution-count"]', '.inputarea .prompt'];
    for (const sel of selectors) {
        const el = cell.querySelector(sel);
        if (el) {
            const match = el.textContent.match(/(\d+)/);
            if (match) return parseInt(match[1]);
        }
    }
    if (cell.shadowRoot) {
        for (const sel of selectors) {
            const el = cell.shadowRoot.querySelector(sel);
            if (el) {
                const match = el.textContent.match(/(\d+)/);
                if (match) return parseInt(match[1]);
            }
        }
    }
    return fallbackIndex + 1;
}

function isCellRunning(cell) {
    let stopBtn = cell.querySelector('[aria-label*="Stop"]');
    if (stopBtn) return true;

    if (cell.shadowRoot) {
        stopBtn = cell.shadowRoot.querySelector('[aria-label*="Stop"]');
        if (stopBtn) return true;

        const nested = cell.shadowRoot.querySelectorAll('*');
        for (let i = 0; i < Math.min(nested.length, 200); i++) {
            if (nested[i].shadowRoot) {
                stopBtn = nested[i].shadowRoot.querySelector('[aria-label*="Stop"]');
                if (stopBtn) return true;
            }
        }
    }

    const spinnerSelectors = [
        'circular-progress',
        '[role="progressbar"]',
        '.spinner',
        '.cell-running-indicator',
        'svg.circular'
    ];

    for (const sel of spinnerSelectors) {
        if (cell.querySelector(sel)) return true;
        if (cell.shadowRoot && cell.shadowRoot.querySelector(sel)) return true;
    }

    if (cell.hasAttribute('running')) return true;
    if (cell.getAttribute('status') === 'running') return true;
    if (cell.classList.contains('running')) return true;
    if (cell.classList.contains('pending')) return true;

    const runBtns = cell.querySelectorAll('#run-button, [id="run-button"]');
    for (const rb of runBtns) {
        const label = (rb.getAttribute('aria-label') || '').toLowerCase();
        if (label.includes('stop') || label.includes('cancel') || label.includes('interrupt')) {
            return true;
        }
    }

    return false;
}

function getColabDuration(cell) {
    const selectors = ['.execution-duration', '[class*="duration"]'];
    for (const sel of selectors) {
        const el = cell.querySelector(sel);
        if (el && el.textContent.trim()) return el.textContent.trim();
        if (cell.shadowRoot) {
            const srEl = cell.shadowRoot.querySelector(sel);
            if (srEl && srEl.textContent.trim()) return srEl.textContent.trim();
        }
    }
    return null;
}

// Subtle anti-idle function that runs when cells are computing
function activeAntiIdlePing() {
    console.log("⚡ ColabGO: [Active-Anti-Idle] Cells are computing. Dispatching invisible UI events to prevent sleep.");
    try {
        // Dispatch pointer moves to convince Colab the user is active
        const pointerEvent = new PointerEvent('pointermove', {
            bubbles: true, cancelable: true, view: window,
            clientX: Math.random() * window.innerWidth,
            clientY: Math.random() * window.innerHeight
        });
        document.dispatchEvent(pointerEvent);

        // Very occasionally simulate a tiny scroll just in case
        if (Math.random() < 0.2) {
            window.scrollBy(0, 1);
            setTimeout(() => window.scrollBy(0, -1), 100);
        }
    } catch (e) {
        console.warn("⚡ ColabGO ERROR: [Active-Anti-Idle] Ping failed:", e);
    }
}

function queueNextAntiIdlePing() {
    if (!isExtensionActive) {
        keepAliveTimeoutId = null;
        return;
    }
    activeAntiIdlePing();
    
    // Completely randomized ping between 10s and 25s
    const nextPingDelay = Math.floor(Math.random() * (25000 - 10000) + 10000);
    console.log(`⚡ ColabGO: [Active-Anti-Idle] Next ghost event queued in ~${Math.round(nextPingDelay/1000)}s.`);
    keepAliveTimeoutId = setTimeout(queueNextAntiIdlePing, nextPingDelay);
}

function loopScanCells() {
    scanCells();
    
    // Randomize the scanning interval slightly so it isn't an exact robot loop
    const nextScanDelay = Math.floor(Math.random() * (2200 - 1200) + 1200); 
    scanTimeoutId = setTimeout(loopScanCells, nextScanDelay);
}

function scanCells() {
    let cells = document.querySelectorAll('colab-cell');
    if (cells.length === 0) cells = document.querySelectorAll('.cell.code');
    if (cells.length === 0) cells = document.querySelectorAll('.cell');

    let currentlyRunningAny = false;

    cells.forEach((cell, i) => {
        const running = isCellRunning(cell);

        if (running) {
            currentlyRunningAny = true;
        }

        if (running && !activeCells.has(cell)) {
            const cellNum = getExecNumber(cell, i);
            const data = {
                index: cellNum,
                startTime: Date.now(),
                elapsed: 0,
                label: `Cell [${cellNum}]`,
                status: 'running'
            };
            activeCells.set(cell, data);
            console.log(`⚡ ColabGO: [CellTimer] DETECTED START -> Cell ${cellNum} started executing.`);

        } else if (!running && activeCells.has(cell)) {
            const data = activeCells.get(cell);
            data.elapsed = Date.now() - data.startTime;
            data.status = 'done';
            data.elapsedFormatted = formatDuration(data.elapsed);
            totalExecutionMs += data.elapsed;

            completedCells.push({
                index: data.index,
                label: data.label,
                elapsed: data.elapsed,
                elapsedFormatted: data.elapsedFormatted,
                status: 'done'
            });

            if (completedCells.length > 20) {
                completedCells = completedCells.slice(-20);
            }

            activeCells.delete(cell);
            recentlyCompleted.add(cell);

            console.log(`⚡ ColabGO: [CellTimer] DETECTED FINISH -> Cell ${data.index} finished in ${data.elapsedFormatted}.`);

            // Send notification to background script
            chrome.runtime.sendMessage({
                action: "cellFinished",
                title: "Google Colab Task Completed",
                message: `Cell [${data.index}] has successfully finished executing in ${data.elapsedFormatted}!`
            }).then(() => console.log(`⚡ ColabGO: [Notify] Sent notification request for Cell ${data.index}.`))
              .catch(e => console.warn(`⚡ ColabGO: [Notify] Failed to send notification (BG script may be sleeping):`, e));

        } else if (running && activeCells.has(cell)) {
            const data = activeCells.get(cell);
            data.elapsed = Date.now() - data.startTime;
        }
    });

    if (currentlyRunningAny && isExtensionActive) {
        if (!keepAliveTimeoutId) {
            console.log("⚡ ColabGO: [Status] Computation detected! Starting randomized high-frequency ghost system.");
            queueNextAntiIdlePing(); // start random ping loop
        }
    } else {
        if (keepAliveTimeoutId) {
            console.log("⚡ ColabGO: [Status] All computation finished or extension paused. Stopping randomized ghost system.");
            clearTimeout(keepAliveTimeoutId);
            keepAliveTimeoutId = null;
        }
    }
}

function scrapeColabDurations() {
    const result = [];
    let cells = document.querySelectorAll('colab-cell');
    if (cells.length === 0) cells = document.querySelectorAll('.cell.code');
    if (cells.length === 0) cells = document.querySelectorAll('.cell');

    cells.forEach((cell, i) => {
        const durationStr = getColabDuration(cell);
        if (durationStr && durationStr.length > 0 && durationStr !== '0s') {
            const cellNum = getExecNumber(cell, i);
            result.push({
                index: cellNum,
                label: `Cell [${cellNum}]`,
                status: 'done',
                elapsed: 0,
                elapsedFormatted: durationStr
            });
        }
    });
    return result;
}

// Start polling with initial randomized loop
setTimeout(loopScanCells, 2000);

// ===== GHOST ACTION (Routine Background Check) =====
async function ghostAction() {
    console.log("⚡ ColabGO: [ghostAction] Running standard background check...");
    try {
        if (!isExtensionActive) {
            console.log("⚡ ColabGO: [ghostAction] Extension is marked inactive. Sleeping.");
            return;
        }

        if (!sessionStartTime) {
            sessionStartTime = Date.now();
            chrome.storage.local.set({ sessionStartTime: sessionStartTime });
            console.log("⚡ ColabGO: [ghostAction] Session start time registered.");
        }

        const dialogButtons = document.querySelectorAll('mwc-button, paper-button');
        dialogButtons.forEach(btn => {
            const text = btn.innerText.toLowerCase();
            if (text.includes("reconnect") || text.includes("ok") || text.includes("yes")) {
                console.log(`⚡ ColabGO: [ghostAction] CRITICAL: Found idle/disconnect dialog button "${text}". Clicking urgently!`);
                btn.click();
            }
        });

        const roll = Math.random();

        if (antiIdleMode === 'safe') {
            // Keep-Alive Mode: Safe ghost operations only (invisible scrolls)
            console.log("⚡ ColabGO: [ghostAction] SAFE MODE active. Performing invisible ghost scroll only.");
            window.scrollBy(0, 10);
            setTimeout(() => window.scrollBy(0, -10), 500);
        } else {
            // Keep-Alive Mode: Balanced (clicks, scrolls, focuses)
            if (roll < 0.2) {
                // Unlikely: Tap connect button
                const connectBtn = document.querySelector("colab-connect-button")?.shadowRoot?.querySelector("#connect");
                if (connectBtn) {
                    console.log("⚡ ColabGO: [ghostAction] Random standard interaction -> Tapping Connect button.");
                    connectBtn.click();
                }
            } else if (roll < 0.7) {
                // Most likely: Subtle scroll
                console.log("⚡ ColabGO: [ghostAction] Random standard interaction -> Scrolling page slightly.");
                window.scrollBy(0, 10);
                setTimeout(() => window.scrollBy(0, -10), 500);
            } else {
                // Somewhat likely: Focus a code cell
                const codeCell = document.querySelector("colab-cell") || document.querySelector(".cell");
                if (codeCell) {
                    console.log("⚡ ColabGO: [ghostAction] Random standard interaction -> Focusing code cell.");
                    codeCell.focus();
                }
            }
        }

        const nextRun = Math.floor(Math.random() * (90000 - 45000) + 45000);
        console.log(`⚡ ColabGO: [ghostAction] Check complete. Completely random next deep check scheduled in ~${Math.round(nextRun / 1000)}s.`);
        timeoutId = setTimeout(ghostAction, nextRun);

    } catch (error) {
        if (error.message && error.message.includes("Extension context invalidated")) {
            console.warn("⚡ ColabGO: [ghostAction] Extension updated. Stopping orphaned interval.");
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            if (keepAliveTimeoutId) { clearTimeout(keepAliveTimeoutId); keepAliveTimeoutId = null; }
            if (scanTimeoutId) { clearTimeout(scanTimeoutId); scanTimeoutId = null; }
            return;
        }
        console.error("⚡ ColabGO ERROR: [ghostAction]", error);
        timeoutId = setTimeout(ghostAction, 60000);
    }
}

// ===== TOOLTIP SCRAPER =====
function scrapeResources() {
    let stats = {
        ram: "Connecting...",
        disk: "Connecting...",
        gpu: null,
        ramPercent: 0,
        diskPercent: 0,
        gpuPercent: 0,
        cellTimers: [],
        scrapedTimers: [],
        sessionUptime: 0,
        totalExecTime: 0
    };

    try {
        const connectBtnBase = document.querySelector("colab-connect-button");
        if (connectBtnBase && connectBtnBase.shadowRoot) {
            const toolbarBtn = connectBtnBase.shadowRoot.querySelector("#connect");
            if (toolbarBtn) {
                const tooltipText = toolbarBtn.getAttribute("tooltiptext");
                if (tooltipText) {
                    let ramMatch = tooltipText.match(/RAM:\s*([\d.]+)\s*[a-zA-Z]+\/([\d.]+)\s*[a-zA-Z]+/i);
                    if (ramMatch) {
                        stats.ram = `${ramMatch[1]} / ${ramMatch[2]} GB`;
                        stats.ramPercent = (parseFloat(ramMatch[1]) / parseFloat(ramMatch[2])) * 100;
                    }
                    let diskMatch = tooltipText.match(/Disk:\s*([\d.]+)\s*[a-zA-Z]+\/([\d.]+)\s*[a-zA-Z]+/i);
                    if (diskMatch) {
                        stats.disk = `${diskMatch[1]} / ${diskMatch[2]} GB`;
                        stats.diskPercent = (parseFloat(diskMatch[1]) / parseFloat(diskMatch[2])) * 100;
                    }
                    let gpuMatch = tooltipText.match(/GPU RAM:\s*([\d.]+)\s*[a-zA-Z]+\/([\d.]+)\s*[a-zA-Z]+/i);
                    if (gpuMatch) {
                        stats.gpu = `${gpuMatch[1]} / ${gpuMatch[2]} GB`;
                        stats.gpuPercent = (parseFloat(gpuMatch[1]) / parseFloat(gpuMatch[2])) * 100;
                    }
                }
            }
        }
    } catch (e) {
        console.error("⚡ ColabGO ERROR: [scrapeResources]", e);
    }

    const runningList = [];
    activeCells.forEach((data) => {
        runningList.push({
            index: data.index,
            label: data.label,
            status: 'running',
            elapsed: data.elapsed,
            elapsedFormatted: formatDuration(data.elapsed)
        });
    });

    stats.cellTimers = [...completedCells, ...runningList];
    stats.scrapedTimers = scrapeColabDurations();
    stats.sessionUptime = sessionStartTime ? (Date.now() - sessionStartTime) : 0;
    stats.totalExecTime = totalExecutionMs;

    activeCells.forEach((data) => {
        stats.totalExecTime += data.elapsed;
    });

    return stats;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateState") {
        console.log(`⚡ ColabGO: [onMessage] State update received: isActive=${request.isActive}`);
        isExtensionActive = request.isActive;
        
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        
        if (isExtensionActive) {
            sessionStartTime = Date.now();
            chrome.storage.local.set({ sessionStartTime: sessionStartTime });
            ghostAction(); // manually trigger an immediate check since active
        } else {
            sessionStartTime = null;
            chrome.storage.local.remove('sessionStartTime');
            if (keepAliveTimeoutId) { clearTimeout(keepAliveTimeoutId); keepAliveTimeoutId = null; }
        }
        sendResponse({ status: "ok" });
    }

    if (request.action === "getStats") {
        sendResponse(scrapeResources());
    }

    return true;
});

console.log("⚡ ColabGO: Content script injected and completely randomized operators initialized.");