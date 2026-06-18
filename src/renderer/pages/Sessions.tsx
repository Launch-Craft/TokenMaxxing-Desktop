import { useEffect, useMemo, useState } from 'react'
import { ListTree, Search } from 'lucide-react'
import { TOOL_IDS, type Session, type ToolId } from '@shared/types'
import { TOOL_META } from '@shared/constants'
import type { SessionFilter } from '@shared/ipc'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ToolGlyph } from '@/components/common/ToolBadge'
import { useSessionDetailStore } from '@/stores/useSessionDetailStore'
import { client } from '@/lib/ipc'
import { formatCompact, formatDuration, relativeTime } from '@/lib/format'

type SortBy = NonNullable<SessionFilter['sortBy']>

export default function Sessions(): JSX.Element {
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [search, setSearch] = useState('')
  const [tool, setTool] = useState<ToolId | 'all'>('all')
  const [sortBy, setSortBy] = useState<SortBy>('recent')

  useEffect(() => {
    let cancelled = false
    const handle = setTimeout(() => {
      void client.metrics
        .sessions({ toolId: tool, search: search || undefined, sortBy })
        .then((rows) => {
          if (!cancelled) setSessions(rows)
        })
    }, 160)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [search, tool, sortBy])

  const totals = useMemo(() => {
    const rows = sessions ?? []
    return {
      count: rows.length,
      tokens: rows.reduce((s, r) => s + r.estimatedTokens, 0),
      cache: rows.reduce((s, r) => s + r.tokenBreakdown.cacheRead + r.tokenBreakdown.cacheCreate, 0),
      minutes: rows.reduce((s, r) => s + r.durationMinutes, 0)
    }
  }, [sessions])

  const detectedTools = TOOL_IDS.filter((t) => t !== 'other')

  return (
    <div>
      <PageHeader
        title="Sessions"
        description={
          sessions
            ? `${totals.count} sessions · ${formatCompact(totals.tokens + totals.cache)} total · ${formatCompact(
                totals.tokens
              )} used · ${formatDuration(totals.minutes)}`
            : 'All your AI coding sessions'
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects, tools, models…"
            className="pl-9"
          />
        </div>
        <Select value={tool} onValueChange={(v) => setTool(v as ToolId | 'all')}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="All tools" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tools</SelectItem>
            {detectedTools.map((t) => (
              <SelectItem key={t} value={t}>
                {TOOL_META[t].name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most recent</SelectItem>
            <SelectItem value="tokens">Most tokens</SelectItem>
            <SelectItem value="duration">Longest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[minmax(0,1fr)_104px_104px_110px_84px_92px] gap-3 border-b border-white/5 px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>Project</span>
          <span className="text-right">Total tokens</span>
          <span className="text-right">Cache write</span>
          <span className="text-right">Cache read</span>
          <span className="text-right">Duration</span>
          <span className="text-right">When</span>
        </div>

        {!sessions ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={ListTree}
            title="No sessions match"
            description="Try a different filter, or run a scan to collect more data."
            className="m-4 border-0"
          />
        ) : (
          <div className="max-h-[calc(100vh-320px)] divide-y divide-white/[0.04] overflow-y-auto">
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => useSessionDetailStore.getState().show(s)}
                className="grid w-full grid-cols-[minmax(0,1fr)_104px_104px_110px_84px_92px] items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-white/[0.02]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ToolGlyph toolId={s.toolId} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{s.projectName}</div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {s.toolName}
                      {s.model ? ` · ${s.model}` : ''}
                    </div>
                  </div>
                </div>
                <span className="text-right font-mono text-sm font-semibold tabular">
                  {formatCompact(
                    s.estimatedTokens + s.tokenBreakdown.cacheRead + s.tokenBreakdown.cacheCreate
                  )}
                </span>
                <span className="text-right font-mono text-xs tabular text-muted-foreground">
                  {formatCompact(s.tokenBreakdown.cacheCreate)}
                </span>
                <span className="text-right font-mono text-xs tabular text-muted-foreground">
                  {formatCompact(s.tokenBreakdown.cacheRead)}
                </span>
                <span className="text-right text-xs text-muted-foreground">
                  {formatDuration(s.durationMinutes)}
                </span>
                <span className="text-right text-xs text-muted-foreground">
                  {relativeTime(s.startedAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
