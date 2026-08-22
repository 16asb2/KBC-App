import { CalendarPicker } from '@/components/CalendarPicker'
import { useSchedule } from '@/context/ScheduleContext'
import { eventColor, eventStartMs, isAllDayEvent, localDayStart } from '@/domain/calendarEvent'
import type { CalendarEvent } from '@/services/calendar'

function groupEventsByDate(events: CalendarEvent[]): { date: Date; events: CalendarEvent[] }[] {
  const map = new Map<string, { date: Date; events: CalendarEvent[] }>()
  for (const e of events) {
    const date = localDayStart(e)
    const key = date.toDateString()
    if (!map.has(key)) map.set(key, { date, events: [] })
    map.get(key)!.events.push(e)
  }
  return [...map.values()]
}

function formatGroupHeader(date: Date): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const dateStr = date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  if (date.getTime() === today.getTime()) return `Today · ${dateStr}`
  if (date.getTime() === tomorrow.getTime()) return `Tomorrow · ${dateStr}`
  return dateStr
}

function formatTime(dt: string): string {
  const d = new Date(dt)
  const h = d.getHours()
  const min = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${min} ${ampm}`
}

// Ported from mobile/app/(tabs)/calendar.tsx. Tapping an event to open
// edit-session isn't ported (write path, later pass) — rows are informational.
export function CalendarPage() {
  const { selectedDate, setSelectedDate, allEvents, loading } = useSchedule()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const futureEvents = allEvents
    .filter((e) => eventStartMs(e) > 0 && localDayStart(e).getTime() >= today.getTime())
    .sort((a, b) => eventStartMs(a) - eventStartMs(b))

  const groups = groupEventsByDate(futureEvents)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="pb-10">
      <CalendarPicker selectedDate={selectedDate} allEvents={allEvents} onDayPress={setSelectedDate} />

      <div className="px-3.5 pt-2">
        <h2 className="mt-4 mb-2.5 ml-0.5 text-[11px] font-bold tracking-wide text-neutral-400 uppercase">
          Upcoming Events
        </h2>

        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-300">No upcoming events</p>
        ) : (
          groups.map((group) => (
            <div key={group.date.toDateString()}>
              <h3 className="mt-[18px] mb-1.5 ml-0.5 text-xs font-bold tracking-wide text-neutral-600 uppercase">
                {formatGroupHeader(group.date)}
              </h3>
              {group.events.map((event) => {
                const color = eventColor(event)
                const timeLabel = isAllDayEvent(event)
                  ? 'All day'
                  : `${formatTime(event.start.dateTime!)} – ${formatTime(event.end.dateTime!)}`
                return (
                  <div
                    key={event.id}
                    className="mb-1.5 flex items-center gap-2.5 rounded-[10px] border-l-4 bg-white p-3 shadow-sm"
                    style={{ borderLeftColor: color }}
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-neutral-900">{event.summary}</p>
                      <p className="text-xs text-neutral-500">{timeLabel}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
