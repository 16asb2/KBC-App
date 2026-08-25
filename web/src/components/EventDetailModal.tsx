import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { KBC, tint } from '@/constants/theme'
import { eventColor, eventKind, EVENT_KIND_LABEL, isAllDayEvent } from '@/domain/calendarEvent'
import {
  canDeleteEvent,
  canEditEvent,
  canJoinEvent,
  type CalendarActor,
} from '@/domain/calendarPermissions'
import { hasSupervisor, participantsFor } from '@/domain/calendarSession'
import {
  deleteEvent,
  joinSession,
  leaveSession,
  type CalendarEvent,
  type CalendarUser,
} from '@/services/calendar'
import { formatLongDate, formatTime } from '@/utils/datetime'

// Tapping an event on the Schedule — or a row in the Calendar tab's Upcoming
// Events list — opens this. Everyone can open it and read what is on: what a
// viewer may then *do* is the only thing that varies, and it varies by
// domain/calendarPermissions.ts.

function formatRange(e: CalendarEvent): string {
  if (isAllDayEvent(e)) return 'All day'
  const s = e.start.dateTime ? formatTime(e.start.dateTime) : '?'
  const t = e.end.dateTime ? formatTime(e.end.dateTime) : '?'
  return `${s} – ${t}`
}

function formatDay(e: CalendarEvent): string {
  const iso = e.start.dateTime ?? e.start.date
  if (!iso) return ''
  return formatLongDate(e.start.dateTime ? new Date(iso) : new Date(`${iso}T00:00`))
}

export function EventDetailModal({
  event,
  user,
  actor,
  onEdit,
  onChanged,
  onDeleted,
  onClose,
}: {
  event: CalendarEvent
  user: CalendarUser
  actor: CalendarActor
  onEdit: () => void
  onChanged: () => void
  /** Called with the id once it is gone from Google, so the cache can drop it. */
  onDeleted: (eventId: string) => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const kind = eventKind(event)
  const participants = participantsFor(event)
  const onIt = participants.some(
    (p) => p.uid === user.uid || p.name.toLowerCase() === user.name.toLowerCase(),
  )
  const supervised = hasSupervisor(participants)

  const joinable = canJoinEvent(event)
  const editable = canEditEvent(event, actor)
  const deletable = canDeleteEvent(event, actor)
  const deleteLabel = kind === 'special' ? 'Delete Event' : 'Delete Session'

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setErr(null)
    try {
      await fn()
      onChanged()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  function remove() {
    if (!window.confirm(`Delete "${event.summary ?? 'this event'}" from the calendar?`)) return
    void run(async () => {
      await deleteEvent(event, user)
      onDeleted(event.id)
    })
  }

  return (
    <Modal onClose={onClose}>
      <span
        className="inline-block rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wide uppercase"
        style={{ backgroundColor: tint(eventColor(event)), color: eventColor(event) }}
      >
        {EVENT_KIND_LABEL[kind]}
      </span>
      <h2 className="mt-2 text-lg font-black text-neutral-900">
        {event.summary ?? 'Untitled event'}
      </h2>
      <p className="mt-0.5 text-sm text-neutral-500">
        {formatDay(event)} · {formatRange(event)}
      </p>
      {event.description && <p className="mt-2 text-sm text-neutral-600">{event.description}</p>}

      {kind === 'special' && (
        <p className="mt-3 rounded-lg bg-neutral-100 p-3 text-xs text-neutral-500">
          A special event, not a climbing session — there is no sign-up list to join. Check the
          schedule for a supervised session around it.
        </p>
      )}

      {kind !== 'special' && participants.length > 0 && (
        <>
          <h3 className="mt-4 mb-1 text-[11px] font-bold tracking-wide text-neutral-500 uppercase">
            Who is coming
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {participants.map((p) => (
              <li
                key={p.uid}
                className="rounded-full px-2.5 py-1 text-xs font-bold"
                style={
                  p.role === 'member'
                    ? { backgroundColor: '#eee', color: '#555' }
                    : { backgroundColor: tint(KBC.pink), color: KBC.pink }
                }
              >
                {p.name}
                {p.role !== 'member' && ' (super)'}
              </li>
            ))}
          </ul>
          {!supervised && (
            <p className="mt-2 text-xs font-semibold" style={{ color: KBC.orange }}>
              No supervisor on this session yet — it is a request until one joins.
            </p>
          )}
        </>
      )}

      {err && <p className="mt-4 text-sm font-semibold text-red-600">{err}</p>}

      <div className="mt-5 space-y-2">
        {joinable &&
          (onIt ? (
            <button
              type="button"
              onClick={() => void run(() => leaveSession(event.id, user))}
              disabled={busy}
              className="w-full rounded-xl border p-3 text-center text-sm font-bold disabled:opacity-60"
              style={{ borderColor: KBC.pink, color: KBC.pink }}
            >
              Leave this session
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void run(() => joinSession(event.id, user))}
              disabled={busy}
              className="w-full rounded-xl p-3 text-center text-sm font-extrabold text-white disabled:opacity-60"
              style={{ backgroundColor: KBC.cyan }}
            >
              Join this session
            </button>
          ))}

        {editable && (
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className="w-full rounded-xl border border-neutral-300 p-3 text-center text-sm font-semibold text-neutral-600 disabled:opacity-60"
          >
            Edit {kind === 'special' ? 'event' : 'session'}
          </button>
        )}

        {deletable && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="w-full rounded-xl border p-3 text-center text-sm font-bold disabled:opacity-60"
            style={{ borderColor: KBC.pink, color: KBC.pink }}
          >
            {busy ? 'Working…' : deleteLabel}
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl p-3 text-center text-sm font-semibold text-neutral-500"
        >
          Close
        </button>
      </div>
    </Modal>
  )
}
