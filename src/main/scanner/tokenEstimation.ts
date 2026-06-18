import type { TokenBreakdown } from '@shared/types'

/**
 * Heuristics for estimating token counts when a tool doesn't record them
 * directly. We deliberately err on the side of transparency: every value an
 * adapter can read *exactly* (e.g. Claude's `usage`) is used as-is; estimates
 * are only applied to tools that lack first-party token accounting.
 */

/** ~4 characters per token is the standard rough approximation for code+English. */
const CHARS_PER_TOKEN = 4
/** Generated lines of code average ~10 tokens/line including surrounding context. */
const TOKENS_PER_AI_LINE = 11

export function estimateTokensFromChars(chars: number): number {
  if (chars <= 0) return 0
  return Math.round(chars / CHARS_PER_TOKEN)
}

export function estimateTokensFromText(text: string): number {
  return estimateTokensFromChars(text.length)
}

export function estimateTokensFromBytes(bytes: number): number {
  // UTF-8 code is ~1 byte/char for ASCII-heavy source.
  return estimateTokensFromChars(bytes)
}

/**
 * Estimate the *total* token spend implied by N lines of accepted AI code.
 * Code suggestion tools (Cursor tab, Cline diffs) only log the output; real
 * spend includes the prompt/context round-trips, hence the multiplier.
 */
export function estimateTokensFromAiLines(lines: number, contextMultiplier = 6): number {
  if (lines <= 0) return 0
  return Math.round(lines * TOKENS_PER_AI_LINE * contextMultiplier)
}

export function emptyBreakdown(): TokenBreakdown {
  return { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, total: 0 }
}

export function addBreakdown(a: TokenBreakdown, b: TokenBreakdown): TokenBreakdown {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheCreate: a.cacheCreate + b.cacheCreate,
    total: a.total + b.total
  }
}

/**
 * Build a breakdown. `total` = the real "tokens used" = input + output ONLY.
 * Both cache categories are excluded: `cacheRead` (context re-read every turn,
 * ~50× real usage) and `cacheCreate` (context written to cache). They remain on
 * the breakdown for display, and the dashboard's "gross" total adds them back.
 */
export function finalizeBreakdown(b: Omit<TokenBreakdown, 'total'>): TokenBreakdown {
  return { ...b, total: b.input + b.output }
}

/** Build a breakdown from a single output-only estimate. */
export function outputOnly(tokens: number): TokenBreakdown {
  return { input: 0, output: tokens, cacheRead: 0, cacheCreate: 0, total: tokens }
}
