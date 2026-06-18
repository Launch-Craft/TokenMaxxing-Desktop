import { useMemo, type CSSProperties } from 'react'
import type { DailyUsage } from '@shared/types'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { formatCompact, formatDate } from '@/lib/format'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKS = 52

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

interface Cell {
  date: string
  tokens: number
  level: 0 | 1 | 2 | 3 | 4
  inRange: boolean
}

/** GitHub-style contribution heatmap driven by daily token totals. */
export function ContributionGraph({ daily }: { daily: DailyUsage[] }): JSX.Element {
  const { columns, monthLabels, max, activeDays } = useMemo(() => {
    const map = new Map(daily.map((d) => [d.date, d.tokens]))
    const values = daily.map((d) => d.tokens).filter((t) => t > 0)
    const sorted = [...values].sort((a, b) => a - b)
    const q = (p: number): number => sorted[Math.floor(sorted.length * p)] ?? 0
    const thresholds = [q(0.25), q(0.5), q(0.75), q(0.92)]

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // Align end to end-of-week (Saturday).
    const end = new Date(today)
    end.setDate(end.getDate() + (6 - end.getDay()))
    const start = new Date(end)
    start.setDate(start.getDate() - (WEEKS * 7 - 1))

    const cols: Cell[][] = []
    const labels: { col: number; label: string }[] = []
    let lastMonth = -1
    let active = 0

    const cursor = new Date(start)
    for (let w = 0; w < WEEKS; w++) {
      const col: Cell[] = []
      for (let d = 0; d < 7; d++) {
        const key = dateKey(cursor)
        const tokens = map.get(key) ?? 0
        const inRange = cursor <= today
        if (tokens > 0 && inRange) active++
        let level: Cell['level'] = 0
        if (tokens > 0) {
          level = 1
          if (tokens > thresholds[0]) level = 2
          if (tokens > thresholds[2]) level = 3
          if (tokens > thresholds[3]) level = 4
        }
        col.push({ date: key, tokens, level, inRange })
        if (d === 0 && cursor.getMonth() !== lastMonth) {
          labels.push({ col: w, label: MONTHS[cursor.getMonth()] })
          lastMonth = cursor.getMonth()
        }
        cursor.setDate(cursor.getDate() + 1)
      }
      cols.push(col)
    }
    return {
      columns: cols,
      monthLabels: labels,
      max: Math.max(...values, 0),
      activeDays: active
    }
  }, [daily])

  const levelStyle = (level: Cell['level'], inRange: boolean): CSSProperties => {
    if (!inRange) return { backgroundColor: 'transparent' }
    const opacities = [0.05, 0.28, 0.48, 0.72, 1]
    return level === 0
      ? { backgroundColor: 'hsl(var(--muted) / 0.5)' }
      : { backgroundColor: `hsl(var(--brand) / ${opacities[level]})` }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">{activeDays}</span> active days ·{' '}
          peak <span className="font-mono font-semibold text-foreground">{formatCompact(max)}</span>{' '}
          tokens/day
        </span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1.5">
          {/* Month labels */}
          <div className="relative ml-7 h-3" style={{ width: WEEKS * 14 }}>
            {monthLabels.map((m, i) => (
              <span
                key={i}
                className="absolute text-[10px] text-muted-foreground"
                style={{ left: m.col * 14 }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            {/* Weekday labels */}
            <div className="flex w-6 flex-col gap-[3px] pt-[1px] text-[9px] text-muted-foreground">
              {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((d, i) => (
                <span key={i} className="h-[11px] leading-[11px]">
                  {d}
                </span>
              ))}
            </div>
            {/* Grid */}
            <div className="flex gap-[3px]">
              {columns.map((col, ci) => (
                <div key={ci} className="flex flex-col gap-[3px]">
                  {col.map((cell, ri) =>
                    cell.inRange ? (
                      <Tooltip key={ri}>
                        <TooltipTrigger asChild>
                          <div
                            className="h-[11px] w-[11px] rounded-[3px] ring-1 ring-inset ring-white/[0.04] transition-transform hover:scale-125"
                            style={levelStyle(cell.level, cell.inRange)}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          <span className="font-mono">{formatCompact(cell.tokens)}</span> tokens ·{' '}
                          {formatDate(cell.date + 'T00:00:00')}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <div key={ri} className="h-[11px] w-[11px]" />
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
          {/* Legend */}
          <div className="ml-7 mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <div
                key={l}
                className="h-[11px] w-[11px] rounded-[3px]"
                style={levelStyle(l as Cell['level'], true)}
              />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  )
}
