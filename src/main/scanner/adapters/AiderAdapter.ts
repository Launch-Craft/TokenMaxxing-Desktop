import { join } from 'node:path'
import { LogDirectoryAdapter, type LogDirConfig } from './LogDirectoryAdapter'
import type { ScanContext } from './ToolAdapter'

/**
 * Aider adapter. Aider stores chat/input history both under `~/.aider` and as
 * `.aider.chat.history.md` in each project. Tokens are estimated from the
 * markdown transcript size.
 */
export class AiderAdapter extends LogDirectoryAdapter {
  readonly id = 'aider' as const
  readonly name = 'Aider'

  protected config(ctx: ScanContext): LogDirConfig {
    return {
      // Aider's home cache dir; per-project `.aider.chat.history.md` files live
      // inside repos and are picked up when that repo sits under ~/.aider.
      roots: [join(ctx.home, '.aider')],
      filePattern: /\.aider\.(chat|input)\.history\.(md|txt)$|\.(md|json|jsonl)$/i,
      projectFrom: 'parentDir',
      bytesPerToken: 8,
      modelHint: null
    }
  }
}
