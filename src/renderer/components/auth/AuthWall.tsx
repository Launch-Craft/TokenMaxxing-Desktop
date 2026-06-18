import { motion } from 'framer-motion'
import { Gamepad2, Globe2, Loader2, Sparkles, Trophy } from 'lucide-react'
import { useAuthStore } from '@/stores/useAuthStore'
import { Button } from '@/components/ui/button'
import logoUrl from '@/assets/logo.png'

/** The 4-color Google "G", inlined to avoid pulling in an icon dependency. */
function GoogleMark(): JSX.Element {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

const PROMISES = [
  { icon: Trophy, label: 'Climb the global leaderboard' },
  { icon: Globe2, label: 'See who ships the most, and from where' },
  { icon: Gamepad2, label: 'Earn ranks, badges & bragging rights' }
]

/**
 * Hard authentication wall. Until the user signs in with Google, NO token usage
 * data is rendered anywhere in the app — this is the only thing on screen.
 */
export function AuthWall(): JSX.Element {
  const { signIn, auth, error } = useAuthStore()
  const pending = auth.status === 'pending'

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-background">
      {/* Ambient backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-10%] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/[0.07] blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-5%] h-[420px] w-[420px] rounded-full bg-white/[0.04] blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[420px] px-6"
      >
        <div className="glass rounded-3xl border border-white/10 p-8 shadow-2xl">
          <div className="flex flex-col items-center text-center">
            <img src={logoUrl} alt="TokenMaxxing" className="h-14 w-14 object-contain" />
            <h1 className="mt-5 text-xl font-bold tracking-tight">Welcome to TokenMaxxing</h1>
            <p className="mt-2 text-sm text-muted-foreground">Log in to continue — let's see your rank.</p>
          </div>

          <div className="mt-7">
            <Button
              size="lg"
              variant="secondary"
              className="w-full gap-3 bg-white text-[#1f1f1f] hover:bg-white/90"
              disabled={pending}
              onClick={() => void signIn('google')}
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Completing sign-in…
                </>
              ) : (
                <>
                  <GoogleMark />
                  Continue with Google
                </>
              )}
            </Button>

            {error && (
              <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
          </div>

          <div className="mt-7 space-y-2.5">
            {PROMISES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
                <Icon className="h-4 w-4 shrink-0 text-primary" />
                {label}
              </div>
            ))}
          </div>

          <div className="mt-7 flex items-center justify-center gap-1.5 border-t border-white/5 pt-5 text-[11px] text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            Free forever · no setup · just sign in and play.
          </div>
        </div>
      </motion.div>
    </div>
  )
}
