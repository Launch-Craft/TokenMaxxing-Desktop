import { create } from 'zustand'
import type { RankingSnapshot } from '@shared/types'
import { LEADERBOARD_REFRESH_MS } from '@shared/constants'
import { client } from '@/lib/ipc'

interface RankingsState {
  rankings: RankingSnapshot | null
  loading: boolean
  refreshing: boolean
  load: () => Promise<void>
  refresh: () => Promise<void>
  /** Begin polling the server leaderboard on the 60s cadence; returns a stopper. */
  startPolling: () => () => void
}

export const useRankingsStore = create<RankingsState>((set, get) => ({
  rankings: null,
  loading: false,
  refreshing: false,
  load: async () => {
    set({ loading: true })
    const rankings = await client.rankings.get()
    set({ rankings, loading: false })
  },
  refresh: async () => {
    if (get().refreshing) return
    set({ refreshing: true })
    try {
      const rankings = await client.rankings.refresh()
      set({ rankings })
    } finally {
      set({ refreshing: false })
    }
  },
  startPolling: () => {
    const id = setInterval(() => {
      void get().refresh()
    }, LEADERBOARD_REFRESH_MS)
    return () => clearInterval(id)
  }
}))
