import { Menu, Tray, nativeImage } from 'electron'
import type { Services } from './services/createServices'
import { createLogger } from './utils/logger'

const log = createLogger('tray')

/** Compact number/money formatting (main process has no renderer helpers). */
function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(Math.round(n))
}
function money(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
  if (n >= 1) return `$${n.toFixed(0)}`
  return `$${n.toFixed(2)}`
}

export interface TrayActions {
  showWindow: () => void
  runScan: () => Promise<void>
}

/**
 * macOS menu-bar presence. Shows today's tokens as the status-bar title and, on
 * click, a menu with today's tokens, global rank and spend — plus quick actions.
 * Auto-refreshes every minute and after each successful scan.
 */
export class TrayController {
  private tray: Tray | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(
    private services: Services,
    private actions: TrayActions
  ) {}

  init(): void {
    // Text-only menu-bar item (no icon — the title shows today's tokens).
    this.tray = new Tray(nativeImage.createEmpty())
    this.tray.setToolTip('TokenMaxxing — your AI usage today')
    this.refresh()

    // Refresh after any scan completes (sidebar, tray, or auto).
    this.services.scanner.onProgress((p) => {
      if (p.status === 'success') this.refresh()
    })
    this.timer = setInterval(() => this.refresh(), 60_000)
    log.info('menu-bar tray initialized')
  }

  refresh(): void {
    if (!this.tray) return
    let tokensToday = 0
    let rank: number | null = null
    let spendToday = 0
    try {
      const snap = this.services.metrics.buildSnapshot(this.services.store)
      tokensToday = snap.stats.tokensToday
      rank = snap.stats.globalRank
      spendToday = snap.stats.spend.today
    } catch (err) {
      log.warn('tray refresh failed', err)
    }

    // Status-bar title: just today's token count (no logo, no emoji).
    this.tray.setTitle(`${compact(tokensToday)} tok`)

    const menu = Menu.buildFromTemplate([
      { label: 'Today', enabled: false },
      { label: `   Tokens used:  ${tokensToday.toLocaleString()}`, enabled: false },
      { label: `   Global rank:  ${rank ? `#${rank.toLocaleString()}` : '—'}`, enabled: false },
      { label: `   Est. spend:   ${money(spendToday)}`, enabled: false },
      { type: 'separator' },
      { label: 'Open Dashboard', click: () => this.actions.showWindow() },
      {
        label: 'Scan now',
        click: () => {
          void this.actions.runScan().then(() => this.refresh())
        }
      },
      { type: 'separator' },
      { label: 'Quit TokenMaxxing', role: 'quit' }
    ])
    this.tray.setContextMenu(menu)
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer)
    this.tray?.destroy()
    this.tray = null
  }
}
