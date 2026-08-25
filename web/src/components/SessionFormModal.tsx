import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { KBC } from '@/constants/theme'
import { eventKind, isAllDayEvent } from '@/domain/calendarEvent'
import { canDeleteEvent, type CalendarActor } from '@/domain/calendarPermissions'
import {
  createSessionRequest,
  createSpecialEvent,
  createSupervisorSession,
  deleteEvent,
  updateEvent,
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
  /** Change or delete something already on the calendar. */
  | { kind: 'edit'; event: CalendarEvent }

/**
 * `<input type="datetime-local">` wants "YYYY-MM-DDTHH:mm" in local time, which
 * is not what toISOString() produces — that is UTC. Build it from the local
 * parts instead, or every prefilled time is off by the UTC offset.
 */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Move a "YYYY-MM-DD" string by whole days, staying in local time. */
function shiftDay(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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
  actor,
  seedDate,
  seedStart,
  onDone,
  onDeleted,
  onClose,
}: {
  mode: SessionFormMode
  user: CalendarUser
  actor: CalendarActor
  /** Day the schedule is showing, so a new session starts on it. */
  seedDate?: Date
  /** Exact time tapped on the timeline — takes precedence over seedDate. */
  seedStart?: Date
  onDone: () => void
  /** Called with the id once it is gone from Google, so the cache can drop it. */
  onDeleted: (eventId: string) => void
  onClose: () => void
}) {
  const editing = mode.kind === 'edit' ? mode.event : null
  // What is being edited decides the form, not how the modal was opened: a
  // special event needs its name and its all-day switch, a session does not.
  const kind = editing ? eventKind(editing) : mode.kind
  const isSpecial = kind === 'special'
  const isRequest = kind === 'request'

  const initialAllDay = editing ? isAllDayEvent(editing) : false
  const initialStart = editing?.start.dateTime
    ? new Date(editing.start.dateTime)
    : defaultStart(seedStart ?? seedDate)
  const initialEnd = editing?.end.dateTime
    ? new Date(editing.end.dateTime)
    : new Date(initialStart.getTime() + 2 * 60 * 60 * 1000)

  const [start, setStart] = useState(
    initialAllDay && editing?.start.date ? `${editing.start.date}T00:00` : toLocalInput(initialStart),
  )
  const [end, setEnd] = useState(() => {
    // Google stores an all-day end date as *exclusive*; the field asks for the
    // last day the event runs, so it comes back a day.
    if (initialAllDay && editing?.end.date) return `${shiftDay(editing.end.date, -1)}T00:00`
    return toLocalInput(initialEnd)
  })
  const [summary, setSummary] = useState(isSpecial ? (editing?.summary ?? '') : '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [allDay, setAllDay] = useState(initialAllDay)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const title = editing
    ? isSpecial
      ? 'Edit special event'
      : isRequest
        ? 'Edit session request'
        : 'Edit climbing session'
    : mode.kind === 'session'
      ? 'Open a climbing session'
      : mode.kind === 'request'
        ? 'Request a climbing session'
        : 'Add a special event'

  const deleteLabel = isSpecial ? 'Delete Event' : 'Delete Session'
  const canDelete = editing ? canDeleteEvent(editing, actor) : false

  async function submit() {
    setErr(null)
    const startDay = start.slice(0, 10)
    const endDay = end.slice(0, 10)

    if (allDay) {
      if (!startDay || !endDay) return setErr('Please pick a first and last day.')
      if (endDay < startDay) return setErr('The last day has to be on or after the first day.')
    } else {
      const startDate = new Date(start)
      const endDate = new Date(end)
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return setErr('Please pick a valid start and end time.')
      }
      if (endDate <= startDate) return setErr('The end time has to be after the start time.')
    }
    if (isSpecial && !summary.trim()) return setErr('Please give the event a name.')

    // All-day events take plain dates, and Google wants the end date exclusive.
    const startValue = allDay ? startDay : new Date(start).toISOString()
    const endValue = allDay ? shiftDay(endDay, 1) : new Date(end).toISOString()

    setSaving(true)
    try {
      if (editing) {
        await updateEvent(
          editing,
          {
            start: startValue,
            end: endValue,
            allDay,
            description,
            ...(isSpecial ? { summary: summary.trim() } : {}),
          },
          user,
        )
      } else if (mode.kind === 'session') {
        await createSupervisorSession({ start: startValue, end: endValue, description }, user)
      } else if (mode.kind === 'request') {
        await createSessionRequest({ start: startValue, end: endValue }, user)
      } else {
        await createSpecialEvent(
          { summary: summary.trim(), start: startValue, end: endValue, allDay, description },
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
    if (!window.confirm(`Delete "${editing.summary ?? 'this event'}" from the calendar?`)) return
    setSaving(true)
    setErr(null)
    try {
      await deleteEvent(editing, user)
      onDeleted(editing.id)
      onDone()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delete that event.')
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-black text-neutral-900">{title}</h2>
      {mode.kind === 'request' && !editing && (
        <p className="mt-1 text-sm text-neutral-500">
          Any part of this time a supervisor already covers is skipped — you will only be asking for
          what is still uncovered.
        </p>
      )}

      {isSpecial && (
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
      {allDay && (
        <p className="mt-1 text-xs text-neutral-400">
          The last day is included — set it to the first day for a single-day event.
        </p>
      )}

      {!isRequest && (
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
          className="flex-1 rounded-xl border border-neutral-300 p-3 text-center text-sm font-bold text-neutral-600"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="flex-1 rounded-xl p-3 text-center text-sm font-extrabold text-black disabled:opacity-60"
          style={{ backgroundColor: KBC.cyan }}
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Confirm'}
        </button>
      </div>

      {canDelete && (
        <button
          type="button"
          onClick={() => void remove()}
          disabled={saving}
          className="mt-2 w-full rounded-xl border p-3 text-center text-sm font-bold disabled:opacity-60"
          style={{ borderColor: KBC.pink, color: KBC.pink }}
        >
          {deleteLabel}
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
