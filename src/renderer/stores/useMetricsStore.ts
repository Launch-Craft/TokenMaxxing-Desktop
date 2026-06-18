import { create } from 'zustand'
import type { MetricsSnapshot } from '@shared/types'
import { client } from '@/lib/ipc'

interface MetricsState {
  snapshot: MetricsSnapshot | null
  loading: boolean
  error: string | null
  load: () => Promise<void>
}

export const useMetricsStore = create<MetricsState>((set) => ({
  snapshot: null,
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null })
    try {
      const snapshot = await client.metrics.snapshot()
      set({ snapshot, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  }
}))
