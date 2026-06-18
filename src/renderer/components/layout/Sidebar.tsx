import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogOut } from 'lucide-react'
import { NAV_ITEMS, SECONDARY_NAV, type NavItem } from './nav'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/useAuthStore'
import { useAppStore } from '@/stores/useAppStore'
import logoUrl from '@/assets/logo.png'

function NavRow({ item }: { item: NavItem }): JSX.Element {
  const { pathname } = useLocation()
  const active = item.end ? pathname === item.to : pathname.startsWith(item.to)
  const ItemIcon = item.icon
  return (
    <NavLink to={item.to} end={item.end} className="relative block no-drag">
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-xl bg-white/[0.06] ring-1 ring-white/10"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}
      <span
        className={cn(
          'relative z-10 flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <ItemIcon
          className={cn('h-[18px] w-[18px] transition-colors', active && 'text-primary')}
          strokeWidth={active ? 2.4 : 2}
        />
        <span className="font-medium">{item.label}</span>
      </span>
    </NavLink>
  )
}

export function Sidebar(): JSX.Element {
  const user = useAuthStore((s) => s.auth.user)
  const signOut = useAuthStore((s) => s.signOut)
  const isMac = useAppStore((s) => s.isMac)

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-white/5 bg-black/20 px-3 pb-4 pt-3">
      {/* On macOS, leave room for the traffic-light window controls (draggable). */}
      {isMac && <div className="drag h-7 shrink-0" />}
      {/* Brand */}
      <div className="no-drag mb-6 flex items-center gap-3 px-2 pt-1">
        <img src={logoUrl} alt="TokenMaxxing" className="h-9 w-9 object-contain" />
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight">TokenMaxxing</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            token analytics
          </div>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavRow key={item.to} item={item} />
        ))}
      </nav>

      <div className="my-4 px-3">
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <nav className="flex flex-col gap-1">
        {SECONDARY_NAV.map((item) => (
          <NavRow key={item.to} item={item} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        {/* Account chip — scanning is automatic (every 10s) so there's no manual button. */}
        <div className="no-drag flex items-center gap-2.5 rounded-xl px-2 py-1.5">
          <div className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-white/10 text-[11px] font-semibold">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              (user?.name ?? 'Local').slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-xs font-medium">{user?.name ?? 'Local profile'}</div>
            <div className="truncate text-[10px] text-muted-foreground">
              {user?.email ?? 'Offline · private'}
            </div>
          </div>
          {user && (
            <button
              onClick={() => void signOut()}
              aria-label="Sign out"
              title="Sign out"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
