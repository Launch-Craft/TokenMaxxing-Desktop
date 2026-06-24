import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppInfo, SessionFilter, TokenMaxxingApi } from '@shared/ipc'
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
  WrappedReport
} from '@shared/types'

/** Subscribe to a main→renderer event channel; returns an unsubscribe fn. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: TokenMaxxingApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo) as Promise<AppInfo>,
    openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url) as Promise<void>
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.windowMaximizeToggle),
    close: () => ipcRenderer.send(IPC.windowClose),
    isMaximized: () => ipcRenderer.invoke(IPC.windowIsMaximized) as Promise<boolean>,
    onMaximizedChange: (cb) => subscribe<boolean>(IPC.windowMaximizedChanged, cb)
  },
  metrics: {
    snapshot: () => ipcRenderer.invoke(IPC.metricsSnapshot) as Promise<MetricsSnapshot>,
    sessions: (filter?: SessionFilter) =>
      ipcRenderer.invoke(IPC.metricsSessions, filter) as Promise<Session[]>
  },
  scan: {
    run: () => ipcRenderer.invoke(IPC.scanRun) as Promise<ScanResult>,
    status: () => ipcRenderer.invoke(IPC.scanStatus) as Promise<ScanProgress>,
    onProgress: (cb) => subscribe<ScanProgress>(IPC.scanProgress, cb)
  },
  analysis: {
    status: () => ipcRenderer.invoke(IPC.analysisStatus) as Promise<AnalysisTick | null>,
    onTick: (cb) => subscribe<AnalysisTick>(IPC.analysisTick, cb)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet) as Promise<Settings>,
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch) as Promise<Settings>
  },
  achievements: {
    get: () => ipcRenderer.invoke(IPC.achievementsGet) as Promise<Achievement[]>
  },
  rankings: {
    get: () => ipcRenderer.invoke(IPC.rankingsGet) as Promise<RankingSnapshot>,
    refresh: () => ipcRenderer.invoke(IPC.rankingsRefresh) as Promise<RankingSnapshot>
  },
  wrapped: {
    get: (year) => ipcRenderer.invoke(IPC.wrappedGet, year) as Promise<WrappedReport>,
    years: () => ipcRenderer.invoke(IPC.wrappedYears) as Promise<number[]>
  },
  auth: {
    state: () => ipcRenderer.invoke(IPC.authState) as Promise<AuthState>,
    signIn: (provider: AuthProvider) =>
      ipcRenderer.invoke(IPC.authSignIn, provider) as Promise<AuthState>,
    signOut: () => ipcRenderer.invoke(IPC.authSignOut) as Promise<AuthState>,
    onChange: (cb) => subscribe<AuthState>(IPC.authChanged, cb)
  },
  notifications: {
    onNavigate: (cb) => subscribe<string>(IPC.notificationNavigate, cb)
  },
  privacy: {
    exportData: () => ipcRenderer.invoke(IPC.privacyExport) as Promise<{ path: string } | null>,
    deleteAllData: () => ipcRenderer.invoke(IPC.privacyDeleteAll) as Promise<void>
  }
}

contextBridge.exposeInMainWorld('api', api)
