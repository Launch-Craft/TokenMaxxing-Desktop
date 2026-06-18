import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type {
  DailyUsage,
  ScanCheckpoint,
  ScanResult,
  Session,
  Settings,
  ToolMetrics
} from '@shared/types'
import type { SessionFilter } from '@shared/ipc'
import { applySessionFilter, type DataStore } from './DataStore'
import { createLogger } from '../utils/logger'

const log = createLogger('memory-store')

interface Snapshot {
  settings: Settings | null
  sessions: Session[]
  daily: DailyUsage[]
  toolMetrics: ToolMetrics[]
  achievements: Record<string, string | null>
  checkpoints: Record<string, ScanCheckpoint>
  scan: ScanResult | null
  meta: Record<string, string>
}

const EMPTY: Snapshot = {
  settings: null,
  sessions: [],
  daily: [],
  toolMetrics: [],
  achievements: {},
  checkpoints: {},
  scan: null,
  meta: {}
}

/**
 * Fallback store used when better-sqlite3 fails to load (e.g. the native module
 * wasn't rebuilt for this Electron version). Holds everything in memory and
 * persists to a single JSON file so data still survives restarts.
 */
export class MemoryDataStore implements DataStore {
  readonly backend = 'memory' as const
  private data: Snapshot
  private filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
    this.data = this.load()
    log.warn('using JSON fallback store at', filePath)
  }

  private load(): Snapshot {
    try {
      if (existsSync(this.filePath)) {
        return { ...EMPTY, ...(JSON.parse(readFileSync(this.filePath, 'utf-8')) as Snapshot) }
      }
    } catch (err) {
      log.error('failed to read fallback store, starting fresh', err)
    }
    return structuredClone(EMPTY)
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(this.data), 'utf-8')
    } catch (err) {
      log.error('failed to persist fallback store', err)
    }
  }

  settings = {
    get: (): Settings | null => this.data.settings,
    save: (settings: Settings): void => {
      this.data.settings = settings
      this.persist()
    }
  }

  sessions = {
    replaceAll: (sessions: Session[]): void => {
      this.data.sessions = sessions
      this.persist()
    },
    upsertForSource: (sourceKey: string, sessions: Session[]): void => {
      this.data.sessions = [
        ...this.data.sessions.filter((s) => s.sourceKey !== sourceKey),
        ...sessions.map((s) => ({ ...s, sourceKey }))
      ]
      this.persist()
    },
    deleteForSources: (sourceKeys: string[]): void => {
      const drop = new Set(sourceKeys)
      this.data.sessions = this.data.sessions.filter((s) => !s.sourceKey || !drop.has(s.sourceKey))
      this.persist()
    },
    query: (filter?: SessionFilter): Session[] => applySessionFilter(this.data.sessions, filter),
    all: (): Session[] => this.data.sessions,
    count: (): number => this.data.sessions.length
  }

  checkpoints = {
    all: (): ScanCheckpoint[] => Object.values(this.data.checkpoints),
    upsertMany: (checkpoints: ScanCheckpoint[]): void => {
      for (const c of checkpoints) this.data.checkpoints[c.sourceKey] = c
      this.persist()
    },
    deleteForKeys: (sourceKeys: string[]): void => {
      for (const k of sourceKeys) delete this.data.checkpoints[k]
      this.persist()
    }
  }

  daily = {
    replaceAll: (rows: DailyUsage[]): void => {
      this.data.daily = rows
      this.persist()
    },
    all: (): DailyUsage[] => this.data.daily
  }

  toolMetrics = {
    replaceAll: (rows: ToolMetrics[]): void => {
      this.data.toolMetrics = rows
      this.persist()
    },
    all: (): ToolMetrics[] => this.data.toolMetrics
  }

  achievements = {
    getUnlockMap: (): Record<string, string | null> => this.data.achievements,
    setUnlockMap: (map: Record<string, string | null>): void => {
      this.data.achievements = { ...this.data.achievements, ...map }
      this.persist()
    }
  }

  scan = {
    saveLast: (result: ScanResult): void => {
      this.data.scan = result
      this.persist()
    },
    getLast: (): ScanResult | null => this.data.scan
  }

  meta = {
    get: (key: string): string | null => this.data.meta[key] ?? null,
    set: (key: string, value: string): void => {
      this.data.meta[key] = value
      this.persist()
    }
  }

  clearAll(): void {
    this.data = structuredClone(EMPTY)
    this.persist()
    log.warn('all local data cleared')
  }

  close(): void {
    this.persist()
  }
}
