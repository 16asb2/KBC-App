import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/context/AuthContext'
import { listUpcomingEvents, type CalendarEvent } from '@/services/calendar'

type ScheduleContextType = {
  selectedDate: Date
  setSelectedDate: (d: Date) => void
  goToToday: () => void
  allEvents: CalendarEvent[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /** Drop a deleted event from the cache immediately. See forgetEvent below. */
  forgetEvent: (eventId: string) => void
}

const ScheduleContext = createContext<ScheduleContextType | null>(null)

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [fetched, setFetched] = useState<CalendarEvent[]>([])
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 30 days back, not 14: the Calendar tab lists past events as well as
      // coming ones, and a month is the span someone actually looks back over
      // ("who supervised last month?", "when was that comp?").
      const data = await listUpcomingEvents(60, 30)
      setFetched(data)
      // Retire a tombstone once Google stops returning the event: from then on
      // its absence is the source of truth, and the set cannot grow unbounded.
      const stillListed = new Set(data.map((e) => e.id))
      setDeletedIds((prev) => {
        const next = new Set([...prev].filter((id) => stillListed.has(id)))
        return next.size === prev.size ? prev : next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Hide an event the app has just deleted from the calendar.
   *
   * Google's events.list is eventually consistent: for a few seconds after a
   * successful DELETE it still returns the event, so the reload that follows a
   * delete would put it straight back on the schedule and it looked as though
   * "Delete Session" had done nothing. Tombstoning the id filters it out of
   * every consumer until a later reload confirms it is really gone.
   */
  const forgetEvent = useCallback((eventId: string) => {
    setDeletedIds((prev) => new Set(prev).add(eventId))
  }, [])

  const allEvents = useMemo(
    () => (deletedIds.size === 0 ? fetched : fetched.filter((e) => !deletedIds.has(e.id))),
    [fetched, deletedIds],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  function goToToday() {
    setSelectedDate(new Date())
  }

  return (
    <ScheduleContext.Provider
      value={{ selectedDate, setSelectedDate, goToToday, allEvents, loading, error, reload, forgetEvent }}
    >
      {children}
    </ScheduleContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- context + its hook are one unit by convention
export function useSchedule() {
  const ctx = useContext(ScheduleContext)
  if (!ctx) throw new Error('useSchedule must be used within ScheduleProvider')
  return ctx
}
