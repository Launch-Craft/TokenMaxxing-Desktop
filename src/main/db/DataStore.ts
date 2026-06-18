import type {
  DailyUsage,
  ScanCheckpoint,
  ScanResult,
  Session,
  Settings,
  ToolMetrics
} from '@shared/types'
import type { SessionFilter } from '@shared/ipc'

/**
 * Persistence boundary for the whole app. Grouped by domain (the repository
 * pattern, unified behind one interface) so the rest of the codebase never
 * touches SQL directly. Two implementations exist:
 *   - {@link SqliteDataStore}  — real local SQLite via better-sqlite3
 *   - {@link MemoryDataStore}  — JSON-file-backed fallback when the native
 *                                module isn't available, so the app still runs.
 */
export interface DataStore {
  readonly backend: 'sqlite' | 'memory'

  settings: {
    get(): Settings | null
    save(settings: Settings): void
  }

  sessions: {
    replaceAll(sessions: Session[]): void
    /** Incremental: replace just the sessions belonging to one source. */
    upsertForSource(sourceKey: string, sessions: Session[]): void
    /** Incremental: drop all sessions belonging to the given sources. */
    deleteForSources(sourceKeys: string[]): void
    query(filter?: SessionFilter): Session[]
    all(): Session[]
    count(): number
  }

  checkpoints: {
    all(): ScanCheckpoint[]
    upsertMany(checkpoints: ScanCheckpoint[]): void
    deleteForKeys(sourceKeys: string[]): void
  }

  daily: {
    replaceAll(rows: DailyUsage[]): void
    all(): DailyUsage[]
  }

  toolMetrics: {
    replaceAll(rows: ToolMetrics[]): void
    all(): ToolMetrics[]
  }

  achievements: {
    /** Map of achievement id → unlocked ISO timestamp (or null). */
    getUnlockMap(): Record<string, string | null>
    setUnlockMap(map: Record<string, string | null>): void
  }

  scan: {
    saveLast(result: ScanResult): void
    getLast(): ScanResult | null
  }

  meta: {
    get(key: string): string | null
    set(key: string, value: string): void
  }

  /** Wipe ALL persisted user data (privacy: "delete all data"). */
  clearAll(): void

  close(): void
}

/** Apply a {@link SessionFilter} to an in-memory array (shared by both stores). */
export function applySessionFilter(rows: Session[], filter?: SessionFilter): Session[] {
  let out = rows
  if (filter?.toolId && filter.toolId !== 'all') {
    out = out.filter((s) => s.toolId === filter.toolId)
  }
  if (filter?.search) {
    const q = filter.search.toLowerCase()
    out = out.filter(
      (s) =>
        s.projectName.toLowerCase().includes(q) ||
        s.toolName.toLowerCase().includes(q) ||
        (s.model ?? '').toLowerCase().includes(q)
    )
  }
  const sortBy = filter?.sortBy ?? 'recent'
  const gross = (s: Session): number =>
    s.estimatedTokens + s.tokenBreakdown.cacheRead + s.tokenBreakdown.cacheCreate
  out = [...out].sort((a, b) => {
    if (sortBy === 'tokens') return gross(b) - gross(a)
    if (sortBy === 'duration') return b.durationMinutes - a.durationMinutes
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  })
  const offset = filter?.offset ?? 0
  const limit = filter?.limit ?? out.length
  return out.slice(offset, offset + limit)
}
