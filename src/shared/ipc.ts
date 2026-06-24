import type {
  Achievement,
  AnalysisTick,
  AuthProvider,
  AuthState,
  MetricsSnapshot,
  RankingSnapshot,
  ScanProgress,
  ScanResult,
  Session,
  Settings,
  ToolId,
  WrappedReport
} from './types'

/** Every IPC channel name in one place to avoid string drift. */
export const IPC = {
  // App / window
  appInfo: 'app:info',
  windowMinimize: 'window:minimize',
  windowMaximizeToggle: 'window:maximize-toggle',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowMaximizedChanged: 'window:maximized-changed',
  openExternal: 'app:open-external',

  // Metrics
  metricsSnapshot: 'metrics:snapshot',
  metricsSessions: 'metrics:sessions',

  // Scanning
  scanRun: 'scan:run',
  scanStatus: 'scan:status',
  scanProgress: 'scan:progress', // main → renderer event

  // Continuous local analysis (2s loop)
  analysisTick: 'analysis:tick', // main → renderer event
  analysisStatus: 'analysis:status',

  // Settings
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  // Achievements
  achievementsGet: 'achievements:get',

  // Rankings
  rankingsGet: 'rankings:get',
  rankingsRefresh: 'rankings:refresh',

  // Wrapped
  wrappedGet: 'wrapped:get',
  wrappedYears: 'wrapped:years',

  // Auth
  authState: 'auth:state',
  authSignIn: 'auth:sign-in',
  authSignOut: 'auth:sign-out',
  authChanged: 'auth:changed', // main → renderer event

  // Notifications
  notificationNavigate: 'notification:navigate', // main → renderer event

  // Privacy
  privacyExport: 'privacy:export',
  privacyDeleteAll: 'privacy:delete-all'
} as const

export interface AppInfo {
  name: string
  version: string
  /** e.g. "darwin" | "win32" | "linux". */
  platform: string
  dataDir: string
  isPackaged: boolean
}

export interface SessionFilter {
  toolId?: ToolId | 'all'
  search?: string
  limit?: number
  offset?: number
  sortBy?: 'recent' | 'tokens' | 'duration'
}

/**
 * The full surface exposed to the renderer on `window.api`. Implemented by the
 * preload bridge (thin) and backed by IPC handlers in the main process.
 */
export interface TokenMaxxingApi {
  app: {
    info(): Promise<AppInfo>
    openExternal(url: string): Promise<void>
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizedChange(cb: (maximized: boolean) => void): () => void
  }
  metrics: {
    snapshot(): Promise<MetricsSnapshot>
    sessions(filter?: SessionFilter): Promise<Session[]>
  }
  scan: {
    run(): Promise<ScanResult>
    status(): Promise<ScanProgress>
    onProgress(cb: (progress: ScanProgress) => void): () => void
  }
  analysis: {
    /** Most recent heartbeat (or null before the first pass). */
    status(): Promise<AnalysisTick | null>
    onTick(cb: (tick: AnalysisTick) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    update(patch: Partial<Settings>): Promise<Settings>
  }
  achievements: {
    get(): Promise<Achievement[]>
  }
  rankings: {
    get(): Promise<RankingSnapshot>
    refresh(): Promise<RankingSnapshot>
  }
  wrapped: {
    get(year: number): Promise<WrappedReport>
    years(): Promise<number[]>
  }
  auth: {
    state(): Promise<AuthState>
    signIn(provider: AuthProvider): Promise<AuthState>
    signOut(): Promise<AuthState>
    onChange(cb: (state: AuthState) => void): () => void
  }
  notifications: {
    onNavigate(cb: (route: string) => void): () => void
  }
  privacy: {
    exportData(): Promise<{ path: string } | null>
    deleteAllData(): Promise<void>
  }
}
