import { ACHIEVEMENTS, evaluateAchievements } from '@shared/achievements'
import { DEFAULT_SETTINGS, TOOL_META } from '@shared/constants'
import {
  estimatePercentile,
  percentileToRank,
  synthesizeCountryShipping,
  synthesizeLeaderboard
} from '@shared/ranking'
import { costForBreakdown, priceForModel } from '@shared/pricing'
import { classifyToolCategory } from '@shared/agentic'
import type {
  Achievement,
  AgenticStats,
  AgenticSummary,
  ChartGranularity,
  DailyUsage,
  MetricsSnapshot,
  ModelCost,
  PeriodStat,
  RankingSnapshot,
  ScanResult,
  Session,
  Settings,
  TimeSeriesPoint,
  ToolBreakdownSlice,
  ToolCallStat,
  ToolId,
  WrappedReport
} from '@shared/types'

/**
 * Deterministic demo dataset. Used only when the Electron bridge (`window.api`)
 * isn't available — e.g. running the renderer in a plain browser for design
 * work. In the packaged app, all data comes from real local scans.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TOOLS: ToolId[] = ['claude-code', 'cursor', 'codex', 'gemini-cli', 'aider']
const PROJECTS = ['orbit-api', 'lumen-ui', 'paper-trading', 'tokenmaxxing', 'rcms-helper', 'auralis']
const MODELS = ['claude-opus-4-8', 'claude-sonnet-4-6', 'gpt-5-codex', 'gemini-2.5-pro']

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

let cached: { daily: DailyUsage[]; sessions: Session[] } | null = null

function generate(): { daily: DailyUsage[]; sessions: Session[] } {
  if (cached) return cached
  const rand = rng(20260618)
  const daily: DailyUsage[] = []
  const sessions: Session[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 365; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000)
    const weekend = d.getDay() === 0 || d.getDay() === 6
    // Occasional break days to create realistic streaks.
    const skip = rand() < (weekend ? 0.45 : 0.08)
    const byTool: Partial<Record<ToolId, number>> = {}
    let dayTokens = 0
    let daySessions = 0
    let dayMinutes = 0
    if (!skip) {
      const count = 1 + Math.floor(rand() * (weekend ? 2 : 4))
      for (let s = 0; s < count; s++) {
        const tool = TOOLS[Math.floor(rand() * TOOLS.length)]
        const base = tool === 'claude-code' ? 180_000 : tool === 'cursor' ? 60_000 : 35_000
        const tokens = Math.round(base * (0.4 + rand() * 1.8))
        const minutes = 15 + Math.floor(rand() * 130)
        const start = new Date(d.getTime() + (8 + Math.floor(rand() * 14)) * 3_600_000)
        const project = PROJECTS[Math.floor(rand() * PROJECTS.length)]
        sessions.push({
          id: `mock-${i}-${s}`,
          toolId: tool,
          toolName: TOOL_META[tool].name,
          projectName: project,
          estimatedTokens: tokens,
          tokenBreakdown: {
            // total = input + output only (tokens used, excl. all cache).
            input: Math.round(tokens * 0.25),
            output: Math.round(tokens * 0.75),
            cacheRead: Math.round(tokens * 7),
            cacheCreate: Math.round(tokens * 1.5),
            total: tokens
          },
          startedAt: start.toISOString(),
          endedAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
          durationMinutes: minutes,
          messageCount: 5 + Math.floor(rand() * 60),
          model: MODELS[Math.floor(rand() * MODELS.length)],
          // Only Claude Code records tool-call telemetry in reality.
          agentic: tool === 'claude-code' ? mockAgentic(rand) : undefined
        })
        byTool[tool] = (byTool[tool] ?? 0) + tokens
        dayTokens += tokens
        daySessions += 1
        dayMinutes += minutes
      }
    }
    daily.push({ date: key(d), tokens: dayTokens, sessions: daySessions, activeMinutes: dayMinutes, byTool })
  }
  cached = { daily, sessions }
  return cached
}

function bucketMonthly(daily: DailyUsage[]): TimeSeriesPoint[] {
  const out: TimeSeriesPoint[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const rows = daily.filter((x) => x.date.startsWith(prefix))
    out.push({
      label: MONTHS[d.getMonth()],
      timestamp: d.toISOString(),
      tokens: rows.reduce((s, r) => s + r.tokens, 0),
      sessions: rows.reduce((s, r) => s + r.sessions, 0),
      activeMinutes: rows.reduce((s, r) => s + r.activeMinutes, 0)
    })
  }
  return out
}

/** Realistic per-session tool-call telemetry for a mock Claude Code session. */
const MOCK_TOOL_WEIGHTS: [string, number][] = [
  ['Bash', 30], ['Edit', 26], ['Read', 22], ['Write', 6], ['Grep', 5],
  ['TodoWrite', 4], ['Glob', 3], ['Agent', 2], ['Workflow', 1], ['WebFetch', 1]
]

