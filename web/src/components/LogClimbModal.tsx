import { useEffect, useState } from 'react'
import { BadgeIcon } from '@/components/BadgeIcon'
import { DropdownPicker } from '@/components/DropdownPicker'
import { EffortBar, effortToNumber } from '@/components/EffortBar'
import { Modal } from '@/components/Modal'
import { KBC } from '@/constants/theme'
import { BADGE_GROUPS } from '@/services/boulders'
import { addClimb, updateClimb, type ClimbLocation, type PersonalClimb } from '@/services/climblog'
import { resizeImageFileToDataUrl } from '@/utils/imageResize'

function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Ported from mobile/app/(tabs)/climblog.tsx's LogClimbModal. Date uses a
// native <input type="date"> instead of mobile's custom DatePickerModal.
export function LogClimbModal({
  onClose,
  onSaved,
  uid,
  userName,
  locations,
  initialLocationId,
  editingClimb,
}: {
  onClose: () => void
  onSaved: (climb: PersonalClimb, isEdit: boolean) => void
  uid: string
  userName: string
  locations: ClimbLocation[]
  initialLocationId: string
  editingClimb?: PersonalClimb | null
}) {
  const isEdit = !!editingClimb
  const defaultLocId = initialLocationId === 'all' ? (locations[0]?.id ?? 'kbc') : initialLocationId

  const [locationId, setLocationId] = useState(editingClimb?.locationId ?? defaultLocId)
  const [sectorIdx, setSectorIdx] = useState(0)
  const [logDate, setLogDate] = useState(() => toDateInputValue(editingClimb ? new Date(editingClimb.timestamp) : new Date()))
  const [climbName, setClimbName] = useState(editingClimb?.name ?? '')
  const [establishedGrade, setEstablishedGrade] = useState(editingClimb?.establishedGrade ?? '')
  const [type, setType] = useState<'ascent' | 'attempt'>(editingClimb?.type ?? 'ascent')
  const [quality, setQuality] = useState(editingClimb?.quality ?? 0)
  const [effort, setEffort] = useState<number | null>(editingClimb ? effortToNumber(editingClimb.effort) : 50)
  const [attempts, setAttempts] = useState(editingClimb?.attempts ? String(editingClimb.attempts) : '1')
  const [project, setProject] = useState(editingClimb?.project ?? false)
  const [badges, setBadges] = useState<string[]>(editingClimb?.badges ?? [])
  const [badgesOpen, setBadgesOpen] = useState(false)
  const [comment, setComment] = useState(editingClimb?.comment ?? '')
  const [photo, setPhoto] = useState(editingClimb?.photo ?? '')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (editingClimb) {
      const editLoc = editingClimb.locationId !== 'kbc' ? locations.find((l) => l.id === editingClimb.locationId) : null
      const sIdx = editLoc ? editLoc.sectors.findIndex((s) => s.name === editingClimb.sectorId) : -1
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSectorIdx(sIdx >= 0 ? sIdx : 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingClimb?.id])

  const activeLoc = locationId === 'kbc' ? null : (locations.find((l) => l.id === locationId) ?? null)
  const sectors = activeLoc?.sectors ?? []
  const sector = sectors[sectorIdx] ?? null
  const showBadges = locationId === 'kbc' || (activeLoc?.useBadges ?? false)

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoBusy(true)
    try {
      setPhoto(await resizeImageFileToDataUrl(file))
    } catch {
      setError('Could not process the image. Please try a different one.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleSave() {
    setError(null)
    if (!climbName.trim()) return setError('Please enter a climb name')
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const timestamp = editingClimb ? new Date(editingClimb.timestamp) : new Date()
      const [y, m, d] = logDate.split('-').map(Number)
      timestamp.setFullYear(y, m - 1, d)

      const payload = {
        uid,
        userName,
        locationId,
        boulderId: editingClimb?.boulderId ?? '',
        sectorId: sector?.name ?? (editingClimb?.sectorId ?? ''),
        timestamp: timestamp.toISOString(),
        name: climbName.trim(),
        establishedGrade: locationId === 'kbc' ? '' : establishedGrade,
        personalGrade: editingClimb?.personalGrade ?? '',
        gradeVote: editingClimb?.gradeVote ?? null,
        problemInternalId: editingClimb?.problemInternalId ?? '',
        quality,
        effort: effort ?? '',
        attempts: Math.min(99, Math.max(1, parseInt(attempts || '1', 10) || 1)),
        type,
        project,
        badges,
        comment: comment.trim(),
        photo,
        createdAt: editingClimb?.createdAt ?? now,
      }

      let saved: PersonalClimb
      if (isEdit && editingClimb) {
        await updateClimb(editingClimb.id, payload)
        saved = { ...editingClimb, ...payload }
      } else {
        saved = await addClimb(payload)
      }
      onSaved(saved, isEdit)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const locOptions = [{ id: 'kbc', label: 'KBC Gym' }, ...locations.map((l) => ({ id: l.id, label: l.name }))]

  return (
    <Modal onClose={onClose}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-black">{isEdit ? 'Edit Climb' : 'Log Climb'}</h2>
        <button type="button" onClick={onClose} className="text-lg text-neutral-400">
          ✕
        </button>
      </div>

      <div className="max-h-[75svh] space-y-3 overflow-y-auto">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType('ascent')}
            className="flex-1 rounded-xl border p-3 text-sm font-bold"
            style={type === 'ascent' ? { background: KBC.green, borderColor: KBC.green, color: '#fff' } : { borderColor: '#ddd', color: '#666' }}
          >
            ✓ Sent
          </button>
          <button
            type="button"
            onClick={() => setType('attempt')}
            className="flex-1 rounded-xl border p-3 text-sm font-bold"
            style={type === 'attempt' ? { background: KBC.orange, borderColor: KBC.orange, color: '#fff' } : { borderColor: '#ddd', color: '#666' }}
          >
            △ Attempted
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-600">Number of attempts:</span>
          <input
            className="kbc-input w-16"
            value={attempts}
            onChange={(e) => {
              const n = e.target.value.replace(/[^0-9]/g, '')
              if (n === '' || (parseInt(n, 10) >= 1 && parseInt(n, 10) <= 99)) setAttempts(n)
            }}
            inputMode="numeric"
            maxLength={2}
          />
        </div>

        <Field label="Location">
          <DropdownPicker
            options={locOptions.map((o) => ({ label: o.label, value: o.id }))}
            value={locationId}
            onChange={(id) => {
              setLocationId(id)
              setSectorIdx(0)
            }}
            placeholder="Select location…"
            accentColor={KBC.cyan}
          />
        </Field>

        {sectors.length > 0 && (
          <Field label="Area">
            <DropdownPicker
              options={sectors.map((s, i) => ({ label: s.name || `Sector ${i + 1}`, value: String(i) }))}
              value={String(sectorIdx)}
              onChange={(v) => setSectorIdx(Number(v))}
              placeholder="Select area…"
              accentColor={KBC.cyan}
            />
          </Field>
        )}

        <Field label="Date">
          <input type="date" className="kbc-input" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
        </Field>

        <Field label="Climb Name">
          <input className="kbc-input" value={climbName} onChange={(e) => setClimbName(e.target.value)} placeholder="Name or description" />
        </Field>

        {locationId !== 'kbc' && (
          <Field label="Established Grade">
            <input className="kbc-input" value={establishedGrade} onChange={(e) => setEstablishedGrade(e.target.value)} placeholder="Grade as set by the route setter" />
          </Field>
        )}

        <Field label="Quality">
          <div className="flex gap-1.5">
            {[1, 2, 3].map((i) => (
              <button key={i} type="button" onClick={() => setQuality(quality === i ? 0 : i)} style={{ fontSize: 26, color: i <= quality ? '#fbbf24' : '#ddd', lineHeight: 1 }}>
                ★
              </button>
            ))}
          </div>
        </Field>

        <Field label="Effort">
          <EffortBar value={effort} onChange={setEffort} />
        </Field>

        <label className="flex items-start gap-3">
          <input type="checkbox" checked={project} onChange={(e) => setProject(e.target.checked)} className="mt-0.5 size-5" style={{ accentColor: KBC.pink }} />
          <span>
            <span className="block text-sm font-bold text-black">Project</span>
            <span className="block text-xs text-neutral-500">Still working on it</span>
          </span>
        </label>

        {showBadges && (
          <div>
            <button type="button" onClick={() => setBadgesOpen((o) => !o)} className="flex w-full items-center justify-between">
              <p className="text-[11px] font-bold tracking-wide text-neutral-400 uppercase">Badges{badges.length > 0 ? ` (${badges.length} selected)` : ''}</p>
              <span className="text-xs font-semibold" style={{ color: KBC.pink }}>
                {badgesOpen ? '▲ Collapse' : '▼ Expand'}
              </span>
            </button>
            {badgesOpen &&
              BADGE_GROUPS.map((group) => (
                <div key={group.title} className="mt-2">
                  <p className="mb-1 text-[11px] font-bold text-neutral-400 uppercase">{group.title}</p>
                  <div className="flex flex-wrap gap-1">
                    {group.badges.map((badge) => {
                      const on = badges.includes(badge)
                      return (
                        <BadgeIcon
                          key={badge}
                          label={badge}
                          selected={on}
                          size="sm"
                          compact
                          onPress={() => setBadges((prev) => (on ? prev.filter((b) => b !== badge) : [...prev, badge]))}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}

        <Field label="Notes">
          <textarea className="kbc-input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Personal notes about this climb…" rows={2} />
        </Field>

        <Field label="Photo">
          {photo ? (
            <div className="space-y-2">
              <img src={photo} alt="" className="max-h-48 w-full rounded-lg object-cover" />
              <button type="button" onClick={() => setPhoto('')} className="text-sm font-bold text-red-600">
                Remove Photo
              </button>
            </div>
          ) : (
            <label className="block w-full cursor-pointer rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm font-bold text-neutral-500">
              {photoBusy ? 'Processing…' : '📷 Add Photo'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => void handlePhotoChange(e)} disabled={photoBusy} />
            </label>
          )}
        </Field>

        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full rounded-xl p-3 text-sm font-bold text-white disabled:opacity-60"
          style={{ background: KBC.black }}
        >
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Log Climb'}
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
