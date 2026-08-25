import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { KBC } from '@/constants/theme'
import {
  eventColor,
  eventKind,
  isAllDayEvent,
  layoutEvents,
  minutesToY,
  TIMELINE_END_HOUR,
  TIMELINE_HOUR_HEIGHT,
  TIMELINE_START_HOUR,
  yToMinutes,
} from '@/domain/calendarEvent'
import type { CalendarEvent } from '@/services/calendar'
import { formatTime, isSameDay } from '@/utils/datetime'

const TOTAL_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR

/** New events start on the nearest quarter hour, like every other day view. */
const SNAP_MINUTES = 15

/** Gap between two side-by-side events, so the boundary is visible. */
const COLUMN_GAP_PX = 3

/** How far a press may travel and still count as a tap rather than a swipe. */
const TAP_SLOP_PX = 8

type Props = {
  events: CalendarEvent[]
  onEventPress?: (event: CalendarEvent) => void
  /** Tap an empty stretch of the grid to start creating something there. */
  onTimePress?: (start: Date) => void
  selectedDate?: Date
  scrollToFirstEvent?: boolean
}

// Ported from mobile@1cdfada/components/timeline-view.tsx, including its onTimePress —
// tap an empty slot to open the create form already seeded with that time.
export function TimelineView({
  events,
  onEventPress,
  onTimePress,
  selectedDate,
  scrollToFirstEvent,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pressStart = useRef<{ x: number; y: number } | null>(null)
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

  /**
   * Turn a click on the empty grid into the time that was clicked.
   *
   * Clicks on an event bubble up to this same handler, so the event buttons
   * stop propagation — otherwise opening an event would also open the create
   * form behind it.
   *
   * A swipe across the timeline to change day still ends in a `click` here,
   * since nothing scrolled horizontally to suppress it — so a press that
   * travelled more than a few pixels is treated as a gesture, not a tap.
   */
  function handleGridClick(e: MouseEvent<HTMLDivElement>) {
    if (!onTimePress || !selectedDate) return
    const from = pressStart.current
    pressStart.current = null
    if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > TAP_SLOP_PX) return
    const bounds = e.currentTarget.getBoundingClientRect()
    const minutes = yToMinutes(e.clientY - bounds.top)
    const snapped = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
    const clamped = Math.min(
      Math.max(snapped, TIMELINE_START_HOUR * 60),
      TIMELINE_END_HOUR * 60 - 60,
    )
    const start = new Date(selectedDate)
    start.setHours(Math.floor(clamped / 60), clamped % 60, 0, 0)
    onTimePress(start)
  }

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
                style={{ backgroundColor: eventColor(e) }}
              >
                {e.summary}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ backgroundColor: KBC.surface }}
      >
        <div className="flex">
          {/* Time labels */}
          <div className="w-[52px] shrink-0" style={{ backgroundColor: KBC.surface }}>
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: TIMELINE_HOUR_HEIGHT }}
                className="pt-1 pr-2 text-right"
              >
                <span className="text-[11px] font-medium text-neutral-400">
                  {h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`}
                </span>
              </div>
            ))}
          </div>

          {/* Events area */}
          <div
            className={`relative flex-1 bg-white ${onTimePress ? 'cursor-copy' : ''}`}
            style={{ height: TOTAL_HOURS * TIMELINE_HOUR_HEIGHT }}
            onPointerDown={(e) => {
              pressStart.current = { x: e.clientX, y: e.clientY }
            }}
            onClick={handleGridClick}
          >
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-0 left-0 h-px bg-neutral-100"
                style={{ top: (h - TIMELINE_START_HOUR) * TIMELINE_HOUR_HEIGHT }}
              />
            ))}

            {isToday && nowInRange && (
              <div
                className="pointer-events-none absolute -left-1 right-0 z-20 flex items-center"
                style={{ top: nowY }}
              >
                <div className="size-2.5 rounded-full" style={{ backgroundColor: KBC.live }} />
                <div className="h-0.5 flex-1" style={{ backgroundColor: KBC.live }} />
              </div>
            )}

            {positioned.map((event) => {
              const special = eventKind(event) === 'special'
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEventPress?.(event)
                  }}
                  className="absolute overflow-hidden rounded-md border-l-4 border-black/20 p-1.5 text-left"
                  style={{
                    top: event.top,
                    height: Math.max(event.height - 2, 18),
                    // Percentage width with a pixel gutter: calc keeps the
                    // columns exact while still separating neighbours visually.
                    left: `calc(${(event.column / event.numColumns) * 100}% + ${event.column === 0 ? 0 : COLUMN_GAP_PX}px)`,
                    width: `calc(${(event.span / event.numColumns) * 100}% - ${event.column === 0 ? COLUMN_GAP_PX : COLUMN_GAP_PX * 2}px)`,
                    backgroundColor: eventColor(event),
                    // Narrow events sit above wide ones, so a short request
                    // inside a long session is never covered by it.
                    zIndex: 10 - Math.min(event.span, 9),
                  }}
                >
                  <p className="line-clamp-2 text-xs font-bold text-white">
                    {special && <span aria-hidden>★ </span>}
                    {event.summary}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-white/85">
                    {formatTime(event.start.dateTime!)}
                    {' – '}
                    {formatTime(event.end.dateTime!)}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
