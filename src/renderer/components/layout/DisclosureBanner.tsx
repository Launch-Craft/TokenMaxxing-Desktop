import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Database, X } from 'lucide-react'
import { useScannerStore } from '@/stores/useScannerStore'

const DISMISS_KEY = 'tm.disclosure.dismissed'

function secondsAgo(iso: string | null, now: number): string {
  if (!iso) return 'starting…'
  const diff = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (diff <= 1) return 'just now'
  return `${diff}s ago`
}

/**
 * Post-login disclosure. Communicates the two facts the user must know once
 * authenticated: (1) usage is auto-analyzed locally every 2 seconds, and
 * (2) detailed data is stored in the (local) database. Dismissible per session.
 */
export function DisclosureBanner(): JSX.Element | null {
  const lastAnalyzedAt = useScannerStore((s) => s.lastAnalyzedAt)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [now, setNow] = useState(() => Date.now())

  // Re-tick once a second so the "Xs ago" label stays live.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const dismiss = (): void => {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  const fresh = lastAnalyzedAt !== null && now - new Date(lastAnalyzedAt).getTime() < 3500

  return (
    <AnimatePresence initial={false}>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden border-b border-primary/10 bg-primary/[0.05]"
        >
          <div className="mx-auto flex w-full max-w-[1180px] items-center gap-3 px-7 py-2.5">
            <span className="relative flex h-2 w-2 shrink-0">
              {fresh && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              )}
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <p className="flex-1 text-[12.5px] leading-tight text-foreground/90">
              Your usage is <span className="font-semibold">analyzed locally every 2 seconds</span> and
              detailed data is stored in your database.{' '}
              <span className="text-muted-foreground">
                Only aggregated metrics sync — never your code or prompts.
              </span>
            </p>
            <span className="hidden items-center gap-1.5 font-mono text-[11px] text-muted-foreground sm:flex">
              <Database className="h-3.5 w-3.5" />
              last analyzed {secondsAgo(lastAnalyzedAt, now)}
            </span>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
