import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type {
  PrivacySettings,
  ScanFrequency,
  Settings,
  ThemePreference,
  ToolId
} from '@shared/types'
import { TOOL_IDS } from '@shared/types'
import { DEFAULT_SETTINGS, SETTINGS_VERSION } from '@shared/constants'
import type { DataStore } from '../db'
import { exportsDir } from '../utils/paths'
import { createLogger } from '../utils/logger'

const log = createLogger('settings')

const SCAN_FREQUENCIES: ScanFrequency[] = ['manual', 'startup', 'hourly', 'daily']
const THEMES: ThemePreference[] = ['dark', 'system']
const PRIVACY_KEYS: (keyof PrivacySettings)[] = [
  'cloudSyncEnabled',
  'rankingParticipation',
  'shareAnonymousUsage'
]

type SettingsPatch = Partial<Omit<Settings, 'privacy' | 'enabledTools'>> & {
  privacy: Partial<PrivacySettings>
  enabledTools: Partial<Record<ToolId, boolean>>
}

/**
 * Build a clean patch from arbitrary (IPC-crossing, untyped-at-runtime) input.
 * Only known fields with the right type survive — unknown keys and malformed
 * values are dropped so a bad payload can't corrupt persisted settings.
 */
function sanitizeSettingsPatch(input: Partial<Settings>): SettingsPatch {
  const p = (input ?? {}) as Record<string, unknown>
  const clean: SettingsPatch = { privacy: {}, enabledTools: {} }

  if (typeof p.scanFrequency === 'string' && SCAN_FREQUENCIES.includes(p.scanFrequency as ScanFrequency)) {
    clean.scanFrequency = p.scanFrequency as ScanFrequency
  }
  if (typeof p.autoScanOnLaunch === 'boolean') clean.autoScanOnLaunch = p.autoScanOnLaunch
  if (typeof p.theme === 'string' && THEMES.includes(p.theme as ThemePreference)) {
    clean.theme = p.theme as ThemePreference
  }
  if (typeof p.handle === 'string') clean.handle = p.handle.trim().slice(0, 40)
  if (p.countryCode === null) clean.countryCode = null
  else if (typeof p.countryCode === 'string' && /^[A-Za-z]{2}$/.test(p.countryCode)) {
    clean.countryCode = p.countryCode.toUpperCase()
  }
  if (p.privacy && typeof p.privacy === 'object') {
    const src = p.privacy as Record<string, unknown>
    for (const k of PRIVACY_KEYS) if (typeof src[k] === 'boolean') clean.privacy[k] = src[k] as boolean
  }
  if (p.enabledTools && typeof p.enabledTools === 'object') {
    const src = p.enabledTools as Record<string, unknown>
    for (const id of TOOL_IDS) if (typeof src[id] === 'boolean') clean.enabledTools[id] = src[id] as boolean
  }
  return clean
}

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
    const clean = sanitizeSettingsPatch(patch)
    const next: Settings = {
      ...current,
      ...clean,
      privacy: { ...current.privacy, ...clean.privacy },
      enabledTools: { ...current.enabledTools, ...clean.enabledTools },
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
