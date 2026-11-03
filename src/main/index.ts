import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, ipcMain, nativeTheme, net, protocol, shell } from 'electron'

const isDev = !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']
const RENDERER_DIR = join(__dirname, '../renderer')

// A DAW must make sound without waiting for a click on the page.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Production pages are served from app://renderer/… instead of file://, so popout
// windows (app://renderer/popout.html) are same-origin with the main window.
// dockview refuses file:// popouts, and same-origin is what lets popouts share the
// main window's JS context (one store, one audio engine).
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

const bg = () => (nativeTheme.shouldUseDarkColors ? '#0b0b0b' : '#efefef')

/** Popout BrowserWindows by window.open target name (dockview: `<id>-<group>`). */
const popouts = new Map<string, BrowserWindow>()

function isPopoutUrl(url: string, opener: string): boolean {
  try {
    const u = new URL(url)
    const o = new URL(opener)
    return u.origin === o.origin && u.pathname.endsWith('/popout.html')
  } catch {
    return false
  }
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: bg(),
    title: 'Drummachine',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      // The audio engine + UI clock must keep running while this window is
      // covered (e.g. by a popped-out panel). Throttling would stall the playhead.
      backgroundThrottling: false
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

  // Popout panels: same-origin popout.html only. dockview passes the position
  // and size as window features, which Electron applies.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isPopoutUrl(url, win.webContents.getURL())) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          // children inherit the main window's options; it starts hidden (show:false)
          show: true,
          title: 'Drummachine',
          minWidth: 360,
          minHeight: 200,
          autoHideMenuBar: true,
          backgroundColor: bg(),
          webPreferences: { backgroundThrottling: false }
        }
      }
    }
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('did-create-window', (child, { frameName }) => {
    popouts.set(frameName, child)
    child.on('closed', () => {
      if (popouts.get(frameName) === child) popouts.delete(frameName)
    })
  })

  // Closing the main window closes its popouts too.
  win.on('closed', () => {
    for (const child of popouts.values()) if (!child.isDestroyed()) child.close()
  })

  if (isDev) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    void win.loadURL('app://renderer/index.html')
  }
  return win
}

ipcMain.on('popout:set-on-top', (_e, frameName: unknown, onTop: unknown) => {
  if (typeof frameName !== 'string') return
  popouts.get(frameName)?.setAlwaysOnTop(onTop === true, 'floating')
})

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { host, pathname } = new URL(request.url)
    const file = normalize(join(RENDERER_DIR, decodeURIComponent(pathname)))
    if (host !== 'renderer' || !file.startsWith(RENDERER_DIR + sep)) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(file).toString())
  })

  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
