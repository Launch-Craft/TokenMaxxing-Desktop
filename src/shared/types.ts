/**
 * Shared domain types — imported by BOTH the Electron main process and the
 * React renderer. Keep this file free of any runtime/Node/DOM dependencies so
 * it can be bundled into either target.
 */

/** Canonical identifiers for every supported AI coding tool. */
export type ToolId =
  | 'claude-code'
  | 'cursor'
  | 'codex'
  | 'gemini-cli'
  | 'aider'
  | 'roo-code'
  | 'cline'
  | 'other'

export const TOOL_IDS: ToolId[] = [
  'claude-code',
  'cursor',
  'codex',
  'gemini-cli',
  'aider',
  'roo-code',
  'cline',
  'other'
]

/** Token accounting split out by category (Claude-style cache tokens). */
export interface TokenBreakdown {
  input: number
  output: number
  cacheRead: number
  cacheCreate: number
  /** input + output + cacheRead + cacheCreate */
  total: number
}

/**
 * The aggregated, privacy-safe metric bundle each {@link ToolAdapter} returns.
 * NOTHING in here is raw source code, prompts, or conversation content.
 */
export interface ToolMetrics {
  toolId: ToolId
  toolName: string
  /** Whether the tool's data directory was found on this machine. */
  detected: boolean
  sessionCount: number
  estimatedTokens: number
  tokenBreakdown: TokenBreakdown
  activeHours: number
  projectCount: number
  /** ISO timestamp of the most recent activity, or null if none. */
  lastActiveAt: string | null
  /** Per-day usage rollup keyed by YYYY-MM-DD. */
  daily: DailyUsage[]
  /** Distinct model identifiers observed (e.g. "claude-opus-4-8"). */
  models: string[]
  /** Human-readable note when detection partially failed. */
  note?: string
}

/**
 * Privacy-safe agentic-activity counts derived from a session's tool calls.
 * NOTHING here is conversation content — only the NAMES of tools invoked, how
 * many calls were made, and whether each result errored. Populated for tools
 * whose logs record tool-call events (Claude Code today); undefined otherwise.
 */
export interface AgenticStats {
  /** Total tool invocations (`tool_use` blocks). */
  toolCalls: number
  /** Total tool results returned (`tool_result` blocks). */
  toolResults: number
  /** Tool results flagged as errors (`tool_result.is_error`). */
  toolErrors: number
  /** Subagents spawned — `Agent` + `Task` tool calls. */
  agentsSpawned: number
  /** Multi-agent workflows launched — `Workflow` tool calls. */
  workflows: number
  /** Per-tool call counts keyed by tool name, e.g. `{ Bash: 12, Edit: 8 }`. */
  byTool: Record<string, number>
}

/** One coding session derived from a tool's logs. */
export interface Session {
  id: string
  toolId: ToolId
  toolName: string
  /** Project name only — never the absolute path or its contents. */
  projectName: string
  estimatedTokens: number
  tokenBreakdown: TokenBreakdown
  startedAt: string
  endedAt: string
  durationMinutes: number
  messageCount: number
  model: string | null
  /** Agentic tool-call activity for this session (when the tool records it). */
  agentic?: AgenticStats
  /**
   * Stable key of the source (log file / db) this session was derived from.
   * Used by incremental scans to replace only a changed source's sessions.
   */
  sourceKey?: string
}

/**
 * Per-source incremental scan checkpoint. If a source's `fingerprint` (e.g.
 * `size:mtimeMs`) is unchanged since the last scan, it is skipped entirely —
 * we never re-parse historical data, only new/changed sources.
 */
export interface ScanCheckpoint {
  sourceKey: string
  toolId: ToolId
  fingerprint: string
  updatedAt: string
}

/** A single day's rolled-up activity. */
export interface DailyUsage {
  /** YYYY-MM-DD (local). */
  date: string
  tokens: number
  sessions: number
  activeMinutes: number
  /** Tokens per tool for this day. */
  byTool: Partial<Record<ToolId, number>>
}

