import type { Achievement, AchievementDef } from './types'

/**
 * Master catalog of achievements. The {@link AchievementEngine} in the main
 * process measures real metrics against each `target`; this file is the single
 * source of truth for the definitions (shared with the renderer for display).
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Tokens ──────────────────────────────────────────────────────────
  {
    id: 'first-tokens',
    name: 'Hello, Tokens',
    description: 'Generate your first 1,000 AI tokens.',
    icon: 'Egg',
    tier: 'bronze',
    category: 'tokens',
    target: 1_000
  },
  {
    id: 'token-apprentice',
    name: 'Token Apprentice',
    description: 'Cross 1 million lifetime tokens.',
    icon: 'Zap',
    tier: 'silver',
    category: 'tokens',
    target: 1_000_000
  },
  {
    id: 'token-titan',
    name: 'Token Titan',
    description: 'Use 10 million tokens. You are built different.',
    icon: 'Flame',
    tier: 'gold',
    category: 'tokens',
    target: 10_000_000
  },
  {
    id: 'token-overlord',
    name: 'Token Overlord',
    description: 'Annihilate 100 million tokens.',
    icon: 'Crown',
    tier: 'mythic',
    category: 'tokens',
    target: 100_000_000
  },

  // ── Streak ──────────────────────────────────────────────────────────
  {
    id: 'week-warrior',
    name: 'Week Warrior',
    description: 'Maintain a 7-day coding streak.',
    icon: 'CalendarCheck',
    tier: 'bronze',
    category: 'streak',
    target: 7
  },
  {
    id: 'consistency-king',
    name: 'Consistency King',
    description: 'Hold a 100-day streak without breaking.',
    icon: 'Trophy',
    tier: 'gold',
    category: 'streak',
    target: 100,
    hint: 'Code at least once every day.'
  },
  {
    id: 'streak-immortal',
    name: 'Streak Immortal',
    description: 'A full 365-day streak. Legendary.',
    icon: 'Infinity',
    tier: 'mythic',
    category: 'streak',
    target: 365
  },

  // ── Time-of-day / hours ─────────────────────────────────────────────
  {
    id: 'night-hacker',
    name: 'Night Hacker',
    description: 'Code after midnight on 30 different days.',
    icon: 'Moon',
    tier: 'silver',
    category: 'time',
    target: 30
  },
  {
    id: 'early-bird',
    name: 'Early Bird',
    description: 'Code before 6 AM on 20 different days.',
    icon: 'Sunrise',
    tier: 'silver',
    category: 'time',
    target: 20
  },
  {
    id: 'marathoner',
    name: 'Marathoner',
    description: 'Run a single coding session over 4 hours.',
    icon: 'Timer',
    tier: 'silver',
    category: 'time',
    target: 240
  },
  {
    id: 'century-hours',
    name: 'Century',
    description: 'Accumulate 100 AI coding hours.',
    icon: 'Hourglass',
    tier: 'gold',
    category: 'time',
    target: 100
  },

  // ── Tools ───────────────────────────────────────────────────────────
  {
    id: 'ai-explorer',
    name: 'AI Explorer',
    description: 'Use 5 different AI coding tools.',
    icon: 'Compass',
    tier: 'silver',
    category: 'tools',
    target: 5
  },
  {
    id: 'polyglot',
    name: 'Tool Polyglot',
    description: 'Use every supported AI tool at least once.',
    icon: 'Boxes',
    tier: 'gold',
    category: 'tools',
    target: 7
  },

  // ── Projects ────────────────────────────────────────────────────────
  {
    id: 'project-pioneer',
    name: 'Project Pioneer',
    description: 'Work on 10 distinct projects with AI.',
    icon: 'FolderGit2',
    tier: 'bronze',
    category: 'projects',
    target: 10
  },
  {
    id: 'open-sourcerer',
    name: 'Open Sourcerer',
    description: 'Touch 50 distinct projects with AI.',
    icon: 'Library',
    tier: 'gold',
    category: 'projects',
    target: 50
  },

  // ── Ranking ─────────────────────────────────────────────────────────
  {
    id: 'builder-elite',
    name: 'Builder Elite',
    description: 'Reach the top 1% of developers globally.',
    icon: 'Gem',
    tier: 'platinum',
    category: 'ranking',
    target: 99
  }
]

/** Numbers fed into {@link evaluateAchievements}. Pure data, no I/O. */
export interface AchievementStatsInput {
  totalTokens: number
  longestStreak: number
  midnightDays: number
  earlyBirdDays: number
  longestSessionMinutes: number
  totalCodingHours: number
  distinctToolsUsed: number
  projectCount: number
  /** 0–100 global percentile (higher is better), or null if unknown. */
  globalPercentile: number | null
}

const METRIC_BY_ID: Record<string, (s: AchievementStatsInput) => number> = {
  'first-tokens': (s) => s.totalTokens,
  'token-apprentice': (s) => s.totalTokens,
  'token-titan': (s) => s.totalTokens,
  'token-overlord': (s) => s.totalTokens,
  'week-warrior': (s) => s.longestStreak,
  'consistency-king': (s) => s.longestStreak,
  'streak-immortal': (s) => s.longestStreak,
  'night-hacker': (s) => s.midnightDays,
  'early-bird': (s) => s.earlyBirdDays,
  marathoner: (s) => s.longestSessionMinutes,
  'century-hours': (s) => s.totalCodingHours,
  'ai-explorer': (s) => s.distinctToolsUsed,
  polyglot: (s) => s.distinctToolsUsed,
  'project-pioneer': (s) => s.projectCount,
  'open-sourcerer': (s) => s.projectCount,
  'builder-elite': (s) => s.globalPercentile ?? 0
}

/**
 * Pure evaluator: maps live stats onto every achievement definition and returns
 * progress + unlock state. `existingUnlockedAt` preserves the original unlock
 * timestamps so we don't reset them on re-evaluation.
 */
export function evaluateAchievements(
  stats: AchievementStatsInput,
  existingUnlockedAt: Record<string, string | null> = {},
  nowIso: string
): Achievement[] {
  return ACHIEVEMENTS.map((def) => {
    const measure = METRIC_BY_ID[def.id]
    const progress = measure ? Math.max(0, measure(stats)) : 0
    const unlocked = progress >= def.target
    const prior = existingUnlockedAt[def.id] ?? null
    return {
      ...def,
      progress,
      unlocked,
      unlockedAt: unlocked ? (prior ?? nowIso) : null
    }
  })
}
