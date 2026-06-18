import type { CountryShipping } from '@shared/types'
import { formatCompact } from '@/lib/format'
import { cn } from '@/lib/utils'

interface CountryLeaderboardProps {
  countries: CountryShipping[]
  selected?: string | null
  onSelect?: (code: string | null) => void
}

const MEDAL = ['🥇', '🥈', '🥉']

/** Country-wise "shipping" leaderboard — who is shipping the most tokens, and from where. */
export function CountryLeaderboard({
  countries,
  selected,
  onSelect
}: CountryLeaderboardProps): JSX.Element {
  const rows = [...countries].sort((a, b) => b.totalTokens - a.totalTokens)
  const max = Math.max(1, ...rows.map((r) => r.totalTokens))

  return (
    <div className="overflow-hidden">
      <div className="grid grid-cols-[44px_1fr_72px_136px] gap-3 border-b border-white/5 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>#</span>
        <span>Country</span>
        <span className="text-right">Devs</span>
        <span className="text-right">Shipped</span>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {rows.map((country, i) => {
          const isSel = country.countryCode === selected
          return (
            <button
              key={country.countryCode}
              onClick={() => onSelect?.(isSel ? null : country.countryCode)}
              className={cn(
                'grid w-full grid-cols-[44px_1fr_72px_136px] items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/[0.03]',
                isSel && 'bg-primary/[0.07]',
                country.isYou && !isSel && 'bg-primary/[0.04]'
              )}
            >
              <span className="font-mono text-xs font-semibold tabular text-muted-foreground">
                {i < 3 ? MEDAL[i] : `#${i + 1}`}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-base leading-none">{country.flag}</span>
                <span className="truncate font-medium">{country.countryName}</span>
                {country.isYou && (
                  <span className="rounded bg-primary/20 px-1.5 py-0 text-[10px] font-medium text-primary">
                    You
                  </span>
                )}
              </span>
              <span className="text-right font-mono text-xs tabular text-muted-foreground">
                {formatCompact(country.developers)}
              </span>
              <span className="flex items-center justify-end gap-2">
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.06]">
                  <span
                    className="block h-full rounded-full bg-primary/80"
                    style={{ width: `${(country.totalTokens / max) * 100}%` }}
                  />
                </span>
                <span className="w-12 text-right font-mono text-xs font-semibold tabular">
                  {formatCompact(country.totalTokens)}
                </span>
              </span>
            </button>
          )
        })}
        {rows.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No shipping data yet — analyze some sessions to appear here.
          </div>
        )}
      </div>
    </div>
  )
}
