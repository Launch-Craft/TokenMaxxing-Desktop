/** Number / time formatting helpers used throughout the UI. */

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const FULL = new Intl.NumberFormat('en')

/** 12,500 → "12.5K", 3,400,000 → "3.4M". */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return COMPACT.format(n)
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return FULL.format(Math.round(n))
}

/** Tokens get compact treatment but keep a trailing label-friendly form. */
export function formatTokens(n: number): string {
  return formatCompact(n)
}

const MONEY_COMPACT = new Intl.NumberFormat('en', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1
})

/** $1,240 → "$1.2K", $9.40 → "$9.40", -$1,500 → "-$1.5K". */
export function formatMoney(usd: number): string {
  if (!Number.isFinite(usd)) return '$0'
  // Format the magnitude, then re-apply the sign so negatives don't render as
  // "$-1500.00".
  const sign = usd < 0 ? '-' : ''
  const abs = Math.abs(usd)
  if (abs > 0 && abs < 1) return `${sign}$${abs.toFixed(2)}`
  if (abs < 1000) return `${sign}$${abs.toFixed(abs < 100 ? 2 : 0)}`
  return `${sign}${MONEY_COMPACT.format(abs)}`
}

export function formatMoneyFull(usd: number): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(usd)
}

export function formatHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '0m'
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 10) return `${h.toFixed(1)}h`
  return `${Math.round(h)}h`
}

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m'
  if (minutes < 60) return `${Math.round(minutes)}m`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function formatRank(rank: number | null): string {
  if (rank === null) return '—'
  return `#${formatNumber(rank)}`
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** "3m ago", "2h ago", "Yesterday", "Jun 4". */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diff = Date.now() - then
  // A future timestamp (clock skew / in-progress session) shouldn't read as a
  // stale "Jun 4"; treat small skews as "just now" and larger ones as a date.
  if (diff < 0) return diff > -60_000 ? 'just now' : formatDate(iso)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

export function formatDelta(delta: number | null): { text: string; positive: boolean } | null {
  if (delta === null) return null
  return { text: `${delta > 0 ? '+' : ''}${delta}%`, positive: delta >= 0 }
}

export function formatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString(
    'en',
    opts ?? { month: 'short', day: 'numeric', year: 'numeric' }
  )
}
