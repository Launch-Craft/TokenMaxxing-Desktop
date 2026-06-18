import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/layout/AppShell'
import { AuthGate } from '@/components/auth/AuthGate'
import { useAppStore } from '@/stores/useAppStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useMetricsStore } from '@/stores/useMetricsStore'
import { useRankingsStore } from '@/stores/useRankingsStore'
import { useScannerStore } from '@/stores/useScannerStore'
import { useAuthStore } from '@/stores/useAuthStore'
import Dashboard from '@/pages/Dashboard'
import Analytics from '@/pages/Analytics'
import Sessions from '@/pages/Sessions'
import Rankings from '@/pages/Rankings'
import Settings from '@/pages/Settings'
import Wrapped from '@/pages/Wrapped'

export default function App(): JSX.Element {
  const authStatus = useAuthStore((s) => s.auth.status)

  useEffect(() => {
    // Bootstrap: load everything the app needs once, then keep live.
    void useAppStore.getState().init()
    void useSettingsStore.getState().load()
    void useMetricsStore.getState().load()
    void useRankingsStore.getState().load()
    void useAuthStore.getState().load()

    const unsubScan = useScannerStore.getState().subscribe()
    const unsubAuth = useAuthStore.getState().subscribe()
    return () => {
      unsubScan()
      unsubAuth()
    }
  }, [])

  // Once signed in, poll the server leaderboard on the 60s cadence.
  useEffect(() => {
    if (authStatus !== 'signed-in') return
    void useRankingsStore.getState().refresh()
    return useRankingsStore.getState().startPolling()
  }, [authStatus])

  return (
    <TooltipProvider delayDuration={150}>
      <AuthGate>
        <AppShell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/rankings" element={<Rankings />} />
            <Route path="/wrapped" element={<Wrapped />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </AppShell>
      </AuthGate>
    </TooltipProvider>
  )
}