export type ChartGranularity = 'daily' | 'weekly' | 'monthly' | 'yearly'

/** Aggregated token/cost/activity for one dashboard period. */
export interface PeriodStat {
  /** Tokens incl. cache reads (full throughput). */
  grossTokens: number
  /** Tokens excl. cache reads (real work). */
  netTokens: number
  /** Estimated USD spend (excl. cache reads). */
  spend: number
  codingHours: number
  sessions: number
}

export interface TimeSeriesPoint {
  /** Bucket label, e.g. "2026-06-18", "2026-W24", "Jun", "2026". */
  label: string
  /** ISO timestamp of bucket start for sorting/tooltips. */
  timestamp: string
  tokens: number
  sessions: number
  activeMinutes: number
}

/** Slice of the tool-breakdown pie chart. */
export interface ToolBreakdownSlice {
  toolId: ToolId
  toolName: string
  tokens: number
  sessions: number
  /** 0–100 share of total tokens. */
  percentage: number
  /** Estimated USD spend for this tool. */
  costUsd: number
  color: string
}

/** One tool's share of all agentic tool calls (drives the usage breakdown). */
export interface ToolCallStat {
  /** Tool name as logged, e.g. "Bash", "Edit", "mcp__server__do_thing". */
  name: string
  calls: number
  /** Tool results that errored for this tool. */
  errors: number
  /** 0–100 share of all tool calls. */
  share: number
  /** 0–100 success rate for this specific tool. */
  successRate: number
  /** Coarse grouping for filtering, e.g. "file" | "shell" | "search" | "agent". */
  category: ToolCallCategory
}

export type ToolCallCategory = 'file' | 'shell' | 'search' | 'agent' | 'task' | 'other'

/**
 * Aggregated agentic activity across every session that recorded tool calls.
 * Powers the Analytics "Agentic Activity" panel. `hasData` is false when no
 * scanned tool exposes tool-call telemetry, so the UI can show an empty state.
 */
export interface AgenticSummary {
  hasData: boolean
  /** Sessions that recorded ≥1 tool call (denominator for the averages). */
  sessionsWithTools: number
  totalToolCalls: number
  totalToolResults: number
  totalToolErrors: number
  totalAgentsSpawned: number
  totalWorkflows: number
  /** 0–100 overall tool-call success rate = (results − errors) / results. */
  successRate: number
  avgToolCallsPerSession: number
  avgAgentsPerSession: number
  /** Largest agent fan-out seen in a single session. */
  maxAgentsInSession: number
  /** Per-tool usage, ranked by call count (descending). */
  toolUsage: ToolCallStat[]
}

/** Estimated spend grouped by model family. */
export interface ModelCost {
  modelId: string
  label: string
  tokens: number
  costUsd: number
  pricePerMInput: number
  pricePerMOutput: number
}

/** Headline numbers shown on the dashboard stat cards. */
export interface DashboardStats {
  tokensToday: number
  tokensThisMonth: number
  activeSessions: number
  codingHours: number
  globalRank: number | null
  currentStreak: number
  longestStreak: number
  totalTokens: number
  /** Estimated AI spend in USD, based on public per-model pricing. */
  spend: {
    today: number
    month: number
    total: number
  }
  /**
   * Token totals INCLUDING cache reads (full throughput) per period — used for
   * the headline count cards. Charts and `spend` deliberately exclude cache reads.
   */
  gross: {
    today: number
    week: number
    month: number
    year: number
    total: number
  }
  /**
   * Full per-period rollups driving the dashboard's Daily/Weekly/Monthly/Yearly
   * tab switcher. `grossTokens` includes cache reads; `spend` excludes them.
   */
  periods: Record<ChartGranularity, PeriodStat>
  /** Percentage deltas vs the previous comparable period (nullable). */
  deltas: {
    tokensToday: number | null
    tokensThisMonth: number | null
    codingHours: number | null
  }
}

