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

  if (isDev) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL as string)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
