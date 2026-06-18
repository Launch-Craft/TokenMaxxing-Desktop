import { createReadStream } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import type { Session } from '@shared/types'
import { ToolAdapter, type ScanContext, type SourceRef } from './ToolAdapter'
import { hashId, normalizeEpochMs, pathExists, safeStat, walk } from '../aggregate'
import { estimateTokensFromBytes, finalizeBreakdown } from '../tokenEstimation'

interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheCreate: number
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/**
 * Codex CLI adapter.
 *
 * Reads `~/.codex` session/rollout JSONL files. Codex's format varies across
 * versions, so we tolerantly extract token `usage` from each line (OpenAI-style
 * `prompt_tokens`/`completion_tokens`, Anthropic-style `input_tokens`/…, or a
 * cumulative `total_tokens`). When no usage is recorded we fall back to a
 * byte-size estimate so the tool still shows up. Only counts are read.
 */
export class CodexAdapter extends ToolAdapter {
  readonly id = 'codex' as const
  readonly name = 'Codex'

  private root(ctx: ScanContext): string {
    return join(ctx.home, '.codex')
  }

  async detect(ctx: ScanContext): Promise<boolean> {
    return pathExists(this.root(ctx))
  }

  protected async enumerate(ctx: ScanContext): Promise<SourceRef[]> {
    const files = await walk(this.root(ctx), { match: /\.(jsonl|json)$/i, maxDepth: 6 })
    const refs: SourceRef[] = []
    for (const file of files) {
      // Skip obvious non-session config blobs.
      if (/config\.json$|\.lock$/i.test(file)) continue
      const stat = await safeStat(file)
      if (!stat || stat.size === 0 || stat.size > 200 * 1024 * 1024) continue
      refs.push({ key: file, fingerprint: `${stat.size}:${stat.mtime.getTime()}` })
    }
    return refs
  }

  protected async parseSource(_ctx: ScanContext, ref: SourceRef): Promise<Session[]> {
    const filePath = ref.key
    const stat = await safeStat(filePath)
    if (!stat) return []

    let input = 0
    let output = 0
    let cacheRead = 0
    let cacheCreate = 0
    let cumulativeTotal = 0
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

        const ts = this.timestampOf(obj)
        if (ts !== null) {
          firstTs = firstTs === null ? ts : Math.min(firstTs, ts)
          lastTs = lastTs === null ? ts : Math.max(lastTs, ts)
        }
        if (!cwd) cwd = this.stringField(obj, 'cwd')
        if (!model) model = this.modelOf(obj)
        if (this.isMessage(obj)) messageCount++

        const usage = this.extractUsage(obj)
        if (usage) {
          input += usage.input
          output += usage.output
          cacheRead += usage.cacheRead
          cacheCreate += usage.cacheCreate
        }
        const total = this.totalOf(obj)
        if (total > cumulativeTotal) cumulativeTotal = total
      }
    } catch {
      return []
    }

    let breakdown = finalizeBreakdown({ input, output, cacheRead, cacheCreate })
    if (breakdown.total === 0) {
      // No per-call usage: use a cumulative total if present, else byte estimate.
      const estimated = cumulativeTotal > 0 ? cumulativeTotal : estimateTokensFromBytes(stat.size / 10)
      breakdown = finalizeBreakdown({ input: 0, output: estimated, cacheRead: 0, cacheCreate: 0 })
    }
    if (breakdown.total === 0) return []

    const start = firstTs ?? stat.mtime.getTime()
    const end = lastTs ?? stat.mtime.getTime()
    const projectName = cwd ? basename(cwd) : basename(dirname(filePath)) || 'codex'

    return [
      {
        id: hashId(this.id, filePath, start),
        toolId: this.id,
        toolName: this.name,
        projectName,
        estimatedTokens: breakdown.total,
        tokenBreakdown: breakdown,
        startedAt: new Date(start).toISOString(),
        endedAt: new Date(end).toISOString(),
        durationMinutes: Math.max(1, Math.round((end - start) / 60_000)),
        messageCount: messageCount || 1,
        model
      }
    ]
  }

  /** Pull a usage block (per-call counts) from any of the known shapes. */
  private extractUsage(obj: Record<string, unknown>): Usage | null {
    const candidates = [
      obj.usage,
      (obj.message as Record<string, unknown> | undefined)?.usage,
      (obj.response as Record<string, unknown> | undefined)?.usage,
      obj.token_usage,
      obj.tokenUsage,
      (obj.info as Record<string, unknown> | undefined)?.last_token_usage
    ]
    for (const c of candidates) {
      if (!c || typeof c !== 'object') continue
      const u = c as Record<string, unknown>
      const input = num(u.input_tokens) || num(u.prompt_tokens) || num(u.inputTokens)
      const output = num(u.output_tokens) || num(u.completion_tokens) || num(u.outputTokens)
      const cacheRead = num(u.cache_read_input_tokens) || num(u.cached_tokens) || num(u.cacheReadTokens)
      const cacheCreate = num(u.cache_creation_input_tokens) || num(u.cacheCreationTokens)
      if (input || output || cacheRead || cacheCreate) {
        return { input, output, cacheRead, cacheCreate }
      }
    }
    return null
  }

  /** Cumulative total, if the format reports one (used only when no per-call usage). */
  private totalOf(obj: Record<string, unknown>): number {
    const sources = [
      obj.usage,
      (obj.info as Record<string, unknown> | undefined)?.total_token_usage,
      obj.token_usage
    ]
    for (const s of sources) {
      if (s && typeof s === 'object') {
        const t = num((s as Record<string, unknown>).total_tokens) || num((s as Record<string, unknown>).total)
        if (t > 0) return t
      }
    }
    return 0
  }

  private timestampOf(obj: Record<string, unknown>): number | null {
    for (const key of ['timestamp', 'ts', 'created_at', 'time']) {
      const v = obj[key]
      if (typeof v === 'string') {
        const t = Date.parse(v)
        if (!Number.isNaN(t)) return t
      }
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) return normalizeEpochMs(v)
    }
    return null
  }

  private modelOf(obj: Record<string, unknown>): string | null {
    return (
      this.stringField(obj, 'model') ??
      this.stringField((obj.message as Record<string, unknown>) ?? {}, 'model') ??
      this.stringField((obj.payload as Record<string, unknown>) ?? {}, 'model')
    )
  }

  private isMessage(obj: Record<string, unknown>): boolean {
    const t = obj.type ?? obj.role
    return t === 'message' || t === 'user' || t === 'assistant' || t === 'response'
  }

  private stringField(obj: Record<string, unknown>, key: string): string | null {
    const v = obj[key]
    return typeof v === 'string' && v.length > 0 ? v : null
  }
}
