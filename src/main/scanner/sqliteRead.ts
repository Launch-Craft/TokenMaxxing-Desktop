import { promises as fs } from 'node:fs'
import type { SqlJsStatic } from 'sql.js'
import { createLogger } from '../utils/logger'

const log = createLogger('sqlite-read')

export interface ReadonlyDb {
  query(sql: string): Record<string, unknown>[]
  close(): void
}

type InitSqlJs = (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>

let sqlJsPromise: Promise<SqlJsStatic> | null = null

function loadSqlJs(): Promise<SqlJsStatic> {
  if (sqlJsPromise) return sqlJsPromise
  const initSqlJs = require('sql.js') as InitSqlJs
  let wasmPath: string | undefined
  try {
    wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
  } catch {
    /* let sql.js use its default resolution */
  }
  sqlJsPromise = initSqlJs(wasmPath ? { locateFile: () => wasmPath as string } : undefined)
  return sqlJsPromise
}

/**
 * Open a SQLite file READ-ONLY. Prefers native better-sqlite3 (fast) but
 * transparently falls back to sql.js (pure WASM) so reading external databases
 * — e.g. Cursor's `ai-code-tracking.db` — works on any machine with no native
 * build tools. sql.js loads a snapshot of the file, so it's also lock-free.
 */
export async function openSqliteReadonly(filePath: string): Promise<ReadonlyDb> {
  try {
    const Database = require('better-sqlite3') as typeof import('better-sqlite3')
    const db = new Database(filePath, { readonly: true, fileMustExist: true })
    return {
      query: (sql) => db.prepare(sql).all() as Record<string, unknown>[],
      close: () => db.close()
    }
  } catch (err) {
    log.debug('better-sqlite3 unavailable, using sql.js (wasm):', (err as Error).message)
  }

  const SQL = await loadSqlJs()
  const buffer = await fs.readFile(filePath)
  const db = new SQL.Database(buffer)
  return {
    query: (sql) => {
      const result = db.exec(sql)
      if (result.length === 0) return []
      const { columns, values } = result[0]
      return values.map((row) => {
        const obj: Record<string, unknown> = {}
        columns.forEach((col, i) => {
          obj[col] = row[i]
        })
        return obj
      })
    },
    close: () => db.close()
  }
}
