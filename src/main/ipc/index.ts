import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { IPC, type AppInfo, type SessionFilter } from '@shared/ipc'
import type { AuthProvider, Settings } from '@shared/types'
import { APP_NAME } from '@shared/constants'
import { getServices } from '../services/createServices'
import { userDataDir } from '../utils/paths'
import { createLogger } from '../utils/logger'

const log = createLogger('ipc')

type Handler = (...args: unknown[]) => unknown | Promise<unknown>

/** Wrap an invokable handler with consistent error logging. */
function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await fn(...args)
    } catch (err) {
      log.error(`handler ${channel} failed:`, (err as Error).message)
      throw err
    }
  })
}

function isSafeExternalUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return ['http:', 'https:', 'mailto:'].includes(u.protocol)
  } catch {
    return false
  }
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const svc = getServices()

  // ── App / window ───────────────────────────────────────────────────────────
  handle(IPC.appInfo, (): AppInfo => {
    return {
      name: APP_NAME,
      version: app.getVersion(),
      platform: process.platform,
      dataDir: userDataDir(),
      isPackaged: app.isPackaged
    }
  })

  handle(IPC.openExternal, async (url) => {
    if (typeof url === 'string' && isSafeExternalUrl(url)) await shell.openExternal(url)
  })

  ipcMain.on(IPC.windowMinimize, () => getWindow()?.minimize())
  ipcMain.on(IPC.windowMaximizeToggle, () => {
    const win = getWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on(IPC.windowClose, () => getWindow()?.close())
  handle(IPC.windowIsMaximized, () => getWindow()?.isMaximized() ?? false)

  // ── Metrics ──────────────────────────────────────────────────────────────────
  handle(IPC.metricsSnapshot, () => svc.metrics.buildSnapshot(svc.store))
  handle(IPC.metricsSessions, (filter) => svc.store.sessions.query(filter as SessionFilter))

  // ── Scanning ─────────────────────────────────────────────────────────────────
  svc.scanner.onProgress((progress) => {
    getWindow()?.webContents.send(IPC.scanProgress, progress)
  })
  handle(IPC.scanRun, async () => {
    const settings = svc.settings.get(svc.store)
    const achievementsBefore = svc.store.achievements.getUnlockMap()
    const result = await svc.scanner.run(settings, svc.store)
    svc.achievements.evaluate(svc.store)
    svc.notifications.check(svc.store, achievementsBefore)
    return result
  })
  handle(IPC.scanStatus, () => svc.scanner.getStatus())

  // ── Continuous local analysis (2s loop) ──────────────────────────────────────
  svc.live.setBroadcast((tick) => getWindow()?.webContents.send(IPC.analysisTick, tick))
  handle(IPC.analysisStatus, () => svc.live.getStatus())
  svc.notifications.setNavigate((route) => {
    const win = getWindow()
    if (!win) return
    win.show()
    win.focus()
    win.webContents.send(IPC.notificationNavigate, route)
  })

  // ── Settings ─────────────────────────────────────────────────────────────────
  handle(IPC.settingsGet, () => svc.settings.get(svc.store))
  handle(IPC.settingsUpdate, (patch) => svc.settings.update(svc.store, patch as Partial<Settings>))

  // ── Achievements ─────────────────────────────────────────────────────────────
  handle(IPC.achievementsGet, () => svc.achievements.evaluate(svc.store))

  // ── Rankings ─────────────────────────────────────────────────────────────────
  handle(IPC.rankingsGet, () =>
    svc.rankings.get(svc.store, svc.settings.get(svc.store), svc.auth.token())
  )
  handle(IPC.rankingsRefresh, () =>
    svc.rankings.refresh(svc.store, svc.settings.get(svc.store), svc.auth.token())
  )

  // ── Wrapped ──────────────────────────────────────────────────────────────────
  handle(IPC.wrappedGet, (year) => svc.wrapped.generate(svc.store, Number(year)))
  handle(IPC.wrappedYears, () => svc.wrapped.listYears(svc.store))

  // ── Auth ─────────────────────────────────────────────────────────────────────
  svc.auth.setOnChange((state) => {
    // On sign-in, adopt the user's real name as the leaderboard handle (and OS
    // country if unset) so the board shows their name, not "anonymous-dev".
    if (state.status === 'signed-in' && state.user) {
      try {
        const s = svc.settings.get(svc.store)
        const patch: Partial<Settings> = {}
        if (state.user.name && (!s.handle || s.handle === 'anonymous-dev')) {
          patch.handle = state.user.name
        }
        if (!s.countryCode) {
          const cc = app.getLocaleCountryCode?.()
          if (cc && /^[A-Z]{2}$/.test(cc)) patch.countryCode = cc
        }
        // Signing into a cloud account IS the opt-in to the leaderboard, so turn
        // cloud sync + ranking participation on. Only aggregated metrics (no code
        // or prompts) are ever sent, and the user can disable this in Settings.
        if (!s.privacy.cloudSyncEnabled || !s.privacy.rankingParticipation) {
          patch.privacy = { ...s.privacy, cloudSyncEnabled: true, rankingParticipation: true }
        }
        if (Object.keys(patch).length) svc.settings.update(svc.store, patch)
      } catch {
        /* ignore */
      }
    }
    getWindow()?.webContents.send(IPC.authChanged, state)
  })
  handle(IPC.authState, () => svc.auth.getState())
  handle(IPC.authSignIn, (provider) => svc.auth.signIn(provider as AuthProvider))
  handle(IPC.authSignOut, () => svc.auth.signOut())

  // ── Privacy ──────────────────────────────────────────────────────────────────
  handle(IPC.privacyExport, async () => {
    const result = await svc.settings.exportData(svc.store)
    if (result.path) shell.showItemInFolder(result.path)
    return result
  })
  handle(IPC.privacyDeleteAll, async () => {
    const settings = svc.settings.get(svc.store)
    svc.store.clearAll()
    // Preserve the user's privacy choices but wipe all metrics.
    svc.settings.update(svc.store, { privacy: settings.privacy, handle: settings.handle })
    // Disable any cloud copy too.
    if (settings.privacy.cloudSyncEnabled) {
      await svc.sync.deleteCloudData(settings, svc.auth.token())
    }
  })

  log.info('IPC handlers registered')
}

/** Emit a window-maximized change to the renderer (called from window.ts). */
export function emitMaximizedChanged(win: BrowserWindow, maximized: boolean): void {
  win.webContents.send(IPC.windowMaximizedChanged, maximized)
}
