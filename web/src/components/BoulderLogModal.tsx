import { useState } from 'react'
import { BadgeIcon } from '@/components/BadgeIcon'
import { EffortBar } from '@/components/EffortBar'
import { Modal } from '@/components/Modal'
import { KBC } from '@/constants/theme'
import { addComment, avgGrade, BADGE_GROUPS, type Boulder } from '@/services/boulders'
import { addClimb, KBC_GRADE_LABELS, type PersonalClimb } from '@/services/climblog'

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Ported from mobile/app/(tabs)/boulders.tsx's BoulderLogModal. Date+time use
// a native <input type="datetime-local"> instead of mobile's custom
// DatePickerModal/TimePickerModal sheets.
export function BoulderLogModal({
  boulder,
  onClose,
  onSaved,
  userUid,
  userName,
}: {
  boulder: Boulder
  onClose: () => void
  onSaved: (newLog: PersonalClimb) => void
  userUid: string
  userName: string
}) {
  const initialGradeIdx = (() => {
    const allVotes: Record<string, number> = { ...boulder.gradeVotes }
    if (boulder.setterGradeVote !== null && boulder.setterGradeVote !== undefined) allVotes['__setter'] = boulder.setterGradeVote
    const avg = avgGrade(allVotes)
    return avg !== null ? Math.round(Math.max(0, Math.min(4, avg))) : -1
  })()

  const [logDate, setLogDate] = useState(() => toLocalInputValue(new Date()))
  const [type, setType] = useState<'ascent' | 'attempt'>('ascent')
  const [selectedBadges, setSelectedBadges] = useState<string[]>([])
  const [badgesOpen, setBadgesOpen] = useState(false)
  const [effort, setEffort] = useState<number | null>(50)
  const [project, setProject] = useState(false)
  const [attempts, setAttempts] = useState('1')
  const [publicComment, setPublicComment] = useState('')
  const [privateComment, setPrivateComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const ts = new Date(logDate).toISOString()

      const allVotes: Record<string, number> = { ...boulder.gradeVotes }
      if (boulder.setterGradeVote !== null && boulder.setterGradeVote !== undefined) allVotes['__setter'] = boulder.setterGradeVote
      const communityAvg = avgGrade(allVotes)
      const establishedGrade = communityAvg !== null ? KBC_GRADE_LABELS[Math.round(Math.max(0, Math.min(4, communityAvg)))] : ''
      const personalGrade = initialGradeIdx >= 0 ? KBC_GRADE_LABELS[initialGradeIdx] : ''

      const entry = await addClimb({
        uid: userUid,
        userName,
        locationId: 'kbc',
        boulderId: boulder.id,
        sectorId: '',
        timestamp: ts,
        name: boulder.name || `Boulder #${boulder.number}`,
        establishedGrade,
        personalGrade,
        gradeVote: initialGradeIdx >= 0 ? initialGradeIdx : null,
        problemInternalId: boulder.internalId,
        quality: 0,
        effort: effort ?? '',
        type,
        project,
        attempts: Math.min(99, Math.max(1, parseInt(attempts || '1', 10) || 1)),
        badges: selectedBadges,
        comment: privateComment,
        createdAt: now,
      })

      if (publicComment.trim()) {
        await addComment(boulder.id, { uid: userUid, name: userName, text: publicComment.trim(), createdAt: now })
      }

      onSaved(entry)
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
        <div>
          <h2 className="text-base font-bold text-black">Log Climb</h2>
          <p className="mt-0.5 text-xs text-neutral-400">{boulder.name || `Boulder #${boulder.number}`}</p>
        </div>
        <button type="button" onClick={onClose} className="text-lg text-neutral-400">
          ✕
        </button>
      </div>

      <div className="max-h-[70svh] space-y-3 overflow-y-auto">
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

        <Field label="When">
          <input type="datetime-local" className="kbc-input" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
        </Field>

        <Field label="Effort">
          <EffortBar value={effort} onChange={setEffort} />
        </Field>

        <div>
          <button type="button" onClick={() => setBadgesOpen((o) => !o)} className="flex w-full items-center justify-between">
            <FieldLabel>Badges{selectedBadges.length > 0 ? ` · ${selectedBadges.length} selected` : ''}</FieldLabel>
            <span className="text-xs text-neutral-400">{badgesOpen ? '▲' : '▼'}</span>
          </button>
          {badgesOpen &&
            BADGE_GROUPS.map((group) => (
              <div key={group.title} className="mt-2">
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
                        onPress={() => setSelectedBadges((prev) => (on ? prev.filter((b) => b !== badge) : [...prev, badge]))}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
        </div>

        <label className="flex items-start gap-3">
          <input type="checkbox" checked={project} onChange={(e) => setProject(e.target.checked)} className="mt-0.5 size-5" style={{ accentColor: KBC.pink }} />
          <span>
            <span className="block text-sm font-bold text-black">Project</span>
            <span className="block text-xs text-neutral-500">Still working on it — save for your logbook</span>
          </span>
        </label>

        <Field label="Public Comment">
          <textarea className="kbc-input" value={publicComment} onChange={(e) => setPublicComment(e.target.value)} placeholder="Share your thoughts… posted to the boulder discussion" rows={2} />
        </Field>

        <Field label="Personal Notes">
          <textarea className="kbc-input" value={privateComment} onChange={(e) => setPrivateComment(e.target.value)} placeholder="Private notes — only visible to you" rows={2} />
        </Field>

        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full rounded-xl p-3 text-sm font-bold text-white disabled:opacity-60"
          style={{ background: KBC.black }}
        >
          {saving ? 'Saving…' : 'Log Climb'}
        </button>
      </div>
    </Modal>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold tracking-wide text-neutral-400 uppercase">{children}</p>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  )
}
