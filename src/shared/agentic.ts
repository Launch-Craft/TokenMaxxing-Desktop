/**
 * Shared helpers for classifying agentic tool calls — used by BOTH the scanner
 * adapters (which count tool calls during parsing) and the MetricsService
 * (which aggregates them). Keep runtime/Node/DOM free so it bundles into either
 * target. Only tool NAMES are ever inspected here — never call arguments.
 */
import type { AgenticStats, ToolCallCategory } from './types'

/** Tool names that spawn a subagent. Covers old (`Task`) and new (`Agent`) CC. */
export const AGENT_TOOL_NAMES: ReadonlySet<string> = new Set(['Agent', 'Task'])

/** Tool names that launch a multi-agent workflow. */
export const WORKFLOW_TOOL_NAMES: ReadonlySet<string> = new Set(['Workflow'])

export function isAgentTool(name: string): boolean {
  return AGENT_TOOL_NAMES.has(name)
}

export function isWorkflowTool(name: string): boolean {
  return WORKFLOW_TOOL_NAMES.has(name)
}

/** Coarse bucket for a tool name, used to group/filter the usage breakdown. */
export function classifyToolCategory(name: string): ToolCallCategory {
  if (isAgentTool(name) || isWorkflowTool(name)) return 'agent'
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return 'file'
    case 'Bash':
    case 'BashOutput':
    case 'KillShell':
      return 'shell'
    case 'Grep':
    case 'Glob':
    case 'WebSearch':
    case 'WebFetch':
    case 'ToolSearch':
      return 'search'
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TaskGet':
    case 'TaskList':
      return 'task'
    default:
      return 'other'
  }
}

/** A zeroed {@link AgenticStats} accumulator. */
export function emptyAgentic(): AgenticStats {
  return {
    toolCalls: 0,
    toolResults: 0,
    toolErrors: 0,
    agentsSpawned: 0,
    workflows: 0,
    byTool: {}
  }
}

/** True when the stats carry any signal worth persisting/displaying. */
export function hasAgenticSignal(a: AgenticStats): boolean {
  return a.toolCalls > 0 || a.toolResults > 0
}
