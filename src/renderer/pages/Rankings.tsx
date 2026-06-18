import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Globe2, MapPin, Radio, RefreshCw, Shield, Sparkles, Trophy } from 'lucide-react'
import type { RankCard as RankCardType } from '@shared/types'
import { rankTier } from '@shared/ranking'
import { PageHeader } from '@/components/common/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ToolBadge } from '@/components/common/ToolBadge'
import { ShippingGlobe } from '@/components/rankings/ShippingGlobe'
import { CountryLeaderboard } from '@/components/rankings/CountryLeaderboard'
import { useRankingsStore } from '@/stores/useRankingsStore'
import { cn } from '@/lib/utils'
import { formatCompact, formatRank, ordinal, relativeTime } from '@/lib/format'

const SCOPE_ICON = { global: Globe2, country: MapPin, tool: Sparkles }

function RankCard({ card, index }: { card: RankCardType; index: number }): JSX.Element {
  const Icon = SCOPE_ICON[card.scope]
  const tier = rankTier(card.percentile)
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className="glass-hover relative overflow-hidden p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon className="h-4 w-4" />
            {card.label}
          </div>
          <Badge variant={card.percentile && card.percentile >= 90 ? 'success' : 'secondary'}>
            {tier}
          </Badge>
        </div>
        <div className="mt-4 flex items-end gap-2">
          <span className="font-mono text-3xl font-bold leading-none tabular">
            {formatRank(card.rank)}
          </span>
          {card.total && (
            <span className="mb-0.5 text-xs text-muted-foreground">
              of {formatCompact(card.total)}
            </span>
          )}
        </div>
        {card.percentile != null && (
          <>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${card.percentile}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Top {(100 - card.percentile).toFixed(1)}% · {ordinal(Math.round(card.percentile))}{' '}
              percentile
            </p>
          </>
        )}
      </Card>
    </motion.div>
  )
}

export default function Rankings(): JSX.Element {
  const { rankings, loading, refreshing, load, refresh } = useRankingsStore()
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (!rankings) void load()
  }, [rankings, load])

  // The snapshot itself says whether it's a local estimate or real cloud data.
  const estimated = rankings?.estimated ?? false
  const countries = rankings?.countries ?? []

  return (
    <div>
      <PageHeader
        title="Rankings"
        description="See how you stack up against developers worldwide"
        actions={
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
              <Radio className="h-3.5 w-3.5 text-primary" />
              Daily ranking · syncs every 5 min
              {rankings?.updatedAt && <span>· {relativeTime(rankings.updatedAt)}</span>}
            </span>
            <Button variant="secondary" size="sm" disabled={refreshing} onClick={() => void refresh()}>
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        }
      />

      {estimated && (
        <Card className="mb-5 flex items-center gap-4 border-amber-500/20 bg-amber-500/[0.04] p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-400">
            <Shield className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Showing a local estimate</p>
            <p className="text-xs text-muted-foreground">
              Couldn't reach the cloud leaderboard, so these numbers are computed on-device. Your real
              rank appears once the connection is back.
            </p>
          </div>
          <Button variant="secondary" size="sm" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Retry
          </Button>
        </Card>
      )}

      {/* Rank cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {loading && !rankings
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[180px] rounded-2xl" />)
          : rankings?.cards.map((card, i) => <RankCard key={card.scope + card.label} card={card} index={i} />)}
      </div>

      {/* Shipping origins — globe + country leaderboard */}
      <Card className="mt-5 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
          <Globe2 className="h-4 w-4 text-viz-cyan" />
          <h3 className="text-sm font-semibold">Shipping Origins</h3>
          <Badge variant="secondary" className="ml-2">
            {rankings?.estimated === false ? 'Live snapshot' : 'Estimated'}
          </Badge>
          <span className="ml-auto text-[11px] text-muted-foreground">
            Where developers are shipping the most tokens from
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex items-center justify-center border-b border-white/5 p-6 lg:border-b-0 lg:border-r">
            {rankings ? (
              <ShippingGlobe
                countries={countries}
                selected={selected}
                onSelect={setSelected}
                size={400}
              />
            ) : (
              <Skeleton className="aspect-square w-full max-w-[400px] rounded-full" />
            )}
          </div>
          <div className="max-h-[480px] overflow-y-auto py-2">
            {rankings ? (
              <CountryLeaderboard
                countries={countries}
                selected={selected}
                onSelect={setSelected}
              />
            ) : (
              <div className="space-y-2 p-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Global leaderboard */}
      <Card className="mt-5 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
          <Trophy className="h-4 w-4 text-viz-amber" />
          <h3 className="text-sm font-semibold">Global Leaderboard</h3>
          {estimated && (
            <Badge variant="secondary" className="ml-2">
              Estimated
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-[60px_1fr_90px_140px_120px] gap-3 border-b border-white/5 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>Rank</span>
          <span>Developer</span>
          <span>Country</span>
          <span className="text-right">Tokens</span>
          <span className="text-right">Top tool</span>
        </div>
        {!rankings ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {rankings.leaderboard.map((row) => (
              <div
                key={row.rank}
                className={cn(
                  'grid grid-cols-[60px_1fr_90px_140px_120px] items-center gap-3 px-5 py-3 text-sm',
                  row.isYou && 'bg-primary/[0.06]'
                )}
              >
                <span className="font-mono font-semibold tabular text-muted-foreground">
                  {row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : `#${row.rank}`}
                </span>
                <span className="flex items-center gap-2 truncate font-medium">
                  {row.handle}
                  {row.isYou && <Badge className="px-1.5 py-0">You</Badge>}
                </span>
                <span className="text-xs text-muted-foreground">{row.country ?? '—'}</span>
                <span className="text-right font-mono font-semibold tabular">
                  {formatCompact(row.totalTokens)}
                </span>
                <span className="flex justify-end">
                  <ToolBadge toolId={row.topTool} />
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
