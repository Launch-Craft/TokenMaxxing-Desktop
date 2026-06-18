import type { TooltipProps } from 'recharts'
import { formatNumber } from '@/lib/format'

/** Shared glass tooltip for all Recharts charts. */
export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueSuffix
}: TooltipProps<number, string> & {
  labelFormatter?: (label: string) => string
  valueSuffix?: string
}): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-white/10 bg-popover/95 px-3 py-2 shadow-glass backdrop-blur">
      {label != null && (
        <div className="mb-1 text-[11px] font-medium text-muted-foreground">
          {labelFormatter ? labelFormatter(String(label)) : String(label)}
        </div>
      )}
      <div className="space-y-0.5">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: (entry.color as string) ?? 'hsl(var(--brand))' }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-mono font-semibold tabular">
              {formatNumber(Number(entry.value))}
              {valueSuffix ?? ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
