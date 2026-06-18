import { app, dialog, shell, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { createLogger } from '../utils/logger'

const log = createLogger('updater')
const RELEASES_URL = 'https://github.com/Launch-Craft/TokenMaxxing-Desktop/releases/latest'

/**
 * Auto-update via electron-updater. On launch (and every 6h) it checks the
 * GitHub Releases feed (latest-mac.yml) published by the release workflow,
 * downloads a newer version in the background, and prompts the user to restart.
 * It also installs automatically on the next quit.
 *
 * IMPORTANT (macOS): Squirrel.Mac only applies updates to a CODE-SIGNED +
 * NOTARIZED app. For unsigned builds the download succeeds but the install step
 * fails — so we fall back to opening the Releases page for a manual download.
 */
export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) {
    log.info('dev build — auto-update disabled')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // Never let a crafted/older feed push a downgrade to a vulnerable version.
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = false

  let notifiedFallback = false
  const openDownloadFallback = (version?: string): void => {
    if (notifiedFallback) return
    notifiedFallback = true
    const win = getWindow()
    const opts = {
      type: 'info' as const,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update available',
      message: version ? `TokenMaxxing ${version} is available` : 'A new version is available',
      detail: "Open the download page to get the latest version."
    }
    const onPick = (r: { response: number }): void => {
      if (r.response === 0) void shell.openExternal(RELEASES_URL)
    }
    if (win) void dialog.showMessageBox(win, opts).then(onPick)
    else void dialog.showMessageBox(opts).then(onPick)
  }

  autoUpdater.on('checking-for-update', () => log.info('checking for update…'))
  autoUpdater.on('update-available', (info) => log.info(`update available: ${info.version}`))
  autoUpdater.on('update-not-available', () => log.info('up to date'))
  autoUpdater.on('download-progress', (p) =>
    log.info(`downloading update ${Math.round(p.percent)}%`)
  )
  autoUpdater.on('error', (err) => {
    // On macOS this is usually the unsigned-build install failure → manual fallback.
    log.warn('auto-update error:', (err as Error).message)
    openDownloadFallback()
  })
  autoUpdater.on('update-downloaded', (info) => {
    const win = getWindow()
    const opts = {
      type: 'info' as const,
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `TokenMaxxing ${info.version} is ready to install`,
      detail: 'Restart to apply it now — otherwise it installs automatically next time you quit.'
    }
    const onPick = (r: { response: number }): void => {
      if (r.response === 0) {
        try {
          autoUpdater.quitAndInstall()
        } catch (err) {
          log.warn('quitAndInstall failed:', (err as Error).message)
          openDownloadFallback(info.version)
        }
      }
    }
    if (win) void dialog.showMessageBox(win, opts).then(onPick)
    else void dialog.showMessageBox(opts).then(onPick)
  })

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err) => log.warn('check failed:', (err as Error).message))
  }
  check()
  const timer = setInterval(check, 6 * 60 * 60 * 1000) // every 6h
  timer.unref?.()
}
