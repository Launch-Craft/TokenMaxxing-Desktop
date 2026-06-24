import { priceForModel, costForBreakdown } from '@shared/pricing'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ToolGlyph } from '@/components/common/ToolBadge'
import { useSessionDetailStore } from '@/stores/useSessionDetailStore'
import {
  formatCompact,
  formatDate,
  formatDuration,
  formatMoneyFull,
  formatNumber,
  relativeTime
} from '@/lib/format'

function Fact({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg bg-white/[0.03] px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium tabular">{value}</div>
    </div>
  )
}

/** Detail dialog for a single session — opened from any session row. */
export function SessionDetail(): JSX.Element | null {
  const { session, open, close } = useSessionDetailStore()
  if (!session) return null

  const b = session.tokenBreakdown
  const net = session.estimatedTokens
  const gross = net + b.cacheRead + b.cacheCreate
  const cost = costForBreakdown(b, session.model)
  const modelLabel = priceForModel(session.model).label
  const startedAt = new Date(session.startedAt)

  const rows = [
    { label: 'Input', value: b.input, muted: false },
    { label: 'Output', value: b.output, muted: false },
    { label: 'Cache writes', value: b.cacheCreate, muted: false },
    { label: 'Cache reads', value: b.cacheRead, muted: true }
  ]
  const max = Math.max(...rows.map((r) => r.value), 1)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        {/* Header */}
        <div className="flex items-start gap-3 pr-6">
          <ToolGlyph toolId={session.toolId} size={42} />
          <div className="min-w-0">
            <DialogTitle className="truncate">{session.projectName}</DialogTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {session.toolName}
              {session.model ? ` · ${session.model}` : ''} · {relativeTime(session.startedAt)}
            </p>
          </div>
        </div>

        {/* Facts */}
        <div className="grid grid-cols-2 gap-2">
          <Fact
            label="Started"
            value={`${formatDate(session.startedAt, { month: 'short', day: 'numeric' })}, ${startedAt.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}`}
          />
          <Fact label="Duration" value={formatDuration(session.durationMinutes)} />
          <Fact label="Messages" value={formatNumber(session.messageCount)} />
          <Fact label="Est. cost" value={formatMoneyFull(cost)} />
        </div>

        {/* Token breakdown */}
        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>Token breakdown</span>
            <span>{modelLabel} rates</span>
          </div>
          <div className="space-y-2.5">
            {rows.map((r) => (
              <div key={r.label}>
                <div className="flex items-center justify-between text-xs">
                  <span className={r.muted ? 'text-muted-foreground' : ''}>{r.label}</span>
                  <span className="font-mono tabular">{formatNumber(r.value)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className={r.muted ? 'h-full rounded-full bg-muted-foreground/50' : 'h-full rounded-full bg-foreground/80'}
                    style={{ width: `${Math.max(1, (r.value / max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Agentic activity (only when the tool records tool calls) */}
        {session.agentic && session.agentic.toolCalls > 0 && (
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              Agentic activity
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Fact label="Tool calls" value={formatNumber(session.agentic.toolCalls)} />
              <Fact
                label="Tool accuracy"
                value={`${
                  session.agentic.toolResults > 0
                    ? (
                        ((session.agentic.toolResults - session.agentic.toolErrors) /
                          session.agentic.toolResults) *
                        100
                      ).toFixed(1)
                    : '100'
                }%`}
              />
              <Fact label="Agents spawned" value={formatNumber(session.agentic.agentsSpawned)} />
              <Fact label="Workflows" value={formatNumber(session.agentic.workflows)} />
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="flex items-center justify-between border-t border-white/5 pt-3 text-sm">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Tokens used (excl. cache)
            </div>
            <div className="mt-0.5 font-mono text-lg font-bold tabular">{formatCompact(net)}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Incl. all cache
            </div>
            <div className="mt-0.5 font-mono text-lg font-bold tabular text-muted-foreground">
              {formatCompact(gross)}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
