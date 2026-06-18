import { basename, dirname } from 'node:path'
import { join } from 'node:path'
import type { Session } from '@shared/types'
import { ToolAdapter, type ScanContext, type SourceRef } from './ToolAdapter'
import { hashId, pathExists, safeStat, walk } from '../aggregate'
import { outputOnly } from '../tokenEstimation'

export interface LogDirConfig {
  /** Candidate absolute base directories (already home-expanded). */
  roots: string[]
  /** Which files count as logs. */
  filePattern: RegExp
  /** Files larger than this are skipped. */
  maxFileBytes?: number
  maxDepth?: number
  /**
   * Estimation density. Logs contain JSON/markdown overhead, so only a fraction
   * is real model content; ~12 bytes ≈ 1 effective token by default.
   */
  bytesPerToken?: number
  /** How to derive the project label from a log file path. */
  projectFrom?: 'parentDir' | 'grandparentDir' | 'fileName' | 'fixed'
  fixedProject?: string
  modelHint?: string | null
}

/**
 * Generic adapter for tools that keep per-session log files but don't expose
 * token counts. Each file is treated as one source AND one session, so
 * incremental scanning can skip every unchanged file by fingerprint. Tokens are
 * estimated from log byte-size; precise parsers (like {@link ClaudeAdapter})
 * replace this per tool without changing the contract.
 */
export abstract class LogDirectoryAdapter extends ToolAdapter {
  protected abstract config(ctx: ScanContext): LogDirConfig

  async detect(ctx: ScanContext): Promise<boolean> {
    for (const root of this.config(ctx).roots) {
      if (await pathExists(root)) return true
    }
    return false
  }

  protected async enumerate(ctx: ScanContext): Promise<SourceRef[]> {
    const cfg = this.config(ctx)
    const maxFileBytes = cfg.maxFileBytes ?? 25 * 1024 * 1024
    const refs: SourceRef[] = []
    for (const root of cfg.roots) {
      if (ctx.signal?.aborted) break
      if (!(await pathExists(root))) continue
      const files = await walk(root, { match: cfg.filePattern, maxDepth: cfg.maxDepth ?? 4 })
      for (const file of files) {
        if (refs.length > 20000) break
        const stat = await safeStat(file)
        if (!stat || stat.size === 0 || stat.size > maxFileBytes) continue
        refs.push({ key: file, fingerprint: `${stat.size}:${stat.mtime.getTime()}` })
      }
    }
    return refs
  }

  protected async parseSource(ctx: ScanContext, ref: SourceRef): Promise<Session[]> {
    const cfg = this.config(ctx)
    const bytesPerToken = cfg.bytesPerToken ?? 12
    const stat = await safeStat(ref.key)
    if (!stat || stat.size === 0) return []

    const tokens = Math.max(1, Math.round(stat.size / bytesPerToken))
    const at = stat.mtime.toISOString()
    // Rough activity estimate from transcript size (capped); these tools don't
    // expose real durations.
    const durationMinutes = Math.min(180, Math.max(1, Math.round(stat.size / 8000)))

    return [
      {
        id: hashId(this.id, ref.key),
        toolId: this.id,
        toolName: this.name,
        projectName: this.deriveProject(ref.key, cfg),
        estimatedTokens: tokens,
        tokenBreakdown: outputOnly(tokens),
        startedAt: at,
        endedAt: at,
        durationMinutes,
        messageCount: 1,
        model: cfg.modelHint ?? null
      }
    ]
  }

  private deriveProject(file: string, cfg: LogDirConfig): string {
    switch (cfg.projectFrom ?? 'parentDir') {
      case 'fixed':
        return cfg.fixedProject ?? this.name.toLowerCase()
      case 'fileName':
        return basename(file).replace(/\.[^.]+$/, '')
      case 'grandparentDir':
        return basename(dirname(dirname(file))) || (cfg.fixedProject ?? 'workspace')
      case 'parentDir':
      default:
        return basename(dirname(file)) || (cfg.fixedProject ?? 'workspace')
    }
  }

  /** Helper: build VS Code-style extension storage roots across known editors. */
  protected vscodeExtensionRoots(ctx: ScanContext, extensionId: string, sub = 'tasks'): string[] {
    const { home } = ctx
    const appSupport = join(home, 'Library', 'Application Support')
    const editors = ['Code', 'Code - Insiders', 'Cursor', 'VSCodium', 'Windsurf']
    const xdg = join(home, '.config')
    const roots: string[] = []
    for (const editor of editors) {
      roots.push(join(appSupport, editor, 'User', 'globalStorage', extensionId, sub))
      roots.push(join(xdg, editor, 'User', 'globalStorage', extensionId, sub))
    }
    return roots
  }
}
