import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { KBC } from '@/constants/theme'
import { isRequestedEvent, isSupervisorEvent } from '@/domain/calendarEvent'
import { hasSupervisor, participantsFor } from '@/domain/calendarSession'
import { joinSession, leaveSession, type CalendarEvent, type CalendarUser } from '@/services/calendar'

// Tapping an event on the Schedule opens this. mobile reached edit-session by
// tapping an event too; join and leave were separate buttons on the timeline.

function formatRange(e: CalendarEvent): string {
  if (e.start.date) return 'All day'
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  const s = e.start.dateTime ? new Date(e.start.dateTime).toLocaleTimeString([], opts) : '?'
  const t = e.end.dateTime ? new Date(e.end.dateTime).toLocaleTimeString([], opts) : '?'
  return `${s} – ${t}`
}

export function EventDetailModal({
  event,
  user,
  canEdit,
  onEdit,
  onChanged,
  onClose,
}: {
  event: CalendarEvent
  user: CalendarUser
  canEdit: boolean
  onEdit: () => void
  onChanged: () => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const participants = participantsFor(event)
  const onIt = participants.some(
    (p) => p.uid === user.uid || p.name.toLowerCase() === user.name.toLowerCase(),
  )
  const supervised = hasSupervisor(participants)
  const isSession = isSupervisorEvent(event.summary) || isRequestedEvent(event.summary)

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

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-black text-neutral-900">{event.summary ?? 'Untitled event'}</h2>
      <p className="mt-0.5 text-sm text-neutral-500">{formatRange(event)}</p>
      {event.description && (
        <p className="mt-2 text-sm text-neutral-600">{event.description}</p>
      )}

      {participants.length > 0 && (
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
                    : { backgroundColor: KBC.pink + '22', color: KBC.pink }
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
        {isSession &&
          (onIt ? (
            <button
              type="button"
              onClick={() => void run(() => leaveSession(event.id, user))}
              disabled={busy}
              className="w-full rounded-xl border p-3 text-sm font-bold disabled:opacity-60"
              style={{ borderColor: KBC.pink, color: KBC.pink }}
            >
              Leave this session
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void run(() => joinSession(event.id, user))}
              disabled={busy}
              className="w-full rounded-xl p-3 text-sm font-extrabold text-black disabled:opacity-60"
              style={{ backgroundColor: KBC.cyan }}
            >
              Join this session
            </button>
          ))}

        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className="w-full rounded-xl border border-neutral-300 p-3 text-sm font-semibold text-neutral-600 disabled:opacity-60"
          >
            Edit or delete
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl p-3 text-sm font-semibold text-neutral-500"
        >
          Close
        </button>
      </div>
    </Modal>
  )
}
