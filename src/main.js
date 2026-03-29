const { app, BrowserWindow, ipcMain, session } = require('electron')
const path = require('path')

// ── Chromium flags BEFORE whenReady ───────────────────────────────────────
// GPU & rendering
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-hardware-overlays', 'single-fullscreen,single-on-top,underlay')
app.commandLine.appendSwitch('enable-features',
  'VaapiVideoDecoder,UseSkiaRenderer,NetworkServiceInProcess2,' +
  'ParallelDownloading,BackForwardCache,PrefetchPrivacyChanges'
)
app.commandLine.appendSwitch('disable-features',
  'UseChromeOSDirectVideoDecoder,HardwareMediaKeyHandling,Translate'
)

// Memory / JS heap
app.commandLine.appendSwitch('js-flags',
  '--max-old-space-size=512 --optimize-for-size --expose-gc'
)

// Disk cache: 150MB
app.commandLine.appendSwitch('disk-cache-size', '157286400')

// Network performance
app.commandLine.appendSwitch('enable-quic')
app.commandLine.appendSwitch('quic-version', 'h3')

// Prevent throttling on background/hidden tabs — important for multi-tab
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      backgroundThrottling: false,
      offscreen: false,
      spellcheck: false,
      // Needed for per-tab partition isolation
      sandbox: false,
    },
    backgroundColor: '#1c1c1e',
    show: false,
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.loadFile(path.join(__dirname, 'ui/index.html'))
}

ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.on('window-close', () => mainWindow?.close())
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false)

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})