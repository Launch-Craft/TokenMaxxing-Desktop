import { useMemo, useState } from 'react'
import { Clock3, DollarSign, Flame, ListTree, RefreshCw, Zap } from 'lucide-react'
import type { ChartGranularity } from '@shared/types'
import { PageHeader } from '@/components/common/PageHeader'
import { StatCard } from '@/components/dashboard/StatCard'
import { TokenUsageChart } from '@/components/dashboard/TokenUsageChart'
import { ToolUsageList } from '@/components/dashboard/ToolUsageList'
import { RecentSessions } from '@/components/dashboard/RecentSessions'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { useMetricsStore } from '@/stores/useMetricsStore'
import { useScannerStore } from '@/stores/useScannerStore'
import { cn } from '@/lib/utils'
import { formatCompact, formatHours, formatMoney, formatNumber, relativeTime } from '@/lib/format'

const PERIODS: { value: ChartGranularity; label: string; word: string }[] = [
  { value: 'daily', label: 'Daily', word: 'today' },
  { value: 'weekly', label: 'Weekly', word: 'this week' },
  { value: 'monthly', label: 'Monthly', word: 'this month' },
  { value: 'yearly', label: 'Yearly', word: 'this year' }
]

function DashboardSkeleton(): JSX.Element {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-72 rounded-lg" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[116px] rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Skeleton className="h-[360px] rounded-2xl lg:col-span-2" />
        <Skeleton className="h-[360px] rounded-2xl" />
      </div>
    </div>
  )
}

export default function Dashboard(): JSX.Element {
  const { snapshot, loading } = useMetricsStore()
  const { running, runScan } = useScannerStore()
  const [period, setPeriod] = useState<ChartGranularity>('monthly')

  const monthlySpark = useMemo(
    () => (snapshot?.series.monthly ?? []).map((p) => p.tokens),
    [snapshot]
  )

  if (loading && !snapshot) return <DashboardSkeleton />

  const stats = snapshot?.stats
  const ps = stats?.periods[period]
  const word = PERIODS.find((p) => p.value === period)?.word ?? 'this month'

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          snapshot ? `Updated ${relativeTime(snapshot.generatedAt)}` : 'Your AI coding at a glance'
        }
        actions={
          <div className="flex items-center gap-2">
            {stats && (
              <span className="flex items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.03] px-2.5 py-1 text-xs text-muted-foreground">
                <Flame className="h-3.5 w-3.5" />
                {stats.currentStreak}d streak
              </span>
            )}
            <Button variant="secondary" size="sm" disabled={running} onClick={() => void runScan()}>
              <RefreshCw className={cn('h-3.5 w-3.5', running && 'animate-spin')} />
              {running ? 'Scanning…' : 'Rescan'}
            </Button>
          </div>
        }
      />

      {/* Global period switcher — drives every number on the page. */}
      <div className="mb-5">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as ChartGranularity)}>
          <TabsList>
            {PERIODS.map((p) => (
              <TabsTrigger key={p.value} value={p.value}>
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Period-driven headline stats. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          index={0}
          label="Tokens used"
          value={formatCompact(ps?.grossTokens ?? 0)}
          icon={Zap}
          sparkline={period === 'monthly' ? monthlySpark : undefined}
          hint={`${word} · incl. cache`}
        />
        <StatCard
          index={1}
          label="Estimated spend"
          value={formatMoney(ps?.spend ?? 0)}
          icon={DollarSign}
          hint={`${word} · excl. cache`}
        />
        <StatCard
          index={2}
          label="Coding hours"
          value={formatHours(ps?.codingHours ?? 0)}
          icon={Clock3}
          hint={word}
        />
        <StatCard
          index={3}
          label="Sessions"
          value={formatNumber(ps?.sessions ?? 0)}
          icon={ListTree}
          hint={word}
        />
      </div>

      {/* Chart (follows the period) + per-tool breakdown. */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {snapshot && <TokenUsageChart series={snapshot.series} granularity={period} />}
        </div>
        <ToolUsageList data={snapshot?.toolBreakdownByPeriod[period] ?? []} periodWord={word} />
      </div>

      <div className="mt-5">
        <RecentSessions sessions={snapshot?.recentSessions ?? []} />
      </div>
    </div>
  )
}