function mockAgentic(rand: () => number): AgenticStats {
  const total = 20 + Math.floor(rand() * 180)
  const byTool: Record<string, number> = {}
  for (let i = 0; i < total; i++) {
    let pick = rand() * MOCK_TOOL_WEIGHTS.reduce((s, [, w]) => s + w, 0)
    for (const [name, w] of MOCK_TOOL_WEIGHTS) {
      pick -= w
      if (pick <= 0) {
        byTool[name] = (byTool[name] ?? 0) + 1
        break
      }
    }
  }
  const toolResults = total
  const toolErrors = Math.round(total * (0.005 + rand() * 0.03))
  return {
    toolCalls: total,
    toolResults,
    toolErrors,
    agentsSpawned: byTool['Agent'] ?? 0,
    workflows: byTool['Workflow'] ?? 0,
    byTool
  }
}

/** Mirror of MetricsService.computeAgentic for the in-browser demo dataset. */
function summarizeAgentic(sessions: Session[]): AgenticSummary {
  let sessionsWithTools = 0
  let totalToolCalls = 0
  let totalToolResults = 0
  let totalToolErrors = 0
  let totalAgentsSpawned = 0
  let totalWorkflows = 0
  let maxAgentsInSession = 0
  const byTool = new Map<string, { calls: number; errors: number }>()
  for (const s of sessions) {
    const a = s.agentic
    if (!a || a.toolCalls === 0) continue
    sessionsWithTools++
    totalToolCalls += a.toolCalls
    totalToolResults += a.toolResults
    totalToolErrors += a.toolErrors
    totalAgentsSpawned += a.agentsSpawned
    totalWorkflows += a.workflows
    maxAgentsInSession = Math.max(maxAgentsInSession, a.agentsSpawned)
    const errRate = a.toolResults > 0 ? a.toolErrors / a.toolResults : 0
    for (const [name, calls] of Object.entries(a.byTool)) {
      const t = byTool.get(name) ?? { calls: 0, errors: 0 }
      t.calls += calls
      t.errors += calls * errRate
      byTool.set(name, t)
    }
  }
  const toolUsage: ToolCallStat[] = [...byTool.entries()]
    .map(([name, v]) => ({
      name,
      calls: v.calls,
      errors: Math.round(v.errors),
      share: totalToolCalls > 0 ? Number(((v.calls / totalToolCalls) * 100).toFixed(1)) : 0,
      successRate: v.calls > 0 ? Number((((v.calls - v.errors) / v.calls) * 100).toFixed(1)) : 100,
      category: classifyToolCategory(name)
    }))
    .sort((a, b) => b.calls - a.calls)
  return {
    hasData: sessionsWithTools > 0,
    sessionsWithTools,
    totalToolCalls,
    totalToolResults,
    totalToolErrors,
    totalAgentsSpawned,
    totalWorkflows,
    successRate:
      totalToolResults > 0
        ? Number((((totalToolResults - totalToolErrors) / totalToolResults) * 100).toFixed(1))
        : 100,
    avgToolCallsPerSession:
      sessionsWithTools > 0 ? Number((totalToolCalls / sessionsWithTools).toFixed(1)) : 0,
    avgAgentsPerSession:
      sessionsWithTools > 0 ? Number((totalAgentsSpawned / sessionsWithTools).toFixed(1)) : 0,
    maxAgentsInSession,
    toolUsage
  }
}

