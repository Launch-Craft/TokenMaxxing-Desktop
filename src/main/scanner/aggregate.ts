import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { DailyUsage, Session, ToolId, ToolMetrics } from '@shared/types'
import { addBreakdown, emptyBreakdown } from './tokenEstimation'

// ── Dates ────────────────────────────────────────────────────────────────────

/** Local YYYY-MM-DD key for a date. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function hashId(...parts: (string | number)[]): string {
  return createHash('sha1').update(parts.join('::')).digest('hex').slice(0, 16)
}

/**
 * Normalize a numeric epoch timestamp to milliseconds, inferring the unit from
 * magnitude (seconds / ms / microseconds / nanoseconds). Returns null for
 * non-finite or non-positive input. Tools log timestamps in all four units, and
 * the old `v < 1e12 ? v*1000 : v` check mangled µs/ns into year-33000 dates.
 */
export function normalizeEpochMs(v: number): number | null {
  if (!Number.isFinite(v) || v <= 0) return null
  if (v >= 1e18) return v / 1e6 // nanoseconds
  if (v >= 1e15) return v / 1e3 // microseconds
  if (v >= 1e12) return v // milliseconds
  return v * 1e3 // seconds
}

// ── Filesystem (best-effort, never throws) ──────────────────────────────────

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir)
  } catch {
    return []
  }
}

export async function safeReadFile(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf-8')
  } catch {
    return null
  }
}

export async function safeStat(p: string): Promise<{ size: number; mtime: Date } | null> {
  try {
    const s = await fs.stat(p)
    return { size: s.size, mtime: s.mtime }
  } catch {
    return null
  }
}

/** Recursively list files under `dir` (bounded depth), returning absolute paths. */
export async function walk(dir: string, opts: { match?: RegExp; maxDepth?: number } = {}): Promise<string[]> {
  const { match, maxDepth = 4 } = opts
  const out: string[] = []
  async function recurse(current: string, depth: number): Promise<void> {
    if (depth > maxDepth) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(current, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue
        await recurse(full, depth + 1)
      } else if (!match || match.test(e.name)) {
        out.push(full)
      }
    }
  }
  await recurse(dir, 0)
  return out
}

// ── Rollups ──────────────────────────────────────────────────────────────────

/** Roll a flat list of sessions into per-day usage. */
export function buildDailyFromSessions(sessions: Session[]): DailyUsage[] {
  const byDate = new Map<string, DailyUsage>()
  for (const s of sessions) {
    const key = localDateKey(new Date(s.startedAt))
    let day = byDate.get(key)
    if (!day) {
      day = { date: key, tokens: 0, sessions: 0, activeMinutes: 0, byTool: {} }
      byDate.set(key, day)
    }
    day.tokens += s.estimatedTokens
    day.sessions += 1
    day.activeMinutes += s.durationMinutes
    day.byTool[s.toolId] = (day.byTool[s.toolId] ?? 0) + s.estimatedTokens
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Aggregate a flat list of sessions into the {@link ToolMetrics} shape. */
export function aggregateSessions(
  toolId: ToolId,
  toolName: string,
  sessions: Session[],
  detected: boolean
): ToolMetrics {
  let breakdown = emptyBreakdown()
  let activeMinutes = 0
  const projects = new Set<string>()
  const models = new Set<string>()
  let lastActive = 0
  for (const s of sessions) {
    breakdown = addBreakdown(breakdown, s.tokenBreakdown)
    activeMinutes += s.durationMinutes
    projects.add(s.projectName)
    if (s.model) models.add(s.model)
    const end = new Date(s.endedAt).getTime()
    if (!Number.isNaN(end)) lastActive = Math.max(lastActive, end)
  }
  return {
    toolId,
    toolName,
    detected,
    sessionCount: sessions.length,
    estimatedTokens: breakdown.total,
    tokenBreakdown: breakdown,
    activeHours: Number((activeMinutes / 60).toFixed(1)),
    projectCount: projects.size,
    lastActiveAt: lastActive ? new Date(lastActive).toISOString() : null,
    daily: buildDailyFromSessions(sessions),
    models: [...models]
  }
}

/** Merge per-tool daily rollups into a single combined series. */
export function mergeDaily(rows: DailyUsage[][]): DailyUsage[] {
  const byDate = new Map<string, DailyUsage>()
  for (const list of rows) {
    for (const d of list) {
      const existing = byDate.get(d.date)
      if (!existing) {
        byDate.set(d.date, { ...d, byTool: { ...d.byTool } })
      } else {
        existing.tokens += d.tokens
        existing.sessions += d.sessions
        existing.activeMinutes += d.activeMinutes
        for (const [tool, v] of Object.entries(d.byTool)) {
          const t = tool as ToolId
          existing.byTool[t] = (existing.byTool[t] ?? 0) + (v ?? 0)
        }
      }
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// ── Sessionization ───────────────────────────────────────────────────────────

export interface RawEvent {
  timestamp: Date
  projectName: string
  model: string | null
  /** Token breakdown for this single event. */
  input?: number
  output?: number
  cacheRead?: number
  cacheCreate?: number
}

/**
 * Group timestamped events into sessions: same project, consecutive events
 * within `gapMinutes` of each other belong to one session.
 */
export function sessionizeByGap(
  toolId: ToolId,
  toolName: string,
  events: RawEvent[],
  gapMinutes = 30
): Session[] {
  // Drop events with an invalid timestamp: a single bad Date would make
  // start.toISOString() throw and discard the entire tool's sessions.
  const valid = events.filter(
    (e) => e.timestamp instanceof Date && !Number.isNaN(e.timestamp.getTime())
  )
  if (valid.length === 0) return []
  const sorted = [...valid].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  const gapMs = gapMinutes * 60_000
  const sessions: Session[] = []

  // Bucket by project, then split by time gaps within each project.
  const byProject = new Map<string, RawEvent[]>()
  for (const e of sorted) {
    const list = byProject.get(e.projectName) ?? []
    list.push(e)
    byProject.set(e.projectName, list)
  }

  for (const [project, list] of byProject) {
    let group: RawEvent[] = []
    const flush = (): void => {
      if (group.length === 0) return
      const start = group[0].timestamp
      const end = group[group.length - 1].timestamp
      let bd = emptyBreakdown()
      const models = new Set<string>()
      for (const ev of group) {
        bd = addBreakdown(bd, {
          input: ev.input ?? 0,
          output: ev.output ?? 0,
          cacheRead: ev.cacheRead ?? 0,
          cacheCreate: ev.cacheCreate ?? 0,
          total: (ev.input ?? 0) + (ev.output ?? 0) + (ev.cacheRead ?? 0) + (ev.cacheCreate ?? 0)
        })
        if (ev.model) models.add(ev.model)
      }
      const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000))
      sessions.push({
        id: hashId(toolId, project, start.toISOString(), group.length),
        toolId,
        toolName,
        projectName: project,
        estimatedTokens: bd.total,
        tokenBreakdown: bd,
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
        durationMinutes,
        messageCount: group.length,
        model: models.size ? [...models][0] : null
      })
      group = []
    }
    for (let i = 0; i < list.length; i++) {
      if (i > 0 && list[i].timestamp.getTime() - list[i - 1].timestamp.getTime() > gapMs) {
        flush()
      }
      group.push(list[i])
    }
    flush()
  }

  return sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
}
