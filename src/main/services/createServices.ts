import { getDataStore, type DataStore } from '../db'
import { ScannerService } from '../scanner/ScannerService'
import { AchievementEngine } from './AchievementEngine'
import { AuthService } from './AuthService'
import { LiveAnalysisService } from './LiveAnalysisService'
import { MetricsService } from './MetricsService'
import { NotificationService } from './NotificationService'
import { RankingService } from './RankingService'
import { SettingsService } from './SettingsService'
import { SyncService } from './SyncService'
import { WrappedService } from './WrappedService'

/** Singleton bag of all main-process services, wired together. */
export interface Services {
  store: DataStore
  settings: SettingsService
  scanner: ScannerService
  live: LiveAnalysisService
  metrics: MetricsService
  sync: SyncService
  rankings: RankingService
  achievements: AchievementEngine
  notifications: NotificationService
  wrapped: WrappedService
  auth: AuthService
}

let services: Services | null = null

export function createServices(): Services {
  if (services) return services
  const store = getDataStore()
  const metrics = new MetricsService()
  const sync = new SyncService()
  const settings = new SettingsService()
  const scanner = new ScannerService()
  const achievements = new AchievementEngine(metrics)
  const notifications = new NotificationService(metrics, settings)
  services = {
    store,
    settings,
    scanner,
    live: new LiveAnalysisService(scanner, store, settings, achievements, notifications),
    metrics,
    sync,
    rankings: new RankingService(metrics, sync),
    achievements,
    notifications,
    wrapped: new WrappedService(),
    auth: new AuthService(store)
  }
  return services
}

export function getServices(): Services {
  return services ?? createServices()
}
