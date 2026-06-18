import { useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Download,
  Github,
  HardDriveDownload,
  LogOut,
  Radar,
  ShieldCheck,
  Trash2
} from 'lucide-react'
import { TOOL_IDS, type ScanFrequency, type ToolId } from '@shared/types'
import { TOOL_META } from '@shared/constants'
import { PageHeader } from '@/components/common/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ToolIcon } from '@/components/common/ToolIcon'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
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

const FREQUENCIES: { value: ScanFrequency; label: string }[] = [
  { value: 'manual', label: 'Manual only' },
  { value: 'startup', label: 'On app launch' },
  { value: 'hourly', label: 'Every hour' },
  { value: 'daily', label: 'Once a day' }
]

export default function Settings(): JSX.Element {
  const { settings, update, exportData, deleteAll } = useSettingsStore()
  const { auth, signIn, signOut, error: authError } = useAuthStore()
  const info = useAppStore((s) => s.info)
  const [exportPath, setExportPath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!settings) {
    return (
      <div>
        <PageHeader title="Settings" />
        <Card className="h-64 animate-pulse" />
      </div>
    )
  }

  const handleExport = async (): Promise<void> => {
    setBusy(true)
    const res = await exportData()
    setExportPath(res?.path ?? null)
    setBusy(false)
  }

  const handleDelete = async (): Promise<void> => {
    if (!window.confirm('Delete ALL local TokenMaxxing data? This cannot be undone.')) return
    setBusy(true)
    await deleteAll()
    setBusy(false)
  }

  return (
    <div className="pb-10">
      <PageHeader title="Settings" description="Configure scanning, privacy, and your account" />

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

        {/* Privacy */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <CardTitle>Privacy</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="mb-2 rounded-lg border border-primary/10 bg-primary/[0.03] p-3 text-xs text-muted-foreground">
              TokenMaxxing never uploads your source code, prompts, or conversations. Only aggregated
              metrics (token counts, hours, project counts) are ever synced — and only if you enable it.
            </div>
            <Row
              title="Cloud sync"
              description="Master switch. When off, nothing ever leaves this machine."
            >
              <Switch
                checked={settings.privacy.cloudSyncEnabled}
                onCheckedChange={(v) =>
                  void update({
                    privacy: {
                      ...settings.privacy,
                      cloudSyncEnabled: v,
                      rankingParticipation: v ? settings.privacy.rankingParticipation : false
                    }
                  })
                }
              />
            </Row>
            <Separator />
            <Row title="Global rankings" description="Compare aggregated metrics on the leaderboard">
              <Switch
                checked={settings.privacy.rankingParticipation}
                disabled={!settings.privacy.cloudSyncEnabled}
                onCheckedChange={(v) =>
                  void update({ privacy: { ...settings.privacy, rankingParticipation: v } })
                }
              />
            </Row>
            <Separator />
            <Row title="Anonymous usage analytics" description="Help improve the product (no personal data)">
              <Switch
                checked={settings.privacy.shareAnonymousUsage}
                onCheckedChange={(v) =>
                  void update({ privacy: { ...settings.privacy, shareAnonymousUsage: v } })
                }
              />
            </Row>
          </CardContent>
        </Card>

        {/* Scanning */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Radar className="h-4 w-4 text-viz-cyan" />
              <CardTitle>Scanning</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Row title="Scan frequency" description="How often TokenMaxxing re-reads local tool logs">
              <Select value={settings.scanFrequency} onValueChange={(v) => void update({ scanFrequency: v as ScanFrequency })}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Separator />
            <Row title="Scan on launch" description="Automatically scan when the app opens">
              <Switch
                checked={settings.autoScanOnLaunch}
                onCheckedChange={(v) => void update({ autoScanOnLaunch: v })}
              />
            </Row>
            <Separator className="my-1" />
            <div className="pt-2">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Tracked tools
              </div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {(TOOL_IDS.filter((t) => t !== 'other') as ToolId[]).map((t) => (
                  <div key={t} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-white/[0.02]">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.06] text-muted-foreground ring-1 ring-inset ring-white/10">
                        <ToolIcon toolId={t} className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="text-sm font-medium">{TOOL_META[t].name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{TOOL_META[t].defaultDir}</div>
                      </div>
                    </div>
                    <Switch
                      checked={settings.enabledTools[t]}
                      onCheckedChange={(v) =>
                        void update({ enabledTools: { ...settings.enabledTools, [t]: v } })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data management */}
        <Card>
          <CardHeader>
            <CardTitle>Your Data</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Row title="Export data" description="Download everything TokenMaxxing has stored as JSON">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleExport()}>
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </Row>
            {exportPath && (
              <div className="mb-1 flex items-center gap-2 rounded-lg bg-viz-green/10 px-3 py-2 text-xs text-viz-green">
                <HardDriveDownload className="h-3.5 w-3.5" /> Exported to {exportPath}
              </div>
            )}
            <Separator />
            <Row title="Delete all data" description="Permanently wipe all local metrics and cloud copies">
              <Button variant="destructive" size="sm" disabled={busy} onClick={() => void handleDelete()}>
                <Trash2 className="h-3.5 w-3.5" /> Delete all
              </Button>
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
