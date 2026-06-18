import { useEffect, useMemo, useState } from 'react'
import { Boxes, Cpu, DollarSign, FolderGit2 } from 'lucide-react'
import type { Session } from '@shared/types'
import { TOOL_META } from '@shared/constants'
import { PageHeader } from '@/components/common/PageHeader'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ContributionGraph } from '@/components/charts/ContributionGraph'
import { ToolStackChart } from '@/components/charts/ToolStackChart'
import { ToolBreakdownChart } from '@/components/dashboard/ToolBreakdownChart'
import { ToolDot } from '@/components/common/ToolBadge'
import { useMetricsStore } from '@/stores/useMetricsStore'
import { client } from '@/lib/ipc'
import { formatCompact, formatMoneyFull } from '@/lib/format'

interface Ranked {
  key: string
  label: string
  tokens: number
  sub?: string
  color?: string
  pct: number
}

function RankBarList({ items }: { items: Ranked[] }): JSX.Element {
  if (items.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">No data yet</p>
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="mb-1 flex items-center gap-2 text-sm">
            {item.color && <ToolDotColor color={item.color} />}
            <span className="truncate font-medium">{item.label}</span>
            {item.sub && <span className="text-xs text-muted-foreground">{item.sub}</span>}
            <span className="ml-auto font-mono text-xs font-semibold tabular">
              {formatCompact(item.tokens)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${item.pct}%`,
                background: item.color ?? 'hsl(var(--brand))'
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function ToolDotColor({ color }: { color: string }): JSX.Element {
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
}

export default function Analytics(): JSX.Element {
  const { snapshot } = useMetricsStore()
  const [sessions, setSessions] = useState<Session[] | null>(null)

  useEffect(() => {
    void client.metrics.sessions().then(setSessions)
  }, [])

  const { topProjects, topModels } = useMemo(() => {
    const rows = sessions ?? []
    const projects = new Map<string, { tokens: number; tool: string; color: string }>()
    const models = new Map<string, number>()
    for (const s of rows) {
      const p = projects.get(s.projectName) ?? { tokens: 0, tool: s.toolName, color: TOOL_META[s.toolId].color }
      p.tokens += s.estimatedTokens
      projects.set(s.projectName, p)
      if (s.model) models.set(s.model, (models.get(s.model) ?? 0) + s.estimatedTokens)
    }
    const projList = [...projects.entries()].sort((a, b) => b[1].tokens - a[1].tokens).slice(0, 6)
    const projMax = projList[0]?.[1].tokens ?? 1
    const modelList = [...models.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    const modelMax = modelList[0]?.[1] ?? 1
    return {
      topProjects: projList.map(([name, v]) => ({
        key: name,
        label: name,
        tokens: v.tokens,
        sub: v.tool,
        color: v.color,
        pct: Math.round((v.tokens / projMax) * 100)
      })),
      topModels: modelList.map(([model, tokens]) => ({
        key: model,
        label: model,
        tokens,
        pct: Math.round((tokens / modelMax) * 100)
      }))
    }
  }, [sessions])

  return (
    <div>
      <PageHeader title="Analytics" description="Deep dive into your AI coding patterns" />

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Activity</h3>
            <p className="mt-1 text-xs text-muted-foreground">Token contributions over the last year</p>
          </div>
        </div>
        {snapshot ? (
          <ContributionGraph daily={snapshot.daily} />
        ) : (
          <Skeleton className="h-[160px] w-full" />
        )}
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Monthly Tokens by Tool</h3>
            <p className="mt-1 text-xs text-muted-foreground">Stacked, last 12 months</p>
          </div>
          {snapshot ? (
            <ToolStackChart daily={snapshot.daily} tools={snapshot.toolBreakdown} />
          ) : (
            <Skeleton className="h-[280px] w-full" />
          )}
        </Card>
        <ToolBreakdownChart data={snapshot?.toolBreakdown ?? []} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <FolderGit2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Top Projects</h3>
          </div>
          {sessions ? <RankBarList items={topProjects} /> : <ListSkeleton />}
        </Card>
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Models Used</h3>
          </div>
          {sessions ? (
            topModels.length ? (
              <RankBarList items={topModels} />
            ) : (
              <p className="flex items-center justify-center gap-2 py-6 text-center text-xs text-muted-foreground">
                <Boxes className="h-4 w-4" /> Model data not available for these tools
              </p>
            )
          ) : (
            <ListSkeleton />
          )}
        </Card>
      </div>

      {/* AI spend by model */}
      <Card className="mt-5 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-viz-green" />
            <h3 className="text-sm font-semibold">AI Spend by Model</h3>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Public list pricing · estimate
          </span>
        </div>
        <div className="grid grid-cols-[1fr_110px_110px_110px_120px] gap-3 border-b border-white/5 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>Model</span>
          <span className="text-right">Tokens</span>
          <span className="text-right">$/M in</span>
          <span className="text-right">$/M out</span>
          <span className="text-right">Est. cost</span>
        </div>
        {!snapshot ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : snapshot.modelCosts.length === 0 ? (
          <p className="px-5 py-6 text-center text-xs text-muted-foreground">No spend computed yet</p>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {snapshot.modelCosts.map((m) => (
              <div
                key={m.modelId}
                className="grid grid-cols-[1fr_110px_110px_110px_120px] items-center gap-3 px-5 py-3 text-sm"
              >
                <span className="truncate font-medium">{m.label}</span>
                <span className="text-right font-mono text-xs tabular text-muted-foreground">
                  {formatCompact(m.tokens)}
                </span>
                <span className="text-right font-mono text-xs tabular text-muted-foreground">
                  {formatMoneyFull(m.pricePerMInput)}
                </span>
                <span className="text-right font-mono text-xs tabular text-muted-foreground">
                  {formatMoneyFull(m.pricePerMOutput)}
                </span>
                <span className="text-right font-mono text-sm font-semibold tabular text-viz-green">
                  {formatMoneyFull(m.costUsd)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function ListSkeleton(): JSX.Element {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  )
}
