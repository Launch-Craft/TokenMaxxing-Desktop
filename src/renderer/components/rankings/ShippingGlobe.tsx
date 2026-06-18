import { useEffect, useMemo, useRef, useState } from 'react'
import { geoOrthographic, geoPath, geoGraticule, geoDistance } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import worldAtlas from 'world-atlas/countries-110m.json'
import type { CountryShipping } from '@shared/types'
import { formatCompact } from '@/lib/format'

/**
 * 3D globe of "shipping origins" rendered with a real world map (d3-geo
 * orthographic + Natural Earth 110m land/borders). Auto-rotates and can be
 * dragged to spin/tilt. Each country with activity gets a marker sized + colored
 * by tokens shipped. Hover for metrics; click to filter. Respects reduced-motion.
 */

// Precompute the land + borders geometry once (module scope).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOPO = worldAtlas as any
const LAND = feature(TOPO, TOPO.objects.countries)
const BORDERS = mesh(TOPO, TOPO.objects.countries, (a: unknown, b: unknown) => a !== b)
const GRATICULE = geoGraticule().step([30, 30])()

/** Cyan (low) → amber (high) heat ramp for the markers. */
function heat(t: number): string {
  const clamped = Math.max(0, Math.min(1, t))
  const h = 190 - 150 * clamped
  return `hsl(${h.toFixed(0)} 88% ${(58 + 8 * clamped).toFixed(0)}%)`
}

interface ShippingGlobeProps {
  countries: CountryShipping[]
  selected?: string | null
  onSelect?: (code: string | null) => void
  size?: number
}

const clampTilt = (v: number): number => Math.max(-85, Math.min(85, v))

