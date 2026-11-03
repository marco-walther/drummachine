import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme, shell } from 'electron'

const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0b0b' : '#efefef',
    title: 'Drummachine',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  win.once('ready-to-show', () => win.show())

  if (isDev) {
    // Surface renderer warnings/errors in the terminal during development.
    win.webContents.on('console-message', (e) => {
      if (e.level === 'warning' || e.level === 'error') {
        console.log(`[renderer:${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`)
      }
    })
  }

  // Pop-out panels (Phase 2) open via window.open from the renderer and share its
  // JS context. Anything else (external links) goes to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url.startsWith('about:blank')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 900,
          height: 420,
          minWidth: 420,
          minHeight: 220,
          autoHideMenuBar: true,
          backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0b0b' : '#efefef'
        }
      }
    }
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
