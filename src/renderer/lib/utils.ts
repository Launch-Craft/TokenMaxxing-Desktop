import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind class names with conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function hsl(cssVar: string, alpha = 1): string {
  return alpha === 1 ? `hsl(var(${cssVar}))` : `hsl(var(${cssVar}) / ${alpha})`
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Mix a color toward transparency by percentage (0–100). */
export function tint(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}
