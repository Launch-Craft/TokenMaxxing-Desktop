import {
  TOOL_IDS,
  type ScanCheckpoint,
  type ScanError,
  type ScanProgress,
  type ScanResult,
  type Session,
  type Settings,
  type ToolId,
  type ToolMetrics
} from '@shared/types'
import { TOOL_META } from '@shared/constants'
import type { DataStore } from '../db'
import { createLogger } from '../utils/logger'
import { home } from '../utils/paths'
import { createAdapters, type ScanContext } from './adapters'
import { aggregateSessions, buildDailyFromSessions } from './aggregate'

const log = createLogger('scanner')

/**
 * Bump whenever token parsing / the cost model changes. A mismatch with the
 * stored value forces a FULL re-parse (clearing cached sessions + checkpoints),
 * so incremental caching never serves data computed by old logic.
 *   v2: exclude cache_read from token totals & cost.
 *   v3: tokens used = input + output only (exclude cache reads AND writes).
 */
const PARSER_VERSION = '3'

export type ProgressListener = (p: ScanProgress) => void

const IDLE: ScanProgress = {
  status: 'idle',
  currentTool: null,
  completed: 0,
  total: 0,
  message: 'Ready to scan'
}

/**
 * Orchestrates an INCREMENTAL scan across all enabled adapters.
 *
 * Each adapter diffs its sources against the stored checkpoints, so historical
 * data is parsed exactly once — subsequent scans only touch new/changed files.
 * After applying the diff, derived data (tool metrics, daily rollups) is
 * recomputed from the full session set (cheap; it's just aggregation). Source
 * code, prompts and conversation text never leave the adapters.
 */
export class ScannerService {
  private adapters = createAdapters()
  private listeners = new Set<ProgressListener>()
  private progress: ScanProgress = { ...IDLE }
  private running = false
  private abort: AbortController | null = null
  /** When true (live 2s passes), progress is not broadcast to avoid UI churn. */
  private quiet = false

