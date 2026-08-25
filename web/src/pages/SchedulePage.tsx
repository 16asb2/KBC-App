import { useState } from 'react'
import { CalendarPicker } from '@/components/CalendarPicker'
import { Modal } from '@/components/Modal'
import { TimelineView } from '@/components/TimelineView'
import { KBC } from '@/constants/theme'
import { useSchedule } from '@/context/ScheduleContext'
import { isEventOnDay, isSameDay } from '@/domain/calendarEvent'
import { defaultCreateKind } from '@/domain/calendarPermissions'
import { useSwipe } from '@/hooks/useSwipe'
import { useCalendarUser } from '@/hooks/useCalendarUser'
import { EventDetailModal } from '@/components/EventDetailModal'
import { SessionFormModal, type SessionFormMode } from '@/components/SessionFormModal'
import type { CalendarEvent } from '@/services/calendar'

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
// request a time, tapping an event opens it to join, leave, edit or delete, and
// tapping an empty stretch of the timeline starts creating something there.
// mobile had these as separate add-session/edit-session/add-event routes.
export function SchedulePage() {
  const { selectedDate, setSelectedDate, allEvents, loading, error, reload, forgetEvent } = useSchedule()
  const { calendarUser, actor, privileged } = useCalendarUser()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [form, setForm] = useState<SessionFormMode | null>(null)
  /** Time tapped on the timeline, seeded into the form that opens. */
  const [formSeed, setFormSeed] = useState<Date | undefined>(undefined)
  const [viewing, setViewing] = useState<CalendarEvent | null>(null)

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

  function openForm(mode: SessionFormMode, seed?: Date) {
    setFormSeed(seed)
    setForm(mode)
  }

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
        <LegendItem color={KBC.pink} label="Climb Session" />
        <LegendItem color={KBC.purple} label="Requested" />
        <LegendItem color={KBC.cyan} label="Special Event" />
      </div>

      {calendarUser && (
        <div className="flex shrink-0 gap-2 border-b border-neutral-200 px-3.5 py-2">
          {privileged ? (
            <>
              <button
                type="button"
                onClick={() => openForm({ kind: 'session' })}
                className="flex-1 rounded-lg p-2 text-center text-[13px] font-bold text-white"
                style={{ backgroundColor: KBC.pink }}
              >
                + Climb Session
              </button>
              <button
                type="button"
                onClick={() => openForm({ kind: 'special' })}
                className="flex-1 rounded-lg border p-2 text-center text-[13px] font-bold"
                style={{ borderColor: KBC.cyan, color: KBC.cyan }}
              >
                + Special Event
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => openForm({ kind: 'request' })}
              className="flex-1 rounded-lg p-2 text-center text-[13px] font-bold text-white"
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
            // Tap an empty slot to create at that time. Supervisors get a
            // climbing session, everyone else a request — the same split the
            // buttons above make, so the two paths never disagree.
            onTimePress={
              actor
                ? (start) => openForm({ kind: defaultCreateKind(actor) }, start)
                : undefined
            }
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

      {viewing && calendarUser && actor && (
        <EventDetailModal
          event={viewing}
          user={calendarUser}
          actor={actor}
          onEdit={() => {
            openForm({ kind: 'edit', event: viewing })
            setViewing(null)
          }}
          onChanged={() => void reload()}
          onDeleted={forgetEvent}
          onClose={() => setViewing(null)}
        />
      )}

      {form && calendarUser && actor && (
        <SessionFormModal
          mode={form}
          user={calendarUser}
          actor={actor}
          seedDate={selectedDate}
          seedStart={formSeed}
          onDone={() => void reload()}
          onDeleted={forgetEvent}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[11px] font-medium text-neutral-500">{label}</span>
    </div>
  )
}