export function mockSnapshot(): MetricsSnapshot {
  const { daily, sessions } = generate()
  const totalTokens = daily.reduce((s, d) => s + d.tokens, 0)
  const monthly = bucketMonthly(daily)
  const last30 = daily.slice(-30).map((d) => ({
    label: d.date,
    timestamp: new Date(d.date + 'T00:00:00').toISOString(),
    tokens: d.tokens,
    sessions: d.sessions,
    activeMinutes: d.activeMinutes
  }))
  const weekly: TimeSeriesPoint[] = []
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7)
    if (chunk.length === 0) continue
    const d = new Date(chunk[0].date + 'T00:00:00')
    weekly.push({
      label: `${MONTHS[d.getMonth()]} ${d.getDate()}`,
      timestamp: d.toISOString(),
      tokens: chunk.reduce((s, r) => s + r.tokens, 0),
      sessions: chunk.reduce((s, r) => s + r.sessions, 0),
      activeMinutes: chunk.reduce((s, r) => s + r.activeMinutes, 0)
    })
  }

  const toolTotals = new Map<ToolId, { tokens: number; sessions: number }>()
  for (const s of sessions) {
    const t = toolTotals.get(s.toolId) ?? { tokens: 0, sessions: 0 }
    t.tokens += s.estimatedTokens
    t.sessions += 1
    toolTotals.set(s.toolId, t)
  }
  // Costs (per-model, per-token-category pricing)
  const costByTool = new Map<ToolId, number>()
  const modelMap = new Map<string, { label: string; tokens: number; cost: number; input: number; output: number }>()
  let spendTotal = 0
  let spendToday = 0
  let spendMonth = 0
  const monthPre = key(new Date()).slice(0, 7)
  const todayK = key(new Date())
  const weekK = key(new Date(Date.now() - 6 * 86_400_000))
  const yearP = todayK.slice(0, 4)
  let gToday = 0
  let gWeek = 0
  let gMonth = 0
  let gYear = 0
  let gTotal = 0
  for (const s of sessions) {
    const cost = costForBreakdown(s.tokenBreakdown, s.model)
    spendTotal += cost
    const dk = s.startedAt.slice(0, 10)
    const gross = s.estimatedTokens + s.tokenBreakdown.cacheRead + s.tokenBreakdown.cacheCreate
    gTotal += gross
    if (dk === todayK) {
      spendToday += cost
      gToday += gross
    }
    if (dk >= weekK) gWeek += gross
    if (dk.startsWith(monthPre)) {
      spendMonth += cost
      gMonth += gross
    }
    if (dk.startsWith(yearP)) gYear += gross
    costByTool.set(s.toolId, (costByTool.get(s.toolId) ?? 0) + cost)
    const { id, label, price } = priceForModel(s.model)
    const m = modelMap.get(id) ?? { label, tokens: 0, cost: 0, input: price.input, output: price.output }
    m.tokens += s.estimatedTokens
    m.cost += cost
    modelMap.set(id, m)
  }
  const modelCosts: ModelCost[] = [...modelMap.entries()]
    .map(([modelId, v]) => ({ modelId, label: v.label, tokens: v.tokens, costUsd: v.cost, pricePerMInput: v.input, pricePerMOutput: v.output }))
    .sort((a, b) => b.costUsd - a.costUsd)

  type PAcc = { gross: number; net: number; spend: number; minutes: number; sessions: number }
  const mkP = (): PAcc => ({ gross: 0, net: 0, spend: 0, minutes: 0, sessions: 0 })
  const P = { daily: mkP(), weekly: mkP(), monthly: mkP(), yearly: mkP() }
  for (const s of sessions) {
    const net = s.estimatedTokens
    const gross = net + s.tokenBreakdown.cacheRead + s.tokenBreakdown.cacheCreate
    const cost = costForBreakdown(s.tokenBreakdown, s.model)
    const min = s.durationMinutes
    const dk = s.startedAt.slice(0, 10)
    const addP = (a: PAcc): void => {
      a.gross += gross
      a.net += net
      a.spend += cost
      a.minutes += min
      a.sessions += 1
    }
    if (dk === todayK) addP(P.daily)
    if (dk >= weekK) addP(P.weekly)
    if (dk.startsWith(monthPre)) addP(P.monthly)
    if (dk.startsWith(yearP)) addP(P.yearly)
  }
  const toStat = (a: PAcc): PeriodStat => ({
    grossTokens: a.gross,
    netTokens: a.net,
    spend: a.spend,
    codingHours: Number((a.minutes / 60).toFixed(1)),
    sessions: a.sessions
  })
  const periods = {
    daily: toStat(P.daily),
    weekly: toStat(P.weekly),
    monthly: toStat(P.monthly),
    yearly: toStat(P.yearly)
  }

  const inP = (dk: string, p: ChartGranularity): boolean =>
    p === 'daily' ? dk === todayK : p === 'weekly' ? dk >= weekK : p === 'monthly' ? dk.startsWith(monthPre) : dk.startsWith(yearP)
  const buildTB = (p: ChartGranularity): ToolBreakdownSlice[] => {
    const m = new Map<ToolId, { tokens: number; cost: number; sessions: number }>()
    for (const s of sessions) {
      if (!inP(s.startedAt.slice(0, 10), p)) continue
      const t = m.get(s.toolId) ?? { tokens: 0, cost: 0, sessions: 0 }
      t.tokens += s.estimatedTokens + s.tokenBreakdown.cacheRead + s.tokenBreakdown.cacheCreate
      t.cost += costForBreakdown(s.tokenBreakdown, s.model)
      t.sessions += 1
      m.set(s.toolId, t)
    }
    const tot = [...m.values()].reduce((a, b) => a + b.tokens, 0)
    return [...m.entries()]
      .map(([toolId, v]) => ({
        toolId,
        toolName: TOOL_META[toolId].name,
        tokens: v.tokens,
        sessions: v.sessions,
        percentage: tot > 0 ? Number(((v.tokens / tot) * 100).toFixed(1)) : 0,
        costUsd: v.cost,
        color: TOOL_META[toolId].color
      }))
      .sort((a, b) => b.tokens - a.tokens)
  }
  const toolBreakdownByPeriod = {
    daily: buildTB('daily'),
    weekly: buildTB('weekly'),
    monthly: buildTB('monthly'),
    yearly: buildTB('yearly')
  }

  const breakdownTotal = [...toolTotals.values()].reduce((s, t) => s + t.tokens, 0)
  const toolBreakdown: ToolBreakdownSlice[] = [...toolTotals.entries()]
    .map(([toolId, v]) => ({
      toolId,
      toolName: TOOL_META[toolId].name,
      tokens: v.tokens,
      sessions: v.sessions,
      percentage: Number(((v.tokens / breakdownTotal) * 100).toFixed(1)),
      costUsd: costByTool.get(toolId) ?? 0,
      color: TOOL_META[toolId].color
    }))
    .sort((a, b) => b.tokens - a.tokens)

  const tokensToday = daily[daily.length - 1]?.tokens ?? 0
  const monthPrefix = key(new Date()).slice(0, 7)
  const tokensThisMonth = daily.filter((d) => d.date.startsWith(monthPrefix)).reduce((s, d) => s + d.tokens, 0)
  const minutesThisMonth = daily
    .filter((d) => d.date.startsWith(monthPrefix))
    .reduce((s, d) => s + d.activeMinutes, 0)

  // streak
  let streak = 0
  for (let i = daily.length - 1; i >= 0; i--) {
    if (daily[i].tokens > 0) streak++
    else if (i !== daily.length - 1) break
  }
  const percentile = estimatePercentile(totalTokens)

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      tokensToday,
      tokensThisMonth,
      activeSessions: sessions.filter((s) => Date.now() - new Date(s.startedAt).getTime() < 86_400_000).length,
      codingHours: Number((minutesThisMonth / 60).toFixed(1)),
      globalRank: percentileToRank(percentile, 120_000),
      currentStreak: streak,
      longestStreak: Math.max(streak, 47),
      totalTokens,
      spend: { today: spendToday, month: spendMonth, total: spendTotal },
      gross: { today: gToday, week: gWeek, month: gMonth, year: gYear, total: gTotal },
      periods,
      deltas: { tokensToday: 12, tokensThisMonth: 8, codingHours: -4 }
    },
    series: { daily: last30, weekly: weekly.slice(-12), monthly, yearly: [
      { label: '2025', timestamp: '2025-01-01T00:00:00.000Z', tokens: Math.round(totalTokens * 0.6), sessions: 600, activeMinutes: 40000 },
      { label: '2026', timestamp: '2026-01-01T00:00:00.000Z', tokens: totalTokens, sessions: sessions.length, activeMinutes: daily.reduce((s, d) => s + d.activeMinutes, 0) }
    ] },
    toolBreakdown,
    toolBreakdownByPeriod,
    modelCosts,
    agentic: summarizeAgentic(sessions),
    recentSessions: [...sessions].sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt)).slice(0, 8),
    daily
  }
}

