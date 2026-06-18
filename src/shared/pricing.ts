import type { TokenBreakdown } from './types'

/**
 * Public list prices (USD per 1,000,000 tokens) for the models we detect. These
 * are the standard published rates; they're kept in one editable table so they
 * can be refreshed easily (and, in future, hydrated from a remote pricing.json).
 *
 * Cache pricing matters a LOT here: Claude's `cache_read` tokens dominate real
 * usage but cost ~10× less than fresh input, so a naive flat rate would wildly
 * over-state spend. We price each token category separately.
 *
 * Last reviewed: 2026-06 (estimates — verify against provider pricing pages).
 */
export interface ModelPrice {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface ModelPriceEntry {
  id: string
  label: string
  match: RegExp
  price: ModelPrice
}

export const MODEL_PRICING: ModelPriceEntry[] = [
  {
    id: 'claude-opus',
    label: 'Claude Opus',
    match: /opus/i,
    price: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 }
  },
  {
    id: 'claude-sonnet',
    label: 'Claude Sonnet',
    match: /sonnet/i,
    price: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }
  },
  {
    id: 'claude-haiku',
    label: 'Claude Haiku',
    match: /haiku/i,
    price: { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 }
  },
  {
    id: 'gpt-codex',
    label: 'GPT-5 / Codex',
    match: /gpt-5|codex|gpt-4\.1|^o[1-9]/i,
    price: { input: 1.25, output: 10, cacheWrite: 1.25, cacheRead: 0.125 }
  },
  {
    id: 'gemini',
    label: 'Gemini',
    match: /gemini/i,
    price: { input: 1.25, output: 10, cacheWrite: 1.625, cacheRead: 0.31 }
  }
]

/** Blended fallback (Sonnet-class) for unknown/estimated models. */
export const DEFAULT_PRICE: ModelPrice = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }
export const DEFAULT_LABEL = 'Other / estimated'

export function priceForModel(model: string | null | undefined): {
  id: string
  label: string
  price: ModelPrice
} {
  if (model) {
    for (const entry of MODEL_PRICING) {
      if (entry.match.test(model)) return { id: entry.id, label: entry.label, price: entry.price }
    }
  }
  return { id: 'default', label: DEFAULT_LABEL, price: DEFAULT_PRICE }
}

/**
 * Cost in USD for a token breakdown. Priced on real usage only (input + output),
 * consistent with the "tokens used" model in `finalizeBreakdown` — both cache
 * categories are excluded so spend reflects actual conversation tokens.
 */
export function costForBreakdown(b: TokenBreakdown, model: string | null | undefined): number {
  const { price } = priceForModel(model)
  return (b.input * price.input + b.output * price.output) / 1_000_000
}
