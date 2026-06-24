import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { createWindow } from './window'
import { registerIpc } from './ipc'
import { createServices, getServices } from './services/createServices'
import { closeDataStore } from './db'
import { initAutoUpdater } from './services/UpdaterService'
import { TrayController } from './tray'
import { createLogger } from './utils/logger'

const log = createLogger('main')
const PROTOCOL = process.env.VITE_APP_PROTOCOL || 'tokenmaxxing'

let mainWindow: BrowserWindow | null = null
let tray: TrayController | null = null

function ensureWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow()
  }
  mainWindow.show()
  mainWindow.focus()
  return mainWindow
}

// Single-instance lock so OAuth deep links route to the running app.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  // Brand the app early so the menu/About show "TokenMaxxing" (not "Electron").
  app.setName('TokenMaxxing')

  // Register custom protocol for OAuth callbacks (tokenmaxxing://auth/callback).
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [process.argv[1]])
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL)
  }

  app.on('second-instance', (_event, argv) => {
    // Windows/Linux: deep link arrives as an argv entry.
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`))
    if (url) getServices().auth.handleCallbackUrl(url)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // macOS: deep link arrives via open-url.
  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (url.startsWith(`${PROTOCOL}://`)) getServices().auth.handleCallbackUrl(url)
  })

  app.whenReady().then(() => {
    app.setName('TokenMaxxing')

    // Dock icon. Packaged builds use the bundled .icns automatically; in dev we
    // set it at runtime so the Dock shows the logo instead of the Electron atom.
    if (process.platform === 'darwin' && !app.isPackaged && app.dock) {
      const devIcon = join(process.cwd(), 'resources', 'icon.png')
      if (existsSync(devIcon)) app.dock.setIcon(devIcon)
    }

    const svc = createServices()

    // Default the user's country from the OS region (e.g. "IN") when unset, so the
    // leaderboard + globe can place them without precise geolocation. Also adopt
    // the signed-in user's real name as the leaderboard handle.
    try {
      const s = svc.settings.get(svc.store)
      const patch: Record<string, unknown> = {}
      if (!s.countryCode) {
        const cc = app.getLocaleCountryCode?.()
        if (cc && /^[A-Z]{2}$/.test(cc)) patch.countryCode = cc
      }
      const user = svc.auth.getState().user
      if (user?.name && (!s.handle || s.handle === 'anonymous-dev')) patch.handle = user.name
      if (Object.keys(patch).length) svc.settings.update(svc.store, patch)
    } catch {
      /* ignore */
    }

    // Only scan locally while signed in (logout clears + stops accumulation).
    svc.live.setActiveCheck(() => svc.auth.getState().status === 'signed-in')

    mainWindow = createWindow()
    registerIpc(() => mainWindow)

    // macOS menu-bar presence: tokens + rank today, click for the menu.
    tray = new TrayController(svc, {
      showWindow: () => ensureWindow(),
      runScan: async () => {
        // Never scan while signed out — keeps logged-out state data-free.
        if (svc.auth.getState().status !== 'signed-in') return
        const achievementsBefore = svc.store.achievements.getUnlockMap()
        await svc.scanner.run(svc.settings.get(svc.store), svc.store)
        svc.achievements.evaluate(svc.store)
        svc.notifications.check(svc.store, achievementsBefore)
      }
    })
    tray.init()

    // Auto-scan on launch if configured, then start the continuous local-analysis
    // loop (every 10s, incremental — warm passes are near no-ops).
    void maybeAutoScan().finally(() => svc.live.start())

    // Check for app updates (GitHub Releases) and self-update in the background.
    initAutoUpdater(() => mainWindow)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    getServices().live.stop()
    tray?.destroy()
    closeDataStore()
  })
}

async function maybeAutoScan(): Promise<void> {
  try {
    const svc = getServices()
    // Only scan while signed in — keeps logged-out state data-free.
    if (svc.auth.getState().status !== 'signed-in') return
    const settings = svc.settings.get(svc.store)
    const lastScan = svc.store.meta.get('lastScanAt')
    const shouldScan =
      settings.autoScanOnLaunch &&
      (settings.scanFrequency === 'startup' ||
        settings.scanFrequency === 'hourly' ||
        settings.scanFrequency === 'daily' ||
        !lastScan)
    if (!shouldScan) return
    log.info('running auto-scan on launch…')
    const achievementsBefore = svc.store.achievements.getUnlockMap()
    await svc.scanner.run(settings, svc.store)
    svc.achievements.evaluate(svc.store)
    svc.notifications.check(svc.store, achievementsBefore)
  } catch (err) {
    log.error('auto-scan failed:', (err as Error).message)
  }
}
