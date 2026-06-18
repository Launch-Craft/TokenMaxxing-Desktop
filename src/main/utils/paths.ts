import { app } from 'electron'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** Absolute home directory of the current OS user. */
export function home(): string {
  return homedir()
}

/** Resolve a `~`-relative path to an absolute one. */
export function expandHome(p: string): string {
  if (p === '~') return home()
  if (p.startsWith('~/')) return join(home(), p.slice(2))
  return resolve(p)
}

/** Per-user writable directory for TokenMaxxing data (db, exports, cache). */
export function userDataDir(): string {
  // `app.getPath('userData')` is unavailable until the app is ready in some
  // contexts; guard so utility imports never throw at module load.
  try {
    return app.getPath('userData')
  } catch {
    return join(home(), '.tokenmaxxing')
  }
}

export function dbPath(): string {
  return join(userDataDir(), 'tokenmaxxing.db')
}

export function jsonStorePath(): string {
  return join(userDataDir(), 'tokenmaxxing-store.json')
}

export function exportsDir(): string {
  return join(userDataDir(), 'exports')
}