/** Full snapshot returned to the renderer to render the dashboard. */
export interface MetricsSnapshot {
  generatedAt: string
  stats: DashboardStats
  series: Record<ChartGranularity, TimeSeriesPoint[]>
  /** All-time tool breakdown (used by Analytics). */
  toolBreakdown: ToolBreakdownSlice[]
  /** Per-period tool breakdown driving the dashboard's period tab. */
  toolBreakdownByPeriod: Record<ChartGranularity, ToolBreakdownSlice[]>
  modelCosts: ModelCost[]
  /** Aggregated agentic activity (agents spawned, tool-call accuracy, …). */
  agentic: AgenticSummary
  recentSessions: Session[]
  daily: DailyUsage[]
}

// ── Scanning ────────────────────────────────────────────────────────────────

export type ScanStatus = 'idle' | 'scanning' | 'success' | 'error'

export interface ScanError {
  toolId: ToolId
  message: string
}

export interface ScanResult {
  startedAt: string
  finishedAt: string
  durationMs: number
  tools: ToolMetrics[]
  totalTokens: number
  totalSessions: number
  errors: ScanError[]
  /** Incremental scan stats: how much work was actually (re)done. */
  sourcesParsed: number
  sourcesSkipped: number
  sourcesRemoved: number
  /** False only on the very first scan (no prior checkpoints). */
  incremental: boolean
}

export interface ScanProgress {
  status: ScanStatus
  /** Tool currently being processed. */
  currentTool: ToolId | null
  completed: number
  total: number
  message: string
}

/**
 * Heartbeat emitted by the continuous local-analysis loop (every
 * {@link LIVE_ANALYSIS_INTERVAL_MS}). Lets the renderer show "last analyzed Xs
 * ago" and refresh derived data only when something actually changed.
 */
export interface AnalysisTick {
  /** ISO timestamp of this analysis pass. */
  at: string
  /** Whether new/changed sources were (re)parsed this pass. */
  changed: boolean
  /** Net tokens (input+output) after this pass. */
  totalTokens: number
  /** The configured cadence in milliseconds (2000). */
  intervalMs: number
}

// ── Achievements ─────────────────────────────────────────────────────────────

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'mythic'

export type AchievementCategory =
  | 'tokens'
  | 'streak'
  | 'time'
  | 'tools'
  | 'ranking'
  | 'projects'
  | 'agentic'

export interface AchievementDef {
  id: string
  name: string
  description: string
  /** lucide-react icon name. */
  icon: string
  tier: AchievementTier
  category: AchievementCategory
  /** Target value the metric must reach to unlock. */
  target: number
  /** Short hint shown on locked cards. */
  hint?: string
}

export interface Achievement extends AchievementDef {
  unlocked: boolean
  /** Current progress value toward {@link AchievementDef.target}. */
  progress: number
  unlockedAt: string | null
}

// ── Rankings ──────────────────────────────────────────────────────────────────

export type RankScope = 'global' | 'country' | 'tool'

export interface RankCard {
  scope: RankScope
  /** e.g. "Global", "India", "Top Cursor User". */
  label: string
  rank: number | null
  total: number | null
  /** 0–100 percentile (higher = better). */
  percentile: number | null
  /** Optional sub-context, e.g. the tool name for a tool-specific rank. */
  context?: string
  toolId?: ToolId
}

export interface RankingLeaderboardEntry {
  rank: number
  handle: string
  country: string | null
  totalTokens: number
  codingHours: number
  topTool: ToolId
  /** True for the local user's own row. */
  isYou: boolean
}

/**
 * One country's aggregated "shipping" (token) activity, used by the country-wise
 * leaderboard and the globe visualization. Privacy-safe: country is coarse
 * (server-derived from IP, country-level only) and contains no per-user data.
 */
