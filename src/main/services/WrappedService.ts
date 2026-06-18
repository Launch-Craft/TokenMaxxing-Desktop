import type {
  Session,
  ToolBreakdownSlice,
  ToolId,
  WrappedReport
} from '@shared/types'
import { TOOL_META } from '@shared/constants'
import { estimatePercentile, percentileToRank } from '@shared/ranking'
import { costForBreakdown } from '@shared/pricing'
import type { DataStore } from '../db'
import { localDateKey } from '../scanner/aggregate'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

/** Generates the shareable "AI Wrapped" annual report from local data. */
export class WrappedService {
  listYears(store: DataStore): number[] {
    const years = new Set<number>()
    for (const d of store.daily.all()) years.add(Number(d.date.slice(0, 4)))
    if (years.size === 0) years.add(new Date().getFullYear())
    return [...years].sort((a, b) => b - a)
  }

  generate(store: DataStore, year: number): WrappedReport {
    // Guard against a non-numeric/NaN year (it crosses the IPC boundary via
    // Number()); fall back to the current year rather than emitting a zeroed report.
    if (!Number.isInteger(year) || year < 2000 || year > 9999) {
      year = new Date().getFullYear()
    }
    const sessions = store.sessions.all().filter((s) => new Date(s.startedAt).getFullYear() === year)
    const daily = store.daily.all().filter((d) => d.date.startsWith(String(year)))
    const prevDaily = store.daily.all().filter((d) => d.date.startsWith(String(year - 1)))

    const totalTokens = daily.reduce((s, d) => s + d.tokens, 0)
    const prevTokens = prevDaily.reduce((s, d) => s + d.tokens, 0)
    const codingHours = Number((sessions.reduce((s, x) => s + x.durationMinutes, 0) / 60).toFixed(1))

    const toolTotals = new Map<ToolId, { tokens: number; sessions: number; cost: number }>()
    const projectTotals = new Map<string, { tokens: number; sessions: number }>()
    const monthly: number[] = new Array(12).fill(0)
    let longest: Session | null = null
    let midnight = 0

    for (const s of sessions) {
      const t = toolTotals.get(s.toolId) ?? { tokens: 0, sessions: 0, cost: 0 }
      t.tokens += s.estimatedTokens
      t.sessions += 1
      t.cost += costForBreakdown(s.tokenBreakdown, s.model)
      toolTotals.set(s.toolId, t)

      const p = projectTotals.get(s.projectName) ?? { tokens: 0, sessions: 0 }
      p.tokens += s.estimatedTokens
      p.sessions += 1
      projectTotals.set(s.projectName, p)

      monthly[new Date(s.startedAt).getMonth()] += s.estimatedTokens
      if (!longest || s.durationMinutes > longest.durationMinutes) longest = s
      if (new Date(s.startedAt).getHours() < 5) midnight++
    }

    const favoriteEntry = [...toolTotals.entries()].sort((a, b) => b[1].tokens - a[1].tokens)[0]
    const favoriteTool = favoriteEntry
      ? {
          toolId: favoriteEntry[0],
          toolName: TOOL_META[favoriteEntry[0]].name,
          tokens: favoriteEntry[1].tokens
        }
      : { toolId: 'claude-code' as ToolId, toolName: 'Claude Code', tokens: 0 }

    const topProjectEntry = [...projectTotals.entries()].sort((a, b) => b[1].tokens - a[1].tokens)[0]
    const topProject = topProjectEntry
      ? { name: topProjectEntry[0], tokens: topProjectEntry[1].tokens, sessions: topProjectEntry[1].sessions }
      : null

    const totalToolTokens = [...toolTotals.values()].reduce((s, t) => s + t.tokens, 0)
    const toolBreakdown: ToolBreakdownSlice[] = [...toolTotals.entries()]
      .map(([toolId, v]) => ({
        toolId,
        toolName: TOOL_META[toolId].name,
        tokens: v.tokens,
        sessions: v.sessions,
        percentage: totalToolTokens > 0 ? Number(((v.tokens / totalToolTokens) * 100).toFixed(1)) : 0,
        costUsd: v.cost,
        color: TOOL_META[toolId].color
      }))
      .sort((a, b) => b.tokens - a.tokens)

    const busiestMonthIdx = monthly.reduce((best, v, i) => (v > monthly[best] ? i : best), 0)
    const busiestMonth = monthly[busiestMonthIdx] > 0
      ? { month: MONTHS[busiestMonthIdx], tokens: monthly[busiestMonthIdx] }
      : null

    const percentile = totalTokens > 0 ? estimatePercentile(totalTokens) : null
    const globalRank = percentile !== null ? percentileToRank(percentile, 120_000) : null

    return {
      year,
      generatedAt: new Date().toISOString(),
      totalTokens,
      totalSessions: sessions.length,
      codingHours,
      favoriteTool,
      longestSession: longest
        ? {
            projectName: longest.projectName,
            minutes: longest.durationMinutes,
            tokens: longest.estimatedTokens
          }
        : null,
      topProject,
      globalRank,
      streakRecord: this.longestStreakInYear(daily.map((d) => d.date)),
      busiestMonth,
      persona: this.persona({
        midnight,
        sessions: sessions.length,
        distinctTools: toolTotals.size,
        codingHours,
        topTool: favoriteTool.toolId
      }),
      monthlyTokens: monthly.map((tokens, i) => ({ month: MONTHS[i].slice(0, 3), tokens })),
      toolBreakdown,
      vsLastYear: prevTokens > 0 ? Number((((totalTokens - prevTokens) / prevTokens) * 100).toFixed(0)) : null
    }
  }

  private longestStreakInYear(dates: string[]): number {
    const set = new Set(dates)
    let longest = 0
    for (const date of set) {
      const prev = new Date(date + 'T00:00:00')
      prev.setDate(prev.getDate() - 1)
      if (set.has(localDateKey(prev))) continue // not a run start
      // Count forward.
      let run = 0
      const cursor = new Date(date + 'T00:00:00')
      while (set.has(localDateKey(cursor))) {
        run++
        cursor.setDate(cursor.getDate() + 1)
      }
      longest = Math.max(longest, run)
    }
    return longest
  }

  private persona(input: {
    midnight: number
    sessions: number
    distinctTools: number
    codingHours: number
    topTool: ToolId
  }): { title: string; subtitle: string } {
    if (input.sessions === 0) {
      return { title: 'The Fresh Start', subtitle: 'Your AI journey is just beginning.' }
    }
    if (input.midnight / Math.max(1, input.sessions) > 0.3) {
      return { title: 'The Night Hacker', subtitle: 'The best code happens after midnight.' }
    }
    if (input.distinctTools >= 5) {
      return { title: 'The Polyglot', subtitle: 'No single tool can contain you.' }
    }
    if (input.codingHours >= 300) {
      return { title: 'The Marathoner', subtitle: 'You treat coding like an endurance sport.' }
    }
    return {
      title: `The ${TOOL_META[input.topTool].name} Native`,
      subtitle: `${TOOL_META[input.topTool].name} is practically muscle memory now.`
    }
  }
}
