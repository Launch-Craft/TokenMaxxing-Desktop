import { type ReactNode } from 'react'
import { AlertTriangle, Github, LogOut } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { useAppStore } from '@/stores/useAppStore'

function Row({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export default function Settings(): JSX.Element {
  const { settings, update } = useSettingsStore()
  const { auth, signIn, signOut, error: authError } = useAuthStore()
  const info = useAppStore((s) => s.info)

  if (!settings) {
    return (
      <div>
        <PageHeader title="Settings" />
        <Card className="h-64 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="pb-10">
      <PageHeader title="Settings" description="Manage your account" />

      <div className="space-y-5">
        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {auth.status === 'signed-in' && auth.user ? (
              <Row title={auth.user.name ?? 'Signed in'} description={auth.user.email ?? auth.user.provider}>
                <Button variant="outline" size="sm" onClick={() => void signOut()}>
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </Button>
              </Row>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  Sign in to sync rankings across devices. Optional — the app works fully offline.
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => void signIn('google')}>
                    <GoogleMark /> Continue with Google
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void signIn('github')}>
                    <Github className="h-4 w-4" /> Continue with GitHub
                  </Button>
                </div>
                {authError && <p className="text-xs text-destructive">{authError}</p>}
              </div>
            )}
            <Separator className="my-2" />
            <Row title="Display handle" description="Shown on leaderboards">
              <Input
                value={settings.handle}
                onChange={(e) => void update({ handle: e.target.value })}
                className="w-48"
                placeholder="your-handle"
              />
            </Row>
            <Row title="Country" description="For country-specific rankings">
              <Input
                value={settings.countryCode ?? ''}
                onChange={(e) => void update({ countryCode: e.target.value.toUpperCase().slice(0, 2) || null })}
                className="w-24"
                placeholder="US"
                maxLength={2}
              />
            </Row>
          </CardContent>
        </Card>

        {/* About */}
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            Theme: Dark (light mode coming soon)
          </span>
          <span className="font-mono">
            {info?.name} v{info?.version} · {info?.platform}
          </span>
        </div>
      </div>
    </div>
  )
}

function GoogleMark(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}
