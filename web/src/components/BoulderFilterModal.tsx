import { useState } from 'react'
import { BadgeIcon } from '@/components/BadgeIcon'
import { DropdownPicker } from '@/components/DropdownPicker'
import { GymMap } from '@/components/GymMap'
import { Modal } from '@/components/Modal'
import { KBC } from '@/constants/theme'
import { DEFAULT_BOULDER_FILTER, type BoulderFilterState } from '@/domain/boulderFilters'
import { BADGE_GROUPS, GRADES, GRADE_COLORS, GRADE_TEXT, LOCATIONS } from '@/services/boulders'

// Ported from mobile@1cdfada/app/(tabs)/boulders.tsx's FilterModal, including its
// GymMap floor-plan picker. The plain chip row is kept below the map rather
// than replaced by it: the map's chips are rotated to sit alongside the walls
// they name, which makes them small targets, and the row is the accessible
// path. Both drive the same filter state.
export function BoulderFilterModal({
  filters,
  onChange,
  onClose,
  setterOptions,
}: {
  filters: BoulderFilterState
  onChange: (f: BoulderFilterState) => void
  onClose: () => void
  setterOptions: { label: string; value: string }[]
}) {
  const [local, setLocal] = useState(filters)
  const [badgesOpen, setBadgesOpen] = useState(false)

  function toggleLoc(loc: string) {
    setLocal((f) => ({ ...f, locations: f.locations.includes(loc) ? f.locations.filter((l) => l !== loc) : [...f.locations, loc] }))
  }
  function toggleGrade(g: number) {
    setLocal((f) => ({ ...f, grades: f.grades.includes(g) ? f.grades.filter((x) => x !== g) : [...f.grades, g] }))
  }
  function toggleBadge(b: string) {
    setLocal((f) => ({ ...f, badges: f.badges.includes(b) ? f.badges.filter((x) => x !== b) : [...f.badges, b] }))
  }
  function apply() {
    onChange(local)
    onClose()
  }
  function clear() {
    setLocal(DEFAULT_BOULDER_FILTER)
    onChange(DEFAULT_BOULDER_FILTER)
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-black">Filter Boulders</h2>
        <button type="button" onClick={onClose} className="text-lg text-neutral-400">
          ✕
        </button>
      </div>

      <div className="max-h-[70svh] space-y-4 overflow-y-auto">
        <CheckRow label="Projects only" sub="Show only boulders you've marked as a project" checked={local.projectsOnly} color={KBC.purple} onToggle={() => setLocal((f) => ({ ...f, projectsOnly: !f.projectsOnly }))} />
        <CheckRow label="Liked only" sub="Show only boulders you've liked" checked={local.likedOnly} color="#0284c7" onToggle={() => setLocal((f) => ({ ...f, likedOnly: !f.likedOnly }))} />
        <CheckRow label="Unsent only" sub="Hide boulders you've already sent" checked={local.unsentOnly} color="#c47c00" onToggle={() => setLocal((f) => ({ ...f, unsentOnly: !f.unsentOnly }))} />

        <div>
          <FieldLabel>Location</FieldLabel>
          <GymMap selected={local.locations} onToggle={toggleLoc} />
          <div className="mt-1.5 flex flex-wrap gap-2">
            {LOCATIONS.map((loc) => {
              const on = local.locations.includes(loc)
              return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => toggleLoc(loc)}
                  className="rounded-full border px-3 py-1.5 text-xs font-bold"
                  style={on ? { background: KBC.cyan, borderColor: KBC.cyan, color: '#fff' } : { borderColor: '#ddd', color: '#555' }}
                >
                  {loc}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <FieldLabel>Grade</FieldLabel>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {GRADES.map((g, i) => {
              const on = local.grades.includes(i)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleGrade(i)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ${on ? 'ring-2 ring-black' : ''}`}
                  style={{ background: GRADE_COLORS[i], color: GRADE_TEXT[i] }}
                >
                  {g}
                  {on && ' ✓'}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <button type="button" onClick={() => setBadgesOpen((o) => !o)} className="flex w-full items-center justify-between">
            <FieldLabel>Badges{local.badges.length > 0 ? ` · ${local.badges.length} active` : ''}</FieldLabel>
            <span className="text-xs text-neutral-400">{badgesOpen ? '▲' : '▼'}</span>
          </button>
          {badgesOpen &&
            BADGE_GROUPS.map((group) => (
              <div key={group.title} className="mt-2">
                <p className="mb-1 text-[11px] font-bold text-neutral-400 uppercase">{group.title}</p>
                <div className="flex flex-wrap gap-1">
                  {group.badges.map((b) => (
                    <BadgeIcon key={b} label={b} selected={local.badges.includes(b)} onPress={() => toggleBadge(b)} size="sm" compact />
                  ))}
                </div>
              </div>
            ))}
        </div>

        <div>
          <FieldLabel>Setter</FieldLabel>
          <div className="mt-1">
            <DropdownPicker
              options={[{ label: 'All setters', value: '' }, ...setterOptions]}
              value={local.setter}
              onChange={(v) => setLocal((f) => ({ ...f, setter: v }))}
              placeholder="All setters"
              accentColor={KBC.lime}
            />
          </div>
        </div>

        <div className="flex gap-2.5 pt-2">
          <button type="button" onClick={apply} className="flex-1 rounded-xl p-3 text-sm font-bold text-white" style={{ background: KBC.black }}>
            Apply Filters
          </button>
          <button type="button" onClick={clear} className="flex-1 rounded-xl border border-neutral-300 p-3 text-sm font-bold text-neutral-600">
            Clear All
          </button>
        </div>
      </div>
    </Modal>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold tracking-wide text-neutral-400 uppercase">{children}</p>
}

function CheckRow({
  label,
  sub,
  checked,
  color,
  onToggle,
}: {
  label: string
  sub: string
  checked: boolean
  color: string
  onToggle: () => void
}) {
  return (
    <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 text-left">
      <span
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border-2"
        style={checked ? { background: color, borderColor: color } : { borderColor: '#ccc' }}
      >
        {checked && <span className="text-xs font-bold text-white">✓</span>}
      </span>
      <span>
        <span className="block text-sm font-bold text-black">{label}</span>
        <span className="block text-xs text-neutral-500">{sub}</span>
      </span>
    </button>
  )
}
