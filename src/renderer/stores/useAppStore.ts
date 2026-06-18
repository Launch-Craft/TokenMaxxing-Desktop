import { create } from 'zustand'
import type { AppInfo } from '@shared/ipc'
import { client, isElectron } from '@/lib/ipc'

interface AppState {
  info: AppInfo | null
  isElectron: boolean
  isMac: boolean
  ready: boolean
  init: () => Promise<void>
}

export const useAppStore = create<AppState>((set) => ({
  info: null,
  isElectron,
  isMac: true,
  ready: false,
  init: async () => {
    const info = await client.app.info()
    set({ info, isMac: info.platform === 'darwin', ready: true })
  }
}))
