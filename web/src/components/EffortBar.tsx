import { useRef } from 'react'

// Ported from mobile/components/effort-bar.tsx.

type Props = {
  value: number | null // 0–100; null = not set
  onChange: (v: number | null) => void
  interactive?: boolean
}

const TRACK_HEIGHT = 22

// Convert legacy string efforts to a 0-100 value for display
// eslint-disable-next-line react-refresh/only-export-components -- shared helper, colocated with the component that uses it
export function effortToNumber(effort: string | number | null | undefined): number | null {
  if (effort === null || effort === undefined || effort === '') return null
  if (typeof effort === 'number') return effort
  const map: Record<string, number> = { Easy: 0, Medium: 33, Hard: 67, Impossible: 100 }
  return map[effort] ?? null
}

// eslint-disable-next-line react-refresh/only-export-components -- shared helper, colocated with the component that uses it
export function effortLabel(effort: string | number | null | undefined): string {
  const n = effortToNumber(effort)
  if (n === null) return ''
  if (n <= 16) return 'Easy'
  if (n <= 50) return 'Medium'
  if (n <= 83) return 'Hard'
  return 'Max'
}

export function EffortBar({ value, onChange, interactive = true }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)

  function clamp(x: number) {
    return Math.max(0, Math.min(100, x))
  }

  function positionFromClientX(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return clamp(((clientX - rect.left) / rect.width) * 100)
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!interactive) return
    e.currentTarget.setPointerCapture(e.pointerId)
    onChange(positionFromClientX(e.clientX))
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!interactive || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    onChange(positionFromClientX(e.clientX))
  }

  const pct = value ?? -1
  const hasValue = value !== null && value !== undefined

  const segments = Array.from({ length: 100 }, (_, i) => {
    const r = Math.round(50 + (i / 99) * 180)
    const g = Math.round(200 - (i / 99) * 150)
    return `rgb(${r},${g},80)`
  })

  return (
    <div className="my-0.5 flex flex-col gap-1">
      <div className="flex justify-between">
        <span className="text-[11px] font-bold text-[#2ecc71]">Easy</span>
        <span className="text-[11px] font-bold text-neutral-400">Neutral</span>
        <span className="text-[11px] font-bold text-[#e74c3c]">Hard</span>
      </div>

      <div className="relative">
        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          className={`flex overflow-hidden rounded-full ${interactive ? 'cursor-pointer touch-none' : ''}`}
          style={{ height: TRACK_HEIGHT }}
        >
          {segments.map((color, i) => (
            <div key={i} className="flex-1" style={{ background: color }} />
          ))}
        </div>

        {hasValue && (
          <div className="pointer-events-none absolute inset-0 flex" style={{ top: -2, bottom: -2 }}>
            <div style={{ flex: Math.max(pct, 0) }} />
            <div className="w-1 rounded-sm bg-[#FFE600] shadow" />
            <div style={{ flex: Math.max(100 - pct, 0) }} />
          </div>
        )}
      </div>

      {hasValue && <p className="mt-0.5 text-center text-[13px] font-bold text-neutral-700">{effortLabel(value)}</p>}
      {!hasValue && interactive && <p className="mt-0.5 text-center text-xs text-neutral-300">Tap bar to set effort</p>}
    </div>
  )
}
