## screeps-cap (speedrun)

This client was developed by [AlinaNova21](https://github.com/AlinaNova21/screeps-cap) for live streaming Screeps events such as BotArena and Screeps Warfare Championship on Twitch.

This branch is customized for screeps **speedrunning** and tracks the RCL progress for a single room while displaying a 5x5 map of the world.

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
- Set the name of the room to focus on in the screeps-cap configs section:

```yml
configs:
  screeps-cap:
    room: W7N3
```

### **Start scripts**

- `npm run start` - starts the app in Production mode
- `npm run start:dev` - starts the app in Development mode with a dev console for debugging
- `npm run start:log` - starts the app in Production mode and displays logs in the terminal
- `npm run start:nogpu` - starts the app in Production mode with GPU rendering disabled
