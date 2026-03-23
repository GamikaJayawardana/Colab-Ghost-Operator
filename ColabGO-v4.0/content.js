let timeoutId = null;
let keepAliveTimeoutId = null;
let scanTimeoutId = null;

let isExtensionActive = false;
let antiIdleMode = 'balanced';
let sessionStartTime = null;

// Initialize active state and preferences
chrome.storage.local.get(['isActive', 'antiIdleMode'], (data) => {
    isExtensionActive = !!data.isActive;
    if (data.antiIdleMode) antiIdleMode = data.antiIdleMode;
    
    // Track session uptime in-memory only (resets on page load)
    sessionStartTime = Date.now();
    console.log("⚡ ColabGO: Initialized new session uptime timer for current page load.");

    if (isExtensionActive) {
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
    const selectors = ['.execution-count', '[class*="execution-count"]', '.inputarea .prompt', 'colab-run-button', '.cell-execution-container'];
    let textSrc = '';
    
    for (const sel of selectors) {
        const el = cell.querySelector(sel) || (cell.shadowRoot && cell.shadowRoot.querySelector(sel));
        if (el) {
            textSrc += el.textContent + ' ';
        }
    }
    
    const runBtn = cell.querySelector('colab-run-button') || (cell.shadowRoot && cell.shadowRoot.querySelector('colab-run-button'));
    if (runBtn && runBtn.parentElement) {
        textSrc += runBtn.parentElement.textContent + ' ';
    }
    
    const exactMatch = textSrc.match(/\[\s*(\d+)\s*\]/);
    if (exactMatch) return parseInt(exactMatch[1]);
    
    const defaultMatch = textSrc.match(/\b(\d+)\b/);
    if (defaultMatch) return parseInt(defaultMatch[1]);

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

function isCellError(cell) {
    if (cell.getAttribute('status') === 'error' || cell.classList.contains('error') || cell.classList.contains('failed')) return true;
    
    const errSelectors = [
        '.output-error', 
        '.output_error', 
        '.traceback', 
        '.error-message',
        '.stream-error',
        '[data-mime-type*="stderr"]',
        '.ansi-red-fg',
        'iron-icon[icon*="error"]',
        'iron-icon[icon*="close"]'
    ];
    
    const roots = [cell, cell.shadowRoot];
    const outputs = cell.querySelectorAll('colab-output-view, .output');
    outputs.forEach(o => { if (o.shadowRoot) roots.push(o.shadowRoot); });

    for (const root of roots) {
        if (!root) continue;
        for (const sel of errSelectors) {
            if (root.querySelector && root.querySelector(sel)) return true;
        }
    }
    
    const runBtn = cell.querySelector('colab-run-button, [id="run-button"]') || (cell.shadowRoot && cell.shadowRoot.querySelector('colab-run-button, [id="run-button"]'));
    if (runBtn) {
        if (runBtn.getAttribute('status') === 'error' || runBtn.classList.contains('error')) return true;
        if (runBtn.shadowRoot && runBtn.shadowRoot.querySelector('iron-icon[icon*="error"], .error, svg.error')) return true;
    }
    
    if (cell.textContent && (cell.textContent.includes('Traceback (most recent call last)') || 
                             cell.textContent.includes('NameError:') ||
                             cell.textContent.includes('FileNotFoundError:') ||
                             cell.textContent.includes('SyntaxError:'))) {
        return true;
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
    if (antiIdleMode === 'safe') {
        return; // Obey safe mode
    }
    console.log("⚡ ColabGO: [Active-Anti-Idle] Cells are computing. Dispatching invisible UI events (pointer & key) to prevent sleep.");
    try {
        // Dispatch pointer moves to convince Colab the user is active
        const pointerEvent = new PointerEvent('pointermove', {
            bubbles: true, cancelable: true, view: window,
            clientX: Math.random() * window.innerWidth,
            clientY: Math.random() * window.innerHeight
        });
        document.dispatchEvent(pointerEvent);

        // Dispatch a benign keypress (Shift) to definitively reset Colab's idle tracker
        const keyEvent = new KeyboardEvent('keydown', {
            key: 'Shift', code: 'ShiftLeft', keyCode: 16,
            bubbles: true, cancelable: true
        });
        document.dispatchEvent(keyEvent);
        document.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'Shift', code: 'ShiftLeft', keyCode: 16,
            bubbles: true, cancelable: true
        }));

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
    try {
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
            
            const hasError = isCellError(cell);
            data.status = hasError ? 'error' : 'done';
            
            data.elapsedFormatted = formatDuration(data.elapsed);
            totalExecutionMs += data.elapsed;

            completedCells.push({
                index: data.index,
                label: data.label,
                elapsed: data.elapsed,
                elapsedFormatted: data.elapsedFormatted,
                status: data.status
            });

            if (completedCells.length > 20) {
                completedCells = completedCells.slice(-20);
            }

            activeCells.delete(cell);

            console.log(`⚡ ColabGO: [CellTimer] DETECTED FINISH -> Cell ${data.index} finished in ${data.elapsedFormatted}. Error: ${hasError}`);

            // Send notification to background script
            const notifTitle = hasError ? "Google Colab Task Failed" : "Google Colab Task Completed";
            const notifMessage = hasError 
                ? `Cell [${data.index}] execution failed after ${data.elapsedFormatted}!`
                : `Cell [${data.index}] has successfully finished executing in ${data.elapsedFormatted}!`;

            chrome.runtime.sendMessage({
                action: "cellFinished",
                title: notifTitle,
                message: notifMessage
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
    } catch (error) {
        if (error.message && error.message.includes("Extension context invalidated")) {
            console.warn("⚡ ColabGO: [scanCells] Extension updated. Stopping orphaned interval.");
            if (scanTimeoutId) { clearTimeout(scanTimeoutId); scanTimeoutId = null; }
            if (keepAliveTimeoutId) { clearTimeout(keepAliveTimeoutId); keepAliveTimeoutId = null; }
        } else {
            console.error("⚡ ColabGO ERROR: [scanCells]", error);
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
            const hasError = isCellError(cell);
            result.push({
                index: cellNum,
                label: `Cell [${cellNum}]`,
                status: hasError ? 'error' : 'done',
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
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    console.log("⚡ ColabGO: [ghostAction] Running standard background check...");
    try {
        if (!isExtensionActive) {
            console.log("⚡ ColabGO: [ghostAction] Extension is marked inactive. Sleeping.");
            return;
        }

        if (!sessionStartTime) {
            sessionStartTime = Date.now();
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
            // Keep-Alive Mode: Balanced (scrolls, focuses)
            if (roll < 0.6) {
                // Most likely: Subtle scroll
                console.log("⚡ ColabGO: [ghostAction] Random standard interaction -> Scrolling page slightly.");
                window.scrollBy(0, 10);
                setTimeout(() => window.scrollBy(0, -10), 500);
            } else {
                // Somewhat likely: Focus a code cell
                const codeCells = document.querySelectorAll("colab-cell");
                const fallbackCells = codeCells.length > 0 ? codeCells : document.querySelectorAll(".cell");
                if (fallbackCells.length > 0) {
                    console.log("⚡ ColabGO: [ghostAction] Random standard interaction -> Focusing random code cell.");
                    const randomCell = fallbackCells[Math.floor(Math.random() * fallbackCells.length)];
                    randomCell.focus({ preventScroll: true });
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
        const currentElapsed = Date.now() - data.startTime;
        runningList.push({
            index: data.index,
            label: data.label,
            status: 'running',
            elapsed: currentElapsed,
            elapsedFormatted: formatDuration(currentElapsed)
        });
    });

    stats.cellTimers = [...completedCells, ...runningList];
    stats.scrapedTimers = scrapeColabDurations();
    stats.sessionUptime = sessionStartTime ? (Date.now() - sessionStartTime) : 0;
    stats.totalExecTime = totalExecutionMs;

    activeCells.forEach((data) => {
        const currentElapsed = Date.now() - data.startTime;
        stats.totalExecTime += currentElapsed;
    });

    return stats;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateState") {
        console.log(`⚡ ColabGO: [onMessage] State update received: isActive=${request.isActive}`);
        isExtensionActive = request.isActive;
        
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        
        if (isExtensionActive) {
            if (!sessionStartTime) {
                sessionStartTime = Date.now();
            }
            ghostAction(); // manually trigger an immediate check since active
        } else {
            // Extension is inactive: disable awakening strategies but leave timers alone
            if (keepAliveTimeoutId) { clearTimeout(keepAliveTimeoutId); keepAliveTimeoutId = null; }
        }
        sendResponse({ status: "ok" });
    }

    if (request.action === "getStats") {
        sendResponse(scrapeResources());
    }

    if (request.action === "pingGhostAction") {
        if (isExtensionActive) {
            console.log("⚡ ColabGO: Received background keep-alive ping.");
            if (!timeoutId) {
                console.log("⚡ ColabGO: Executing Ghost Action from ping.");
                ghostAction();
            }
        } else {
            // When inactive, we disable ghost operations but still force a quick scan
            // to ensure accurate cell timers and resources in the background.
            console.log("⚡ ColabGO: Received background keep-alive ping. Monitoring only (Inactive).");
            scanCells(); 
        }
        sendResponse({ status: "ok" });
    }

    return true;
});

console.log("⚡ ColabGO: Content script injected and completely randomized operators initialized.");