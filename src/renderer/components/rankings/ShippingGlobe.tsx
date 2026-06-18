import { useEffect, useMemo, useRef, useState } from 'react'
import type { CountryShipping } from '@shared/types'
import { formatCompact } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Dependency-free 3D globe of "shipping origins" — each country is a marker at
 * its centroid, sized + colored by how many tokens are shipped from there. Uses
 * an orthographic projection rotated over time (requestAnimationFrame), so it
 * needs no WebGL and works offline. Hovering a marker shows its metrics;
 * clicking filters the country table. Respects prefers-reduced-motion.
 */

const DEG = Math.PI / 180
const TILT = 18 // tilt the north pole slightly toward the viewer

interface Projected {
  x: number
  y: number
  visible: boolean
  /** cos of angular distance from the projection center (1 = front, −1 = back). */
  depth: number
}

function project(lat: number, lng: number, lon0: number, R: number, c: number): Projected {
  const phi = lat * DEG
  const lambda = (lng - lon0) * DEG
  const phi0 = TILT * DEG
  const cosc = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lambda)
  const x = Math.cos(phi) * Math.sin(lambda)
  const y = Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lambda)
  return { x: c + R * x, y: c - R * y, visible: cosc >= -0.02, depth: cosc }
}

/** Cyan (low) → amber (high) heat ramp. */
function heat(t: number): string {
  const clamped = Math.max(0, Math.min(1, t))
  const h = 190 - 150 * clamped
  return `hsl(${h.toFixed(0)} 88% ${(58 + 8 * clamped).toFixed(0)}%)`
}

function buildGraticule(lon0: number, R: number, c: number): string[] {
  const segs: string[] = []
  const pushSamples = (samples: Projected[]): void => {
    let cur: string[] = []
    for (const p of samples) {
      if (p.visible) cur.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      else {
        if (cur.length > 1) segs.push(cur.join(' '))
        cur = []
      }
    }
    if (cur.length > 1) segs.push(cur.join(' '))
  }
  for (let lng = -150; lng <= 180; lng += 30) {
    const s: Projected[] = []
    for (let lat = -90; lat <= 90; lat += 6) s.push(project(lat, lng, lon0, R, c))
    pushSamples(s)
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const s: Projected[] = []
    for (let lng = -180; lng <= 180; lng += 6) s.push(project(lat, lng, lon0, R, c))
    pushSamples(s)
  }
  return segs
}

interface ShippingGlobeProps {
  countries: CountryShipping[]
  selected?: string | null
  onSelect?: (code: string | null) => void
  size?: number
}

