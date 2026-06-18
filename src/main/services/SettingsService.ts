import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Settings } from '@shared/types'
import { DEFAULT_SETTINGS, SETTINGS_VERSION } from '@shared/constants'
import type { DataStore } from '../db'
import { exportsDir } from '../utils/paths'
import { createLogger } from '../utils/logger'

const log = createLogger('settings')

/** Loads/saves user settings with sane defaults and deep-merged updates. */
export class SettingsService {
  get(store: DataStore): Settings {
    const stored = store.settings.get()
    if (!stored) {
      store.settings.save(DEFAULT_SETTINGS)
      return DEFAULT_SETTINGS
    }
    return this.migrate(stored)
  }

  update(store: DataStore, patch: Partial<Settings>): Settings {
    const current = this.get(store)
    const next: Settings = {
      ...current,
      ...patch,
      privacy: { ...current.privacy, ...(patch.privacy ?? {}) },
      enabledTools: { ...current.enabledTools, ...(patch.enabledTools ?? {}) },
      version: SETTINGS_VERSION
    }
    store.settings.save(next)
    log.info('settings updated')
    return next
  }

  private migrate(s: Settings): Settings {
    // Merge in any newly-added defaults for forward compatibility.
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      privacy: { ...DEFAULT_SETTINGS.privacy, ...s.privacy },
      enabledTools: { ...DEFAULT_SETTINGS.enabledTools, ...s.enabledTools },
      version: SETTINGS_VERSION
    }
  }

  /** Export ALL local data to a JSON file the user owns. */
  async exportData(store: DataStore): Promise<{ path: string }> {
    const dir = exportsDir()
    await fs.mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const path = join(dir, `tokenmaxxing-export-${stamp}.json`)
    const payload = {
      exportedAt: new Date().toISOString(),
      version: SETTINGS_VERSION,
      settings: this.get(store),
      sessions: store.sessions.all(),
      daily: store.daily.all(),
      toolMetrics: store.toolMetrics.all(),
      achievements: store.achievements.getUnlockMap(),
      lastScan: store.scan.getLast()
    }
    await fs.writeFile(path, JSON.stringify(payload, null, 2), 'utf-8')
    log.info('exported data to', path)
    return { path }
  }
}
