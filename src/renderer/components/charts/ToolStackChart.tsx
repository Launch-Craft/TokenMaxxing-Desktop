import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DailyUsage, ToolBreakdownSlice, ToolId } from '@shared/types'
import { TOOL_META } from '@shared/constants'
import { ChartTooltip } from './ChartTooltip'
import { formatCompact } from '@/lib/format'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Stacked monthly token usage, split by tool. */
export function ToolStackChart({
  daily,
  tools
}: {
  daily: DailyUsage[]
  tools: ToolBreakdownSlice[]
}): JSX.Element {
  const activeTools = tools.map((t) => t.toolId)

  const data = useMemo(() => {
    const now = new Date()
    const order: { key: string; label: string }[] = []
    const totals = new Map<string, Map<ToolId, number>>()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      order.push({ key, label: MONTHS[d.getMonth()] })
      totals.set(key, new Map())
    }
    for (const day of daily) {
      const bucket = totals.get(day.date.slice(0, 7))
      if (!bucket) continue
      for (const [tool, v] of Object.entries(day.byTool)) {
        if (activeTools.includes(tool as ToolId)) {
          bucket.set(tool as ToolId, (bucket.get(tool as ToolId) ?? 0) + (v ?? 0))
        }
      }
    }
    return order.map(({ key, label }) => {
      const row: Record<string, number | string> = { label }
      const bucket = totals.get(key)
      for (const t of activeTools) row[t] = bucket?.get(t) ?? 0
      return row
    })
  }, [daily, activeTools])

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v) => formatCompact(Number(v))}
            stroke="hsl(var(--muted-foreground))"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} content={<ChartTooltip />} />
          {activeTools.map((toolId, i) => (
            <Bar
              key={toolId}
              dataKey={toolId}
              name={TOOL_META[toolId].name}
              stackId="tokens"
              fill={TOOL_META[toolId].color}
              radius={i === activeTools.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              maxBarSize={36}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
