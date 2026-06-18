import { create } from 'zustand'
import type { Settings } from '@shared/types'
import { client } from '@/lib/ipc'

interface SettingsState {
  settings: Settings | null
  loading: boolean
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
  exportData: () => Promise<{ path: string } | null>
  deleteAll: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loading: false,
  load: async () => {
    set({ loading: true })
    const settings = await client.settings.get()
    set({ settings, loading: false })
  },
  update: async (patch) => {
    // Optimistic update for snappy toggles.
    const prev = get().settings
    if (prev) set({ settings: { ...prev, ...patch, privacy: { ...prev.privacy, ...(patch.privacy ?? {}) } } })
    const settings = await client.settings.update(patch)
    set({ settings })
  },
  exportData: () => client.privacy.exportData(),
  deleteAll: async () => {
    await client.privacy.deleteAllData()
    await get().load()
  }
}))
