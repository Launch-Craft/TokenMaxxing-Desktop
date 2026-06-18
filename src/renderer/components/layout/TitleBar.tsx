import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Minus, Shield, Square, X } from 'lucide-react'
import { NAV_ITEMS, SECONDARY_NAV } from './nav'
import { useAppStore } from '@/stores/useAppStore'
import { client } from '@/lib/ipc'
import { cn } from '@/lib/utils'

function usePageTitle(): string {
  const { pathname } = useLocation()
  const all = [...NAV_ITEMS, ...SECONDARY_NAV]
  const match =
    all.find((i) => (i.end ? pathname === i.to : i.to !== '/' && pathname.startsWith(i.to))) ??
    all[0]
  return match.label
}

function WinControl({
  onClick,
  className,
  children,
  label
}: {
  onClick: () => void
  className?: string
  children: ReactNode
  label: string
}): JSX.Element {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={cn(
        'no-drag grid h-8 w-11 place-items-center text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  )
}

export function TitleBar(): JSX.Element {
  const title = usePageTitle()
  const isMac = useAppStore((s) => s.isMac)

  return (
    <header className="drag flex h-11 shrink-0 items-center justify-between border-b border-white/5 bg-black/10 pr-1">
      <div className={cn('flex items-center gap-3', isMac ? 'pl-[78px]' : 'pl-4')}>
        <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => void client.app.openExternal('https://tokenmaxxing.app/privacy')}
          className="no-drag mr-1 hidden items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.03] px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground sm:flex"
        >
          <Shield className="h-3 w-3 text-primary" />
          Private · Local only
        </button>

        {!isMac && (
          <div className="flex items-center">
            <WinControl label="Minimize" onClick={() => client.window.minimize()}>
              <Minus className="h-3.5 w-3.5" />
            </WinControl>
            <WinControl label="Maximize" onClick={() => client.window.toggleMaximize()}>
              <Square className="h-3 w-3" />
            </WinControl>
            <WinControl
              label="Close"
              onClick={() => client.window.close()}
              className="hover:bg-destructive hover:text-destructive-foreground"
            >
              <X className="h-4 w-4" />
            </WinControl>
          </div>
        )}
      </div>
    </header>
  )
}
