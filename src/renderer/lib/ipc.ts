import type { AppInfo, SessionFilter, TokenMaxxingApi } from '@shared/ipc'
import type { AnalysisTick, AuthState, AuthUser, ScanProgress } from '@shared/types'
import {
  MOCK_SETTINGS,
  mockAchievements,
  mockRankings,
  mockScanResult,
  mockSessions,
  mockSnapshot,
  mockWrapped
} from './mock'

export const isElectron = typeof window !== 'undefined' && !!window.api

function delay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/** Browser-only fallback that mimics the bridge with demo data. */
const mockApi: TokenMaxxingApi = {
  app: {
    info: () =>
      delay<AppInfo>({
        name: 'TokenMaxxing',
        version: '0.1.0-web',
        platform: 'darwin',
        dataDir: '~/Library/Application Support/TokenMaxxing',
        isPackaged: false
      }),
    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener')
    }
  },
  window: {
    minimize: () => {},
    toggleMaximize: () => {},
    close: () => {},
    isMaximized: () => Promise.resolve(false),
    onMaximizedChange: () => () => {}
  },
  metrics: {
    snapshot: () => delay(mockSnapshot()),
    sessions: (filter?: SessionFilter) => {
      let rows = mockSessions()
      if (filter?.toolId && filter.toolId !== 'all') rows = rows.filter((s) => s.toolId === filter.toolId)
      if (filter?.search) {
        const q = filter.search.toLowerCase()
        rows = rows.filter((s) => s.projectName.toLowerCase().includes(q) || s.toolName.toLowerCase().includes(q))
      }
      if (filter?.sortBy === 'tokens')
        rows = [...rows].sort(
          (a, b) =>
            b.estimatedTokens + b.tokenBreakdown.cacheRead + b.tokenBreakdown.cacheCreate -
            (a.estimatedTokens + a.tokenBreakdown.cacheRead + a.tokenBreakdown.cacheCreate)
        )
      if (filter?.sortBy === 'duration') rows = [...rows].sort((a, b) => b.durationMinutes - a.durationMinutes)
      return delay(rows.slice(filter?.offset ?? 0, (filter?.offset ?? 0) + (filter?.limit ?? rows.length)))
    }
  },
  scan: {
    run: () => delay(mockScanResult(), 1600),
    status: () =>
      Promise.resolve<ScanProgress>({ status: 'idle', currentTool: null, completed: 0, total: 0, message: 'Ready to scan' }),
    onProgress: () => () => {}
  },
  analysis: {
    status: () => delay<AnalysisTick | null>(null, 0),
    // Emit a heartbeat every 2s so the "last analyzed" indicator feels live in
    // the browser-preview build.
    onTick: (cb) => {
      const id = setInterval(
        () => cb({ at: new Date().toISOString(), changed: false, totalTokens: 0, intervalMs: 2000 }),
        2000
      )
      return () => clearInterval(id)
    }
  },
  settings: {
    get: () => delay(MOCK_SETTINGS),
    update: (patch) => delay({ ...MOCK_SETTINGS, ...patch })
  },
  achievements: { get: () => delay(mockAchievements()) },
  rankings: { get: () => delay(mockRankings()), refresh: () => delay(mockRankings(), 600) },
  wrapped: { get: (year) => delay(mockWrapped(year)), years: () => delay([2026, 2025]) },
  auth: {
    state: () => delay<AuthState>({ status: 'signed-out', user: null }),
    // Browser-preview only: simulate a successful Google sign-in so the gated UI
    // and the leaderboard/globe can be explored without a backend.
    signIn: (provider) => {
      const user: AuthUser = {
        id: 'demo-user',
        email: 'you@tokenmaxxing.dev',
        name: 'Demo Developer',
        avatarUrl: null,
        provider
      }
      return delay<AuthState>({ status: 'signed-in', user }, 600)
    },
    signOut: () => delay<AuthState>({ status: 'signed-out', user: null }),
    onChange: () => () => {}
  },
  privacy: {
    exportData: () => delay({ path: '~/Downloads/tokenmaxxing-export.json' }),
    deleteAllData: () => delay(undefined)
  }
}

/** The single API surface the renderer talks to. */
export const client: TokenMaxxingApi = isElectron ? (window.api as TokenMaxxingApi) : mockApi
