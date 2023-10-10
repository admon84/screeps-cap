const electron = require('electron');
const { app, BrowserWindow } = electron;

// GPU settings
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.disableHardwareAcceleration();

let mainWindow = null;
const isDevMode = process.argv.includes('--dev');

function createWindow() {
  const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    webgl: true,
    webSecurity: false,
    experimentalFeatures: true,
    experimentalCanvasFeatures: true,
    offscreen: true,
    fullscreen: true,
    frame: isDevMode,
    width,
    height,
    x: 0,
    y: 0,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  if (isDevMode) {
    const { default: installExtension, VUEJS_DEVTOOLS } = require('electron-devtools-installer');
    installExtension(VUEJS_DEVTOOLS)
      .then(name => console.log(`Added Extension: ${name}`))
      .catch(err => console.log('Error:', err));
    mainWindow.webContents.openDevTools();
    mainWindow.maximize();
  } else {
    mainWindow.setMenu(null);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Restart app every 30 minutes to combat lag
setTimeout(
  () => {
    app.relaunch();
    app.quit();
  },
  30 * 60 * 1000
);
