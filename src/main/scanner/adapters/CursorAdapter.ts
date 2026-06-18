import { join } from 'node:path'
import type { Session } from '@shared/types'
import { ToolAdapter, type ScanContext, type SourceRef } from './ToolAdapter'
import {
  normalizeEpochMs,
  pathExists,
  safeStat,
  sessionizeByGap,
  type RawEvent
} from '../aggregate'
import { estimateTokensFromAiLines } from '../tokenEstimation'
import { openSqliteReadonly, type ReadonlyDb } from '../sqliteRead'

/**
 * Cursor adapter.
 *
 * Reads `~/.cursor/ai-tracking/ai-code-tracking.db` READ-ONLY via the portable
 * SQLite reader (better-sqlite3 if built, else sql.js/WASM — so it works with
 * no native toolchain). Cursor doesn't record token counts, so we estimate
 * spend from the number of AI-authored lines per commit (`scored_commits`) plus
 * model/timestamp metadata from `ai_code_hashes`. The tracked source content is
 * never read.
 */
export class CursorAdapter extends ToolAdapter {
  readonly id = 'cursor' as const
  readonly name = 'Cursor'

  private dbFile(ctx: ScanContext): string {
    return join(ctx.home, '.cursor', 'ai-tracking', 'ai-code-tracking.db')
  }

  async detect(ctx: ScanContext): Promise<boolean> {
    return pathExists(this.dbFile(ctx))
  }

  protected async enumerate(ctx: ScanContext): Promise<SourceRef[]> {
    const file = this.dbFile(ctx)
    const stat = await safeStat(file)
    if (!stat) return []
    // Whole DB is one source — re-read only when its fingerprint changes.
    return [{ key: file, fingerprint: `${stat.size}:${stat.mtime.getTime()}` }]
  }

  protected async parseSource(ctx: ScanContext, ref: SourceRef): Promise<Session[]> {
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
        // Columns may be epoch seconds OR ms; normalize and skip unparseable rows
        // (a raw `new Date(Number(null))` would yield epoch 0 / Invalid Date).
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
