## screeps-cap

The Screeps Capture client connects to a Screeps World and displays interesting content by analyzing the warpath battle API.

This client was developed by [AlinaNova21](https://github.com/AlinaNova21/screeps-cap) for live streaming Screeps events such as BotArena and Screeps Warfare Championship on Twitch.

This fork was made in 2023 for live streaming the BotArena 214 event.

## **Get Started**

The Screeps Capture client is built with Electron and Vue on Node.js and uses the Screeps Renderer engine and APIs to display the Screeps World.

### **Requirements**

Before diving in, ensure you have the following installed:

- [Node.js](https://nodejs.org/en/download) (LTS recommended)

### **Installation**

1. Clone the source code or download and extract it to your preferred directory.
2. Navigate to the project folder using your terminal.
3. Run `npm install` or `yarn` to install the depdencencies.

### **Configure**

- Rename or copy `.screeps.example.yml` to `.screeps.yml` and update it with your Screeps credentials.

### **Start scripts**

- `npm run start` - starts the app in Production mode
- `npm run start:dev` - starts the app in Development mode with a dev console for debugging
- `npm run start:log` - starts the app in Production mode and displays logs in the terminal
- `npm run start:nogpu` - starts the app in Production mode with GPU rendering disabled
