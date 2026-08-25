import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { KBC } from '@/constants/theme'
import { createLocation, gradeSystemsForDiscipline, type ClimbDiscipline, type ClimbLocation, type GradeSystem, type Sector } from '@/services/climblog'

const DISCIPLINE_LABELS: Record<ClimbDiscipline, string> = { boulder: 'Boulder', 'top-rope': 'Top-Rope', lead: 'Lead', trad: 'Trad' }
const GRADE_SYSTEM_LABELS: Record<GradeSystem, string> = { kbc: 'KBC', 'v-scale': 'V-Scale', font: 'Font', yosemite: 'Yosemite' }

// Ported from mobile@1cdfada/app/(tabs)/climblog.tsx's NewLocationModal.
export function NewLocationModal({ onClose, onCreated, uid }: { onClose: () => void; onCreated: (loc: ClimbLocation) => void; uid: string }) {
  const [name, setName] = useState('')
  const [locType, setLocType] = useState<'indoor' | 'outdoor'>('outdoor')
  const [useBadges, setUseBadges] = useState(false)
  const [address, setAddress] = useState('')
  const [gps, setGps] = useState('')
  const [sectors, setSectors] = useState<Sector[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addSector() {
    setSectors((prev) => [...prev, { name: '', discipline: 'boulder', gradeSystem: 'v-scale' }])
  }
  function removeSector(i: number) {
    setSectors((prev) => prev.filter((_, idx) => idx !== i))
  }
  function updateSector(i: number, patch: Partial<Sector>) {
    setSectors((prev) =>
      prev.map((s, idx) => {
        if (idx !== i) return s
        const updated = { ...s, ...patch }
        if (patch.discipline) {
          const systems = gradeSystemsForDiscipline(patch.discipline)
          if (!systems.includes(updated.gradeSystem)) updated.gradeSystem = systems[0]
        }
        return updated
      }),
    )
  }

  async function handleSave() {
    if (!name.trim()) return setError('Name required')
    setError(null)
    setSaving(true)
    try {
      const loc = await createLocation({
        uid,
        name: name.trim(),
        type: locType,
        sectors,
        address: address.trim(),
        gps: gps.trim(),
        useBadges,
        createdAt: new Date().toISOString(),
      })
      onCreated(loc)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-black">New Location</h2>
        <button type="button" onClick={onClose} className="text-lg text-neutral-400">
          ✕
        </button>
      </div>

      <div className="max-h-[75svh] space-y-3 overflow-y-auto">
        <Field label="Location Name">
          <input className="kbc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Local Crag, Home Wall…" />
        </Field>

        <Field label="Type">
          <div className="flex gap-2">
            {(['outdoor', 'indoor'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setLocType(t)}
                className="flex-1 rounded-xl border p-2.5 text-sm font-bold"
                style={locType === t ? { background: KBC.cyan, borderColor: KBC.cyan, color: '#fff' } : { borderColor: '#ddd', color: '#666' }}
              >
                {t === 'outdoor' ? '🏔 Outdoor' : '🏛 Indoor'}
              </button>
            ))}
          </div>
        </Field>

        <label className="flex items-start gap-3">
          <input type="checkbox" checked={useBadges} onChange={(e) => setUseBadges(e.target.checked)} className="mt-0.5 size-5" style={{ accentColor: KBC.pink }} />
          <span>
            <span className="block text-sm font-bold text-black">Use Climbing Badges</span>
            <span className="block text-xs text-neutral-500">Enable KBC-style hold type &amp; technique badges</span>
          </span>
        </label>

        <Field label="Sectors">
          <div className="space-y-3">
            {sectors.map((s, i) => (
              <div key={i} className="space-y-1.5 rounded-lg bg-neutral-50 p-2.5">
                <input
                  className="kbc-input"
                  value={s.name}
                  onChange={(e) => updateSector(i, { name: e.target.value })}
                  placeholder={`Sector ${i + 1} name`}
                />
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(DISCIPLINE_LABELS) as ClimbDiscipline[]).map((d) => (
                    <Chip key={d} active={s.discipline === d} onClick={() => updateSector(i, { discipline: d })}>
                      {DISCIPLINE_LABELS[d]}
                    </Chip>
                  ))}
                </div>
                {s.discipline === 'boulder' ? (
                  <div className="flex gap-1.5">
                    {(['v-scale', 'font'] as GradeSystem[]).map((gs) => (
                      <Chip key={gs} active={s.gradeSystem === gs} onClick={() => updateSector(i, { gradeSystem: gs })}>
                        {GRADE_SYSTEM_LABELS[gs]}
                      </Chip>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-400 italic">Yosemite (YDS) scale</p>
                )}
                <button type="button" onClick={() => removeSector(i)} className="text-xs font-semibold text-red-500">
                  Remove sector
                </button>
              </div>
            ))}
            <button type="button" onClick={addSector} className="w-full rounded-lg border border-dashed border-neutral-300 p-2 text-sm font-bold text-neutral-500">
              ＋ Add Sector
            </button>
          </div>
        </Field>

        <Field label="Address (optional)">
          <input className="kbc-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street address or area description" />
        </Field>

        <Field label="GPS Coordinates (optional)">
          <input className="kbc-input" value={gps} onChange={(e) => setGps(e.target.value)} placeholder="e.g. 44.2312, -76.4819" />
        </Field>

        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full rounded-xl p-3 text-sm font-bold text-white disabled:opacity-60"
          style={{ background: KBC.black }}
        >
          {saving ? 'Saving…' : 'Create Location'}
        </button>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-bold tracking-wide text-neutral-400 uppercase">{label}</p>
      {children}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-2.5 py-1 text-xs font-bold"
      style={active ? { background: KBC.cyan, borderColor: KBC.cyan, color: '#fff' } : { borderColor: '#ddd', color: '#666' }}
    >
      {children}
    </button>
  )
}
