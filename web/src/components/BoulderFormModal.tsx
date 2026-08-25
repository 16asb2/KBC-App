import { useState } from 'react'
import { BadgeIcon } from '@/components/BadgeIcon'
import { DropdownPicker } from '@/components/DropdownPicker'
import { GradeBar } from '@/components/GradeBar'
import { GymMap } from '@/components/GymMap'
import { Modal } from '@/components/Modal'
import { KBC } from '@/constants/theme'
import { resizeImageFileToDataUrl } from '@/utils/imageResize'
import {
  BADGE_GROUPS,
  GRADES,
  GRADE_COLORS,
  GRADE_TEXT,
  LOCATIONS,
  createBoulder,
  removeBoulder,
  updateBoulder,
  type Boulder,
} from '@/services/boulders'

export type BoulderFormMode = { type: 'add'; seasonId: string; nextNumber: number } | { type: 'edit'; boulder: Boulder }

// Ported from mobile@1cdfada/app/(tabs)/boulders.tsx's BoulderFormModal. Location
// uses the same plain checkbox list as BoulderFilterModal instead of
// mobile's visual GymMap. Photo picker uses a file input + canvas resize
// (utils/imageResize.ts) instead of expo-image-picker/expo-image-manipulator
// — same target format (base64 JPEG data URI, width 1080, quality 0.7).
export function BoulderFormModal({
  mode,
  onClose,
  onSaved,
  userUid,
  defaultSetter,
  canRemove,
  tapeColorPool,
  onAddTapeColor,
  existingNumbers,
}: {
  mode: BoulderFormMode
  onClose: () => void
  onSaved: (updated?: Boulder) => void
  userUid: string
  defaultSetter: string
  canRemove: boolean
  tapeColorPool: string[]
  onAddTapeColor: (color: string) => void
  existingNumbers: number[]
}) {
  const isEdit = mode.type === 'edit'
  const b = isEdit ? mode.boulder : null

  const [name, setName] = useState(b?.name ?? '')
  const [boulderNumber, setBoulderNumber] = useState(String(isEdit ? (b?.number ?? 1) : (mode as { type: 'add'; nextNumber: number }).nextNumber))
  const [tapeColor, setTapeColor] = useState(b?.tapeColor ?? '')
  const [newTapeColorText, setNewTapeColorText] = useState('')
  const [setter, setSetter] = useState(b?.setter ?? defaultSetter)
  const [locations, setLocations] = useState<string[]>(b?.locations ?? [])
  const [photo, setPhoto] = useState(b?.photo ?? '')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [gradeIdx, setGradeIdx] = useState<number | null>(b?.setterGradeVote ?? null)
  const [selectedBadges, setSelectedBadges] = useState<string[]>(b?.setterBadges ?? [])
  const [localGradeVotes, setLocalGradeVotes] = useState<Record<string, number>>(b?.gradeVotes ?? {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleLocation(loc: string) {
    setLocations((prev) => (prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc]))
  }

  async function handleDeleteVote(isSetterVote: boolean, voteUid?: string) {
    if (!b || !canRemove) return
    if (!window.confirm('Remove this grade vote?')) return
    try {
      if (isSetterVote) {
        await updateBoulder(b.id, { setterGradeVote: null })
        setGradeIdx(null)
      } else if (voteUid) {
        const updated = { ...localGradeVotes }
        delete updated[voteUid]
        await updateBoulder(b.id, { gradeVotes: updated })
        setLocalGradeVotes(updated)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

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
    if (!tapeColor.trim()) return setError('Please select or add a tape color.')
    const parsedNumber = parseInt(boulderNumber, 10)
    if (!boulderNumber.trim() || isNaN(parsedNumber) || parsedNumber < 1) return setError('Please enter a valid boulder number.')
    const isDuplicate = existingNumbers.some((n) => n === parsedNumber && (!isEdit || n !== b?.number))
    if (isDuplicate) return setError(`Boulder #${parsedNumber} already exists this season. Choose a different number.`)

    setSaving(true)
    try {
      const now = new Date().toISOString()
      if (isEdit && b) {
        await updateBoulder(b.id, { name, number: parsedNumber, tapeColor, setter, locations, photo, setterGradeVote: gradeIdx, setterBadges: selectedBadges, updatedAt: now })
        onSaved({ ...b, name, number: parsedNumber, tapeColor, setter, locations, photo, setterGradeVote: gradeIdx ?? null, setterBadges: selectedBadges, gradeVotes: localGradeVotes, updatedAt: now })
      } else if (mode.type === 'add') {
        await createBoulder({
          seasonId: mode.seasonId,
          number: parsedNumber,
          name,
          tapeColor,
          setter,
          setterEmail: '',
          createdByUid: userUid,
          createdAt: now,
          updatedAt: now,
          locations,
          photo,
          removed: false,
          likes: [],
          setterGradeVote: gradeIdx,
          setterBadges: selectedBadges,
          gradeVotes: {},
          qualityVotes: {},
        })
        onSaved()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!isEdit || !b) return
    if (!window.confirm(`Remove boulder #${b.number}? This cannot be undone.`)) return
    setSaving(true)
    try {
      await removeBoulder(b.id)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const title = isEdit ? `Boulder #${b?.number ?? ''}` : 'Add Boulder'

  const voteRows = (() => {
    type VoteRow = { label: string; grade: number; isSetterVote: boolean; uid?: string }
    const rows: VoteRow[] = []
    if (gradeIdx !== null && gradeIdx !== undefined) rows.push({ label: 'Setter (initial)', grade: gradeIdx, isSetterVote: true })
    for (const [voteUid, grade] of Object.entries(localGradeVotes)) {
      rows.push({ label: voteUid === userUid ? 'You' : `Member …${voteUid.slice(-6)}`, grade, isSetterVote: false, uid: voteUid })
    }
    return rows
  })()

  return (
    <Modal onClose={onClose}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-black">{title}</h2>
        <button type="button" onClick={onClose} className="text-lg text-neutral-400">
          ✕
        </button>
      </div>

      <div className="max-h-[75svh] space-y-3 overflow-y-auto">
        <Field label="Boulder Number">
          <input className="kbc-input" value={boulderNumber} onChange={(e) => setBoulderNumber(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="e.g. 42" />
        </Field>

        <Field label="Name (optional)">
          <input className="kbc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Crimper" />
        </Field>

        <Field label="Tape Color *">
          <DropdownPicker
            options={[{ label: 'Select tape color…', value: '' }, ...tapeColorPool.map((c) => ({ label: c, value: c }))]}
            value={tapeColor}
            onChange={setTapeColor}
            placeholder="Select tape color…"
            accentColor={KBC.lime}
          />
          <div className="mt-2 flex gap-2">
            <input className="kbc-input flex-1" value={newTapeColorText} onChange={(e) => setNewTapeColorText(e.target.value)} placeholder="Add new color…" />
            <button
              type="button"
              onClick={() => {
                const c = newTapeColorText.trim()
                if (!c) return
                onAddTapeColor(c)
                setTapeColor(c)
                setNewTapeColorText('')
              }}
              className="shrink-0 rounded-xl px-4 text-sm font-bold text-white"
              style={{ background: KBC.black }}
            >
              Add
            </button>
          </div>
        </Field>

        <Field label="Setter (optional)">
          <input className="kbc-input" value={setter} onChange={(e) => setSetter(e.target.value)} placeholder="Leave blank for Unknown setter" />
        </Field>

        <Field label="Location">
          <GymMap selected={locations} onToggle={toggleLocation} />
          <div className="flex flex-wrap gap-2">
            {LOCATIONS.map((loc) => {
              const on = locations.includes(loc)
              return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => toggleLocation(loc)}
                  className="rounded-full border px-3 py-1.5 text-xs font-bold"
                  style={on ? { background: KBC.cyan, borderColor: KBC.cyan, color: '#fff' } : { borderColor: '#ddd', color: '#555' }}
                >
                  {loc}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="Setter Grade">
          <GradeBar votes={gradeIdx !== null ? { [userUid]: gradeIdx } : {}} userUid={userUid} onVote={(g) => setGradeIdx(g < 0 ? null : g)} interactive />
        </Field>

        {isEdit && voteRows.length > 0 && (
          <Field label={`Grade Votes (${voteRows.length})`}>
            <div className="overflow-hidden rounded-lg border border-neutral-100">
              {voteRows.map((row, i) => {
                const idx = Math.round(Math.max(0, Math.min(4, row.grade)))
                return (
                  <div key={i} className={`flex items-center gap-2.5 px-3 py-2 ${i % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}`}>
                    <span className="flex-1 text-sm text-neutral-600">{row.label}</span>
                    <span className="rounded px-2.5 py-0.5 text-xs font-bold" style={{ background: GRADE_COLORS[idx], color: GRADE_TEXT[idx] }}>
                      {GRADES[idx]}
                    </span>
                    {canRemove && (
                      <button type="button" onClick={() => void handleDeleteVote(row.isSetterVote, row.uid)} className="font-bold text-red-500">
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </Field>
        )}

        <Field label="Photo (optional)">
          {photo ? (
            <div className="space-y-2">
              <img src={photo} alt="" className="max-h-48 w-full rounded-lg object-contain" />
              <button type="button" onClick={() => setPhoto('')} className="text-sm font-bold text-red-600">
                ✕ Remove
              </button>
            </div>
          ) : (
            <label className="block w-full cursor-pointer rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm font-bold text-neutral-500">
              {photoBusy ? 'Processing…' : '📷 Choose Photo'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => void handlePhotoChange(e)} disabled={photoBusy} />
            </label>
          )}
        </Field>

        <Field label={`Setter Badges${selectedBadges.length > 0 ? ` · ${selectedBadges.length} selected` : ''}`}>
          {BADGE_GROUPS.map((group) => (
            <div key={group.title} className="mt-2 first:mt-0">
              <p className="mb-1 text-[11px] font-bold text-neutral-400 uppercase">{group.title}</p>
              <div className="flex flex-wrap gap-1">
                {group.badges.map((badge) => {
                  const on = selectedBadges.includes(badge)
                  return (
                    <BadgeIcon
                      key={badge}
                      label={badge}
                      count={0}
                      selected={on}
                      size="sm"
                      compact
                      onPress={() => setSelectedBadges((prev) => (on ? prev.filter((x) => x !== badge) : [...prev, badge]))}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </Field>

        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full rounded-xl p-3 text-sm font-bold text-white disabled:opacity-60"
          style={{ background: KBC.black }}
        >
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Boulder'}
        </button>

        {isEdit && canRemove && (
          <button type="button" onClick={() => void handleRemove()} disabled={saving} className="w-full rounded-xl border border-red-200 p-3 text-sm font-bold text-red-600">
            Remove Boulder
          </button>
        )}
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
