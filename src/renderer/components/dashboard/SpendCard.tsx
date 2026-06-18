import { motion } from 'framer-motion'
import { DollarSign, Info } from 'lucide-react'
import type { DashboardStats, ModelCost } from '@shared/types'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { formatMoney, formatMoneyFull } from '@/lib/format'

export function SpendCard({
  spend,
  modelCosts
}: {
  spend: DashboardStats['spend']
  modelCosts: ModelCost[]
}): JSX.Element {
  const topModels = modelCosts.slice(0, 4)
  // Math.max(1, …) guards a top model with exactly 0 cost (0/0 = NaN width).
  const maxCost = Math.max(1, topModels[0]?.costUsd ?? 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="glass relative overflow-hidden rounded-2xl p-5"
    >
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center">
        {/* Headline */}
        <div className="lg:w-[300px] lg:shrink-0">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.06] text-foreground">
              <DollarSign className="h-4 w-4" strokeWidth={2.4} />
            </span>
            Estimated AI Spend
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground/70 hover:text-foreground">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px]">
                What this usage would cost at public per-model API pricing (input,
                output and cache tokens priced separately). An estimate, not a bill.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="mt-3 font-mono text-4xl font-bold leading-none tabular text-foreground">
            {formatMoney(spend.total)}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span>
              This month{' '}
              <span className="font-mono font-semibold text-foreground">
                {formatMoney(spend.month)}
              </span>
            </span>
            <span>
              Today{' '}
              <span className="font-mono font-semibold text-foreground">
                {formatMoney(spend.today)}
              </span>
            </span>
          </div>
        </div>

        {/* Per-model bars */}
        <div className="flex-1 space-y-2.5">
          {topModels.length === 0 ? (
            <p className="text-xs text-muted-foreground">No spend computed yet — run a scan.</p>
          ) : (
            topModels.map((m) => (
              <div key={m.modelId} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">
                  {m.label}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className="h-full rounded-full bg-foreground/80"
                    style={{ width: `${Math.max(3, (m.costUsd / maxCost) * 100)}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right font-mono text-xs font-semibold tabular">
                  {formatMoneyFull(m.costUsd)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  )
}
