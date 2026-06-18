import type { CountryShipping, RankingLeaderboardEntry, ToolId } from './types'
import { countryGeo } from './geo'

/**
 * Pure ranking helpers shared by the renderer and main process. When cloud sync
 * is disabled we still want the Rankings screen to feel alive, so we synthesize
 * a *deterministic* leaderboard from the user's own numbers. This is clearly
 * labeled as a local estimate in the UI and never uploaded anywhere.
 */

export type RankTierName =
  | 'Unranked'
  | 'Bronze'
  | 'Silver'
  | 'Gold'
  | 'Platinum'
  | 'Diamond'
  | 'Elite'

export function rankTier(percentile: number | null): RankTierName {
  if (percentile === null) return 'Unranked'
  if (percentile >= 99) return 'Elite'
  if (percentile >= 95) return 'Diamond'
  if (percentile >= 85) return 'Platinum'
  if (percentile >= 65) return 'Gold'
  if (percentile >= 40) return 'Silver'
  return 'Bronze'
}

/**
 * Estimate a percentile from a token total using a log-normal-ish curve fit to
 * plausible developer usage. Returns 0–100.
 */
export function estimatePercentile(totalTokens: number): number {
  if (totalTokens <= 0) return 0
  // Reference: ~50th percentile ≈ 2M tokens, ~99th ≈ 250M tokens.
  const x = Math.log10(totalTokens + 1)
  const lo = Math.log10(50_000) // ~floor
  const hi = Math.log10(250_000_000) // ~elite
  const pct = ((x - lo) / (hi - lo)) * 100
  return Math.max(0, Math.min(99.9, Number(pct.toFixed(1))))
}

/** Convert a percentile into an approximate rank within `population`. */
export function percentileToRank(percentile: number, population: number): number {
  const rank = Math.round(((100 - percentile) / 100) * population) + 1
  return Math.max(1, rank)
}

const HANDLES = [
  'neo.vim',
  'asyncawait',
  'rustacean',
  'promptsmith',
  'segfault',
  'lambda_lord',
  'tabs>spaces',
  'midnight.sh',
  'ghostwriter',
  'kernel_panic',
  'nullpointer',
  'big.O',
  'monorepo_mama',
  'yak_shaver',
  'cache_invalidator',
  'race_condition',
  'shipfast',
  'context_window',
  'vibe_coder',
  'merge_conflict'
]

const COUNTRIES = ['US', 'IN', 'DE', 'GB', 'BR', 'JP', 'CA', 'FR', 'NG', 'AU']

/** Tiny deterministic PRNG so the synthetic board is stable across renders. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function synthesizeLeaderboard(
  you: { totalTokens: number; codingHours: number; topTool: ToolId; handle: string },
  yourRank: number,
  size = 12
): RankingLeaderboardEntry[] {
  const rand = mulberry32(Math.max(1, Math.floor(you.totalTokens / 1000) + size))
  const entries: RankingLeaderboardEntry[] = []

  // Top of the board scales above the user.
  let tokens = you.totalTokens * (3 + rand() * 4) + 5_000_000
  for (let i = 0; i < size; i++) {
    const rank = i + 1
    const isYou = rank === yourRank
    if (isYou) {
      entries.push({
        rank,
        handle: you.handle,
        country: null,
        totalTokens: you.totalTokens,
        codingHours: you.codingHours,
        topTool: you.topTool,
        isYou: true
      })
    } else {
      tokens = tokens * (0.78 + rand() * 0.12)
      entries.push({
        rank,
        handle: HANDLES[(i * 7 + 3) % HANDLES.length],
        country: COUNTRIES[(i * 3) % COUNTRIES.length],
        totalTokens: Math.round(tokens),
        codingHours: Math.round(tokens / 90_000),
        topTool: (['claude-code', 'cursor', 'codex', 'gemini-cli'] as ToolId[])[i % 4],
        isYou: false
      })
    }
  }

  return entries.sort((a, b) => b.totalTokens - a.totalTokens).map((e, i) => ({
    ...e,
    rank: i + 1
  }))
}

/**
 * Relative developer-population weights for the top "shipping" countries. Used
 * to synthesize a plausible, deterministic country distribution when no cloud
 * snapshot is available. Clearly surfaced as an estimate in the UI.
 */
const COUNTRY_WEIGHTS: Array<[string, number]> = [
  ['US', 100], ['IN', 84], ['CN', 58], ['DE', 44], ['GB', 41], ['BR', 34],
  ['JP', 30], ['FR', 28], ['CA', 26], ['RU', 22], ['KR', 20], ['NL', 16],
  ['PL', 15], ['UA', 14], ['ES', 13], ['AU', 12], ['SG', 11], ['ID', 10],
  ['IL', 9], ['SE', 8], ['TR', 7], ['VN', 7], ['IT', 6], ['MX', 6],
  ['NG', 5], ['AR', 5], ['CH', 4], ['IE', 4]
]

/**
 * Build a deterministic country-wise shipping rollup. When `yourCountry` is
 * provided, that country is flagged (`isYou`) and credited with the user's own
 * tokens. This powers the offline/local-estimate globe + country leaderboard;
 * the cloud path returns real aggregates instead.
 */
export function synthesizeCountryShipping(opts: {
  totalTokens: number
  yourCountry?: string | null
  count?: number
}): CountryShipping[] {
  const rand = mulberry32(20260618)
  const unit = 7_200_000
  const map = new Map<string, { tokens: number; developers: number }>()

  for (let i = 0; i < COUNTRY_WEIGHTS.length; i++) {
    const [code, weight] = COUNTRY_WEIGHTS[i]
    const jitter = 0.82 + rand() * 0.4
    map.set(code, {
      tokens: Math.round(weight * unit * jitter),
      developers: Math.max(1, Math.round(weight * 92 * (0.8 + rand() * 0.5)))
    })
  }

  // Credit the signed-in user's own country.
  const you = opts.yourCountry?.toUpperCase() ?? null
  if (you) {
    const prev = map.get(you) ?? { tokens: 0, developers: 0 }
    map.set(you, {
      tokens: prev.tokens + Math.max(0, Math.round(opts.totalTokens)),
      developers: prev.developers + 1
    })
  }

  const total = [...map.values()].reduce((s, v) => s + v.tokens, 0) || 1
  const rows: CountryShipping[] = [...map.entries()].map(([code, v]) => {
    const geo = countryGeo(code)
    return {
      countryCode: code,
      countryName: geo.name,
      flag: geo.flag,
      lat: geo.lat,
      lng: geo.lng,
      totalTokens: v.tokens,
      developers: v.developers,
      share: Number(((v.tokens / total) * 100).toFixed(1)),
      isYou: you === code
    }
  })

  return rows
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, opts.count ?? COUNTRY_WEIGHTS.length)
}
