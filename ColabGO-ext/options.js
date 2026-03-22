console.log("⚡ ColabGO: [Options] Initializing settings page.");

const saveBtn = document.getElementById('saveBtn');
const statusText = document.getElementById('status');
const intervalSelect = document.getElementById('intervalSelect');
const notifyResource = document.getElementById('notifyResource');
const notifyCell = document.getElementById('notifyCell');

// Load saved settings
chrome.storage.local.get(['settings'], (data) => {
    const settings = data.settings || { interval: 'medium', notifyResource: true, notifyCell: true };
    intervalSelect.value = settings.interval;
    notifyResource.checked = settings.notifyResource;
    notifyCell.checked = settings.notifyCell;
});

// Save settings
saveBtn.addEventListener('click', () => {
    const settings = {
        interval: intervalSelect.value,
        notifyResource: notifyResource.checked,
        notifyCell: notifyCell.checked
    };
    
    chrome.storage.local.set({ settings: settings }, () => {
        console.log("⚡ ColabGO: [Options] Settings saved:", settings);
        
        // Visual feedback for save
        statusText.style.opacity = 1;
        setTimeout(() => {
            statusText.style.opacity = 0;
        }, 2000);
    });
});