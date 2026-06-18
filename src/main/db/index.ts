import { dbPath, jsonStorePath } from '../utils/paths'
import { createLogger } from '../utils/logger'
import type { DataStore } from './DataStore'
import { MemoryDataStore } from './MemoryDataStore'
import { SqliteDataStore } from './SqliteDataStore'

const log = createLogger('db')

let store: DataStore | null = null

/**
 * Create (once) the best available data store. Prefers real SQLite; if the
 * native module can't load, transparently falls back to the JSON store so the
 * app never hard-crashes on a missing/mis-built binary.
 */
export function getDataStore(): DataStore {
  if (store) return store
  try {
    // SqliteDataStore only loads the native binding inside its constructor, so
    // a missing/mis-built binary throws here and we fall back gracefully.
    store = new SqliteDataStore(dbPath())
  } catch (err) {
    log.error('SQLite unavailable, falling back to JSON store:', (err as Error).message)
    store = new MemoryDataStore(jsonStorePath())
  }
  return store
}

export function closeDataStore(): void {
  store?.close()
  store = null
}

export type { DataStore } from './DataStore'
