import { Boxes } from 'lucide-react'
import type { ToolBreakdownSlice } from '@shared/types'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/common/EmptyState'
import { ToolGlyph } from '@/components/common/ToolBadge'
import { formatCompact, formatMoney } from '@/lib/format'

/** Clean per-tool list: tokens, sessions, est. cost, and a share bar. */
export function ToolUsageList({
  data,
  periodWord
}: {
  data: ToolBreakdownSlice[]
  periodWord?: string
}): JSX.Element {
  const max = data[0]?.tokens ?? 1
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">Usage by tool</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Total tokens (incl. cache) &amp; cost{periodWord ? ` · ${periodWord}` : ''}
        </p>
      </div>

      {data.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No tools detected yet"
          description="Run a scan to see your AI tools."
          className="flex-1 border-0"
        />
      ) : (
        <ul className="flex flex-col gap-3.5">
          {data.map((t) => (
            <li key={t.toolId}>
              <div className="flex items-center gap-3">
                <ToolGlyph toolId={t.toolId} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.toolName}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t.sessions.toLocaleString()} sessions · {t.percentage}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-semibold tabular">
                    {formatCompact(t.tokens)}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground tabular">
                    {formatMoney(t.costUsd)}
                  </div>
                </div>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(2, (t.tokens / max) * 100)}%`, backgroundColor: t.color }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
