import { useState } from 'react'
import { CalendarPicker } from '@/components/CalendarPicker'
import { Modal } from '@/components/Modal'
import { TimelineView } from '@/components/TimelineView'
import { KBC } from '@/constants/theme'
import { useSchedule } from '@/context/ScheduleContext'
import { isEventOnDay } from '@/domain/calendarEvent'
import { useSwipe } from '@/hooks/useSwipe'

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

// Ported from mobile/app/(tabs)/index.tsx, day view only. The "+ Climb
// Session" / "Request Climb Session" / "+ Special Event" buttons and
// tap-a-timeslot-to-add / tap-an-event-to-edit aren't ported — they're all
// write paths (add-session/edit-session/add-event) that land with a later
// calendar-writes pass. This is a view, as scoped.
export function SchedulePage() {
  const { selectedDate, setSelectedDate, allEvents, loading, error, reload } = useSchedule()
  const [pickerOpen, setPickerOpen] = useState(false)

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
          <TimelineView events={dayEvents} selectedDate={selectedDate} scrollToFirstEvent />
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
