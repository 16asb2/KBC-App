import { useState } from 'react'
import { CalendarPicker } from '@/components/CalendarPicker'
import { Modal } from '@/components/Modal'
import { TimelineView } from '@/components/TimelineView'
import { KBC } from '@/constants/theme'
import { useSchedule } from '@/context/ScheduleContext'
import { isEventOnDay } from '@/domain/calendarEvent'
import { useSwipe } from '@/hooks/useSwipe'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { isPrivileged } from '@/domain/roles'
import { EventDetailModal } from '@/components/EventDetailModal'
import { SessionFormModal, type SessionFormMode } from '@/components/SessionFormModal'
import type { CalendarEvent, CalendarUser } from '@/services/calendar'

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatHeaderDate(date: Date): string {
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatHeaderLabel(date: Date): string | null {
  const today = new Date()
  if (isSameDay(date, today)) return '(Today)'
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (isSameDay(date, tomorrow)) return '(Tomorrow)'
  return null
}

// Ported from mobile/app/(tabs)/index.tsx, day view only, now including its
// write paths: supervisors open sessions and add special events, members
// request a time, and tapping an event opens it to join, leave, edit or delete.
// mobile had these as separate add-session/edit-session/add-event routes.
export function SchedulePage() {
  const { selectedDate, setSelectedDate, allEvents, loading, error, reload } = useSchedule()
  const { user } = useAuth()
  const { profile } = useProfile()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [form, setForm] = useState<SessionFormMode | null>(null)
  const [viewing, setViewing] = useState<CalendarEvent | null>(null)

  const privileged = isPrivileged(user?.email ?? null, profile)
  // Calendar identity is separate from the Firestore profile: the name here is
  // what gets written into the event title and roster.
  const calendarUser: CalendarUser | null =
    user && profile
      ? {
          uid: profile.uid,
          name: profile.preferredName || profile.name,
          isSupervisor: profile.isSupervisor,
          isAdmin: profile.isAdmin,
        }
      : null

  function changeDay(offset: number) {
    const next = new Date(selectedDate)
    next.setDate(selectedDate.getDate() + offset)
    setSelectedDate(next)
  }

  // Swiping left goes forward, matching the ‹ › buttons and the direction the
  // content would move if it were a filmstrip.
  const swipe = useSwipe({
    onSwipeLeft: () => changeDay(1),
    onSwipeRight: () => changeDay(-1),
  })

  const dayEvents = allEvents.filter((e) => isEventOnDay(e, selectedDate))

  return (
    <div className="flex h-full flex-col" {...swipe}>
      <div className="flex items-center gap-1 px-2 py-2.5" style={{ backgroundColor: KBC.darkGrey }}>
        <button type="button" className="flex-1 text-left" onClick={() => setPickerOpen(true)}>
          <span className="flex items-center gap-1.5">
            <span className="text-[17px] font-bold text-white">{formatHeaderDate(selectedDate)}</span>
            <span className="text-sm opacity-80">📅</span>
          </span>
          {formatHeaderLabel(selectedDate) && (
            <span className="mt-0.5 block text-[11px] text-neutral-400">{formatHeaderLabel(selectedDate)}</span>
          )}
        </button>
        <button type="button" className="p-2 text-2xl" style={{ color: KBC.pink }} onClick={() => void reload()}>
          ↻
        </button>
        <button type="button" className="p-2 text-3xl leading-none" style={{ color: KBC.pink }} onClick={() => changeDay(-1)}>
          ‹
        </button>
        <button type="button" className="p-2 text-3xl leading-none" style={{ color: KBC.pink }} onClick={() => changeDay(1)}>
          ›
        </button>
      </div>

      <div className="flex gap-4 border-b border-neutral-200 bg-neutral-100 px-3.5 py-1.5">
        <LegendItem color={KBC.pink} label="Supervisor" />
        <LegendItem color={KBC.purple} label="Requested" />
        <LegendItem color={KBC.cyan} label="Events" />
      </div>

      {calendarUser && (
        <div className="flex shrink-0 gap-2 border-b border-neutral-200 px-3.5 py-2">
          {privileged ? (
            <>
              <button
                type="button"
                onClick={() => setForm({ kind: 'session' })}
                className="flex-1 rounded-lg p-2 text-[13px] font-bold text-white"
                style={{ backgroundColor: KBC.pink }}
              >
                + Climb Session
              </button>
              <button
                type="button"
                onClick={() => setForm({ kind: 'special' })}
                className="flex-1 rounded-lg border p-2 text-[13px] font-bold"
                style={{ borderColor: KBC.cyan, color: KBC.cyan }}
              >
                + Special Event
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setForm({ kind: 'request' })}
              className="flex-1 rounded-lg p-2 text-[13px] font-bold text-white"
              style={{ backgroundColor: KBC.purple }}
            >
              Request a Climb Session
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-neutral-400">Loading…</p>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm font-semibold" style={{ color: KBC.pink }}>
              {error}
            </p>
            <button type="button" onClick={() => void reload()} className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: KBC.pink }}>
              Retry
            </button>
          </div>
        ) : (
          <TimelineView
            events={dayEvents}
            selectedDate={selectedDate}
            scrollToFirstEvent
            onEventPress={calendarUser ? setViewing : undefined}
          />
        )}
      </div>

      {pickerOpen && (
        <Modal onClose={() => setPickerOpen(false)}>
          <CalendarPicker
            selectedDate={selectedDate}
            allEvents={allEvents}
            onDayPress={(day) => {
              setSelectedDate(day)
              setPickerOpen(false)
            }}
          />
        </Modal>
      )}

      {viewing && calendarUser && (
        <EventDetailModal
          event={viewing}
          user={calendarUser}
          canEdit={privileged}
          onEdit={() => {
            setForm({ kind: 'edit', event: viewing })
            setViewing(null)
          }}
          onChanged={() => void reload()}
          onClose={() => setViewing(null)}
        />
      )}

      {form && calendarUser && (
        <SessionFormModal
          mode={form}
          user={calendarUser}
          seedDate={selectedDate}
          onDone={() => void reload()}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[11px] font-medium text-neutral-500">{label}</span>
    </div>
  )
}
