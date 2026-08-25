import { Modal } from '@/components/Modal'
import { KBC } from '@/constants/theme'
import type { ClimbLocation } from '@/services/climblog'

// Ported from mobile@1cdfada/app/(tabs)/climblog.tsx's LocationPickerSheet.
export function LocationPickerSheet({
  onClose,
  locationId,
  onSelect,
  locations,
  onNewLocation,
}: {
  onClose: () => void
  locationId: string
  onSelect: (id: string) => void
  locations: ClimbLocation[]
  onNewLocation: () => void
}) {
  const options = [
    { id: 'all', label: 'All Locations', sub: 'Show climbs from everywhere' },
    { id: 'kbc', label: 'KBC Gym', sub: 'Kingston Boulder Cooperative' },
    ...locations.map((l) => ({ id: l.id, label: l.name, sub: l.type === 'indoor' ? '🏛 Indoor' : '🏔 Outdoor' })),
  ]

  return (
    <Modal onClose={onClose}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-bold text-black">Select Location</h2>
        <button type="button" onClick={onClose} className="text-lg text-neutral-400">
          ✕
        </button>
      </div>

      <div className="max-h-[50svh] overflow-y-auto">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => {
              onSelect(o.id)
              onClose()
            }}
            className="flex w-full flex-col items-start border-b border-neutral-100 py-3 text-left last:border-0"
          >
            <span className="text-[15px] font-semibold" style={o.id === locationId ? { color: KBC.cyan } : { color: '#111' }}>
              {o.label}
            </span>
            {o.sub && <span className="text-xs text-neutral-400">{o.sub}</span>}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            onClose()
            onNewLocation()
          }}
          className="w-full py-3 text-left text-sm font-bold"
          style={{ color: KBC.cyan }}
        >
          ＋ Create New Location
        </button>
      </div>
    </Modal>
  )
}
