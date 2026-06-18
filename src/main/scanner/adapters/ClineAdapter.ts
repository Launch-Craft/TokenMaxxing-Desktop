import { LogDirectoryAdapter, type LogDirConfig } from './LogDirectoryAdapter'
import type { ScanContext } from './ToolAdapter'

/**
 * Cline adapter (auto-detected). Cline is a VS Code / Cursor extension that
 * stores per-task conversation history under the editor's globalStorage. We read
 * the task transcript sizes to estimate token spend — never their content.
 */
export class ClineAdapter extends LogDirectoryAdapter {
  readonly id = 'cline' as const
  readonly name = 'Cline'

  protected config(ctx: ScanContext): LogDirConfig {
    return {
      roots: this.vscodeExtensionRoots(ctx, 'saoudrizwan.claude-dev', 'tasks'),
      filePattern: /(api_conversation_history|ui_messages)\.json$/i,
      projectFrom: 'grandparentDir',
      maxDepth: 3,
      bytesPerToken: 14,
      modelHint: null
    }
  }
}
