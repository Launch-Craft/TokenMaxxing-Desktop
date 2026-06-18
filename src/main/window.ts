import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { IPC } from '@shared/ipc'

const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL
const isMac = process.platform === 'darwin'

function windowIcon(): string | undefined {
  const p = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(process.cwd(), 'resources', 'icon.png')
  return existsSync(p) ? p : undefined
}

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#08090c',
    icon: isMac ? undefined : windowIcon(),
    // Custom title bar: native traffic lights on macOS, custom controls elsewhere.
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 16, y: 18 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  win.on('ready-to-show', () => win.show())

  win.on('maximize', () => win.webContents.send(IPC.windowMaximizedChanged, true))
  win.on('unmaximize', () => win.webContents.send(IPC.windowMaximizedChanged, false))

  // External links open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Block top-frame navigation away from the app bundle. Without this, an
  // injected link or redirect could load remote content into the renderer with
  // the privileged preload bridge still attached. Same-origin navigation (and
  // SPA history/hash routing, which doesn't fire this) stays allowed.
  const appOrigin = isDev ? (process.env.ELECTRON_RENDERER_URL as string) : 'file://'
  const blockOffOrigin = (e: Electron.Event, url: string): void => {
    if (url.startsWith(appOrigin)) return
    e.preventDefault()
    if (url.startsWith('http:') || url.startsWith('https:')) void shell.openExternal(url)
  }
  win.webContents.on('will-navigate', (e, url) => blockOffOrigin(e, url))
  win.webContents.on('will-redirect', (e, url) => blockOffOrigin(e, url))

  if (isDev) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL as string)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
