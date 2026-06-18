import type {
  CountryShipping,
  RankCard,
  RankingLeaderboardEntry,
  RankingSnapshot,
  RankingUploadPayload,
  Settings,
  ToolId
} from '@shared/types'
import { TOOL_META } from '@shared/constants'
import { estimatePercentile, percentileToRank } from '@shared/ranking'
import { countryGeo } from '@shared/geo'
import type { DataStore } from '../db'
import { createLogger } from '../utils/logger'
import { MetricsService } from './MetricsService'
import type { SyncService } from './SyncService'

const log = createLogger('rankings')
const GLOBAL_POPULATION = 120_000
const COUNTRY_POPULATION = 8_000

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  IN: 'India',
  GB: 'United Kingdom',
  DE: 'Germany',
  CA: 'Canada',
  BR: 'Brazil',
  JP: 'Japan',
  FR: 'France',
  AU: 'Australia',
  NG: 'Nigeria'
}

/**
 * Computes ranking cards + leaderboard. When the user has opted into cloud
 * rankings AND cloud sync is enabled, real data comes from the backend via
 * {@link SyncService}; otherwise we present a clearly-labeled *local estimate*
 * derived purely from the user's own numbers (nothing is uploaded).
 */
export class RankingService {
  constructor(
    private metrics: MetricsService = new MetricsService(),
    private sync?: SyncService
  ) {}

  private participating(settings: Settings): boolean {
    return settings.privacy.cloudSyncEnabled && settings.privacy.rankingParticipation
  }

  buildPayload(store: DataStore): RankingUploadPayload {
    const totals = this.metrics.derivedTotals(store)
    const snapshot = this.metrics.buildSnapshot(store)
    const topTool = this.topTool(totals.toolTotals)
    return {
      totalTokens: totals.totalTokens,
      // Today's tokens (incl. cache) — matches the dashboard "Tokens used" card and
      // drives the DAILY leaderboard ranking.
      dailyTokens: snapshot.stats.gross.today,
      monthlyTokens: snapshot.stats.tokensThisMonth,
      activeDays: store.daily.all().filter((d) => d.tokens > 0).length,
      codingHours: totals.totalCodingHours,
      projectsCreated: totals.projectCount,
      topTool,
      toolTotals: totals.toolTotals
    }
  }

  async get(
    store: DataStore,
    settings: Settings,
    token: string | null = null
  ): Promise<RankingSnapshot> {
    return this.compute(store, settings, false, token)
  }

  async refresh(
    store: DataStore,
    settings: Settings,
    token: string | null = null
  ): Promise<RankingSnapshot> {
    return this.compute(store, settings, true, token)
  }

  private async compute(
    store: DataStore,
    settings: Settings,
    forceRemote: boolean,
    token: string | null = null
  ): Promise<RankingSnapshot> {
    const totals = this.metrics.derivedTotals(store)
    const totalTokens = totals.totalTokens
    const topTool = this.topTool(totals.toolTotals)
    const percentile = totalTokens > 0 ? estimatePercentile(totalTokens) : null

    // Cloud path: ONLY when the user has opted into cloud rankings (master switch
    // + ranking participation) AND is signed in AND a backend is configured. This
    // honors the privacy-first promise — nothing (not even the handle in a fetch
    // query) leaves the machine unless cloud sync is explicitly enabled. Uses REAL
    // data: upload the user's aggregated metrics so they appear, then read the live
    // leaderboard + country rollups. Falls back to a local estimate if unreachable.
    if (token && this.participating(settings) && this.sync && this.sync.hasBackend()) {
      try {
        // Only upload when there's actual data. Right after sign-out wipes local
        // data, a fresh sign-in would otherwise upload an all-zero payload, which
        // the daily-leaderboard filter (daily_tokens > 0) hides — and worse, it
        // would overwrite any real cloud data this account already had with 0.
        if (forceRemote && totalTokens > 0) {
          await this.sync.uploadRankingMetrics(this.buildPayload(store), settings, token)
        }
        const remote = await this.sync.fetchRankings(settings, token)
        if (remote) {
          // Country rollups come from a separate endpoint (globe + country board).
          const countries = await this.sync.fetchCountries(settings, token).catch(() => [])
          return {
            ...remote,
            countries: countries.length ? countries : (remote.countries ?? []),
            estimated: false
          }
        }
      } catch (err) {
        log.warn('cloud rankings unavailable, using local estimate:', (err as Error).message)
      }
    }

    // Local estimate path.
    const globalRank =
      percentile !== null ? percentileToRank(percentile, GLOBAL_POPULATION) : null
    const cards: RankCard[] = [
      {
        scope: 'global',
        label: 'Global',
        rank: globalRank,
        total: GLOBAL_POPULATION,
        percentile,
        context: 'All developers'
      }
    ]

    if (settings.countryCode) {
      const countryPct = percentile
      cards.push({
        scope: 'country',
        label: COUNTRY_NAMES[settings.countryCode] ?? settings.countryCode,
        rank: countryPct !== null ? percentileToRank(countryPct, COUNTRY_POPULATION) : null,
        total: COUNTRY_POPULATION,
        percentile: countryPct,
        context: settings.countryCode
      })
    }

    if (totalTokens > 0) {
      const toolTokens = totals.toolTotals[topTool] ?? 0
      const toolPct = estimatePercentile(toolTokens)
      cards.push({
        scope: 'tool',
        label: `Top ${TOOL_META[topTool].name} User`,
        rank: percentileToRank(toolPct, Math.round(GLOBAL_POPULATION / 4)),
        total: Math.round(GLOBAL_POPULATION / 4),
        percentile: toolPct,
        context: TOOL_META[topTool].name,
        toolId: topTool
      })
    }

    // Estimate path shows ONLY the user's own data — never fabricated competitors
    // or a fake country distribution (that read as real "global" data and was
    // misleading). The rank cards above are the user's own numbers projected onto
    // a percentile curve and are clearly labeled "Estimated" in the UI.
    const leaderboard: RankingLeaderboardEntry[] =
      totalTokens > 0
        ? [
            {
              rank: 1,
              handle: settings.handle,
              country: settings.countryCode ?? null,
              totalTokens: Math.round(totalTokens),
              codingHours: totals.totalCodingHours,
              topTool,
              isYou: true
            }
          ]
        : []

    const countries: CountryShipping[] = []
    if (settings.countryCode && totalTokens > 0) {
      const geo = countryGeo(settings.countryCode)
      countries.push({
        countryCode: geo.code,
        countryName: geo.name,
        flag: geo.flag,
        lat: geo.lat,
        lng: geo.lng,
        totalTokens: Math.round(totalTokens),
        developers: 1,
        share: 100,
        isYou: true
      })
    }

    return {
      participating: this.participating(settings),
      cards,
      leaderboard,
      countries,
      updatedAt: new Date().toISOString(),
      estimated: true
    }
  }

  private topTool(toolTotals: Partial<Record<ToolId, number>>): ToolId {
    let best: ToolId = 'claude-code'
    let bestVal = -1
    for (const [tool, val] of Object.entries(toolTotals)) {
      if ((val ?? 0) > bestVal) {
        best = tool as ToolId
        bestVal = val ?? 0
      }
    }
    return best
  }
}
