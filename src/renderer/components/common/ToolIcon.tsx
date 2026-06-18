import { useId } from 'react'
import type { ToolId } from '@shared/types'
import { TOOL_META } from '@shared/constants'
import { Icon } from './Icon'

/**
 * Recognizable brand-style marks for each AI tool (in their signature colors).
 * These are original simplified renditions for identification — for production,
 * swap in each vendor's official brand asset per their trademark guidelines.
 * Tools without a well-known mark fall back to a neutral lucide glyph.
 */
export function ToolIcon({ toolId, className }: { toolId: ToolId; className?: string }): JSX.Element {
  const id = useId().replace(/:/g, '')

  switch (toolId) {
    // Anthropic / Claude — radial sunburst, terracotta.
    case 'claude-code':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <rect
              key={i}
              x="11.1"
              y="2.2"
              width="1.8"
              height="7"
              rx="0.9"
              fill="#D97757"
              transform={`rotate(${i * 30} 12 12)`}
            />
          ))}
        </svg>
      )

    // Cursor — angular cursor mark, monochrome silver.
    case 'cursor':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M5 3 L20 11.4 L12.7 13.1 L10.6 20.8 Z"
            fill="#E4E4E7"
            stroke="#ffffff"
            strokeOpacity="0.25"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />
        </svg>
      )

    // OpenAI / Codex — six-fold interlocking knot.
    case 'codex':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <ellipse
              key={i}
              cx="12"
              cy="12"
              rx="3.5"
              ry="8.3"
              transform={`rotate(${i * 60} 12 12)`}
              stroke="#ECECEC"
              strokeWidth="1.25"
            />
          ))}
        </svg>
      )

    // Google Gemini — four-point spark, blue→violet→pink gradient.
    case 'gemini-cli':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <defs>
            <linearGradient id={`gm${id}`} x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#4796E3" />
              <stop offset="0.5" stopColor="#9168C0" />
              <stop offset="1" stopColor="#BC5A94" />
            </linearGradient>
          </defs>
          <path
            d="M12 1.5 C12 7.3 16.7 12 22.5 12 C16.7 12 12 16.7 12 22.5 C12 16.7 7.3 12 1.5 12 C7.3 12 12 7.3 12 1.5 Z"
            fill={`url(#gm${id})`}
          />
        </svg>
      )

    default:
      return <Icon name={TOOL_META[toolId].icon} className={className} />
  }
}
