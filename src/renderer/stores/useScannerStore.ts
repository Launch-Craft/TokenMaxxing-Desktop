import { create } from 'zustand'
import type { ScanProgress } from '@shared/types'
import { client } from '@/lib/ipc'
import { useMetricsStore } from './useMetricsStore'
import { useRankingsStore } from './useRankingsStore'

interface ScannerState {
  progress: ScanProgress
  running: boolean
  lastScanAt: string | null
  /** Timestamp of the most recent continuous-analysis pass (2s loop). */
  lastAnalyzedAt: string | null
  runScan: () => Promise<void>
  subscribe: () => () => void
}

const IDLE: ScanProgress = {
  status: 'idle',
  currentTool: null,
  completed: 0,
  total: 0,
  message: 'Ready to scan'
}

export const useScannerStore = create<ScannerState>((set, get) => ({
  progress: IDLE,
  running: false,
  lastScanAt: null,
  lastAnalyzedAt: null,
  runScan: async () => {
    if (get().running) return
    set({ running: true })
    try {
      await client.scan.run()
      set({ lastScanAt: new Date().toISOString() })
      // Refresh everything derived from a scan.
      await Promise.all([
        useMetricsStore.getState().load(),
        useRankingsStore.getState().load()
      ])
    } finally {
      set({ running: false })
    }
  },
  subscribe: () => {
    const offProgress = client.scan.onProgress((progress) => {
      set({ progress, running: progress.status === 'scanning' })
      // Any completed scan (sidebar, tray menu, or auto-scan) refreshes the UI.
      if (progress.status === 'success') {
        void Promise.all([
          useMetricsStore.getState().load(),
          useRankingsStore.getState().load()
        ])
      }
    })
    // Continuous 2s analysis heartbeat: update freshness always, but only reload
    // derived data when the pass actually processed new/changed activity.
    const offTick = client.analysis.onTick((tick) => {
      set({ lastAnalyzedAt: tick.at })
      if (tick.changed) void useMetricsStore.getState().load()
    })
    return () => {
      offProgress()
      offTick()
    }
  }
}))
