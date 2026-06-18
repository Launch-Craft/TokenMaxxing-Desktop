import type { ReactNode } from 'react'
import { useAuthStore } from '@/stores/useAuthStore'
import { AuthWall } from './AuthWall'
import logoUrl from '@/assets/logo.png'

/**
 * Access control boundary. Renders its children ONLY when the user is
 * authenticated; otherwise the {@link AuthWall} is the only thing shown. This is
 * the single choke point that guarantees no token usage data is visible to a
 * signed-out user.
 */
export function AuthGate({ children }: { children: ReactNode }): JSX.Element {
  const auth = useAuthStore((s) => s.auth)
  const loaded = useAuthStore((s) => s.loaded)

  // Brief splash while the persisted session is restored, so we never flash the
  // wall to a user who is actually already signed in.
  if (!loaded) {
    return (
      <div className="grid h-screen w-screen place-items-center bg-background">
        <img src={logoUrl} alt="" className="h-12 w-12 animate-pulse object-contain opacity-80" />
      </div>
    )
  }

  if (auth.status !== 'signed-in') return <AuthWall />

  return <>{children}</>
}
