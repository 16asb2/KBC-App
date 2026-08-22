import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
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
}

const ScheduleContext = createContext<ScheduleContextType | null>(null)

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listUpcomingEvents(60, 14)
      setAllEvents(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  function goToToday() {
    setSelectedDate(new Date())
  }

  return (
    <ScheduleContext.Provider value={{ selectedDate, setSelectedDate, goToToday, allEvents, loading, error, reload }}>
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
