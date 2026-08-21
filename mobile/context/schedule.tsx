import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { useAuth } from '@/context/auth';
import { AppState } from 'react-native';
import { CalendarEvent, listUpcomingEvents } from '@/services/calendarService';

type ScheduleContextType = {
  selectedDate: Date;
  setSelectedDate: (d: Date) => void;
  goToToday: () => void;
  allEvents: CalendarEvent[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const ScheduleContext = createContext<ScheduleContextType | null>(null);

export function ScheduleProvider({ children }: { children: React.ReactNode }) {
  const { getAccessToken, user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const data = await listUpcomingEvents(token, 60, 14);
      setAllEvents(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  // Reload on mount and whenever the signed-in user changes (covers sign-out/sign-in cycles).
  useEffect(() => { if (user) reload(); }, [user?.id]);

  // Reload when the app comes back to the foreground (covers long background periods).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && user) reload();
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function goToToday() {
    setSelectedDate(new Date());
  }

  return (
    <ScheduleContext.Provider value={{ selectedDate, setSelectedDate, goToToday, allEvents, loading, error, reload }}>
      {children}
    </ScheduleContext.Provider>
  );
}

export function useSchedule() {
  const ctx = useContext(ScheduleContext);
  if (!ctx) throw new Error('useSchedule must be used within ScheduleProvider');
  return ctx;
}
