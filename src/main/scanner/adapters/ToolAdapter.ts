import type { ScanCheckpoint, Session, ToolId } from '@shared/types'
import { TOOL_META } from '@shared/constants'
import type { Logger } from '../../utils/logger'

/** Context handed to every adapter for a scan run. */
export interface ScanContext {
  home: string
  log: Logger
  /** Cooperative cancellation. */
  signal?: AbortSignal
}

/**
 * A discrete scannable source (a log file, a SQLite db, a task folder…).
 * `fingerprint` changes when the source's content changes (e.g. `size:mtimeMs`);
 * if it matches the stored checkpoint, the source is skipped — never re-parsed.
 */
export interface SourceRef {
  key: string
  fingerprint: string
}

/** The incremental diff an adapter produces for one scan. */
export interface AdapterScanResult {
  toolId: ToolId
  toolName: string
  detected: boolean
  /** Sources that were new/changed and got (re)parsed. */
  changedSources: { key: string; fingerprint: string; sessions: Session[] }[]
  /** Sources unchanged since the last scan (skipped — zero work). */
  unchangedKeys: string[]
  /** Every source key currently present (used to detect deletions). */
  presentKeys: string[]
  note?: string
}

/**
 * Base class for all tool adapters, built around INCREMENTAL scanning:
 *
 *   1. `enumerate()` lists the tool's sources + content fingerprints (cheap).
 *   2. The base compares each fingerprint to the stored checkpoint.
 *   3. Only new/changed sources are handed to `parseSource()`.
 *
 * Historical data is therefore parsed exactly once, ever. Add a new tool by
 * subclassing this (or {@link LogDirectoryAdapter}) and registering it in
 * `adapters/index.ts`. Adapters MUST return only privacy-safe counts — never
 * source code, prompts, or conversation text.
 */
export abstract class ToolAdapter {
  abstract readonly id: ToolId
  abstract readonly name: string

  /** True if this tool's data exists on the machine. */
  abstract detect(ctx: ScanContext): Promise<boolean>

  /** List sources + fingerprints. Must be cheap (stat, not read). */
  protected abstract enumerate(ctx: ScanContext): Promise<SourceRef[]>

  /** Parse a single source into privacy-safe sessions. */
  protected abstract parseSource(ctx: ScanContext, ref: SourceRef): Promise<Session[]>

  /** Incremental scan: diff sources against prior checkpoints. */
  async scan(
    ctx: ScanContext,
    prior: Map<string, ScanCheckpoint>
  ): Promise<AdapterScanResult> {
    const base: AdapterScanResult = {
      toolId: this.id,
      toolName: this.name,
      detected: false,
      changedSources: [],
      unchangedKeys: [],
      presentKeys: []
    }

    if (!(await this.detect(ctx))) return base
    base.detected = true

    try {
      const refs = await this.enumerate(ctx)
      base.presentKeys = refs.map((r) => r.key)
      for (const ref of refs) {
        if (ctx.signal?.aborted) break
        const checkpoint = prior.get(ref.key)
        if (checkpoint && checkpoint.fingerprint === ref.fingerprint) {
          base.unchangedKeys.push(ref.key)
          continue
        }
        const sessions = await this.parseSource(ctx, ref)
        base.changedSources.push({
          key: ref.key,
          fingerprint: ref.fingerprint,
          sessions: sessions.map((s) => ({ ...s, sourceKey: ref.key }))
        })
      }
      return base
    } catch (err) {
      ctx.log.error(`[${this.id}] scan failed:`, (err as Error).message)
      return { ...base, note: `Scan error: ${(err as Error).message}` }
    }
  }

  /** Convenience to derive a clean project label from an absolute path. */
  protected projectNameFromPath(p: string): string {
    const base = p.replace(/\/+$/, '').split('/').filter(Boolean).pop()
    return base || 'unknown'
  }

  /** Default display color for charts. */
  get color(): string {
    return TOOL_META[this.id].color
  }
}
