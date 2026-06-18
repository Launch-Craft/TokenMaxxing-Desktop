import { useId } from 'react'

interface SparklineProps {
  data: number[]
  color?: string
  width?: number
  height?: number
  className?: string
}

/** Tiny dependency-free area sparkline for stat cards. */
export function Sparkline({
  data,
  color = 'hsl(var(--brand))',
  width = 120,
  height = 36,
  className
}: SparklineProps): JSX.Element {
  const id = useId().replace(/:/g, '')
  if (data.length < 2) {
    return <svg width={width} height={height} className={className} />
  }
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const stepX = width / (data.length - 1)
  const points = data.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * (height - 4) - 2
    return [x, y] as const
  })
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`

  return (
    <svg width={width} height={height} className={className} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
