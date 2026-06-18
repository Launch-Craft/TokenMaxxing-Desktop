import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toPng } from 'html-to-image'
import { Calendar, Clock3, Crown, Download, Flame, Sparkles, Trophy } from 'lucide-react'
import type { WrappedReport } from '@shared/types'
import { TOOL_META } from '@shared/constants'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ToolIcon } from '@/components/common/ToolIcon'
import { client } from '@/lib/ipc'
import { formatCompact, formatHours, formatRank } from '@/lib/format'

function MiniStat({
  icon: IconCmp,
  label,
  value
}: {
  icon: typeof Flame
  label: string
  value: string
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <IconCmp className="h-4 w-4 text-primary" />
      <div className="mt-3 font-mono text-xl font-bold tabular">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  )
}

export default function Wrapped(): JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null)
  const [years, setYears] = useState<number[]>([])
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [report, setReport] = useState<WrappedReport | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void client.wrapped.years().then((y) => {
      setYears(y)
      if (y.length) setYear(y[0])
    })
  }, [])

  useEffect(() => {
    setReport(null)
    // Ignore a stale response if `year` changes again before this resolves.
    let cancelled = false
    void client.wrapped.get(year).then((r) => {
      if (!cancelled) setReport(r)
    })
    return () => {
      cancelled = true
    }
  }, [year])

  const handleSave = useCallback(async () => {
    if (!cardRef.current) return
    setSaving(true)
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: '#08090c',
        cacheBust: true
      })
      const link = document.createElement('a')
      link.download = `tokenmaxxing-wrapped-${year}.png`
      link.href = dataUrl
      link.click()
    } finally {
      setSaving(false)
    }
  }, [year])

  const maxMonth = report ? Math.max(...report.monthlyTokens.map((m) => m.tokens), 1) : 1
  const fav = report?.favoriteTool

  return (
    <div>
      <PageHeader
        title="AI Wrapped"
        description="Your year in AI coding, ready to share"
        actions={
          <div className="flex items-center gap-2">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(years.length ? years : [year]).map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!report || saving} onClick={() => void handleSave()}>
              <Download className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : 'Save image'}
            </Button>
          </div>
        }
      />

      {!report ? (
        <Skeleton className="h-[560px] w-full rounded-3xl" />
      ) : (
        <motion.div
          ref={cardRef}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-3xl border border-white/10 p-8"
          style={{
            background:
              'radial-gradient(90% 70% at 50% -20%, hsl(0 0% 100% / 0.07), transparent 60%), hsl(240 6% 7%)'
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.3em] text-primary">
              <Sparkles className="h-4 w-4" />
              TokenMaxxing Wrapped
            </div>
            <div className="font-mono text-5xl font-black tracking-tighter text-white/90">{report.year}</div>
          </div>

          {/* Hero */}
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">You generated</div>
              <div className="mt-1 font-mono text-6xl font-black leading-none tracking-tighter text-brand-gradient">
                {formatCompact(report.totalTokens)}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">tokens across {formatCompact(report.totalSessions)} sessions</div>

              <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <Crown className="h-5 w-5 text-viz-amber" />
                <div>
                  <div className="text-base font-bold">{report.persona.title}</div>
                  <div className="text-xs text-muted-foreground">{report.persona.subtitle}</div>
                </div>
              </div>
            </div>

            {/* Favorite tool spotlight */}
            {fav && (
              <div
                className="flex flex-col justify-between rounded-2xl border border-white/10 p-5"
                style={{ background: `color-mix(in srgb, ${TOOL_META[fav.toolId].color} 10%, transparent)` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">Favorite tool</span>
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] ring-1 ring-inset ring-white/10">
                    <ToolIcon toolId={fav.toolId} className="h-5 w-5" />
                  </span>
                </div>
                <div>
                  <div className="font-mono text-3xl font-bold">{fav.toolName}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {formatCompact(fav.tokens)} tokens · your #1 companion
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mini stats */}
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MiniStat icon={Clock3} label="Coding hours" value={formatHours(report.codingHours)} />
            <MiniStat icon={Flame} label="Best streak" value={`${report.streakRecord}d`} />
            <MiniStat icon={Trophy} label="Global rank" value={formatRank(report.globalRank)} />
            <MiniStat
              icon={Calendar}
              label="Busiest month"
              value={report.busiestMonth?.month.slice(0, 3) ?? '—'}
            />
          </div>

          {/* Monthly bars */}
          <div className="mt-7">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              Monthly rhythm
            </div>
            <div className="flex h-24 items-end gap-1.5">
              {report.monthlyTokens.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full flex-1 items-end">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${(m.tokens / maxMonth) * 100}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className="w-full rounded-md bg-primary/70"
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground">{m.month}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top project + footer */}
          <div className="mt-7 flex items-center justify-between border-t border-white/10 pt-5">
            {report.topProject ? (
              <div>
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Top project</span>
                <div className="font-mono text-lg font-bold">{report.topProject.name}</div>
              </div>
            ) : (
              <div />
            )}
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              tokenmaxxing.app
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
