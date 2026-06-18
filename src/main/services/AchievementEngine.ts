import type { Achievement } from '@shared/types'
import { evaluateAchievements, type AchievementStatsInput } from '@shared/achievements'
import { estimatePercentile } from '@shared/ranking'
import type { DataStore } from '../db'
import { createLogger } from '../utils/logger'
import { MetricsService } from './MetricsService'

const log = createLogger('achievements')

/**
 * Evaluates achievement progress from the persisted metrics and records unlock
 * timestamps. Pure scoring lives in `@shared/achievements`; this class wires it
 * to the data store and preserves original unlock dates across re-evaluations.
 */
export class AchievementEngine {
  constructor(private metrics: MetricsService = new MetricsService()) {}

  evaluate(store: DataStore): Achievement[] {
    const totals = this.metrics.derivedTotals(store)
    const longestStreak = this.metrics.buildSnapshot(store).stats.longestStreak

    const input: AchievementStatsInput = {
      totalTokens: totals.totalTokens,
      longestStreak,
      midnightDays: totals.midnightDays,
      earlyBirdDays: totals.earlyBirdDays,
      longestSessionMinutes: totals.longestSessionMinutes,
      totalCodingHours: totals.totalCodingHours,
      distinctToolsUsed: totals.distinctToolsUsed,
      projectCount: totals.projectCount,
      globalPercentile: totals.totalTokens > 0 ? estimatePercentile(totals.totalTokens) : null
    }

    const existing = store.achievements.getUnlockMap()
    const now = new Date().toISOString()
    const achievements = evaluateAchievements(input, existing, now)

    // Persist unlock timestamps (newly unlocked get `now`, kept ones preserved).
    const map: Record<string, string | null> = {}
    let newlyUnlocked = 0
    for (const a of achievements) {
      map[a.id] = a.unlockedAt
      if (a.unlocked && !existing[a.id]) newlyUnlocked++
    }
    store.achievements.setUnlockMap(map)
    if (newlyUnlocked > 0) log.info(`${newlyUnlocked} new achievement(s) unlocked`)

    return achievements.sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1
      return b.progress / b.target - a.progress / a.target
    })
  }
}