  onProgress(listener: ProgressListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getStatus(): ScanProgress {
    return this.progress
  }

  private update(patch: Partial<ScanProgress>): void {
    // Live (quiet) passes update nothing visible — they must feel invisible.
    if (this.quiet) return
    this.progress = { ...this.progress, ...patch }
    for (const l of this.listeners) l(this.progress)
  }

  cancel(): void {
    this.abort?.abort()
  }

  async run(settings: Settings, store: DataStore, opts?: { quiet?: boolean }): Promise<ScanResult> {
    if (this.running) {
      if (!opts?.quiet) log.warn('scan already in progress')
      return store.scan.getLast() ?? this.emptyResult()
    }
    this.running = true
    this.quiet = opts?.quiet ?? false
    this.abort = new AbortController()
    const startedAt = Date.now()

    const prior = new Map<string, ScanCheckpoint>(
      store.checkpoints.all().map((c) => [c.sourceKey, c])
    )

    // If the parser changed, invalidate ALL cached sessions so the new token
    // model is applied to historical data (not just newly-changed files).
    if (store.meta.get('parserVersion') !== PARSER_VERSION) {
      log.info(`parser changed → full re-parse (was ${store.meta.get('parserVersion') ?? 'none'})`)
      store.sessions.replaceAll([])
      store.checkpoints.deleteForKeys([...prior.keys()])
      prior.clear()
    }

    const incremental = prior.size > 0
    const enabled = this.adapters.filter((a) => settings.enabledTools[a.id] !== false)
    this.update({
      status: 'scanning',
      completed: 0,
      total: enabled.length,
      currentTool: null,
      message: incremental ? 'Checking for new activity…' : 'Running first full scan…'
    })

    const ctx: ScanContext = { home: home(), log, signal: this.abort.signal }
    const errors: ScanError[] = []
    const newCheckpoints: ScanCheckpoint[] = []
    const removedKeys: string[] = []
    let parsed = 0
    let skipped = 0

    try {
      for (const adapter of enabled) {
        this.update({ currentTool: adapter.id, message: `Scanning ${adapter.name}…` })
        const result = await adapter.scan(ctx, prior)
        if (result.note) errors.push({ toolId: adapter.id, message: result.note })

        // Replace only the sessions of changed/new sources.
        const now = new Date().toISOString()
        for (const source of result.changedSources) {
          store.sessions.upsertForSource(source.key, source.sessions)
          newCheckpoints.push({
            sourceKey: source.key,
            toolId: adapter.id,
            fingerprint: source.fingerprint,
            updatedAt: now
          })
        }
        parsed += result.changedSources.length
        skipped += result.unchangedKeys.length

        // Detect deletions: prior sources for this tool no longer present.
        if (result.detected) {
          const present = new Set(result.presentKeys)
          for (const c of prior.values()) {
            if (c.toolId === adapter.id && !present.has(c.sourceKey)) removedKeys.push(c.sourceKey)
          }
        }

        this.update({ completed: this.progress.completed + 1 })
        if (this.abort.signal.aborted) break
      }

      if (removedKeys.length) {
        store.sessions.deleteForSources(removedKeys)
        store.checkpoints.deleteForKeys(removedKeys)
      }
      if (newCheckpoints.length) store.checkpoints.upsertMany(newCheckpoints)

      // Recompute derived data from the full (mostly cached) session set.
      const allSessions = store.sessions.all()
      const tools = this.computeToolMetrics(allSessions)
      store.toolMetrics.replaceAll(tools)
      store.daily.replaceAll(buildDailyFromSessions(allSessions))

      const finishedAt = Date.now()
      const result: ScanResult = {
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        durationMs: finishedAt - startedAt,
        tools,
        totalTokens: tools.reduce((sum, t) => sum + t.estimatedTokens, 0),
        totalSessions: allSessions.length,
        errors,
        sourcesParsed: parsed,
        sourcesSkipped: skipped,
        sourcesRemoved: removedKeys.length,
        incremental
      }
      store.scan.saveLast(result)
      store.meta.set('lastScanAt', result.finishedAt)
      store.meta.set('parserVersion', PARSER_VERSION)

      this.update({
        status: 'success',
        currentTool: null,
        completed: enabled.length,
        message: `${parsed.toLocaleString()} new · ${skipped.toLocaleString()} cached · ${result.totalSessions.toLocaleString()} sessions`
      })
      // Live passes only log when they actually did work, to keep logs readable.
      if (!this.quiet || parsed > 0 || removedKeys.length > 0) {
        log.info(
          `scan ${incremental ? '(incremental)' : '(full)'}${this.quiet ? ' (live)' : ''} done in ${result.durationMs}ms — parsed ${parsed}, cached ${skipped}, removed ${removedKeys.length}, ${result.totalTokens.toLocaleString()} tokens`
        )
      }
      return result
    } catch (err) {
      if (!this.quiet) log.error('scan failed:', err)
      this.update({ status: 'error', message: `Scan failed: ${(err as Error).message}` })
      throw err
    } finally {
      this.running = false
      this.quiet = false
      this.abort = null
    }
  }

  /** Build per-tool metrics from the full session set (after the diff). */
  private computeToolMetrics(allSessions: Session[]): ToolMetrics[] {
    const byTool = new Map<ToolId, Session[]>()
    for (const s of allSessions) {
      const list = byTool.get(s.toolId) ?? []
      list.push(s)
      byTool.set(s.toolId, list)
    }
    return TOOL_IDS.filter((t) => t !== 'other').map((t) =>
      aggregateSessions(t, TOOL_META[t].name, byTool.get(t) ?? [], (byTool.get(t)?.length ?? 0) > 0)
    )
  }

  private emptyResult(): ScanResult {
    const now = new Date().toISOString()
    return {
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      tools: [],
      totalTokens: 0,
      totalSessions: 0,
      errors: [],
      sourcesParsed: 0,
      sourcesSkipped: 0,
      sourcesRemoved: 0,
      incremental: false
    }
  }
}
