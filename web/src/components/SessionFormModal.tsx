import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { KBC } from '@/constants/theme'
import {
  createSessionRequest,
  createSpecialEvent,
  createSupervisorSession,
  deleteSession,
  updateSession,
  type CalendarEvent,
  type CalendarUser,
} from '@/services/calendar'

// Ported from mobile's add-session.tsx, edit-session.tsx and add-event.tsx,
// which were three routes; one modal here, since this app has no navigation
// stack and the three share almost all of their form.

export type SessionFormMode =
  /** Supervisor opens a slot they will cover. */
  | { kind: 'session' }
  /** Member asks for a time nobody covers yet. */
  | { kind: 'request' }
  /** A named event rather than a climbing session. */
  | { kind: 'special' }
  /** Change or delete an existing session. */
  | { kind: 'edit'; event: CalendarEvent }

const TITLES: Record<SessionFormMode['kind'], string> = {
  session: 'Open a climbing session',
  request: 'Request a climbing session',
  special: 'Add a special event',
  edit: 'Edit session',
}

/**
 * `<input type="datetime-local">` wants "YYYY-MM-DDTHH:mm" in local time, which
 * is not what toISOString() produces — that is UTC. Build it from the local
 * parts instead, or every prefilled time is off by the UTC offset.
 */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultStart(seed?: Date): Date {
  const d = seed ? new Date(seed) : new Date()
  if (!seed) d.setHours(d.getHours() + 1)
  d.setMinutes(0, 0, 0)
  return d
}

export function SessionFormModal({
  mode,
  user,
  seedDate,
  onDone,
  onClose,
}: {
  mode: SessionFormMode
  user: CalendarUser
  /** Day the schedule is showing, so a new session starts on it. */
  seedDate?: Date
  onDone: () => void
  onClose: () => void
}) {
  const editing = mode.kind === 'edit' ? mode.event : null

  const initialStart = editing?.start.dateTime
    ? new Date(editing.start.dateTime)
    : defaultStart(seedDate)
  const initialEnd = editing?.end.dateTime
    ? new Date(editing.end.dateTime)
    : new Date(initialStart.getTime() + 2 * 60 * 60 * 1000)

  const [start, setStart] = useState(toLocalInput(initialStart))
  const [end, setEnd] = useState(toLocalInput(initialEnd))
  const [summary, setSummary] = useState(mode.kind === 'special' ? '' : (editing?.summary ?? ''))
  const [description, setDescription] = useState(editing?.description ?? '')
  const [allDay, setAllDay] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setErr(null)
    const startDate = new Date(start)
    const endDate = new Date(end)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return setErr('Please pick a valid start and end time.')
    }
    if (endDate <= startDate) return setErr('The end time has to be after the start time.')
    if (mode.kind === 'special' && !summary.trim()) return setErr('Please give the event a name.')

    setSaving(true)
    try {
      if (mode.kind === 'edit') {
        await updateSession(
          mode.event.id,
          { start: startDate.toISOString(), end: endDate.toISOString(), description },
          user,
        )
      } else if (mode.kind === 'session') {
        await createSupervisorSession(
          { start: startDate.toISOString(), end: endDate.toISOString(), description },
          user,
        )
      } else if (mode.kind === 'request') {
        await createSessionRequest(
          { start: startDate.toISOString(), end: endDate.toISOString() },
          user,
        )
      } else {
        await createSpecialEvent(
          {
            summary: summary.trim(),
            // All-day events take plain dates, not timestamps.
            start: allDay ? start.slice(0, 10) : startDate.toISOString(),
            end: allDay ? end.slice(0, 10) : endDate.toISOString(),
            allDay,
          },
          user,
        )
      }
      onDone()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.')
      setSaving(false)
    }
  }

  async function remove() {
    if (!editing) return
    if (!window.confirm(`Delete "${editing.summary ?? 'this session'}" from the calendar?`)) return
    setSaving(true)
    setErr(null)
    try {
      await deleteSession(editing.id, user)
      onDone()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delete that session.')
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-black text-neutral-900">{TITLES[mode.kind]}</h2>
      {mode.kind === 'request' && (
        <p className="mt-1 text-sm text-neutral-500">
          Any part of this time a supervisor already covers is skipped — you will only be asking for
          what is still uncovered.
        </p>
      )}

      {mode.kind === 'special' && (
        <>
          <Label>Event name</Label>
          <input
            className="kbc-input"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="e.g. Ladies Night"
          />
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-neutral-700">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All-day event
          </label>
        </>
      )}

      <Label>{allDay ? 'First day' : 'Starts'}</Label>
      <input
        className="kbc-input"
        type={allDay ? 'date' : 'datetime-local'}
        value={allDay ? start.slice(0, 10) : start}
        onChange={(e) => setStart(allDay ? `${e.target.value}T00:00` : e.target.value)}
      />

      <Label>{allDay ? 'Last day' : 'Ends'}</Label>
      <input
        className="kbc-input"
        type={allDay ? 'date' : 'datetime-local'}
        value={allDay ? end.slice(0, 10) : end}
        onChange={(e) => setEnd(allDay ? `${e.target.value}T00:00` : e.target.value)}
      />

      {mode.kind !== 'request' && mode.kind !== 'special' && (
        <>
          <Label>Notes (optional)</Label>
          <input
            className="kbc-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Anything members should know"
          />
        </>
      )}

      {err && <p className="mt-4 text-sm font-semibold text-red-600">{err}</p>}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-neutral-300 p-3 text-sm font-bold text-neutral-600"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="flex-1 rounded-xl p-3 text-sm font-extrabold text-black disabled:opacity-60"
          style={{ backgroundColor: KBC.cyan }}
        >
          {saving ? 'Saving…' : mode.kind === 'edit' ? 'Save changes' : 'Confirm'}
        </button>
      </div>

      {editing && (
        <button
          type="button"
          onClick={() => void remove()}
          disabled={saving}
          className="mt-2 w-full rounded-xl border p-3 text-sm font-bold disabled:opacity-60"
          style={{ borderColor: KBC.pink, color: KBC.pink }}
        >
          Delete session
        </button>
      )}
    </Modal>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mt-3 mb-1 block text-[11px] font-bold tracking-wide text-neutral-500 uppercase">
      {children}
    </label>
  )
}
