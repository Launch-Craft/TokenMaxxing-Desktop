import type { ToolId } from '@shared/types'
import { TOOL_META } from '@shared/constants'
import { ToolIcon } from './ToolIcon'
import { cn } from '@/lib/utils'

export function ToolDot({ toolId, className }: { toolId: ToolId; className?: string }): JSX.Element {
  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)}
      style={{ backgroundColor: TOOL_META[toolId].color }}
    />
  )
}

export function ToolBadge({
  toolId,
  withIcon = false,
  className
}: {
  toolId: ToolId
  withIcon?: boolean
  className?: string
}): JSX.Element {
  const meta = TOOL_META[toolId]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.03] px-2 py-0.5 text-xs font-medium',
        className
      )}
    >
      {withIcon ? <ToolIcon toolId={toolId} className="h-3.5 w-3.5" /> : <ToolDot toolId={toolId} />}
      {meta.name}
    </span>
  )
}

export function ToolGlyph({
  toolId,
  size = 36,
  className
}: {
  toolId: ToolId
  size?: number
  className?: string
}): JSX.Element {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-xl bg-white/[0.06] ring-1 ring-inset ring-white/10 text-muted-foreground',
        className
      )}
      style={{ width: size, height: size }}
    >
      <ToolIcon toolId={toolId} className="h-[56%] w-[56%]" />
    </span>
  )
}