export function mockSessions(): Session[] {
  return [...generate().sessions].sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))
}

export function mockAchievements(): Achievement[] {
  const snap = mockSnapshot()
  return evaluateAchievements(
    {
      totalTokens: snap.stats.totalTokens,
      longestStreak: snap.stats.longestStreak,
      midnightDays: 18,
      earlyBirdDays: 6,
      longestSessionMinutes: 263,
      totalCodingHours: 420,
      distinctToolsUsed: 5,
      projectCount: 14,
      agentsSpawned: snap.agentic.totalAgentsSpawned,
      toolCalls: snap.agentic.totalToolCalls,
      globalPercentile: estimatePercentile(snap.stats.totalTokens)
    },
    {},
    new Date().toISOString()
  ).sort((a, b) => (a.unlocked === b.unlocked ? b.progress / b.target - a.progress / a.target : a.unlocked ? -1 : 1))
}

export function mockRankings(): RankingSnapshot {
  const snap = mockSnapshot()
  const pct = estimatePercentile(snap.stats.totalTokens)
  const rank = percentileToRank(pct, 120_000)
  return {
    participating: false,
    updatedAt: new Date().toISOString(),
    cards: [
      { scope: 'global', label: 'Global', rank, total: 120_000, percentile: pct, context: 'All developers' },
      { scope: 'country', label: 'India', rank: percentileToRank(pct, 8000), total: 8000, percentile: pct, context: 'IN' },
      { scope: 'tool', label: 'Top Claude Code User', rank: percentileToRank(pct, 30_000), total: 30_000, percentile: pct, context: 'Claude Code', toolId: 'claude-code' }
    ],
    leaderboard: synthesizeLeaderboard(
      { totalTokens: snap.stats.totalTokens, codingHours: 420, topTool: 'claude-code', handle: 'you' },
      Math.min(rank, 8)
    ),
    countries: synthesizeCountryShipping({
      totalTokens: snap.stats.totalTokens,
      yourCountry: 'IN',
      count: 24
    }),
    estimated: true
  }
}

