import { motion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react'
import { Sparkline } from '@/components/charts/Sparkline'
import { cn, tint } from '@/lib/utils'

export interface StatCardProps {
  label: string
  value: string
  icon: LucideIcon
  accent?: string
  delta?: { text: string; positive: boolean } | null
  hint?: string
  sparkline?: number[]
  index?: number
}

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = 'hsl(var(--brand))',
  delta,
  hint,
  sparkline,
  index = 0
}: StatCardProps): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="glass glass-hover group relative overflow-hidden rounded-2xl p-4"
    >
      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-8 w-8 place-items-center rounded-lg"
            style={{ color: accent, backgroundColor: tint(accent, 14) }}
          >
            <Icon className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        {delta && (
          <span
            className={cn(
              'flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
              delta.positive
                ? 'bg-white/[0.06] text-foreground'
                : 'bg-white/[0.03] text-muted-foreground'
            )}
          >
            {delta.positive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {delta.text}
          </span>
        )}
      </div>

      <div className="relative mt-3 flex items-end justify-between gap-2">
        <div>
          <div className="font-mono text-[26px] font-bold leading-none tracking-tight tabular">
            {value}
          </div>
          {hint && <div className="mt-1.5 text-[11px] text-muted-foreground">{hint}</div>}
        </div>
        {sparkline && sparkline.length > 1 && (
          <Sparkline data={sparkline} color={accent} width={92} height={34} className="opacity-80" />
        )}
      </div>
    </motion.div>
  )
}
