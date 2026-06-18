import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { ToolBreakdownSlice } from '@shared/types'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/common/EmptyState'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { formatCompact, formatMoney } from '@/lib/format'
import { PieChartIcon } from 'lucide-react'

export function ToolBreakdownChart({
  data
}: {
  data: ToolBreakdownSlice[]
}): JSX.Element {
  const total = data.reduce((s, d) => s + d.tokens, 0)

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">Tool Breakdown</h3>
        <p className="mt-1 text-xs text-muted-foreground">Tokens by AI tool</p>
      </div>

      {data.length === 0 ? (
        <EmptyState
          icon={PieChartIcon}
          title="No tool data yet"
          description="Run a scan to see which AI tools you use most."
          className="flex-1 border-0"
        />
      ) : (
        <div className="flex flex-1 flex-col items-center gap-5">
          <div className="relative h-[160px] w-[160px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="tokens"
                  nameKey="toolName"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={74}
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((slice) => (
                    <Cell key={slice.toolId} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip valueSuffix=" tok" />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-lg font-bold leading-none tabular">
                {formatCompact(total)}
              </span>
              <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                total
              </span>
            </div>
          </div>

          <ul className="w-full space-y-2.5">
            {data.slice(0, 6).map((slice) => (
              <li key={slice.toolId} className="flex items-center gap-2.5 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {slice.toolName}
                </span>
                <span className="flex shrink-0 items-baseline gap-2 text-right">
                  <span className="font-mono text-xs font-semibold tabular">
                    {slice.percentage}%
                  </span>
                  <span className="w-12 font-mono text-[10px] tabular text-muted-foreground">
                    {formatMoney(slice.costUsd)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
