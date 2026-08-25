import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPicker } from '@/components/CalendarPicker'
import { EventDetailModal } from '@/components/EventDetailModal'
import { SessionFormModal, type SessionFormMode } from '@/components/SessionFormModal'
import { KBC } from '@/constants/theme'
import { useSchedule } from '@/context/ScheduleContext'
import {
  eventColor,
  eventKind,
  eventStartMs,
  EVENT_KIND_LABEL,
  isAllDayEvent,
  localDayStart,
} from '@/domain/calendarEvent'
import { useCalendarUser } from '@/hooks/useCalendarUser'
import type { CalendarEvent } from '@/services/calendar'
import { formatDayWithRelative, formatTime, isSameDay, startOfDay } from '@/utils/datetime'

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
  return formatDayWithRelative(date, { future: true })
}

// Ported from mobile@1cdfada/app/(tabs)/calendar.tsx, plus the two interactions it
// never had: rows open the event, and the month grid drives the list. Tapping a
// day rolls Upcoming Events to it; tapping the same day again hands off to the
// Schedule tab, which is already showing that day because the first tap set it.
export function CalendarPage() {
  const { selectedDate, setSelectedDate, allEvents, loading, reload, forgetEvent } = useSchedule()
  const { calendarUser, actor } = useCalendarUser()
  const navigate = useNavigate()

  const [viewing, setViewing] = useState<CalendarEvent | null>(null)
  const [form, setForm] = useState<SessionFormMode | null>(null)
  /**
   * The day the *previous* tap landed on. `selectedDate` can't stand in for
   * this: it is already set to today when the tab opens, so the very first tap
   * on today would count as the second one and jump straight to the Schedule.
   */
  const [lastTapped, setLastTapped] = useState<Date | null>(null)

  const listRef = useRef<HTMLDivElement>(null)
  const groupRefs = useRef(new Map<string, HTMLDivElement>())
  const openedOnToday = useRef(false)

  // Everything in the cache, past included -- ScheduleContext fetches a month
  // back. The list opens scrolled to today, so recent sessions are a scroll up
  // rather than gone: handy for "who was supervising last Tuesday".
  const dated = allEvents
    .filter((e) => eventStartMs(e) > 0)
    .sort((a, b) => eventStartMs(a) - eventStartMs(b))

  const groups = groupEventsByDate(dated)

  /** Roll the list to `day`, or to the first day after it that has anything on. */
  function scrollListToDay(day: Date, behavior: ScrollBehavior = 'smooth') {
    const container = listRef.current
    if (!container) return
    const target = startOfDay(day)
    const group = groups.find((g) => g.date.getTime() >= target.getTime())
    const el = group ? groupRefs.current.get(group.date.toDateString()) : undefined
    // offsetTop is measured against the `relative` wrapper, so it is already
    // the offset the container needs to scroll to.
    container.scrollTo({ top: el ? el.offsetTop : container.scrollHeight, behavior })
  }

  // Land on today once the events arrive. Without this the list opens on the
  // oldest event in the window, which is a month of history nobody asked for.
  useEffect(() => {
    if (openedOnToday.current || groups.length === 0) return
    openedOnToday.current = true
    scrollListToDay(new Date(), 'auto')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length])

  function handleDayPress(day: Date) {
    if (lastTapped && isSameDay(lastTapped, day)) {
      // Second tap on the same day — open it in the Schedule tab. The first tap
      // already made it the selected date, so the Schedule opens right on it.
      navigate('/schedule')
      return
    }
    setLastTapped(day)
    setSelectedDate(day)
    scrollListToDay(day)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  return (
    // Two scrolls, deliberately. The page itself is taller than the viewport,
    // so scrolling it slides the month grid up and out of the way — and since
    // the list below is exactly one screen tall, once the grid has gone the
    // list fills the display. The list then scrolls inside that, so you can
    // read far into the future without the grid ever coming back.
    <div className="flex flex-col">
      <div className="shrink-0">
        <CalendarPicker
          selectedDate={selectedDate}
          allEvents={allEvents}
          onDayPress={handleDayPress}
        />
      </div>

      {/* One screen tall: the viewport less the AppShell header, and less the
          bottom tab bar too below md, where that bar exists. svh (the *small*
          viewport height) so mobile browser chrome expanding cannot push the
          bottom of the list out of reach. */}
      <div
        ref={listRef}
        className="h-[calc(100svh-7.5rem)] overflow-y-auto border-t border-neutral-100 px-3.5 md:h-[calc(100svh-4rem)]"
      >
        {/* `relative` is load-bearing: it makes each day group's offsetTop
            measure from here, which is what scrollListToDay scrolls to. */}
        <div className="relative pb-10">
          {groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-300">No events</p>
          ) : (
            groups.map((group) => {
              const isSelected = isSameDay(group.date, selectedDate)
              // Days gone by are dimmed. With past and future in one list and
              // no heading between them, this is the only thing marking where
              // now is — and it costs no vertical space, which the heading did.
              const isPast = group.date.getTime() < startOfDay().getTime()
              return (
                <div
                  key={group.date.toDateString()}
                  className={isPast ? "opacity-55" : undefined}
                  ref={(el) => {
                    if (el) groupRefs.current.set(group.date.toDateString(), el)
                    else groupRefs.current.delete(group.date.toDateString())
                  }}
                >
                  <h3
                    className="mt-[18px] mb-1.5 ml-0.5 text-xs font-bold tracking-wide uppercase"
                    style={{ color: isSelected ? KBC.pink : '#525252' }}
                  >
                    {formatGroupHeader(group.date)}
                  </h3>
                  {group.events.map((event) => {
                    const color = eventColor(event)
                    const timeLabel = isAllDayEvent(event)
                      ? 'All day'
                      : `${formatTime(event.start.dateTime!)} – ${formatTime(event.end.dateTime!)}`
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => setViewing(event)}
                        className="mb-1.5 flex w-full items-center gap-2.5 rounded-[10px] border-l-4 bg-white p-3 text-left shadow-sm transition-colors hover:bg-neutral-50"
                        style={{ borderLeftColor: color }}
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-bold text-neutral-900">
                            {event.summary}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {timeLabel} · {EVENT_KIND_LABEL[eventKind(event)]}
                          </p>
                        </div>
                        <span className="shrink-0 text-lg text-neutral-300">›</span>
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      </div>

      {viewing && calendarUser && actor && (
        <EventDetailModal
          event={viewing}
          user={calendarUser}
          actor={actor}
          onEdit={() => {
            setForm({ kind: 'edit', event: viewing })
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
          onDone={() => void reload()}
          onDeleted={forgetEvent}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}
