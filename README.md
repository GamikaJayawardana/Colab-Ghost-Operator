# ⚡ ColabGO: Ghost Operator (v4.1)

ColabGO is a lightweight Chrome Extension designed to keep your Google Colab sessions alive and provide deep insights into your workflow. It prevents idle timeouts by using randomized, human-like interactions and provides a real-time resource dashboard.

## 🚀 What's New in v4.0 & v4.1
The latest version introduces several powerful features to enhance workflow continuity:
* **Cell Execution Tracking**: A new "Cell Timer" section tracks individual cell start times, durations, and completion status.
* **Session Analytics**: Displays real-time session uptime and cumulative execution time.
* **Automated PC Keep-Awake**: Automatically prevents your computer from entering "Sleep" mode while the extension is active using the Chrome Power API.
* **Desktop Notifications**: Receive native system alerts immediately when a long-running cell finishes executing.
* **Advanced Settings**: Customize your experience with new interface themes (Dark Space, OLED, Light) and specific Keep-Alive mechanics.

## 🛠️ Key Features
* **Real-time Resource Monitoring**: Track System RAM, Disk, and GPU usage directly from the extension popup.
* **Intelligent GPU Detection**: The dashboard automatically identifies and displays GPU RAM only when a hardware accelerator is connected.
* **Ghost Operator Logic**:
    * **Balanced Mode**: Uses a randomized mix of clicks, scrolls, and cell focusing to maintain session health.
    * **Safe Mode**: Performs invisible "ghost scrolls" only—recommended if you want to avoid clicking UI buttons.
* **Dialogue Auto-Handling**: Automatically handles "Are you still there?" and "Reconnect" prompts to keep your backend active.

## ⚙️ Installation (Developer Mode)
1.  **Download**: Download this repository as a ZIP file and extract it to a folder.
2.  **Extensions Page**: Open Chrome and navigate to `chrome://extensions/`.
3.  **Developer Mode**: Enable "Developer mode" using the toggle in the top right corner.
4.  **Load Extension**: Click the **Load unpacked** button and select the `ColabGO-v4.0` folder.
5.  **Initialize**: Open or refresh a Google Colab tab to initialize the service.

## 💡 Usage Notes
* **Keep the Tab Open**: The Google Colab tab must remain open in your browser for ColabGO to manage the session.
* **Settings Persistence**: Your preferences for themes, notifications, and Keep-Alive modes are saved automatically.
* **Dashboard Sync**: RAM and Disk stats are pulled directly from the Colab interface; ensure your runtime is connected to see active data.

## 📄 License
This project is licensed under the **MIT License**.
Copyright (c) 2026 **Gamika Jayawardana**.

---
*Developed by **GamikaKJ** · Improving data science workflows, one cell at a time.*