export function mockWrapped(year: number): WrappedReport {
  const snap = mockSnapshot()
  return {
    year,
    generatedAt: new Date().toISOString(),
    totalTokens: snap.stats.totalTokens,
    totalSessions: snap.recentSessions.length * 40,
    codingHours: 421.5,
    favoriteTool: { toolId: 'claude-code', toolName: 'Claude Code', tokens: Math.round(snap.stats.totalTokens * 0.62) },
    longestSession: { projectName: 'tokenmaxxing', minutes: 263, tokens: 540_000 },
    topProject: { name: 'tokenmaxxing', tokens: Math.round(snap.stats.totalTokens * 0.3), sessions: 188 },
    globalRank: snap.stats.globalRank,
    streakRecord: snap.stats.longestStreak,
    busiestMonth: { month: 'March', tokens: Math.round(snap.stats.totalTokens * 0.14) },
    persona: { title: 'The Night Hacker', subtitle: 'The best code happens after midnight.' },
    monthlyTokens: snap.series.monthly.map((m) => ({ month: m.label, tokens: m.tokens })),
    toolBreakdown: snap.toolBreakdown,
    vsLastYear: 64
  }
}

export const MOCK_SETTINGS: Settings = { ...DEFAULT_SETTINGS, handle: 'you', countryCode: 'IN' }

export function mockScanResult(): ScanResult {
  const snap = mockSnapshot()
  return {
    startedAt: new Date(Date.now() - 1500).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 1500,
    tools: [],
    totalTokens: snap.stats.totalTokens,
    totalSessions: 712,
    errors: [],
    sourcesParsed: 6,
    sourcesSkipped: 706,
    sourcesRemoved: 0,
    incremental: true
  }
}

/** The achievement defs, re-exported for convenience. */
export { ACHIEVEMENTS }
