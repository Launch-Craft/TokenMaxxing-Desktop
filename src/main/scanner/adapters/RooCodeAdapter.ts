import { LogDirectoryAdapter, type LogDirConfig } from './LogDirectoryAdapter'
import type { ScanContext } from './ToolAdapter'

/**
 * Roo Code adapter (auto-detected). Roo Code (formerly Roo Cline) is a VS Code /
 * Cursor extension; like Cline it keeps per-task histories in globalStorage.
 */
export class RooCodeAdapter extends LogDirectoryAdapter {
  readonly id = 'roo-code' as const
  readonly name = 'Roo Code'

  protected config(ctx: ScanContext): LogDirConfig {
    const roots = [
      ...this.vscodeExtensionRoots(ctx, 'rooveterinaryinc.roo-cline', 'tasks'),
      ...this.vscodeExtensionRoots(ctx, 'rooveterinaryinc.roo-code', 'tasks')
    ]
    return {
      roots,
      filePattern: /(api_conversation_history|ui_messages)\.json$/i,
      projectFrom: 'grandparentDir',
      maxDepth: 3,
      bytesPerToken: 14,
      modelHint: null
    }
  }
}
