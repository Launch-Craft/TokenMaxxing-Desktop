import type { ToolId } from '@shared/types'
import { ToolAdapter } from './ToolAdapter'
import { ClaudeAdapter } from './ClaudeAdapter'
import { CursorAdapter } from './CursorAdapter'
import { CodexAdapter } from './CodexAdapter'
import { AiderAdapter } from './AiderAdapter'
import { GeminiAdapter } from './GeminiAdapter'
import { ClineAdapter } from './ClineAdapter'
import { RooCodeAdapter } from './RooCodeAdapter'

/**
 * Central registry of every tool adapter. To support a new AI tool, implement a
 * {@link ToolAdapter} (or extend {@link LogDirectoryAdapter}) and add it here —
 * the scanner, dashboard, rankings and achievements pick it up automatically.
 */
export function createAdapters(): ToolAdapter[] {
  return [
    new ClaudeAdapter(),
    new CursorAdapter(),
    new CodexAdapter(),
    new GeminiAdapter(),
    new AiderAdapter(),
    new RooCodeAdapter(),
    new ClineAdapter()
  ]
}

export function getAdapterMap(): Map<ToolId, ToolAdapter> {
  const map = new Map<ToolId, ToolAdapter>()
  for (const a of createAdapters()) map.set(a.id, a)
  return map
}

export { ToolAdapter } from './ToolAdapter'
export type { ScanContext, AdapterScanResult } from './ToolAdapter'
