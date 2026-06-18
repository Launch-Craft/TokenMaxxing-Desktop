import { createReadStream } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import type { Session } from '@shared/types'
import { ToolAdapter, type ScanContext, type SourceRef } from './ToolAdapter'
import { hashId, pathExists, safeReaddir, safeStat } from '../aggregate'
import { finalizeBreakdown } from '../tokenEstimation'

/**
 * Claude Code adapter.
 *
 * Reads `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`. Each line is a
 * JSON event; assistant events carry an exact `message.usage` block, so token
 * counts here are REAL, not estimated. We only ever read usage numbers,
 * timestamps, model ids and the project's folder name — never message content.
 */
export class ClaudeAdapter extends ToolAdapter {
  readonly id = 'claude-code' as const
  readonly name = 'Claude Code'

  private projectsDir(ctx: ScanContext): string {
    return join(ctx.home, '.claude', 'projects')
  }

  async detect(ctx: ScanContext): Promise<boolean> {
    return pathExists(this.projectsDir(ctx))
  }

  protected async enumerate(ctx: ScanContext): Promise<SourceRef[]> {
    const root = this.projectsDir(ctx)
    const refs: SourceRef[] = []
    for (const projectDir of await safeReaddir(root)) {
      const dirPath = join(root, projectDir)
      for (const file of await safeReaddir(dirPath)) {
        if (!file.endsWith('.jsonl')) continue
        const filePath = join(dirPath, file)
        const stat = await safeStat(filePath)
        // Skip empty / pathologically large files.
        if (!stat || stat.size === 0 || stat.size > 200 * 1024 * 1024) continue
        refs.push({ key: filePath, fingerprint: `${stat.size}:${stat.mtime.getTime()}` })
      }
    }
    return refs
  }

  protected async parseSource(_ctx: ScanContext, ref: SourceRef): Promise<Session[]> {
    const filePath = ref.key
    const session = await this.parseSessionFile(
      filePath,
      basename(dirname(filePath)),
      basename(filePath)
    )
    return session ? [session] : []
  }

  private async parseSessionFile(
    filePath: string,
    projectDir: string,
    fileName: string
  ): Promise<Session | null> {
    let input = 0
    let output = 0
    let cacheRead = 0
    let cacheCreate = 0
    let messageCount = 0
    let firstTs: number | null = null
    let lastTs: number | null = null
    let model: string | null = null
    let cwd: string | null = null

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

        const ts = typeof obj.timestamp === 'string' ? Date.parse(obj.timestamp) : NaN
        if (!Number.isNaN(ts)) {
          firstTs = firstTs === null ? ts : Math.min(firstTs, ts)
          lastTs = lastTs === null ? ts : Math.max(lastTs, ts)
        }
        if (!cwd && typeof obj.cwd === 'string') cwd = obj.cwd

        const type = obj.type
        if (type === 'user' || type === 'assistant') messageCount++

        if (type === 'assistant') {
          const message = obj.message as
            | { usage?: Record<string, number>; model?: string }
            | undefined
          const usage = message?.usage
          if (usage) {
            input += Number(usage.input_tokens) || 0
            output += Number(usage.output_tokens) || 0
            cacheRead += Number(usage.cache_read_input_tokens) || 0
            cacheCreate += Number(usage.cache_creation_input_tokens) || 0
          }
          if (!model && typeof message?.model === 'string') model = message.model
        }
      }
    } catch {
      return null
    }

    const breakdown = finalizeBreakdown({ input, output, cacheRead, cacheCreate })
    if (breakdown.total === 0 || firstTs === null || lastTs === null) return null

    const projectName = cwd ? basename(cwd) : this.decodeProjectDir(projectDir)
    const durationMinutes = Math.max(1, Math.round((lastTs - firstTs) / 60_000))

    return {
      id: hashId(this.id, fileName, firstTs),
      toolId: this.id,
      toolName: this.name,
      projectName,
      estimatedTokens: breakdown.total,
      tokenBreakdown: breakdown,
      startedAt: new Date(firstTs).toISOString(),
      endedAt: new Date(lastTs).toISOString(),
      durationMinutes,
      messageCount,
      model
    }
  }

  /** Decode `-Users-name-Work-foo` → `foo` as a fallback project label. */
  private decodeProjectDir(dir: string): string {
    const segments = dir.split('-').filter(Boolean)
    return segments[segments.length - 1] ?? 'unknown'
  }
}
