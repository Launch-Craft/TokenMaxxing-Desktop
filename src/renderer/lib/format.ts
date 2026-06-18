/** Number / time formatting helpers used throughout the UI. */

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const FULL = new Intl.NumberFormat('en')

/** 12,500 → "12.5K", 3,400,000 → "3.4M". */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return COMPACT.format(n)
}

export function formatNumber(n: number): string {
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

/** $1,240 → "$1.2K", $9.40 → "$9.40". */
export function formatMoney(usd: number): string {
  if (!Number.isFinite(usd)) return '$0'
  if (usd > 0 && usd < 1) return `$${usd.toFixed(2)}`
  if (usd < 1000) return `$${usd.toFixed(usd < 100 ? 2 : 0)}`
  return MONEY_COMPACT.format(usd)
}

export function formatMoneyFull(usd: number): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(usd)
}

export function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 10) return `${h.toFixed(1)}h`
  return `${Math.round(h)}h`
}

export function formatDuration(minutes: number): string {
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
