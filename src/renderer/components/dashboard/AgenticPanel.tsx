import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Bot, GitBranch, Target, Wrench } from 'lucide-react'
import type { AgenticSummary, ToolCallCategory, ToolCallStat } from '@shared/types'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatCard } from '@/components/dashboard/StatCard'
import { cn, tint } from '@/lib/utils'
import { formatCompact, formatNumber } from '@/lib/format'

/** Presentation metadata for each tool-call category (color + label). */
const CATEGORY_META: Record<ToolCallCategory, { label: string; color: string }> = {
  file: { label: 'Files', color: 'hsl(var(--viz-cyan))' },
  shell: { label: 'Shell', color: 'hsl(var(--viz-amber))' },
  search: { label: 'Search', color: 'hsl(var(--viz-violet))' },
  agent: { label: 'Agents', color: 'hsl(var(--viz-green))' },
  task: { label: 'Tasks', color: 'hsl(var(--viz-blue))' },
  other: { label: 'Other', color: 'hsl(var(--viz-slate))' }
}

const CATEGORY_ORDER: ToolCallCategory[] = ['file', 'shell', 'search', 'agent', 'task', 'other']

/**
 * Interactive "Agentic Activity" panel: headline counters (agents spawned,
 * tool-call accuracy, …), a category-filterable tool-usage breakdown with
 * hover detail, and an accuracy gauge. Driven entirely by {@link AgenticSummary}.
 */
