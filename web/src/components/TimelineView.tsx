import { useEffect, useRef, useState } from 'react'
import { isAllDayEvent, isSameDay, layoutEvents, minutesToY, TIMELINE_END_HOUR, TIMELINE_HOUR_HEIGHT, TIMELINE_START_HOUR } from '@/domain/calendarEvent'
import { eventColor } from '@/domain/calendarEvent'
import type { CalendarEvent } from '@/services/calendar'

const TOTAL_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR

function allDayColor(event: CalendarEvent): string {
  return eventColor(event)
}

type Props = {
  events: CalendarEvent[]
  onEventPress?: (event: CalendarEvent) => void
  selectedDate?: Date
  scrollToFirstEvent?: boolean
}

// Ported from mobile/components/timeline-view.tsx. onTimePress (tap an empty
// slot to start adding a session) isn't ported — there's no add-session route
// yet, that's write-side calendar work for a later pass.
export function TimelineView({ events, onEventPress, selectedDate, scrollToFirstEvent }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const isToday = selectedDate ? isSameDay(selectedDate, now) : false
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nowY = minutesToY(nowMinutes)
  const nowInRange = nowY >= 0 && nowY <= TOTAL_HOURS * TIMELINE_HOUR_HEIGHT

  const allDayEvents = events.filter(isAllDayEvent)
  const timedEvents = events.filter((e) => !isAllDayEvent(e))
  const positioned = layoutEvents(timedEvents)

  useEffect(() => {
    if (!scrollToFirstEvent || !scrollRef.current) return
    let y = 0
    if (isToday && nowInRange) {
      y = Math.max(0, nowY - TIMELINE_HOUR_HEIGHT * 1.5)
    } else if (timedEvents.length > 0) {
      const sorted = [...timedEvents].sort(
        (a, b) => new Date(a.start.dateTime!).getTime() - new Date(b.start.dateTime!).getTime(),
      )
      const d = new Date(sorted[0].start.dateTime!)
      const firstMin = d.getHours() * 60 + d.getMinutes()
      y = Math.max(0, minutesToY(firstMin) - TIMELINE_HOUR_HEIGHT)
    } else {
      return
    }
    const target = scrollRef.current
    const t = setTimeout(() => target.scrollTo({ top: y, behavior: 'smooth' }), 100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, scrollToFirstEvent, isToday])

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => TIMELINE_START_HOUR + i)

  return (
    <div className="flex h-full flex-col">
      {allDayEvents.length > 0 && (
        <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-100 px-3 py-3">
          <span className="w-12 shrink-0 text-[11px] font-semibold text-neutral-400">All day</span>
          <div className="flex flex-1 flex-wrap gap-1.5">
            {allDayEvents.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onEventPress?.(e)}
                className="truncate rounded px-3 py-2 text-[13px] font-bold text-white"
                style={{ backgroundColor: allDayColor(e) }}
              >
                {e.summary}
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#f7f7f7]">
        <div className="flex">
          {/* Time labels */}
          <div className="w-[52px] shrink-0 bg-[#f7f7f7]">
            {hours.map((h) => (
              <div key={h} style={{ height: TIMELINE_HOUR_HEIGHT }} className="pt-1 pr-2 text-right">
                <span className="text-[11px] font-medium text-neutral-400">
                  {h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`}
                </span>
              </div>
            ))}
          </div>

          {/* Events area */}
          <div className="relative flex-1 bg-white" style={{ height: TOTAL_HOURS * TIMELINE_HOUR_HEIGHT }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-0 left-0 h-px bg-neutral-100"
                style={{ top: (h - TIMELINE_START_HOUR) * TIMELINE_HOUR_HEIGHT }}
              />
            ))}

            {isToday && nowInRange && (
              <div className="pointer-events-none absolute -left-1 right-0 z-20 flex items-center" style={{ top: nowY }}>
                <div className="size-2.5 rounded-full bg-[#00e676]" />
                <div className="h-0.5 flex-1 bg-[#00e676]" />
              </div>
            )}

            {positioned.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => onEventPress?.(event)}
                className="absolute overflow-hidden rounded-md border-l-4 border-black/20 p-1.5 text-left"
                style={{
                  top: event.top,
                  height: event.height,
                  width: `${100 / event.numColumns}%`,
                  left: `${(event.column / event.numColumns) * 100}%`,
                  backgroundColor: eventColor(event),
                }}
              >
                <p className="line-clamp-2 text-xs font-bold text-white">{event.summary}</p>
                <p className="mt-0.5 truncate text-[10px] text-white/85">
                  {new Date(event.start.dateTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {new Date(event.end.dateTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
