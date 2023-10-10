// Modules to control application life and create native browser window
const electron = require('electron')
const {app, BrowserWindow} = electron

// electron gpu settings
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.disableHardwareAcceleration()

let mainWindow = null;

const DEV = process.argv.includes('--dev')

function createWindow () {
  // const displays = electron.screen.getAllDisplays()
  const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize
  
  mainWindow = new BrowserWindow({ 
    webgl: true,
    webSecurity: false,
    experimentalFeatures: true,
    experimentalCanvasFeatures: true,
    offscreen: true,
    x:0, y:0,
    fullscreen: true,
    width, height, 
    frame: DEV,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  mainWindow.loadFile('index.html')

  if (DEV) {
    const { default: installExtension, VUEJS_DEVTOOLS } = require('electron-devtools-installer');
    installExtension(VUEJS_DEVTOOLS)
        .then((name) => console.log(`Added Extension:  ${name}`))
        .catch((err) => console.log('An error occurred: ', err));
    mainWindow.webContents.openDevTools()
    mainWindow.maximize()
  } else {
    mainWindow.setMenu(null)
  }
  
  mainWindow.on('closed', function () {
    mainWindow = null
  })
}

app.on('ready', createWindow)

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow()
  }
})

// Restart occasionally, sometimes the cycle breaks, this helps auto-recover
setTimeout(() => {
  app.relaunch();
  app.quit();
}, 30 * 60 * 1000)
