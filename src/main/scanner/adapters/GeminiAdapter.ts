import { join } from 'node:path'
import { LogDirectoryAdapter, type LogDirConfig } from './LogDirectoryAdapter'
import type { ScanContext } from './ToolAdapter'

/**
 * Gemini CLI adapter (auto-detected). Scans `~/.gemini` for session logs and
 * temp transcripts. Tokens estimated from log size.
 */
export class GeminiAdapter extends LogDirectoryAdapter {
  readonly id = 'gemini-cli' as const
  readonly name = 'Gemini CLI'

  protected config(ctx: ScanContext): LogDirConfig {
    const base = join(ctx.home, '.gemini')
    return {
      roots: [join(base, 'tmp'), join(base, 'logs'), base],
      filePattern: /\.(json|jsonl|log)$/i,
      projectFrom: 'parentDir',
      bytesPerToken: 12,
      modelHint: 'gemini'
    }
  }
}