export interface CountryShipping {
  /** ISO-3166-1 alpha-2. */
  countryCode: string
  countryName: string
  flag: string
  /** Centroid latitude/longitude for the globe marker. */
  lat: number
  lng: number
  /** Tokens "shipped" (net, input+output) attributed to this country. */
  totalTokens: number
  /** Number of participating developers in this country. */
  developers: number
  /** 0–100 share of all shipped tokens. */
  share: number
  /** True for the local user's own country. */
  isYou?: boolean
}

export interface RankingSnapshot {
  participating: boolean
  cards: RankCard[]
  leaderboard: RankingLeaderboardEntry[]
  /** Country-wise shipping rollup powering the globe + country leaderboard. */
  countries: CountryShipping[]
  /** When the cloud ranking data was last refreshed (snapshot freshness). */
  updatedAt: string | null
  /** True when `countries`/`leaderboard` are a local estimate, not a server snapshot. */
  estimated: boolean
}

/** Aggregated metrics uploaded for ranking (privacy-safe). */
export interface RankingUploadPayload {
  totalTokens: number
  /** Today's tokens (incl. cache) — drives the DAILY leaderboard ranking. */
  dailyTokens: number
  monthlyTokens: number
  activeDays: number
  codingHours: number
  projectsCreated: number
  topTool: ToolId
  toolTotals: Partial<Record<ToolId, number>>
}

// ── AI Wrapped ────────────────────────────────────────────────────────────────

export interface WrappedReport {
  year: number
  generatedAt: string
  totalTokens: number
  totalSessions: number
  codingHours: number
  favoriteTool: { toolId: ToolId; toolName: string; tokens: number }
  longestSession: { projectName: string; minutes: number; tokens: number } | null
  topProject: { name: string; tokens: number; sessions: number } | null
  globalRank: number | null
  streakRecord: number
  /** Month with the most tokens, e.g. "March". */
  busiestMonth: { month: string; tokens: number } | null
  /** Fun personality archetype derived from usage. */
  persona: { title: string; subtitle: string }
  monthlyTokens: { month: string; tokens: number }[]
  toolBreakdown: ToolBreakdownSlice[]
  /** Percentile vs the prior year, if available. */
  vsLastYear: number | null
}

// ── Settings ──────────────────────────────────────────────────────────────────

export type ScanFrequency = 'manual' | 'startup' | 'hourly' | 'daily'
export type ThemePreference = 'dark' | 'system'

export interface PrivacySettings {
  /** Master switch — when false NOTHING ever leaves the machine. */
  cloudSyncEnabled: boolean
  /** Opt-in to global/country/tool leaderboards. */
  rankingParticipation: boolean
  /** Allow anonymized telemetry to improve the product. */
  shareAnonymousUsage: boolean
}

export interface NotificationSettings {
  /** Master switch for native desktop notifications. */
  enabled: boolean
  /** Daily token milestone alerts (100K, 500K, 1M, …). */
  milestones: boolean
  /** Evening reminder when a streak is at risk. */
  streaks: boolean
  /** Weekly / monthly Wrapped-ready alerts. */
  wrapped: boolean
  /** Achievement unlock toasts. */
  achievements: boolean
}

export interface Settings {
  scanFrequency: ScanFrequency
  autoScanOnLaunch: boolean
  theme: ThemePreference
  privacy: PrivacySettings
  notifications: NotificationSettings
  /** Per-tool scanning enable flags. */
  enabledTools: Record<ToolId, boolean>
  /** Display handle used on leaderboards. */
  handle: string
  /** ISO country code for country ranking, or null. */
  countryCode: string | null
  /** Schema version for forward-compatible migrations. */
  version: number
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export type AuthProvider = 'google' | 'github'

export interface AuthUser {
  id: string
  email: string | null
  name: string | null
  avatarUrl: string | null
  provider: AuthProvider
}

export interface AuthState {
  status: 'signed-out' | 'signed-in' | 'pending'
  user: AuthUser | null
}

// ── Generic IPC envelope ──────────────────────────────────────────────────────

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }
