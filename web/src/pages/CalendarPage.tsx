import { useRef, useState } from 'react'
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
  isSameDay,
  localDayStart,
} from '@/domain/calendarEvent'
import { useCalendarUser } from '@/hooks/useCalendarUser'
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

// Ported from mobile/app/(tabs)/calendar.tsx, plus the two interactions it
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
  const stickyHeaderRef = useRef<HTMLDivElement>(null)
  const groupRefs = useRef(new Map<string, HTMLDivElement>())

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const futureEvents = allEvents
    .filter((e) => eventStartMs(e) > 0 && localDayStart(e).getTime() >= today.getTime())
    .sort((a, b) => eventStartMs(a) - eventStartMs(b))

  const groups = groupEventsByDate(futureEvents)

  /** Roll the list to `day`, or to the first day after it that has anything on. */
  function scrollListToDay(day: Date) {
    const container = listRef.current
    if (!container) return
    const target = new Date(day)
    target.setHours(0, 0, 0, 0)
    const group = groups.find((g) => g.date.getTime() >= target.getTime())
    const el = group ? groupRefs.current.get(group.date.toDateString()) : undefined
    if (!el) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
      return
    }
    // offsetTop is measured against the `relative` wrapper, so it is already
    // the container's scroll offset — but the "Upcoming Events" heading is
    // sticky and would sit on top of the day heading at exactly that offset,
    // so back off by its height.
    const stickyHeight = stickyHeaderRef.current?.offsetHeight ?? 0
    container.scrollTo({ top: Math.max(el.offsetTop - stickyHeight, 0), behavior: 'smooth' })
  }

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
    <div className="flex h-full flex-col">
      <div className="shrink-0">
        <CalendarPicker selectedDate={selectedDate} allEvents={allEvents} onDayPress={handleDayPress} />
      </div>

      {/* The list scrolls independently of the month grid above it, so rolling
          to a day never pushes the grid off screen. */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto border-t border-neutral-100 px-3.5">
        {/* `relative` is load-bearing: it makes each day group's offsetTop
            measure from here, which is what scrollListToDay scrolls to. */}
        <div className="relative pb-10">
          <div ref={stickyHeaderRef} className="sticky top-0 z-10 bg-white pt-3 pb-1.5">
            <h2 className="ml-0.5 text-[11px] font-bold tracking-wide text-neutral-400 uppercase">
              Upcoming Events
            </h2>
            <p className="mt-0.5 ml-0.5 text-[11px] text-neutral-400">
              Tap a day to jump here · tap it again to open it on the Schedule
            </p>
          </div>

          {groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-300">No upcoming events</p>
          ) : (
            groups.map((group) => {
              const isSelected = isSameDay(group.date, selectedDate)
              return (
                <div
                  key={group.date.toDateString()}
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
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-bold text-neutral-900">{event.summary}</p>
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
