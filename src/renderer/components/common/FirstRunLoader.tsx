import { useMetricsStore } from '@/stores/useMetricsStore'
import { useScannerStore } from '@/stores/useScannerStore'
import logoUrl from '@/assets/logo.png'

/**
 * Full-screen "setting up" loader shown on first launch / first sign-in, while
 * the initial scan analyzes the machine's AI-tool logs and populates data. It
 * only appears when there's NO data yet, so a normal rescan (data already
 * present) never blocks the UI behind it.
 */
export function FirstRunLoader(): JSX.Element | null {
  const snapshot = useMetricsStore((s) => s.snapshot)
  const running = useScannerStore((s) => s.running)
  const progress = useScannerStore((s) => s.progress)

  const hasData = !!snapshot && snapshot.stats.totalTokens > 0
  // Show while the initial metrics load hasn't resolved, or a scan is actively
  // populating the very first batch of data.
  const show = !hasData && (snapshot === null || running || progress.status === 'scanning')
  if (!show) return null

  const message =
    progress.status === 'scanning' && progress.message ? progress.message : 'Fetching your data…'
  const pct =
    progress.total > 0 ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background">
      <div className="flex w-64 flex-col items-center gap-5 text-center">
        <img src={logoUrl} alt="" className="h-14 w-14 animate-pulse object-contain" />
        <div>
          <p className="text-sm font-semibold">Setting up TokenMaxxing</p>
          <p className="mt-1 text-xs text-muted-foreground">{message}</p>
        </div>
        <div className="h-1 w-48 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={pct === null ? 'h-full w-1/3 animate-pulse rounded-full bg-primary' : 'h-full rounded-full bg-primary transition-all'}
            style={pct === null ? undefined : { width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
