import type {
  DailyUsage,
  ScanCheckpoint,
  ScanResult,
  Session,
  Settings,
  ToolId,
  ToolMetrics
} from '@shared/types'
import type { SessionFilter } from '@shared/ipc'
import { applySessionFilter, type DataStore } from './DataStore'
import { createLogger } from '../utils/logger'

const log = createLogger('sqlite')
const SCHEMA_VERSION = 3

const SESSION_INSERT_SQL = `INSERT OR REPLACE INTO sessions
  (id, tool_id, tool_name, project_name, est_tokens, input, output, cache_read, cache_create, started_at, ended_at, duration_min, message_count, model, agentic, source_key)
 VALUES
  (@id, @tool_id, @tool_name, @project_name, @est_tokens, @input, @output, @cache_read, @cache_create, @started_at, @ended_at, @duration_min, @message_count, @model, @agentic, @source_key)`

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  tool_id       TEXT NOT NULL,
  tool_name     TEXT NOT NULL,
  project_name  TEXT NOT NULL,
  est_tokens    INTEGER NOT NULL,
  input         INTEGER NOT NULL DEFAULT 0,
  output        INTEGER NOT NULL DEFAULT 0,
  cache_read    INTEGER NOT NULL DEFAULT 0,
  cache_create  INTEGER NOT NULL DEFAULT 0,
  started_at    TEXT NOT NULL,
  ended_at      TEXT NOT NULL,
  duration_min  REAL NOT NULL,
  message_count INTEGER NOT NULL,
  model         TEXT,
  agentic       TEXT,
  source_key    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_tool ON sessions(tool_id);
CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source_key);
CREATE TABLE IF NOT EXISTS scan_checkpoints (
  source_key  TEXT PRIMARY KEY,
  tool_id     TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_usage (
  date           TEXT PRIMARY KEY,
  tokens         INTEGER NOT NULL,
  sessions       INTEGER NOT NULL,
  active_minutes REAL NOT NULL,
  by_tool        TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tool_metrics (
  tool_id TEXT PRIMARY KEY,
  json    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS achievements (
  id          TEXT PRIMARY KEY,
  unlocked_at TEXT
);
CREATE TABLE IF NOT EXISTS scan_results (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL
);
`

interface SessionRow {
  id: string
  tool_id: string
  tool_name: string
  project_name: string
  est_tokens: number
  input: number
  output: number
  cache_read: number
  cache_create: number
  started_at: string
  ended_at: string
  duration_min: number
  message_count: number
  model: string | null
  agentic: string | null
  source_key: string | null
}

function rowToSession(r: SessionRow): Session {
  const total = r.est_tokens
  let agentic: Session['agentic']
  if (r.agentic) {
    try {
      agentic = JSON.parse(r.agentic) as Session['agentic']
    } catch {
      agentic = undefined
    }
  }
  return {
    id: r.id,
    toolId: r.tool_id as Session['toolId'],
    toolName: r.tool_name,
    projectName: r.project_name,
    estimatedTokens: r.est_tokens,
    tokenBreakdown: {
      input: r.input,
      output: r.output,
      cacheRead: r.cache_read,
      cacheCreate: r.cache_create,
      total
    },
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationMinutes: r.duration_min,
    messageCount: r.message_count,
    model: r.model,
    agentic,
    sourceKey: r.source_key ?? undefined
  }
}

export class SqliteDataStore implements DataStore {
  readonly backend = 'sqlite' as const
  private db: import('better-sqlite3').Database

  constructor(filePath: string) {
    // Lazy require so a missing native binding only throws here (and is caught
    // by the factory, which then falls back to the JSON store).
    const DatabaseCtor = require('better-sqlite3') as typeof import('better-sqlite3')
    this.db = new DatabaseCtor(filePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    // Wait (instead of throwing SQLITE_BUSY) if a writer/checkpoint holds the lock.
    this.db.pragma('busy_timeout = 5000')
    this.db.exec(SCHEMA)
    this.migrate()
    log.info('opened database at', filePath)
  }

  private migrate(): void {
    const current = (this.db.pragma('user_version', { simple: true }) as number) ?? 0
    if (current > SCHEMA_VERSION) {
      // DB was written by a newer app version (e.g. after a downgrade). The
      // idempotent schema above keeps our expected columns present, so we can
      // read it, but flag it rather than silently bumping the version down.
      log.warn(`database schema v${current} is newer than this app (v${SCHEMA_VERSION})`)
      return
    }
    if (current < 3) {
      // v2: incremental scanning — add source_key to sessions.
      // v3: agentic activity — add the agentic JSON column. Both adds are
      // idempotent (guarded by table_info) so a fresh DB created by the schema
      // above is skipped, and an old DB picks up only its missing columns.
      const cols = this.db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
      const has = (name: string): boolean => cols.some((c) => c.name === name)
      if (!has('source_key')) this.db.exec('ALTER TABLE sessions ADD COLUMN source_key TEXT')
      if (!has('agentic')) this.db.exec('ALTER TABLE sessions ADD COLUMN agentic TEXT')
    }
    if (current < SCHEMA_VERSION) {
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`)
    }
  }

  settings = {
    get: (): Settings | null => {
      const row = this.db.prepare('SELECT json FROM settings WHERE id = 1').get() as
        | { json: string }
        | undefined
      return row ? (JSON.parse(row.json) as Settings) : null
    },
    save: (settings: Settings): void => {
      this.db
        .prepare(
          'INSERT INTO settings (id, json) VALUES (1, @json) ON CONFLICT(id) DO UPDATE SET json = @json'
        )
        .run({ json: JSON.stringify(settings) })
    }
  }

  private bindSession(s: Session): Record<string, unknown> {
    return {
      id: s.id,
      tool_id: s.toolId,
      tool_name: s.toolName,
      project_name: s.projectName,
      est_tokens: s.estimatedTokens,
      input: s.tokenBreakdown.input,
      output: s.tokenBreakdown.output,
      cache_read: s.tokenBreakdown.cacheRead,
      cache_create: s.tokenBreakdown.cacheCreate,
      started_at: s.startedAt,
      ended_at: s.endedAt,
      duration_min: s.durationMinutes,
      message_count: s.messageCount,
      model: s.model,
      agentic: s.agentic ? JSON.stringify(s.agentic) : null,
      source_key: s.sourceKey ?? null
    }
  }

  sessions = {
    replaceAll: (sessions: Session[]): void => {
      const insert = this.db.prepare(SESSION_INSERT_SQL)
      const tx = this.db.transaction((rows: Session[]) => {
        this.db.prepare('DELETE FROM sessions').run()
        for (const s of rows) insert.run(this.bindSession(s))
      })
      tx(sessions)
    },
    upsertForSource: (sourceKey: string, sessions: Session[]): void => {
      const insert = this.db.prepare(SESSION_INSERT_SQL)
      const tx = this.db.transaction((rows: Session[]) => {
        this.db.prepare('DELETE FROM sessions WHERE source_key = ?').run(sourceKey)
        for (const s of rows) insert.run(this.bindSession({ ...s, sourceKey }))
      })
      tx(sessions)
    },
    deleteForSources: (sourceKeys: string[]): void => {
      const del = this.db.prepare('DELETE FROM sessions WHERE source_key = ?')
      const tx = this.db.transaction((keys: string[]) => {
        for (const k of keys) del.run(k)
      })
      tx(sourceKeys)
    },
    query: (filter?: SessionFilter): Session[] => {
      // Pull all then filter/sort in JS — datasets are small (≤ tens of
      // thousands) and this keeps filtering logic identical across backends.
      const rows = this.db.prepare('SELECT * FROM sessions').all() as SessionRow[]
      return applySessionFilter(rows.map(rowToSession), filter)
    },
    all: (): Session[] => {
      const rows = this.db.prepare('SELECT * FROM sessions').all() as SessionRow[]
      return rows.map(rowToSession)
    },
    count: (): number => {
      const r = this.db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }
      return r.n
    }
  }

  daily = {
    replaceAll: (rows: DailyUsage[]): void => {
      const insert = this.db.prepare(
        'INSERT OR REPLACE INTO daily_usage (date, tokens, sessions, active_minutes, by_tool) VALUES (@date, @tokens, @sessions, @active_minutes, @by_tool)'
      )
      const tx = this.db.transaction((items: DailyUsage[]) => {
        this.db.prepare('DELETE FROM daily_usage').run()
        for (const d of items) {
          insert.run({
            date: d.date,
            tokens: d.tokens,
            sessions: d.sessions,
            active_minutes: d.activeMinutes,
            by_tool: JSON.stringify(d.byTool)
          })
        }
      })
      tx(rows)
    },
    all: (): DailyUsage[] => {
      const rows = this.db
        .prepare('SELECT * FROM daily_usage ORDER BY date ASC')
        .all() as Array<{
        date: string
        tokens: number
        sessions: number
        active_minutes: number
        by_tool: string
      }>
      return rows.map((r) => ({
        date: r.date,
        tokens: r.tokens,
        sessions: r.sessions,
        activeMinutes: r.active_minutes,
        byTool: JSON.parse(r.by_tool)
      }))
    }
  }

  toolMetrics = {
    replaceAll: (rows: ToolMetrics[]): void => {
      const insert = this.db.prepare(
        'INSERT OR REPLACE INTO tool_metrics (tool_id, json) VALUES (@tool_id, @json)'
      )
      const tx = this.db.transaction((items: ToolMetrics[]) => {
        this.db.prepare('DELETE FROM tool_metrics').run()
        for (const m of items) insert.run({ tool_id: m.toolId, json: JSON.stringify(m) })
      })
      tx(rows)
    },
    all: (): ToolMetrics[] => {
      const rows = this.db.prepare('SELECT json FROM tool_metrics').all() as Array<{
        json: string
      }>
      return rows.map((r) => JSON.parse(r.json) as ToolMetrics)
    }
  }

  achievements = {
    getUnlockMap: (): Record<string, string | null> => {
      const rows = this.db.prepare('SELECT id, unlocked_at FROM achievements').all() as Array<{
        id: string
        unlocked_at: string | null
      }>
      return Object.fromEntries(rows.map((r) => [r.id, r.unlocked_at]))
    },
    setUnlockMap: (map: Record<string, string | null>): void => {
      const insert = this.db.prepare(
        'INSERT OR REPLACE INTO achievements (id, unlocked_at) VALUES (@id, @unlocked_at)'
      )
      const tx = this.db.transaction((entries: [string, string | null][]) => {
        for (const [id, unlocked_at] of entries) insert.run({ id, unlocked_at })
      })
      tx(Object.entries(map))
    }
  }

  scan = {
    saveLast: (result: ScanResult): void => {
      this.db
        .prepare(
          'INSERT INTO scan_results (id, json) VALUES (1, @json) ON CONFLICT(id) DO UPDATE SET json = @json'
        )
        .run({ json: JSON.stringify(result) })
    },
    getLast: (): ScanResult | null => {
      const row = this.db.prepare('SELECT json FROM scan_results WHERE id = 1').get() as
        | { json: string }
        | undefined
      return row ? (JSON.parse(row.json) as ScanResult) : null
    }
  }

  checkpoints = {
    all: (): ScanCheckpoint[] => {
      const rows = this.db
        .prepare('SELECT source_key, tool_id, fingerprint, updated_at FROM scan_checkpoints')
        .all() as Array<{
        source_key: string
        tool_id: string
        fingerprint: string
        updated_at: string
      }>
      return rows.map((r) => ({
        sourceKey: r.source_key,
        toolId: r.tool_id as ToolId,
        fingerprint: r.fingerprint,
        updatedAt: r.updated_at
      }))
    },
    upsertMany: (checkpoints: ScanCheckpoint[]): void => {
      const insert = this.db.prepare(
        `INSERT INTO scan_checkpoints (source_key, tool_id, fingerprint, updated_at)
         VALUES (@source_key, @tool_id, @fingerprint, @updated_at)
         ON CONFLICT(source_key) DO UPDATE SET
           fingerprint = excluded.fingerprint, updated_at = excluded.updated_at`
      )
      const tx = this.db.transaction((rows: ScanCheckpoint[]) => {
        for (const c of rows) {
          insert.run({
            source_key: c.sourceKey,
            tool_id: c.toolId,
            fingerprint: c.fingerprint,
            updated_at: c.updatedAt
          })
        }
      })
      tx(checkpoints)
    },
    deleteForKeys: (sourceKeys: string[]): void => {
      const del = this.db.prepare('DELETE FROM scan_checkpoints WHERE source_key = ?')
      const tx = this.db.transaction((keys: string[]) => {
        for (const k of keys) del.run(k)
      })
      tx(sourceKeys)
    }
  }

  meta = {
    get: (key: string): string | null => {
      const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
        | { value: string }
        | undefined
      return row ? row.value : null
    },
    set: (key: string, value: string): void => {
      this.db
        .prepare(
          'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        )
        .run(key, value)
    }
  }

  clearAll(): void {
    const tx = this.db.transaction(() => {
      for (const t of [
        'sessions',
        'daily_usage',
        'tool_metrics',
        'achievements',
        'scan_results',
        'scan_checkpoints',
        'settings',
        'meta'
      ]) {
        this.db.prepare(`DELETE FROM ${t}`).run()
      }
    })
    tx()
    log.warn('all local data cleared')
  }

  close(): void {
    this.db.close()
  }
}