export function AgenticPanel({ agentic }: { agentic: AgenticSummary }): JSX.Element | null {
  const [category, setCategory] = useState<ToolCallCategory | 'all'>('all')
  const [hovered, setHovered] = useState<string | null>(null)

  const presentCategories = useMemo(() => {
    const set = new Set(agentic.toolUsage.map((t) => t.category))
    return CATEGORY_ORDER.filter((c) => set.has(c))
  }, [agentic.toolUsage])

  const visible = useMemo(() => {
    const rows =
      category === 'all'
        ? agentic.toolUsage
        : agentic.toolUsage.filter((t) => t.category === category)
    return rows.slice(0, 12)
  }, [agentic.toolUsage, category])

  // Scale bars to the largest visible value so the leader fills the row.
  const maxCalls = Math.max(1, visible[0]?.calls ?? 0)

  if (!agentic.hasData) {
    return (
      <Card className="mt-5 p-8 text-center">
        <Bot className="mx-auto h-6 w-6 text-muted-foreground" />
        <h3 className="mt-3 text-sm font-semibold">No agentic activity yet</h3>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          Agent spawns and tool-call accuracy appear here once a tool that records tool calls
          (like Claude Code) has been scanned.
        </p>
      </Card>
    )
  }

  return (
    <section className="mt-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Agentic Activity</h3>
        <span className="text-[11px] text-muted-foreground">
          {formatNumber(agentic.sessionsWithTools)} agentic sessions
        </span>
      </div>

      {/* Headline counters */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Agents spawned"
          value={formatCompact(agentic.totalAgentsSpawned)}
          icon={Bot}
          accent="hsl(var(--viz-green))"
          hint={`${agentic.avgAgentsPerSession} avg · ${agentic.maxAgentsInSession} peak / session`}
          index={0}
        />
        <StatCard
          label="Tool-call accuracy"
          value={`${agentic.successRate}%`}
          icon={Target}
          accent="hsl(var(--viz-cyan))"
          hint={`${formatNumber(agentic.totalToolErrors)} errors in ${formatCompact(
            agentic.totalToolResults
          )} results`}
          index={1}
        />
        <StatCard
          label="Tool calls"
          value={formatCompact(agentic.totalToolCalls)}
          icon={Wrench}
          accent="hsl(var(--viz-violet))"
          hint={`${agentic.avgToolCallsPerSession} avg / session`}
          index={2}
        />
        <StatCard
          label="Workflows"
          value={formatCompact(agentic.totalWorkflows)}
          icon={GitBranch}
          accent="hsl(var(--viz-amber))"
          hint="multi-agent orchestrations"
          index={3}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Tool usage breakdown — category-filterable + hover detail */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold">Tool usage</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Which tools your agents reach for
              </p>
            </div>
            {presentCategories.length > 1 && (
              <Tabs
                value={category}
                onValueChange={(v) => setCategory(v as ToolCallCategory | 'all')}
              >
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  {presentCategories.map((c) => (
                    <TabsTrigger key={c} value={c}>
                      {CATEGORY_META[c].label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
          </div>

          <ul className="space-y-2.5">
            {visible.map((tool, i) => (
              <ToolUsageRow
                key={tool.name}
                tool={tool}
                pct={Math.round((tool.calls / maxCalls) * 100)}
                active={hovered === null || hovered === tool.name}
                onHover={(on) => setHovered(on ? tool.name : null)}
                index={i}
              />
            ))}
            {visible.length === 0 && (
              <li className="py-6 text-center text-xs text-muted-foreground">
                No tools in this category
              </li>
            )}
          </ul>
        </Card>

        {/* Accuracy gauge + fan-out */}
        <Card className="flex flex-col items-center justify-center p-5">
          <h4 className="self-start text-sm font-semibold">Reliability</h4>
          <AccuracyGauge value={agentic.successRate} />
          <div className="mt-4 grid w-full grid-cols-2 gap-3">
            <MiniStat
              label="Calls"
              value={formatCompact(agentic.totalToolCalls)}
              color="hsl(var(--viz-green))"
            />
            <MiniStat
              label="Errors"
              value={formatNumber(agentic.totalToolErrors)}
              color="hsl(var(--viz-rose))"
            />
          </div>
        </Card>
      </div>
    </section>
  )
}

function ToolUsageRow({
  tool,
  pct,
  active,
  onHover,
  index
}: {
  tool: ToolCallStat
  pct: number
  active: boolean
  onHover: (on: boolean) => void
  index: number
}): JSX.Element {
  const color = CATEGORY_META[tool.category].color
  const hasErrors = tool.errors > 0
  return (
    <li
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn('cursor-default transition-opacity duration-200', active ? 'opacity-100' : 'opacity-40')}
    >
      <div className="mb-1 flex items-center gap-2 text-sm">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate font-medium">{prettyToolName(tool.name)}</span>
        {hasErrors && (
          <span className="rounded-full bg-viz-rose/10 px-1.5 py-0.5 text-[10px] font-semibold text-viz-rose">
            {tool.successRate}% ok
          </span>
        )}
        <span className="ml-auto font-mono text-xs font-semibold tabular">
          {formatCompact(tool.calls)}
        </span>
        <span className="w-10 text-right font-mono text-[11px] text-muted-foreground tabular">
          {tool.share}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, delay: index * 0.03, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </li>
  )
}

/** Radial gauge for the overall tool-call success rate. */
function AccuracyGauge({ value }: { value: number }): JSX.Element {
  const size = 148
  const stroke = 12
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  // Color shifts from rose → amber → green as reliability improves.
  const color =
    pct >= 95 ? 'hsl(var(--viz-green))' : pct >= 85 ? 'hsl(var(--viz-amber))' : 'hsl(var(--viz-rose))'
  return (
    <div className="relative mt-4 grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeOpacity={0.18} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - pct / 100) }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-mono text-3xl font-bold tabular" style={{ color }}>
          {value}%
        </span>
        <span className="text-[11px] text-muted-foreground">success rate</span>
      </div>
    </div>
  )
}

function MiniStat({
  label,
  value,
  color
}: {
  label: string
  value: string
  color: string
}): JSX.Element {
  return (
    <div className="rounded-xl px-3 py-2" style={{ backgroundColor: tint(color, 8) }}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-bold tabular" style={{ color }}>
        {value}
      </div>
    </div>
  )
}

/** Trim long MCP tool names (`mcp__server__do_thing` → `do_thing`) for display. */
function prettyToolName(name: string): string {
  if (name.startsWith('mcp__')) {
    const parts = name.split('__')
    return parts[parts.length - 1] || name
  }
  return name
}
