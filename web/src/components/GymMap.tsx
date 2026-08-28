import { LOCATIONS, type Location } from '@/services/boulders'

// Ported from the GymMap in mobile@1cdfada/app/(tabs)/boulders.tsx — a floor plan of
// the gym where each wall is a selectable chip, used to pick locations instead
// of reading a list of names. Proportions come from the KBC floor sketch;
// H/W ≈ 0.62.
//
// mobile measured the window and multiplied every fraction by it, because React
// Native has no percentage positioning. CSS does, so the fractions are used
// directly as percentages and the map scales with its container — no
// measurement, no resize listener, no re-render on rotate.

type WallSpec = {
  id: Location
  color: string
  /** Wall shape, as fractions of the map's width and height. */
  sx: number
  sy: number
  sw: number
  sh: number
  srot: number
  /**
   * Label chip position (fractions again) and its rotation, chosen so the chip
   * runs parallel to the wall it names: ±90 for vertical walls, 0 for
   * horizontal, and perpendicular to the angle for the diagonal cave wall.
   */
  lx: number
  ly: number
  lrot: number
}

const GYM_WALLS: WallSpec[] = [
  // Thin yellow vertical bar — chip runs vertically alongside, just inside the floor
  { id: 'Yellow Wall', color: '#b8a800', sx: 0.012, sy: 0.028, sw: 0.021, sh: 0.54, srot: 0, lx: -0.015, ly: 0.335, lrot: -90 },
  // Wide cyan horizontal bar — chip centred below the bar
  { id: 'Blue Wall', color: '#0095bb', sx: 0.033, sy: 0.028, sw: 0.352, sh: 0.107, srot: 0, lx: 0.124, ly: 0.099, lrot: 0 },
  // Thin green vertical bar, extending behind Cave Left
  { id: 'Green Wall', color: '#2ea829', sx: 0.38, sy: 0.028, sw: 0.019, sh: 0.68, srot: 0, lx: 0.23, ly: 0.334, lrot: -90 },
  // Diagonal cave wall — chip perpendicular to it (-84° is 90° off the +6° wall)
  { id: 'Cave Left', color: '#8b1a1a', sx: 0.396, sy: 0.158, sw: 0.028, sh: 0.545, srot: 6, lx: 0.383, ly: 0.417, lrot: -84 },
  // Wide horizontal cave ceiling
  { id: 'Cave Middle', color: '#8b1a1a', sx: 0.432, sy: 0.158, sw: 0.552, sh: 0.107, srot: 0, lx: 0.595, ly: 0.23, lrot: 0 },
  // Thin right wall of the cave
  { id: 'Cave Right', color: '#8b1a1a', sx: 0.975, sy: 0.158, sw: 0.021, sh: 0.676, srot: 0, lx: 0.833, ly: 0.505, lrot: 90 },
]

// Fixed features of the floor, drawn for orientation only.
const LANDMARKS = [
  { label: 'Tension Board 2', x: 0.012, y: 0.62, w: 0.068, h: 0.355, vertical: true },
  { label: 'Garage Door', x: 0.38, y: 0.876, w: 0.438, h: 0.096, vertical: false },
  { label: 'Door', x: 0.831, y: 0.876, w: 0.143, h: 0.096, vertical: false },
]

const pct = (f: number) => `${f * 100}%`

export function GymMap({
  selected,
  onToggle,
}: {
  selected: readonly string[]
  /**
   * Omit to render the map read-only — the walls are still highlighted, but
   * nothing is pressable. That is how a boulder's page shows where it is
   * without offering to move it.
   */
  onToggle?: (loc: Location) => void
}) {
  const interactive = !!onToggle
  return (
    <div
      // 0.62 is the floor plan's height-to-width ratio; max-width keeps the
      // chips legible instead of ballooning on a desktop screen.
      className="relative mx-auto mb-1 w-full max-w-md rounded-[10px] bg-neutral-100"
      style={{ aspectRatio: '1 / 0.62' }}
      role="group"
      aria-label="Gym wall map"
    >
      {LANDMARKS.map((l) => (
        <div
          key={l.label}
          className="absolute flex items-center justify-center overflow-hidden rounded-sm border-[1.5px] border-neutral-600 bg-white"
          style={{ left: pct(l.x), top: pct(l.y), width: pct(l.w), height: pct(l.h) }}
        >
          <span
            className="text-[7px] font-bold whitespace-nowrap text-neutral-600"
            style={l.vertical ? { transform: 'rotate(-90deg)' } : undefined}
          >
            {l.label}
          </span>
        </div>
      ))}

      {/* Wall shapes are decoration — the chips below are what you press. */}
      {GYM_WALLS.map((w) => (
        <div
          key={`shape-${w.id}`}
          aria-hidden
          className="absolute rounded-sm"
          style={{
            left: pct(w.sx),
            top: pct(w.sy),
            width: pct(w.sw),
            height: pct(w.sh),
            backgroundColor: w.color,
            transform: w.srot ? `rotate(${w.srot}deg)` : undefined,
          }}
        />
      ))}

      {GYM_WALLS.map((w) => {
        const on = selected.includes(w.id)
        // Read-only walls are spans, not disabled buttons: there is nothing to
        // press, so they should not be in the tab order or announced as
        // controls. Unhighlighted ones fade back so the marked walls read at a
        // glance instead of competing with five other labels.
        const Chip = interactive ? 'button' : 'span'
        return (
          <Chip
            key={`chip-${w.id}`}
            {...(interactive
              ? { type: 'button' as const, onClick: () => onToggle(w.id), 'aria-pressed': on }
              : { 'aria-hidden': true })}
            className="absolute rounded-md border-[1.5px] px-2 py-[5px] text-[11px] font-extrabold tracking-[0.2px] whitespace-nowrap"
            style={{
              left: pct(w.lx),
              top: pct(w.ly),
              borderColor: w.color,
              backgroundColor: on ? w.color : 'rgba(255,255,255,0.95)',
              color: on ? '#fff' : w.color,
              transform: w.lrot ? `rotate(${w.lrot}deg)` : undefined,
              opacity: interactive || on ? 1 : 0.45,
            }}
          >
            {w.id}
          </Chip>
        )
      })}

      <span className="sr-only">
        {interactive
          ? `Select one or more walls. Currently selected: ${selected.length > 0 ? selected.join(', ') : 'none'}.`
          : `On ${selected.length > 0 ? selected.join(', ') : 'no marked wall'}.`}
      </span>
    </div>
  )
}

// The map is drawn from its own spec, so a wall added to services/boulders.ts
// without a matching entry here would silently never appear. Not exported —
// this file exports a component, and a second export kind would break fast
// refresh.
if (import.meta.env.DEV) {
  const drawn = GYM_WALLS.map((w) => w.id)
  const missing = LOCATIONS.filter((l) => !drawn.includes(l))
  if (missing.length > 0) {
    console.warn(`[GymMap] No wall drawn for: ${missing.join(', ')}. Add a WallSpec in GymMap.tsx.`)
  }
}
