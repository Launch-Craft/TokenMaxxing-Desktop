import {
  BarChart3,
  Gift,
  LayoutDashboard,
  ListTree,
  Settings,
  Trophy,
  type LucideIcon
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/sessions', label: 'Sessions', icon: ListTree },
  { to: '/rankings', label: 'Rankings', icon: Trophy }
]

export const SECONDARY_NAV: NavItem[] = [
  { to: '/wrapped', label: 'AI Wrapped', icon: Gift },
  { to: '/settings', label: 'Settings', icon: Settings }
]
