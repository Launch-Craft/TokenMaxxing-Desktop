import type {
  ChartGranularity,
  DailyUsage,
  DashboardStats,
  MetricsSnapshot,
  ModelCost,
  PeriodStat,
  Session,
  TimeSeriesPoint,
  ToolBreakdownSlice,
  ToolId,
  ToolMetrics
} from '@shared/types'
import { TOOL_META } from '@shared/constants'
import { estimatePercentile, percentileToRank } from '@shared/ranking'
import { costForBreakdown, priceForModel } from '@shared/pricing'
import type { DataStore } from '../db'
import { localDateKey } from '../scanner/aggregate'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

const NOMINAL_POPULATION = 120_000

function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // Monday = 0
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

/** Builds the read-model the dashboard renders, derived from persisted data. */
export class MetricsService {
  buildSnapshot(store: DataStore): MetricsSnapshot {
    const daily = store.daily.all()
    const toolMetrics = store.toolMetrics.all()
    const sessions = store.sessions.all()
    const { costByTool, modelCosts } = this.computeCosts(sessions)

    return {
      generatedAt: new Date().toISOString(),
      stats: this.computeStats(daily, sessions),
      series: {
        daily: this.dailySeries(daily, sessions, 30),
        weekly: this.weeklySeries(daily, 12),
        monthly: this.monthlySeries(daily, 12),
        yearly: this.yearlySeries(daily)
      },
      toolBreakdown: this.toolBreakdown(toolMetrics, costByTool),
      toolBreakdownByPeriod: this.toolBreakdownByPeriod(sessions),
      modelCosts,
      recentSessions: [...sessions]
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, 8),
      daily
    }
  }

  // ── Cost / spend ─────────────────────────────────────────────────────────────

  /** Group estimated USD spend by tool and by model from per-session pricing. */
  private computeCosts(sessions: Session[]): {
    costByTool: Map<ToolId, number>
    modelCosts: ModelCost[]
  } {
    const costByTool = new Map<ToolId, number>()
    const modelMap = new Map<
      string,
      { label: string; tokens: number; cost: number; input: number; output: number }
    >()
    for (const s of sessions) {
      const cost = costForBreakdown(s.tokenBreakdown, s.model)
      costByTool.set(s.toolId, (costByTool.get(s.toolId) ?? 0) + cost)
      const { id, label, price } = priceForModel(s.model)
      const m =
        modelMap.get(id) ??
        { label, tokens: 0, cost: 0, input: price.input, output: price.output }
      m.tokens += s.estimatedTokens
      m.cost += cost
      modelMap.set(id, m)
    }
    const modelCosts: ModelCost[] = [...modelMap.entries()]
      .map(([modelId, v]) => ({
        modelId,
        label: v.label,
        tokens: v.tokens,
        costUsd: v.cost,
        pricePerMInput: v.input,
        pricePerMOutput: v.output
      }))
      .sort((a, b) => b.costUsd - a.costUsd)
    return { costByTool, modelCosts }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  private computeStats(daily: DailyUsage[], sessions: Session[]): DashboardStats {
    const byDate = new Map(daily.map((d) => [d.date, d]))
    const now = new Date()
    const todayKey = localDateKey(now)
    const yKey = localDateKey(new Date(now.getTime() - 86_400_000))

    const tokensToday = byDate.get(todayKey)?.tokens ?? 0
    const tokensYesterday = byDate.get(yKey)?.tokens ?? 0

    const monthPrefix = todayKey.slice(0, 7)
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthPrefix = localDateKey(lastMonthDate).slice(0, 7)
    const dayOfMonth = now.getDate()

    let tokensThisMonth = 0
    let tokensLastMonthToDate = 0
    let minutesThisMonth = 0
    let minutesLastMonth = 0
    for (const d of daily) {
      if (d.date.startsWith(monthPrefix)) {
        tokensThisMonth += d.tokens
        minutesThisMonth += d.activeMinutes
      } else if (d.date.startsWith(lastMonthPrefix)) {
        if (Number(d.date.slice(8, 10)) <= dayOfMonth) tokensLastMonthToDate += d.tokens
        minutesLastMonth += d.activeMinutes
      }
    }

    const totalTokens = daily.reduce((s, d) => s + d.tokens, 0)
    const since = now.getTime() - 86_400_000
    const activeSessions = sessions.filter((s) => new Date(s.startedAt).getTime() >= since).length

    // Per-period rollups (one pass): tokens (gross/net), spend (excl cache),
    // coding minutes, and session counts for today / week / month / year.
    const weekStartKey = localDateKey(new Date(now.getTime() - 6 * 86_400_000))
    const yearPrefix = todayKey.slice(0, 4)
    type Acc = { gross: number; net: number; spend: number; minutes: number; sessions: number }
    const mk = (): Acc => ({ gross: 0, net: 0, spend: 0, minutes: 0, sessions: 0 })
    const pDay = mk()
    const pWeek = mk()
    const pMonth = mk()
    const pYear = mk()
    let spendTotal = 0
    let gTotal = 0
    const add = (a: Acc, g: number, n: number, c: number, m: number): void => {
      a.gross += g
      a.net += n
      a.spend += c
      a.minutes += m
      a.sessions += 1
    }
    for (const s of sessions) {
      const net = s.estimatedTokens
      const gross = net + s.tokenBreakdown.cacheRead + s.tokenBreakdown.cacheCreate
      const cost = costForBreakdown(s.tokenBreakdown, s.model)
      const min = s.durationMinutes
      spendTotal += cost
      gTotal += gross
      const d = localDateKey(new Date(s.startedAt))
      if (d === todayKey) add(pDay, gross, net, cost, min)
      if (d >= weekStartKey) add(pWeek, gross, net, cost, min)
      if (d.startsWith(monthPrefix)) add(pMonth, gross, net, cost, min)
      if (d.startsWith(yearPrefix)) add(pYear, gross, net, cost, min)
    }
    const toStat = (a: Acc): PeriodStat => ({
      grossTokens: a.gross,
      netTokens: a.net,
      spend: a.spend,
      codingHours: Number((a.minutes / 60).toFixed(1)),
      sessions: a.sessions
    })

    const { current, longest } = this.streaks(byDate, now)
    const percentile = estimatePercentile(totalTokens)
    const globalRank = totalTokens > 0 ? percentileToRank(percentile, NOMINAL_POPULATION) : null

    return {
      tokensToday,
      tokensThisMonth,
      activeSessions,
      codingHours: Number((minutesThisMonth / 60).toFixed(1)),
      globalRank,
      currentStreak: current,
      longestStreak: longest,
      totalTokens,
      spend: { today: pDay.spend, month: pMonth.spend, total: spendTotal },
      gross: {
        today: pDay.gross,
        week: pWeek.gross,
        month: pMonth.gross,
        year: pYear.gross,
        total: gTotal
      },
      periods: {
        daily: toStat(pDay),
        weekly: toStat(pWeek),
        monthly: toStat(pMonth),
        yearly: toStat(pYear)
      },
      deltas: {
        tokensToday: pctDelta(tokensToday, tokensYesterday),
        tokensThisMonth: pctDelta(tokensThisMonth, tokensLastMonthToDate),
        codingHours: pctDelta(minutesThisMonth, minutesLastMonth)
      }
    }
  }

  private streaks(byDate: Map<string, DailyUsage>, now: Date): { current: number; longest: number } {
    // Current streak: count back from today (or yesterday) while days have activity.
    let current = 0
    const cursor = new Date(now)
    // Allow the streak to "start" yesterday if today has no activity yet.
    if (!(byDate.get(localDateKey(cursor))?.tokens)) cursor.setDate(cursor.getDate() - 1)
    while (byDate.get(localDateKey(cursor))?.tokens) {
      current++
      cursor.setDate(cursor.getDate() - 1)
    }

    // Longest streak across all recorded days.
    const days = [...byDate.values()]
      .filter((d) => d.tokens > 0)
      .map((d) => d.date)
      .sort()
    let longest = 0
    let run = 0
    let prev: Date | null = null
    for (const key of days) {
      const d = new Date(key + 'T00:00:00')
      if (prev && (d.getTime() - prev.getTime()) / 86_400_000 === 1) {
        run++
      } else {
        run = 1
      }
      longest = Math.max(longest, run)
      prev = d
    }
    return { current, longest: Math.max(longest, current) }
  }

  // ── Time series ──────────────────────────────────────────────────────────

  private dailySeries(daily: DailyUsage[], sessions: Session[], days: number): TimeSeriesPoint[] {
    const byDate = new Map(daily.map((d) => [d.date, d]))
    const points: TimeSeriesPoint[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86_400_000)
      const key = localDateKey(d)
      const row = byDate.get(key)
      points.push({
        label: key,
        timestamp: d.toISOString(),
        tokens: row?.tokens ?? 0,
        sessions: row?.sessions ?? 0,
        activeMinutes: row?.activeMinutes ?? 0
      })
    }
    return points
  }

  private weeklySeries(daily: DailyUsage[], weeks: number): TimeSeriesPoint[] {
    const buckets = new Map<string, TimeSeriesPoint>()
    const cutoff = startOfWeek(new Date(Date.now() - weeks * 7 * 86_400_000))
    for (const d of daily) {
      const date = new Date(d.date + 'T00:00:00')
      if (date < cutoff) continue
      const ws = startOfWeek(date)
      const key = localDateKey(ws)
      const point =
        buckets.get(key) ??
        ({
          label: `${MONTHS[ws.getMonth()]} ${ws.getDate()}`,
          timestamp: ws.toISOString(),
          tokens: 0,
          sessions: 0,
          activeMinutes: 0
        } as TimeSeriesPoint)
      point.tokens += d.tokens
      point.sessions += d.sessions
      point.activeMinutes += d.activeMinutes
      buckets.set(key, point)
    }
    return [...buckets.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }

  private monthlySeries(daily: DailyUsage[], months: number): TimeSeriesPoint[] {
    const buckets = new Map<string, TimeSeriesPoint>()
    const now = new Date()
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      buckets.set(key, {
        label: `${MONTHS[d.getMonth()]}`,
        timestamp: d.toISOString(),
        tokens: 0,
        sessions: 0,
        activeMinutes: 0
      })
    }
    for (const d of daily) {
      const key = d.date.slice(0, 7)
      const point = buckets.get(key)
      if (point) {
        point.tokens += d.tokens
        point.sessions += d.sessions
        point.activeMinutes += d.activeMinutes
      }
    }
    return [...buckets.values()]
  }

  private yearlySeries(daily: DailyUsage[]): TimeSeriesPoint[] {
    const buckets = new Map<string, TimeSeriesPoint>()
    for (const d of daily) {
      const year = d.date.slice(0, 4)
      const point =
        buckets.get(year) ??
        ({
          label: year,
          timestamp: `${year}-01-01T00:00:00.000Z`,
          tokens: 0,
          sessions: 0,
          activeMinutes: 0
        } as TimeSeriesPoint)
      point.tokens += d.tokens
      point.sessions += d.sessions
      point.activeMinutes += d.activeMinutes
      buckets.set(year, point)
    }
    return [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label))
  }

  // ── Tool breakdown ─────────────────────────────────────────────────────────

  /** Per-period tool breakdown (net tokens + cost), driven by the dashboard tab. */
  private toolBreakdownByPeriod(
    sessions: Session[]
  ): Record<ChartGranularity, ToolBreakdownSlice[]> {
    const now = new Date()
    const todayKey = localDateKey(now)
    const weekStartKey = localDateKey(new Date(now.getTime() - 6 * 86_400_000))
    const monthPrefix = todayKey.slice(0, 7)
    const yearPrefix = todayKey.slice(0, 4)
    const inPeriod = (d: string, p: ChartGranularity): boolean =>
      p === 'daily'
        ? d === todayKey
        : p === 'weekly'
          ? d >= weekStartKey
          : p === 'monthly'
            ? d.startsWith(monthPrefix)
            : d.startsWith(yearPrefix)

    const build = (p: ChartGranularity): ToolBreakdownSlice[] => {
      const byTool = new Map<ToolId, { tokens: number; cost: number; sessions: number }>()
      for (const s of sessions) {
        if (!inPeriod(localDateKey(new Date(s.startedAt)), p)) continue
        const t = byTool.get(s.toolId) ?? { tokens: 0, cost: 0, sessions: 0 }
        // tokens = gross (incl. cache reads + writes); cost stays real-usage only.
        t.tokens += s.estimatedTokens + s.tokenBreakdown.cacheRead + s.tokenBreakdown.cacheCreate
        t.cost += costForBreakdown(s.tokenBreakdown, s.model)
        t.sessions += 1
        byTool.set(s.toolId, t)
      }
      const total = [...byTool.values()].reduce((sum, v) => sum + v.tokens, 0)
      return [...byTool.entries()]
        .map(([toolId, v]) => ({
          toolId,
          toolName: TOOL_META[toolId]?.name ?? toolId,
          tokens: v.tokens,
          sessions: v.sessions,
          percentage: total > 0 ? Number(((v.tokens / total) * 100).toFixed(1)) : 0,
          costUsd: v.cost,
          color: TOOL_META[toolId]?.color ?? TOOL_META.other.color
        }))
        .sort((a, b) => b.tokens - a.tokens)
    }

    return {
      daily: build('daily'),
      weekly: build('weekly'),
      monthly: build('monthly'),
      yearly: build('yearly')
    }
  }

  private toolBreakdown(
    toolMetrics: ToolMetrics[],
    costByTool: Map<ToolId, number>
  ): ToolBreakdownSlice[] {
    const detected = toolMetrics.filter((t) => t.estimatedTokens > 0)
    const total = detected.reduce((s, t) => s + t.estimatedTokens, 0)
    return detected
      .map((t) => ({
        toolId: t.toolId,
        toolName: t.toolName,
        tokens: t.estimatedTokens,
        sessions: t.sessionCount,
        percentage: total > 0 ? Number(((t.estimatedTokens / total) * 100).toFixed(1)) : 0,
        costUsd: costByTool.get(t.toolId) ?? 0,
        color: TOOL_META[t.toolId]?.color ?? TOOL_META.other.color
      }))
      .sort((a, b) => b.tokens - a.tokens)
  }

  /** Aggregated counters used by the achievement engine and wrapped reports. */
  derivedTotals(store: DataStore): {
    totalTokens: number
    totalCodingHours: number
    distinctToolsUsed: number
    projectCount: number
    longestSessionMinutes: number
    midnightDays: number
    earlyBirdDays: number
    toolTotals: Partial<Record<ToolId, number>>
  } {
    const sessions = store.sessions.all()
    const daily = store.daily.all()
    const projects = new Set<string>()
    const tools = new Set<ToolId>()
    const midnight = new Set<string>()
    const early = new Set<string>()
    const toolTotals: Partial<Record<ToolId, number>> = {}
    let longestSession = 0
    let minutes = 0

    for (const s of sessions) {
      projects.add(`${s.toolId}:${s.projectName}`)
      tools.add(s.toolId)
      toolTotals[s.toolId] = (toolTotals[s.toolId] ?? 0) + s.estimatedTokens
      longestSession = Math.max(longestSession, s.durationMinutes)
      minutes += s.durationMinutes
      const start = new Date(s.startedAt)
      const hr = start.getHours()
      const dayKey = localDateKey(start)
      if (hr >= 0 && hr < 5) midnight.add(dayKey)
      if (hr >= 4 && hr < 6) early.add(dayKey)
    }

    return {
      totalTokens: daily.reduce((sum, d) => sum + d.tokens, 0),
      totalCodingHours: Number((minutes / 60).toFixed(1)),
      distinctToolsUsed: tools.size,
      projectCount: new Set([...projects].map((p) => p.split(':')[1])).size,
      longestSessionMinutes: longestSession,
      midnightDays: midnight.size,
      earlyBirdDays: early.size,
      toolTotals
    }
  }
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null
  return Number((((current - previous) / previous) * 100).toFixed(0))
}
