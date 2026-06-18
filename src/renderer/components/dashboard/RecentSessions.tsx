import { Link } from 'react-router-dom'
import { ArrowRight, FolderCode } from 'lucide-react'
import type { Session } from '@shared/types'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/common/EmptyState'
import { ToolGlyph } from '@/components/common/ToolBadge'
import { useSessionDetailStore } from '@/stores/useSessionDetailStore'
import { formatCompact, formatDuration, relativeTime } from '@/lib/format'

export function SessionRow({ session }: { session: Session }): JSX.Element {
  const show = useSessionDetailStore((s) => s.show)
  return (
    <button
      type="button"
      onClick={() => show(session)}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.03]"
    >
      <ToolGlyph toolId={session.toolId} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{session.projectName}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{session.toolName}</span>
          <span className="opacity-40">·</span>
          <span>{relativeTime(session.startedAt)}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm font-semibold tabular">
          {formatCompact(
            session.estimatedTokens + session.tokenBreakdown.cacheRead + session.tokenBreakdown.cacheCreate
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">{formatDuration(session.durationMinutes)}</div>
      </div>
    </button>
  )
}

export function RecentSessions({ sessions }: { sessions: Session[] }): JSX.Element {
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recent Sessions</h3>
        <Link
          to="/sessions"
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          icon={FolderCode}
          title="No sessions yet"
          description="Your recent AI coding sessions will appear here after a scan."
          className="flex-1 border-0"
        />
      ) : (
        <div className="-mx-2 flex flex-col gap-0.5">
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </div>
      )}
    </Card>
  )
}
