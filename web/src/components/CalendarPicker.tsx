import { useState } from 'react'
import { useSwipe } from '@/hooks/useSwipe'
import { KBC } from '@/constants/theme'
import { isEventOnDay, isRequestedEvent, isSupervisorEvent } from '@/domain/calendarEvent'
import type { CalendarEvent } from '@/services/calendar'
import { isSameDay } from '@/utils/datetime'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function buildCalendarDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const days: (Date | null)[] = []
  for (let i = 0; i < first.getDay(); i++) days.push(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d))
  return days
}

// Ported from mobile@1cdfada/components/calendar-picker.tsx.
export function CalendarPicker({
  selectedDate,
  allEvents,
  onDayPress,
}: {
  selectedDate: Date
  allEvents: CalendarEvent[]
  onDayPress: (day: Date) => void
}) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth())

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else setViewMonth((m) => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else setViewMonth((m) => m + 1)
  }

  const days = buildCalendarDays(viewYear, viewMonth)

  // Swipe the grid to change month, same direction as the ‹ › buttons.
  const swipe = useSwipe({ onSwipeLeft: nextMonth, onSwipeRight: prevMonth })

  return (
    <div className="px-3 pt-3" {...swipe}>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={prevMonth} className="p-2 text-3xl leading-none" style={{ color: KBC.pink }}>
          ‹
        </button>
        <p className="text-xl font-extrabold text-black">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </p>
        <button type="button" onClick={nextMonth} className="p-2 text-3xl leading-none" style={{ color: KBC.pink }}>
          ›
        </button>
      </div>

      <div className="mb-1.5 grid grid-cols-7">
        {DAY_NAMES.map((d) => (
          <span key={d} className="text-center text-xs font-bold text-neutral-400">
            {d}
          </span>
        ))}
      </div>
      <div className="mb-1 border-b border-neutral-100" />

      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="aspect-square" />
          const isToday = isSameDay(day, today)
          const isSelected = !isToday && isSameDay(day, selectedDate)
          const withSuper = allEvents.some((e) => isEventOnDay(e, day) && isSupervisorEvent(e.summary))
          const withRequested = allEvents.some((e) => isEventOnDay(e, day) && isRequestedEvent(e.summary))
          const withRegular = allEvents.some(
            (e) => isEventOnDay(e, day) && !isSupervisorEvent(e.summary) && !isRequestedEvent(e.summary),
          )
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onDayPress(day)}
              className="flex aspect-square flex-col items-center justify-center"
            >
              <span
                className="flex size-9 items-center justify-center rounded-full text-[15px]"
                style={{
                  backgroundColor: isToday ? KBC.pink : isSelected ? KBC.cyan : 'transparent',
                  color: isToday || isSelected ? '#fff' : '#111',
                  fontWeight: isToday || isSelected ? 800 : 400,
                }}
              >
                {day.getDate()}
              </span>
              <span className="mt-0.5 flex h-1.5 gap-0.5">
                {withSuper && <span className="size-1.5 rounded-full" style={{ backgroundColor: KBC.pink }} />}
                {withRequested && <span className="size-1.5 rounded-full" style={{ backgroundColor: KBC.purple }} />}
                {withRegular && <span className="size-1.5 rounded-full" style={{ backgroundColor: KBC.cyan }} />}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex justify-center gap-5 border-t border-neutral-100 py-4">
        <LegendItem color={KBC.pink} label="Supervisor" />
        <LegendItem color={KBC.cyan} label="Events" />
        <LegendItem color={KBC.purple} label="Requested" />
      </div>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs font-medium text-neutral-500">{label}</span>
    </div>
  )
}