export function ShippingGlobe({
  countries,
  selected,
  onSelect,
  size = 380
}: ShippingGlobeProps): JSX.Element {
  const R = size / 2 - 16
  const c = size / 2
  const [lon0, setLon0] = useState(20)
  const [hovered, setHovered] = useState<string | null>(null)
  const hoveringRef = useRef(false)
  const rafRef = useRef<number | undefined>(undefined)
  const lastRef = useRef(0)

  useEffect(() => {
    const reduced =
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    const loop = (t: number): void => {
      rafRef.current = requestAnimationFrame(loop)
      if (t - lastRef.current < 33) return // ~30fps
      const dt = lastRef.current ? (t - lastRef.current) / 1000 : 0
      lastRef.current = t
      if (!hoveringRef.current) setLon0((v) => (v + dt * 8) % 360) // 8°/sec
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const maxShare = useMemo(
    () => Math.max(1, ...countries.map((x) => x.share)),
    [countries]
  )
  const grat = useMemo(() => buildGraticule(lon0, R, c), [lon0, R, c])
  const markers = useMemo(
    () =>
      countries
        .map((country) => ({ country, p: project(country.lat, country.lng, lon0, R, c) }))
        .sort((a, b) => a.p.depth - b.p.depth), // back-to-front paint order
    [countries, lon0, R, c]
  )

  const active = markers.find((m) => m.country.countryCode === (hovered ?? selected)) ?? null
  const tip = active && active.p.visible ? active : null

  return (
    <div className="relative mx-auto select-none" style={{ width: size, maxWidth: '100%' }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-auto w-full overflow-visible"
        onMouseLeave={() => {
          hoveringRef.current = false
          setHovered(null)
        }}
      >
        <defs>
          <radialGradient id="globe-ocean" cx="38%" cy="32%" r="78%">
            <stop offset="0%" stopColor="hsl(220 24% 20%)" />
            <stop offset="55%" stopColor="hsl(222 28% 12%)" />
            <stop offset="100%" stopColor="hsl(224 32% 6%)" />
          </radialGradient>
          <radialGradient id="globe-glow" cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor="hsl(200 90% 60%)" stopOpacity="0" />
            <stop offset="100%" stopColor="hsl(200 90% 60%)" stopOpacity="0.12" />
          </radialGradient>
        </defs>

        {/* Atmosphere */}
        <circle cx={c} cy={c} r={R + 8} fill="url(#globe-glow)" />
        {/* Sphere */}
        <circle
          cx={c}
          cy={c}
          r={R}
          fill="url(#globe-ocean)"
          stroke="hsl(210 40% 60% / 0.18)"
          strokeWidth={1}
          onClick={() => onSelect?.(null)}
        />

        {/* Graticule */}
        <g fill="none" stroke="hsl(205 50% 70% / 0.10)" strokeWidth={0.7}>
          {grat.map((pts, i) => (
            <polyline key={i} points={pts} />
          ))}
        </g>

        {/* Country markers */}
        {markers.map(({ country, p }) => {
          const t = country.share / maxShare
          const r = 2.4 + 12 * Math.sqrt(t)
          const front = p.depth > 0
          const opacity = p.visible ? (front ? 0.55 + 0.45 * p.depth : 0.12) : 0
          const isSel = country.countryCode === selected
          const color = heat(t)
          if (opacity <= 0) return null
          return (
            <g
              key={country.countryCode}
              transform={`translate(${p.x} ${p.y})`}
              style={{ cursor: front ? 'pointer' : 'default' }}
              opacity={opacity}
              onMouseEnter={() => {
                if (!front) return
                hoveringRef.current = true
                setHovered(country.countryCode)
              }}
              onMouseLeave={() => {
                hoveringRef.current = false
                setHovered((h) => (h === country.countryCode ? null : h))
              }}
              onClick={() => front && onSelect?.(isSel ? null : country.countryCode)}
            >
              {/* glow */}
              <circle r={r * 1.9} fill={color} opacity={0.18} />
              {(isSel || country.isYou) && front && (
                <circle r={r + 4} fill="none" stroke={color} strokeWidth={1.4} opacity={0.9}>
                  <animate
                    attributeName="r"
                    values={`${r + 2};${r + 7};${r + 2}`}
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.9;0.2;0.9"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <circle r={r} fill={color} stroke="hsl(0 0% 100% / 0.65)" strokeWidth={front ? 0.8 : 0} />
            </g>
          )
        })}
      </svg>

      {/* Tooltip */}
      {tip && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-xl border border-white/10 bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
          style={{ left: `${(tip.p.x / size) * 100}%`, top: `${(tip.p.y / size) * 100}%` }}
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <span className="text-sm">{tip.country.flag}</span>
            {tip.country.countryName}
            {tip.country.isYou && (
              <span className="rounded bg-primary/20 px-1 text-[10px] text-primary">You</span>
            )}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
            <span>tokens</span>
            <span className="text-right text-foreground">{formatCompact(tip.country.totalTokens)}</span>
            <span>devs</span>
            <span className="text-right text-foreground">{formatCompact(tip.country.developers)}</span>
            <span>share</span>
            <span className="text-right text-foreground">{tip.country.share.toFixed(1)}%</span>
          </div>
        </div>
      )}

      <p className={cn('mt-3 text-center text-[11px] text-muted-foreground')}>
        Drag-free auto-rotating globe · hover a node for details · click to filter
      </p>
    </div>
  )
}
