import { LIVE_ANALYSIS_INTERVAL_MS } from '@shared/constants'
import type { AnalysisTick } from '@shared/types'
import type { DataStore } from '../db'
import type { ScannerService } from '../scanner/ScannerService'
import type { SettingsService } from './SettingsService'
import type { AchievementEngine } from './AchievementEngine'
import type { NotificationService } from './NotificationService'
import { createLogger } from '../utils/logger'

const log = createLogger('live-analysis')

type Broadcast = (tick: AnalysisTick) => void

/**
 * Drives the continuous, on-device analysis loop. Every
 * {@link LIVE_ANALYSIS_INTERVAL_MS} (2s) it runs a QUIET incremental scan —
 * unchanged sources are skipped via fingerprints, so a warm pass is a near
 * no-op. Each pass emits an {@link AnalysisTick} the renderer uses to show
 * "last analyzed Xs ago" and to refresh derived data only when something
 * actually changed. Nothing here uploads anything — analysis is purely local;
 * the detailed results live in the local SQLite store.
 */
export class LiveAnalysisService {
  private timer: ReturnType<typeof setInterval> | null = null
  private ticking = false
  private last: AnalysisTick | null = null
  private errorLogged = false
  private broadcast: Broadcast = () => {}
  /** Only scan while this returns true (e.g. signed in). */
  private isActive: () => boolean = () => true

  constructor(
    private scanner: ScannerService,
    private store: DataStore,
    private settings: SettingsService,
    private achievements: AchievementEngine,
    private notifications: NotificationService
  ) {}

  setBroadcast(fn: Broadcast): void {
    this.broadcast = fn
  }

  setActiveCheck(fn: () => boolean): void {
    this.isActive = fn
  }

  getStatus(): AnalysisTick | null {
    return this.last
  }

  start(): void {
    if (this.timer) return
    log.info(`continuous local analysis enabled — every ${LIVE_ANALYSIS_INTERVAL_MS}ms (incremental)`)
    void this.tick() // immediate first pass
    this.timer = setInterval(() => void this.tick(), LIVE_ANALYSIS_INTERVAL_MS)
    // Never hold the process open just for this heartbeat.
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking) return // coalesce: never overlap passes
    if (!this.isActive()) return // only scan while signed in
    this.ticking = true
    try {
      const settings = this.settings.get(this.store)
      const result = await this.scanner.run(settings, this.store, { quiet: true })
      const changed = result.sourcesParsed > 0 || result.sourcesRemoved > 0
      const achievementsBefore = changed ? this.store.achievements.getUnlockMap() : undefined
      if (changed) this.achievements.evaluate(this.store)
      this.notifications.check(this.store, achievementsBefore)
      const tick: AnalysisTick = {
        at: new Date().toISOString(),
        changed,
        totalTokens: result.totalTokens,
        intervalMs: LIVE_ANALYSIS_INTERVAL_MS
      }
      this.last = tick
      this.broadcast(tick)
      this.errorLogged = false
    } catch (err) {
      // Log once per error streak so a persistent failure doesn't spam logs.
      if (!this.errorLogged) {
        log.warn('live analysis pass failed:', (err as Error).message)
        this.errorLogged = true
      }
    } finally {
      this.ticking = false
    }
  }
}
