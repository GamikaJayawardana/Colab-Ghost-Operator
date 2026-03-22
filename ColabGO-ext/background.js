console.log("⚡ ColabGO: [Background] Service worker initialized.");

// Listen for changes to the ON/OFF switch
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.isActive) {
        const isActive = changes.isActive.newValue;
        console.log(`⚡ ColabGO: [Background] State changed to: ${isActive}`);

        if (isActive) {
            // 1. Prevent Computer Sleep
            chrome.power.requestKeepAwake("system");
            console.log("⚡ ColabGO: [Background] Computer sleep PREVENTED.");
            
            // 2. Set Icon Badge
            chrome.action.setBadgeText({ text: "ON" });
            chrome.action.setBadgeBackgroundColor({ color: "#00e676" });
        } else {
            // 1. Allow Computer Sleep
            chrome.power.releaseKeepAwake();
            console.log("⚡ ColabGO: [Background] Computer sleep ALLOWED.");
            
            // 2. Clear Icon Badge
            chrome.action.setBadgeText({ text: "" });
        }
    }
});

// Listen for notifications from the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "triggerNotification") {
        console.log(`⚡ ColabGO: [Background] Triggering notification: ${request.title}`);
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/icons8-infinity-48.png",
            title: request.title,
            message: request.message,
            priority: 2
        });
        sendResponse({status: "notified"});
    }
    return true;
});