import type {
  CountryShipping,
  RankingSnapshot,
  RankingUploadPayload,
  Settings
} from '@shared/types'
import { countryGeo } from '@shared/geo'
import { createLogger } from '../utils/logger'

const log = createLogger('sync')

/**
 * Thin client for the optional TokenMaxxing cloud backend (see /server). EVERY
 * method here is only ever invoked when the user has explicitly enabled cloud
 * sync. The payloads are strictly aggregated metrics — never source code,
 * prompts, or conversations.
 */
export class SyncService {
  private get baseUrl(): string | null {
    return process.env.VITE_API_BASE_URL || process.env.API_BASE_URL || null
  }

  private headers(token: string | null): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' }
    if (token) h.authorization = `Bearer ${token}`
    return h
  }

  async uploadRankingMetrics(
    payload: RankingUploadPayload,
    settings: Settings,
    token: string | null = null
  ): Promise<void> {
    if (!settings.privacy.cloudSyncEnabled) {
      log.debug('cloud sync disabled; skipping upload')
      return
    }
    if (!this.baseUrl) {
      log.debug('no API base url configured; skipping upload')
      return
    }
    const res = await fetch(`${this.baseUrl}/v1/rankings/metrics`, {
      method: 'POST',
      headers: this.headers(token),
      body: JSON.stringify({
        handle: settings.handle,
        countryCode: settings.countryCode,
        metrics: payload
      })
    })
    if (!res.ok) throw new Error(`upload failed: ${res.status}`)
  }

  async fetchRankings(
    settings: Settings,
    token: string | null = null
  ): Promise<RankingSnapshot | null> {
    if (!this.baseUrl) return null
    const params = new URLSearchParams({ handle: settings.handle })
    if (settings.countryCode) params.set('country', settings.countryCode)
    const res = await fetch(`${this.baseUrl}/v1/rankings?${params.toString()}`, {
      headers: this.headers(token)
    })
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
    return (await res.json()) as RankingSnapshot
  }

  /**
   * Fetch the server's country-wise shipping rollup (globe + country board).
   * The server stays geo-agnostic — it returns only `{ countryCode, totalTokens,
   * developers }` rows; we merge centroids/flags from the shared geo table and
   * compute each country's share here.
   */
  async fetchCountries(
    settings: Settings,
    token: string | null = null
  ): Promise<CountryShipping[]> {
    if (!this.baseUrl) return []
    const res = await fetch(`${this.baseUrl}/v1/rankings/countries`, {
      headers: this.headers(token)
    })
    if (!res.ok) throw new Error(`countries fetch failed: ${res.status}`)
    const body = (await res.json()) as {
      countries?: Array<{ countryCode: string; totalTokens: number; developers: number }>
    }
    const rows = body.countries ?? []
    const total = rows.reduce((s, r) => s + (r.totalTokens || 0), 0) || 1
    const you = settings.countryCode?.toUpperCase() ?? null
    return rows.map((r) => {
      const geo = countryGeo(r.countryCode)
      return {
        countryCode: geo.code,
        countryName: geo.name,
        flag: geo.flag,
        lat: geo.lat,
        lng: geo.lng,
        totalTokens: r.totalTokens,
        developers: r.developers,
        share: Number(((r.totalTokens / total) * 100).toFixed(1)),
        isYou: you === geo.code
      }
    })
  }

  async deleteCloudData(settings: Settings, token: string | null = null): Promise<void> {
    if (!this.baseUrl) return
    await fetch(`${this.baseUrl}/v1/account/data`, {
      method: 'DELETE',
      headers: this.headers(token)
    }).catch((err) => log.warn('cloud delete failed', err))
  }
}
