import type { ToolId, Settings } from './types'

export const APP_NAME = 'TokenMaxxing'
export const APP_TAGLINE = 'GitHub Contributions × Spotify Wrapped, for AI developers'
export const SETTINGS_VERSION = 1

/**
 * Continuous local analysis cadence: while the app is open, the main process
 * runs an INCREMENTAL scan of the local data every 10 seconds (warm passes are a
 * near no-op when nothing changed — see ScannerService).
 */
export const LIVE_ANALYSIS_INTERVAL_MS = 10_000

/**
 * Cloud sync cadence: how often the app uploads aggregated metrics to the backend
 * and refreshes the leaderboard. Every 5 minutes.
 */
export const LEADERBOARD_REFRESH_MS = 5 * 60_000

/**
 * Static, presentation-level metadata for each tool. The runtime scan
 * directories live with each adapter; this is what the UI renders.
 */
export interface ToolMeta {
  id: ToolId
  name: string
  /** Short label for compact UI. */
  short: string
  /** CSS variable used for charts/badges. */
  colorVar: string
  /** Resolved hsl() color string for non-CSS contexts (canvas/recharts). */
  color: string
  /** lucide-react icon name. */
  icon: string
  /** Default home-relative scan directory (informational/UI). */
  defaultDir: string
  /** True when the tool is auto-detected rather than at a fixed path. */
  autoDetect: boolean
}

// Monochrome silver ramp — distinct greys so charts stay readable yet on-theme.
export const TOOL_META: Record<ToolId, ToolMeta> = {
  'claude-code': {
    id: 'claude-code',
    name: 'Claude Code',
    short: 'Claude',
    colorVar: '--viz-green',
    color: 'hsl(0 0% 92%)',
    icon: 'Sparkles',
    defaultDir: '~/.claude',
    autoDetect: false
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    short: 'Cursor',
    colorVar: '--viz-cyan',
    color: 'hsl(0 0% 76%)',
    icon: 'MousePointer2',
    defaultDir: '~/.cursor',
    autoDetect: false
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    short: 'Codex',
    colorVar: '--viz-orange',
    color: 'hsl(0 0% 64%)',
    icon: 'Braces',
    defaultDir: '~/.codex',
    autoDetect: false
  },
  'gemini-cli': {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    short: 'Gemini',
    colorVar: '--viz-slate',
    color: 'hsl(0 0% 54%)',
    icon: 'Gem',
    defaultDir: '~/.gemini',
    autoDetect: true
  },
  aider: {
    id: 'aider',
    name: 'Aider',
    short: 'Aider',
    colorVar: '--viz-violet',
    color: 'hsl(0 0% 46%)',
    icon: 'Bot',
    defaultDir: '~/.aider',
    autoDetect: false
  },
  'roo-code': {
    id: 'roo-code',
    name: 'Roo Code',
    short: 'Roo',
    colorVar: '--viz-rose',
    color: 'hsl(0 0% 40%)',
    icon: 'Squirrel',
    defaultDir: 'auto-detect',
    autoDetect: true
  },
  cline: {
    id: 'cline',
    name: 'Cline',
    short: 'Cline',
    colorVar: '--viz-blue',
    color: 'hsl(0 0% 34%)',
    icon: 'TerminalSquare',
    defaultDir: 'auto-detect',
    autoDetect: true
  },
  other: {
    id: 'other',
    name: 'Others',
    short: 'Other',
    colorVar: '--viz-slate',
    color: 'hsl(0 0% 30%)',
    icon: 'CircleDashed',
    defaultDir: '—',
    autoDetect: true
  }
}

/** Ordered list of tool colors for charts. */
export const TOOL_COLOR_ORDER = (Object.keys(TOOL_META) as ToolId[]).map(
  (id) => TOOL_META[id].color
)

export const DEFAULT_SETTINGS: Settings = {
  scanFrequency: 'startup',
  autoScanOnLaunch: true,
  theme: 'dark',
  privacy: {
    cloudSyncEnabled: false,
    rankingParticipation: false,
    shareAnonymousUsage: false
  },
  enabledTools: {
    'claude-code': true,
    cursor: true,
    codex: true,
    'gemini-cli': true,
    aider: true,
    'roo-code': true,
    cline: true,
    other: true
  },
  handle: 'anonymous-dev',
  countryCode: null,
  version: SETTINGS_VERSION
}

/**
 * Rough $/1M-token blended pricing used ONLY for the optional "AI spend"
 * estimate. Kept intentionally conservative and clearly labeled as an estimate.
 */
export const BLENDED_TOKEN_COST_PER_MILLION = 4.5
