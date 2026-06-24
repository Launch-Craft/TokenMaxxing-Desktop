import { Notification } from 'electron'
import type { DailyUsage } from '@shared/types'
import { ACHIEVEMENTS } from '@shared/achievements'
import { APP_NAME } from '@shared/constants'
import type { DataStore } from '../db'
import { localDateKey } from '../scanner/aggregate'
import type { MetricsService } from './MetricsService'
import type { SettingsService } from './SettingsService'
import { createLogger } from '../utils/logger'

const log = createLogger('notifications')
const META_KEY = 'notificationState'

/** Daily token thresholds — each fires at most once per calendar day. */
const TOKEN_MILESTONES = [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000] as const

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

interface NotificationState {
  fired: Record<string, true>
}

type NavigateFn = (route: string) => void

/**
 * Native desktop notifications for milestones, streaks, Wrapped recaps, and
 * achievement unlocks. Fired keys are persisted in meta so each alert is shown
 * at most once per period.
 */
export class NotificationService {
  private navigate: NavigateFn = () => {}

  constructor(
    private metrics: MetricsService,
    private settings: SettingsService
  ) {}

  setNavigate(fn: NavigateFn): void {
    this.navigate = fn
  }

  /**
   * Evaluate all notification rules. Pass `achievementsBefore` when achievements
   * were just re-evaluated so new unlocks can be announced.
   */
  check(store: DataStore, achievementsBefore?: Record<string, string | null>): void {
    const prefs = this.settings.get(store).notifications
    if (!prefs.enabled) return

    const snapshot = this.metrics.buildSnapshot(store)
    const stats = snapshot.stats
    const daily = store.daily.all()
    const now = new Date()
    const todayKey = localDateKey(now)
    const state = this.loadState(store)

    if (prefs.milestones) {
      for (const milestone of TOKEN_MILESTONES) {
        if (stats.tokensToday < milestone) continue
        const key = `milestone-${todayKey}-${milestone}`
        if (state.fired[key]) continue
        this.show({
          title: 'Token milestone',
          body: `You hit ${compact(milestone)} tokens today. Keep maxxing.`,
          route: '/'
        })
        state.fired[key] = true
      }
    }

    if (prefs.streaks && stats.currentStreak > 0 && stats.tokensToday === 0 && now.getHours() >= 18) {
      const key = `streak-${todayKey}`
      if (!state.fired[key]) {
        this.show({
          title: 'Streak reminder',
          body: `Keep your ${stats.currentStreak}-day streak alive — code something today.`,
          route: '/'
        })
        state.fired[key] = true
      }
    }

    if (prefs.wrapped) {
      this.maybeWeekWrapped(daily, now, state)
      this.maybeMonthWrapped(daily, now, state)
    }

    if (prefs.achievements && achievementsBefore) {
      const after = store.achievements.getUnlockMap()
      for (const def of ACHIEVEMENTS) {
        if (after[def.id] && !achievementsBefore[def.id]) {
          this.show({
            title: 'Achievement unlocked',
            body: `${def.name} — ${def.description}`,
            route: '/wrapped'
          })
        }
      }
    }

    this.prune(state)
    this.saveState(store, state)
  }

  private maybeWeekWrapped(daily: DailyUsage[], now: Date, state: NotificationState): void {
    // Notify on Monday morning for the previous Mon–Sun week.
    if (now.getDay() !== 1 || now.getHours() < 9) return

    const { start, end, key } = previousWeekRange(now)
    if (state.fired[key]) return

    const week = sumRange(daily, start, end)
    if (week.tokens < 1_000) return

    this.show({
      title: 'Weekly Wrapped is ready',
      body: `Last week: ${compact(week.tokens)} tokens across ${week.sessions} sessions.`,
      route: '/wrapped'
    })
    state.fired[key] = true
  }

  private maybeMonthWrapped(daily: DailyUsage[], now: Date, state: NotificationState): void {
    // Notify during the first three days of a month for the month that just ended.
    if (now.getDate() > 3 || now.getHours() < 9) return

    const prev = previousMonth(now)
    const key = `month-wrapped-${prev.prefix}`
    if (state.fired[key]) return

    const month = sumMonth(daily, prev.prefix)
    if (month.tokens < 1_000) return

    this.show({
      title: 'Monthly Wrapped is ready',
      body: `${prev.label}: ${compact(month.tokens)} tokens across ${month.sessions} sessions.`,
      route: '/wrapped'
    })
    state.fired[key] = true
  }

  private show(opts: { title: string; body: string; route?: string }): void {
    if (!Notification.isSupported()) return
    try {
      const n = new Notification({
        title: APP_NAME,
        subtitle: opts.title,
        body: opts.body
      })
      if (opts.route) {
        n.on('click', () => this.navigate(opts.route!))
      }
      n.show()
      log.info('shown:', opts.title)
    } catch (err) {
      log.warn('could not show notification:', (err as Error).message)
    }
  }

  private loadState(store: DataStore): NotificationState {
    try {
      const raw = store.meta.get(META_KEY)
      if (!raw) return { fired: {} }
      const parsed = JSON.parse(raw) as NotificationState
      return parsed?.fired && typeof parsed.fired === 'object' ? parsed : { fired: {} }
    } catch {
      return { fired: {} }
    }
  }

  private saveState(store: DataStore, state: NotificationState): void {
    store.meta.set(META_KEY, JSON.stringify(state))
  }

  /** Drop fired keys older than ~90 days. */
  private prune(state: NotificationState): void {
    const cutoff = Date.now() - 90 * 86_400_000
    for (const key of Object.keys(state.fired)) {
      const m = key.match(/(\d{4}-\d{2}-\d{2})/)
      if (m && new Date(`${m[1]}T00:00:00`).getTime() < cutoff) delete state.fired[key]
    }
  }
}

function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toLocaleString()
}

function previousWeekRange(now: Date): { start: string; end: string; key: string } {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const end = new Date(d)
  end.setDate(d.getDate() - 1) // previous Sunday
  const start = new Date(end)
  start.setDate(end.getDate() - 6) // previous Monday
  const startKey = localDateKey(start)
  return { start: startKey, end: localDateKey(end), key: `week-wrapped-${startKey}` }
}

function previousMonth(now: Date): { prefix: string; label: string } {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return { prefix, label: MONTHS[d.getMonth()] }
}

function sumRange(
  daily: DailyUsage[],
  start: string,
  end: string
): { tokens: number; sessions: number } {
  let tokens = 0
  let sessions = 0
  for (const row of daily) {
    if (row.date >= start && row.date <= end) {
      tokens += row.tokens
      sessions += row.sessions
    }
  }
  return { tokens, sessions }
}

function sumMonth(daily: DailyUsage[], prefix: string): { tokens: number; sessions: number } {
  let tokens = 0
  let sessions = 0
  for (const row of daily) {
    if (row.date.startsWith(prefix)) {
      tokens += row.tokens
      sessions += row.sessions
    }
  }
  return { tokens, sessions }
}
