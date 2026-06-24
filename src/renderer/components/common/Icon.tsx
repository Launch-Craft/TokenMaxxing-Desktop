import {
  Bot,
  Boxes,
  Braces,
  CalendarCheck,
  CircleDashed,
  Compass,
  Crown,
  Egg,
  Flame,
  FolderGit2,
  Gem,
  Hourglass,
  Infinity as InfinityIcon,
  Library,
  Moon,
  MousePointer2,
  Network,
  Sparkles,
  Squirrel,
  Sunrise,
  TerminalSquare,
  Timer,
  Trophy,
  Wrench,
  Zap,
  type LucideIcon
} from 'lucide-react'

/** Curated map so icon names from shared metadata resolve without bundle bloat. */
const ICONS: Record<string, LucideIcon> = {
  // tools
  Sparkles,
  MousePointer2,
  Braces,
  Gem,
  Bot,
  Squirrel,
  TerminalSquare,
  CircleDashed,
  // achievements
  Egg,
  Zap,
  Flame,
  Crown,
  CalendarCheck,
  Trophy,
  Infinity: InfinityIcon,
  Moon,
  Sunrise,
  Timer,
  Hourglass,
  Compass,
  Boxes,
  FolderGit2,
  Library,
  Network,
  Wrench
}

export interface IconProps {
  name: string
  className?: string
  strokeWidth?: number
}

export function Icon({ name, className, strokeWidth = 2 }: IconProps): JSX.Element {
  const Cmp = ICONS[name] ?? CircleDashed
  return <Cmp className={className} strokeWidth={strokeWidth} />
}
