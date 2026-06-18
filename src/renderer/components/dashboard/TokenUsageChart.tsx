import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { ChartGranularity, MetricsSnapshot } from '@shared/types'
import { Card } from '@/components/ui/card'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { formatCompact, formatDate } from '@/lib/format'

function tickLabel(value: string, granularity: ChartGranularity): string {
  if (granularity === 'daily') {
    const d = new Date(value + 'T00:00:00')
    return Number.isNaN(d.getTime()) ? value : `${d.getMonth() + 1}/${d.getDate()}`
  }
  return value
}

/** Token-usage area chart. Granularity is controlled by the page's period tab. */
export function TokenUsageChart({
  series,
  granularity
}: {
  series: MetricsSnapshot['series']
  granularity: ChartGranularity
}): JSX.Element {
  const data = series[granularity] ?? []
  const total = data.reduce((s, p) => s + p.tokens, 0)

  return (
    <Card className="p-5">
      <div className="mb-5">
        <h3 className="text-sm font-semibold">Token Usage Over Time</h3>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {formatCompact(total)} tokens · {granularity} · excl. cache
        </p>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="tokenArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity={0.45} />
                <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="label"
              tickFormatter={(v) => tickLabel(String(v), granularity)}
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(v) => formatCompact(Number(v))}
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              cursor={{ stroke: 'hsl(var(--brand))', strokeWidth: 1, strokeDasharray: '4 4' }}
              content={
                <ChartTooltip
                  labelFormatter={(l) =>
                    granularity === 'daily' && /\d{4}-\d{2}-\d{2}/.test(l) ? formatDate(l + 'T00:00:00') : l
                  }
                />
              }
            />
            <Area
              type="monotone"
              dataKey="tokens"
              name="Tokens"
              stroke="hsl(var(--brand))"
              strokeWidth={2}
              fill="url(#tokenArea)"
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
