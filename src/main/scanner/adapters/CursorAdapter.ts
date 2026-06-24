import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { AgenticStats, Session } from '@shared/types'
import { emptyAgentic, hasAgenticSignal, isAgentTool, isWorkflowTool } from '@shared/agentic'
import { ToolAdapter, type ScanContext, type SourceRef } from './ToolAdapter'
import {
  hashId,
  normalizeEpochMs,
  pathExists,
  safeStat,
  sessionizeByGap,
  walk,
  type RawEvent
} from '../aggregate'
import {
  estimateTokensFromAiLines,
  estimateTokensFromChars,
  finalizeBreakdown
} from '../tokenEstimation'
import { openSqliteReadonly, type ReadonlyDb } from '../sqliteRead'

const TRANSCRIPT_PATH_RE = /[/\\]agent-transcripts[/\\][^/\\]+[/\\][^/\\]+\.jsonl$/i
/** Rough token budget per tool call when the transcript has no usage block. */
const TOKENS_PER_TOOL_CALL = 800

/**
 * Cursor adapter.
 *
 * Two data sources:
 * 1. `~/.cursor/projects/.../agent-transcripts/.../*.jsonl` — per-chat agent
 *    sessions (same shape as Claude Code transcripts). These drive "recent
 *    sessions" with file-mtime timestamps.
 * 2. `~/.cursor/ai-tracking/ai-code-tracking.db` — SQLite commit/hash
 *    telemetry for line-based token estimates when usage isn't recorded.
 *
 * Only counts, timestamps, model ids and project folder names are read — never
 * message text or source code.
 */
export class CursorAdapter extends ToolAdapter {
  readonly id = 'cursor' as const
  readonly name = 'Cursor'

  private dbFile(ctx: ScanContext): string {
    return join(ctx.home, '.cursor', 'ai-tracking', 'ai-code-tracking.db')
  }

  private projectsDir(ctx: ScanContext): string {
    return join(ctx.home, '.cursor', 'projects')
  }

  async detect(ctx: ScanContext): Promise<boolean> {
    if (await pathExists(this.dbFile(ctx))) return true
    return pathExists(this.projectsDir(ctx))
  }

  protected async enumerate(ctx: ScanContext): Promise<SourceRef[]> {
    const refs: SourceRef[] = []

    const db = this.dbFile(ctx)
    const dbStat = await safeStat(db)
    if (dbStat) {
      refs.push({ key: db, fingerprint: `${dbStat.size}:${dbStat.mtime.getTime()}` })
    }

    const transcripts = (
      await walk(this.projectsDir(ctx), { match: /\.jsonl$/i, maxDepth: 6 })
    ).filter((f) => TRANSCRIPT_PATH_RE.test(f))
    for (const file of transcripts) {
      const stat = await safeStat(file)
      if (!stat || stat.size === 0 || stat.size > 200 * 1024 * 1024) continue
      refs.push({ key: file, fingerprint: `${stat.size}:${stat.mtime.getTime()}` })
    }

    return refs
  }

  protected async parseSource(ctx: ScanContext, ref: SourceRef): Promise<Session[]> {
    if (TRANSCRIPT_PATH_RE.test(ref.key)) {
      const session = await this.parseTranscriptFile(ref.key)
      return session ? [session] : []
    }
    return this.parseTrackingDb(ctx, ref)
  }

  /** Parse one Cursor agent-transcript JSONL into a single session. */
  private async parseTranscriptFile(filePath: string): Promise<Session | null> {
    const stat = await safeStat(filePath)
    if (!stat) return null

    let messageCount = 0
    let estimatedChars = 0
    const agentic = emptyAgentic()

    try {
      const rl = createInterface({
        input: createReadStream(filePath, { encoding: 'utf-8' }),
        crlfDelay: Infinity
      })
      for await (const line of rl) {
        if (!line.trim()) continue
        let obj: Record<string, unknown>
        try {
          obj = JSON.parse(line)
        } catch {
          continue
        }

        const role = obj.role
        if (role === 'user' || role === 'assistant') messageCount++

        const message = obj.message as { content?: unknown } | undefined
        estimatedChars += this.estimateContentChars(message?.content, role === 'assistant' ? agentic : null)
      }
    } catch {
      return null
    }

    if (messageCount === 0) return null

    const tokens = estimateTokensFromChars(estimatedChars) + agentic.toolCalls * TOKENS_PER_TOOL_CALL
    const breakdown = finalizeBreakdown({ input: 0, output: tokens, cacheRead: 0, cacheCreate: 0 })
    if (breakdown.total === 0) return null

    const endMs = stat.mtime.getTime()
    // Spread activity backward from the file's last write so multi-turn chats
    // don't all collapse to a 1-minute duration.
    const spanMs = Math.min(endMs, Math.max(60_000, messageCount * 90_000))
    const startMs = endMs - spanMs

    const projectName = this.projectFromTranscriptPath(filePath)

    return {
      id: hashId(this.id, 'transcript', filePath, startMs),
      toolId: this.id,
      toolName: this.name,
      projectName,
      estimatedTokens: breakdown.total,
      tokenBreakdown: breakdown,
      startedAt: new Date(startMs).toISOString(),
      endedAt: new Date(endMs).toISOString(),
      durationMinutes: Math.max(1, Math.round(spanMs / 60_000)),
      messageCount,
      model: null,
      agentic: hasAgenticSignal(agentic) ? agentic : undefined
    }
  }

