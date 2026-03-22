⚡ ColabGO: Ghost Operator
ColabGO is a lightweight Chrome Extension designed to enhance your Google Colab experience. It provides a real-time resource dashboard and ensures your long-running training sessions aren't interrupted by minor network flickers or idle prompts.

🚀 Key Features
⚡Real-time Resource Monitoring: Track System RAM, Disk, and GPU usage directly from the extension popup.
⚡Intelligent GPU Detection: The dashboard automatically updates to show GPU RAM when a hardware accelerator is connected.
⚡Workflow Continuity: Automatically handles "Are you still there?" and "Reconnect" dialogs to keep your backend active.
⚡Smart Background Logic: Uses randomized "human-like" interactions (scrolling, cell focusing) to maintain session health without being intrusive.
⚡Sleek Dark Mode UI: Designed to match the modern Colab and Chrome aesthetic.

🛠️ Installation (Developer Mode)
⚡Since this extension is in active development, follow these steps to install it manually:
⚡Download this repository as a ZIP file and extract it to a folder on your computer.
⚡Open Chrome and navigate to chrome://extensions/.
⚡Enable Developer mode using the toggle in the top right corner.
⚡Click the Load unpacked button.
⚡Select the ColabGO-ext folder inside the repository where you extracted the ColabGO files.
⚡Open and refresh the page to initialize the  service.

💡 Usage Notes
⚡Keep the Tab Open: While ColabGO manages the session, the Google Colab tab must remain open in your browser.
⚡Computer Awake: Ensure your computer does not go into "Sleep" mode, as this will pause the browser's execution.
⚡Dashboard Sync: The RAM and Disk stats are pulled directly from the Colab interface. If stats aren't showing, ensure your Colab runtime is connected.

👨‍💻 Developed By
GamikaKJ Improving data science workflows, one cell at a time.