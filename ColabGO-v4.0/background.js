chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "cellFinished") {
        console.log("ColabGO BG: Received cellFinished event", request);
        
        // Only trigger notification if explicitly enabled in Settings
        chrome.storage.local.get(['notifEnabled'], (data) => {
            if (data.notifEnabled !== false) {
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "icons/icons8-infinity-48.png",
                    title: request.title || "ColabGO - Cell Finished",
                    message: request.message,
                    priority: 2,
                    requireInteraction: true // Keep notification until user dismisses it or clicks
                });
            }
        });
        
        sendResponse({status: "Notification sent/ignored based on settings"});
    }
    return true; // Keep channel open for async
});

// Manage PC Keep-Awake state automatically
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.isActive) {
        if (changes.isActive.newValue === true) {
            console.log("ColabGO BG: Enabling PC Keep-Awake (System)");
            chrome.power.requestKeepAwake("system");
        } else {
            console.log("ColabGO BG: Disabling PC Keep-Awake");
            chrome.power.releaseKeepAwake();
        }
    }
});

// On startup, check current state
chrome.storage.local.get(['isActive'], (data) => {
    if (data.isActive) {
        console.log("ColabGO BG: Extension started in active state. Enabling Keep-Awake.");
        chrome.power.requestKeepAwake("system");
    }
});