  /**
   * Count characters in content blocks for token estimation; tally tool_use
   * blocks into agentic counters. Only block types and tool names are inspected.
   */
  private estimateContentChars(content: unknown, agentic: AgenticStats | null): number {
    if (!Array.isArray(content)) return 0
    let chars = 0
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      const b = block as Record<string, unknown>
      if (b.type === 'text' && typeof b.text === 'string') {
        chars += b.text.length
      } else if (b.type === 'tool_use' && agentic) {
        const name = typeof b.name === 'string' && b.name ? b.name : 'unknown'
        agentic.toolCalls++
        agentic.byTool[name] = (agentic.byTool[name] ?? 0) + 1
        if (isAgentTool(name)) agentic.agentsSpawned++
        else if (isWorkflowTool(name)) agentic.workflows++
      }
    }
    return chars
  }

  private projectFromTranscriptPath(filePath: string): string {
    const match = filePath.match(/[/\\]projects[/\\]([^/\\]+)[/\\]agent-transcripts[/\\]/)
    if (match) return this.decodeProjectDir(match[1])
    return 'cursor-workspace'
  }

  /** Decode `-Users-name-Work-foo` → `foo` as a fallback project label. */
  private decodeProjectDir(dir: string): string {
    const segments = dir.split('-').filter(Boolean)
    return segments[segments.length - 1] ?? 'unknown'
  }

  private async parseTrackingDb(ctx: ScanContext, ref: SourceRef): Promise<Session[]> {
    let db: ReadonlyDb
    try {
      db = await openSqliteReadonly(ref.key)
    } catch (err) {
      ctx.log.warn('[cursor] could not open DB:', (err as Error).message)
      return []
    }

    try {
      const models = this.readModels(db)
      const events = this.readCommitEvents(db)
      if (events.length > 0) {
        const fallbackModel = models[0] ?? null
        return sessionizeByGap(this.id, this.name, events, 45).map((s) => ({
          ...s,
          model: s.model ?? fallbackModel
        }))
      }
      return this.fallbackFromHashes(db, models)
    } finally {
      db.close()
    }
  }

  private readModels(db: ReadonlyDb): string[] {
    try {
      const rows = db.query(
        "SELECT DISTINCT model FROM ai_code_hashes WHERE model IS NOT NULL AND model != '' LIMIT 25"
      )
      return rows.map((r) => String(r.model)).filter(Boolean)
    } catch {
      return []
    }
  }

  private readCommitEvents(db: ReadonlyDb): RawEvent[] {
    try {
      const rows = db.query(
        `SELECT branchName, scoredAt, commitDate, composerLinesAdded, tabLinesAdded, linesAdded
         FROM scored_commits`
      )
      const events: RawEvent[] = []
      for (const r of rows) {
        const aiLines =
          (Number(r.composerLinesAdded) || 0) + (Number(r.tabLinesAdded) || 0) ||
          Number(r.linesAdded) ||
          0
        if (aiLines <= 0) continue
        const ts = this.parseTimestamp(
          r.commitDate ? String(r.commitDate) : null,
          r.scoredAt != null ? Number(r.scoredAt) : null
        )
        if (!ts) continue
        events.push({
          timestamp: ts,
          projectName: this.branchToProject(r.branchName ? String(r.branchName) : null),
          model: null,
          output: estimateTokensFromAiLines(aiLines)
        })
      }
      return events
    } catch {
      return []
    }
  }

  private fallbackFromHashes(db: ReadonlyDb, models: string[]): Session[] {
    try {
      const rows = db.query(
        'SELECT createdAt, timestamp, model FROM ai_code_hashes ORDER BY createdAt ASC LIMIT 50000'
      )
      if (rows.length === 0) return []
      const events: RawEvent[] = []
      for (const r of rows) {
        const ms = normalizeEpochMs(Number(r.timestamp ?? r.createdAt))
        if (ms === null) continue
        events.push({
          timestamp: new Date(ms),
          projectName: 'cursor-workspace',
          model: r.model ? String(r.model) : (models[0] ?? null),
          output: estimateTokensFromAiLines(4)
        })
      }
      return sessionizeByGap(this.id, this.name, events, 45)
    } catch {
      return []
    }
  }

  private branchToProject(branch: string | null): string {
    if (!branch) return 'cursor-workspace'
    if (['main', 'master', 'develop', 'dev'].includes(branch)) return 'cursor-workspace'
    const tail = branch.split('/').pop() ?? branch
    return tail || 'cursor-workspace'
  }

  private parseTimestamp(commitDate: string | null, scoredAt: number | null): Date | null {
    if (commitDate) {
      const t = Date.parse(commitDate)
      if (!Number.isNaN(t)) return new Date(t)
    }
    if (scoredAt && scoredAt > 0) return new Date(scoredAt)
    return null
  }
}