export function ShippingGlobe({
  countries,
  selected,
  onSelect,
  size = 380
}: ShippingGlobeProps): JSX.Element {
  const R = size / 2 - 16
  const c = size / 2
  const [lon0, setLon0] = useState(20)
  const [tilt, setTilt] = useState(18)
  const [hovered, setHovered] = useState<string | null>(null)
  const [grabbing, setGrabbing] = useState(false)

  const hoveringRef = useRef(false)
  const draggingRef = useRef(false)
  const downRef = useRef<{ x: number; y: number; lon0: number; tilt: number; id: number } | null>(null)
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
      if (!hoveringRef.current && !draggingRef.current && !downRef.current) {
        setLon0((v) => (v + dt * 8) % 360)
      }
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Orthographic projection rotated by the current drag/auto-rotate state.
  const projection = useMemo(
    () =>
      geoOrthographic()
        .scale(R)
        .translate([c, c])
        .rotate([-lon0, -tilt])
        .clipAngle(90),
    [lon0, tilt, R, c]
  )
  const pathGen = useMemo(() => geoPath(projection), [projection])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const landPath = pathGen(LAND as any) ?? undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bordersPath = pathGen(BORDERS as any) ?? undefined
  const gratPath = pathGen(GRATICULE) ?? undefined

  const maxShare = useMemo(() => Math.max(1, ...countries.map((x) => x.share)), [countries])
  const center: [number, number] = [lon0, tilt]
  const markers = useMemo(() => {
    return countries
      .map((country) => {
        const xy = projection([country.lng, country.lat])
        const dist = geoDistance([country.lng, country.lat], center)
        return xy ? { country, x: xy[0], y: xy[1], dist } : null
      })
      .filter((m): m is { country: CountryShipping; x: number; y: number; dist: number } => m !== null)
      .sort((a, b) => b.dist - a.dist) // back-to-front
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries, lon0, tilt, R, c])

  const active = markers.find((m) => m.country.countryCode === (hovered ?? selected)) ?? null

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>): void {
    downRef.current = { x: e.clientX, y: e.clientY, lon0, tilt, id: e.pointerId }
    draggingRef.current = false
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>): void {
    const d = downRef.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!draggingRef.current && Math.hypot(dx, dy) > 4) {
      draggingRef.current = true
      setGrabbing(true)
      try {
        e.currentTarget.setPointerCapture(d.id)
      } catch {
        /* ignore */
      }
    }
    if (draggingRef.current) {
      setLon0(d.lon0 - dx * 0.4)
      setTilt(clampTilt(d.tilt - dy * 0.3))
    }
  }
  function endDrag(e: React.PointerEvent<SVGSVGElement>): void {
    const d = downRef.current
    if (d && draggingRef.current) {
      try {
        e.currentTarget.releasePointerCapture(d.id)
      } catch {
        /* ignore */
      }
    }
    downRef.current = null
    draggingRef.current = false
    setGrabbing(false)
  }

  return (
    <div className="relative mx-auto select-none" style={{ width: size, maxWidth: '100%' }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-auto w-full touch-none overflow-visible"
        style={{ cursor: grabbing ? 'grabbing' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onMouseLeave={() => {
          hoveringRef.current = false
          setHovered(null)
        }}
      >
        <defs>
          <radialGradient id="globe-ocean" cx="38%" cy="32%" r="78%">
            <stop offset="0%" stopColor="hsl(214 32% 17%)" />
            <stop offset="60%" stopColor="hsl(218 34% 11%)" />
            <stop offset="100%" stopColor="hsl(222 38% 6%)" />
          </radialGradient>
          <radialGradient id="globe-glow" cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor="hsl(190 90% 60%)" stopOpacity="0" />
            <stop offset="100%" stopColor="hsl(190 90% 60%)" stopOpacity="0.14" />
          </radialGradient>
        </defs>

        {/* Atmosphere */}
        <circle cx={c} cy={c} r={R + 8} fill="url(#globe-glow)" />
        {/* Ocean sphere */}
        <circle
          cx={c}
          cy={c}
          r={R}
          fill="url(#globe-ocean)"
          stroke="hsl(200 40% 60% / 0.18)"
          strokeWidth={1}
          onClick={() => !draggingRef.current && onSelect?.(null)}
        />

        {/* Graticule (over ocean, under land) */}
        {gratPath && <path d={gratPath} fill="none" stroke="hsl(205 50% 70% / 0.08)" strokeWidth={0.6} />}
        {/* Land */}
        {landPath && (
          <path
            d={landPath}
            fill="hsl(200 18% 30%)"
            stroke="hsl(200 25% 46% / 0.5)"
            strokeWidth={0.5}
            style={{ pointerEvents: 'none' }}
          />
        )}
        {/* Country borders */}
        {bordersPath && (
          <path
            d={bordersPath}
            fill="none"
            stroke="hsl(210 20% 12% / 0.7)"
            strokeWidth={0.4}
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Shipping markers (front hemisphere only) */}
        {markers.map(({ country, x, y, dist }) => {
          const t = country.share / maxShare
          const r = 2.4 + 12 * Math.sqrt(t)
          const color = heat(t)
          const isSel = country.countryCode === selected
          const opacity = 0.55 + 0.45 * (1 - dist / (Math.PI / 2))
          return (
            <g
              key={country.countryCode}
              transform={`translate(${x} ${y})`}
              opacity={opacity}
              onMouseEnter={() => {
                if (draggingRef.current) return
                hoveringRef.current = true
                setHovered(country.countryCode)
              }}
              onMouseLeave={() => {
                hoveringRef.current = false
                setHovered((h) => (h === country.countryCode ? null : h))
              }}
              onClick={() => !draggingRef.current && onSelect?.(isSel ? null : country.countryCode)}
            >
              <circle r={r * 1.9} fill={color} opacity={0.2} />
              {(isSel || country.isYou) && (
                <circle r={r + 4} fill="none" stroke={color} strokeWidth={1.4} opacity={0.9}>
                  <animate attributeName="r" values={`${r + 2};${r + 7};${r + 2}`} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0.2;0.9" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle r={r} fill={color} stroke="hsl(0 0% 100% / 0.7)" strokeWidth={0.8} />
            </g>
          )
        })}
      </svg>

      {/* Tooltip */}
      {active && !grabbing && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-xl border border-white/10 bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
          style={{ left: `${(active.x / size) * 100}%`, top: `${(active.y / size) * 100}%` }}
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <span className="text-sm">{active.country.flag}</span>
            {active.country.countryName}
            {active.country.isYou && (
              <span className="rounded bg-primary/20 px-1 text-[10px] text-primary">You</span>
            )}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
            <span>tokens</span>
            <span className="text-right text-foreground">{formatCompact(active.country.totalTokens)}</span>
            <span>devs</span>
            <span className="text-right text-foreground">{formatCompact(active.country.developers)}</span>
            <span>share</span>
            <span className="text-right text-foreground">{active.country.share.toFixed(1)}%</span>
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Drag to spin &amp; tilt · hover a node for details · click to filter
      </p>
    </div>
  )
}
