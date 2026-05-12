import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { CalendarPicker } from '@/components/calendar-picker';
import { KBC } from '@/constants/theme';
import { useSchedule } from '@/context/schedule';
import type { CalendarEvent } from '@/services/calendarService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function eventColor(event: CalendarEvent): string {
  const s = event.summary?.toLowerCase() ?? '';
  if (s.includes('(requested)')) return KBC.purple;
  if (s.includes('(sup)') || s.includes('(super)')) return KBC.pink;
  return KBC.cyan;
}

function eventStartMs(e: CalendarEvent): number {
  if (e.start?.dateTime) return new Date(e.start.dateTime).getTime();
  if (e.start?.date) {
    const [y, m, d] = e.start.date.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  return 0;
}

function localDayStart(e: CalendarEvent): Date {
  if (e.start?.dateTime) {
    const d = new Date(e.start.dateTime);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  if (e.start?.date) {
    const [y, m, d] = e.start.date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(0);
}

function groupEventsByDate(events: CalendarEvent[]): Array<{ date: Date; events: CalendarEvent[] }> {
  const map = new Map<string, { date: Date; events: CalendarEvent[] }>();
  for (const e of events) {
    const date = localDayStart(e);
    const key  = date.toDateString();
    if (!map.has(key)) map.set(key, { date, events: [] });
    map.get(key)!.events.push(e);
  }
  return [...map.values()];
}

function formatGroupHeader(date: Date): string {
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const dateStr  = date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  if (date.getTime() === today.getTime())    return `Today  ·  ${dateStr}`;
  if (date.getTime() === tomorrow.getTime()) return `Tomorrow  ·  ${dateStr}`;
  return dateStr;
}

function formatTime(dt: string): string {
  const d = new Date(dt);
  const h = d.getHours();
  const min = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${min} ${ampm}`;
}

function openEvent(event: CalendarEvent) {
  const start = event.start?.dateTime ?? event.start?.date;
  const end   = event.end?.dateTime   ?? event.end?.date;
  if (!start || !end) return;
  router.push({ pathname: '/edit-session', params: {
    id: event.id,
    summary: event.summary ?? '',
    start,
    end,
    description: event.description ?? '',
  }});
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { selectedDate, setSelectedDate, allEvents, loading } = useSchedule();

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const futureEvents = allEvents
    .filter(e => eventStartMs(e) > 0 && localDayStart(e).getTime() >= today.getTime())
    .sort((a, b) => eventStartMs(a) - eventStartMs(b));

  const groups = groupEventsByDate(futureEvents);

  function handleDayPress(day: Date) {
    setSelectedDate(day);
    router.navigate('/(tabs)');
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={KBC.pink} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <CalendarPicker
            selectedDate={selectedDate}
            allEvents={allEvents}
            onDayPress={handleDayPress}
          />

          <View style={styles.listSection}>
            <Text style={styles.listHeader}>Upcoming Events</Text>

            {groups.length === 0 ? (
              <Text style={styles.emptyText}>No upcoming events</Text>
            ) : (
              groups.map(group => (
                <View key={group.date.toDateString()}>
                  <Text style={styles.dateHeader}>{formatGroupHeader(group.date)}</Text>
                  {group.events.map(event => {
                    const color    = eventColor(event);
                    const isAllDay = !!event.start?.date && !event.start?.dateTime;
                    const timeLabel = isAllDay
                      ? 'All day'
                      : `${formatTime(event.start.dateTime!)} – ${formatTime(event.end.dateTime!)}`;
                    return (
                      <TouchableOpacity
                        key={event.id}
                        style={[styles.eventRow, { borderLeftColor: color }]}
                        onPress={() => openEvent(event)}
                        activeOpacity={0.72}
                      >
                        <View style={[styles.eventDot, { backgroundColor: color }]} />
                        <View style={styles.eventInfo}>
                          <Text style={styles.eventTitle} numberOfLines={1}>{event.summary}</Text>
                          <Text style={styles.eventTime}>{timeLabel}</Text>
                        </View>
                        <Text style={[styles.chevron, { color }]}>›</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#fff' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:      { paddingBottom: 40 },

  listSection: { paddingHorizontal: 14, paddingTop: 8 },
  listHeader:  {
    fontSize: 11, fontWeight: '700', color: '#999',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 16, marginBottom: 10, marginLeft: 2,
  },
  emptyText:   { fontSize: 14, color: '#bbb', textAlign: 'center', paddingVertical: 24 },

  dateHeader:  {
    fontSize: 12, fontWeight: '700', color: '#555',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 18, marginBottom: 6, marginLeft: 2,
  },

  eventRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10, padding: 12,
    marginBottom: 6,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
    gap: 10,
  },
  eventDot:    { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  eventInfo:   { flex: 1, gap: 2 },
  eventTitle:  { fontSize: 15, fontWeight: '700', color: '#111' },
  eventTime:   { fontSize: 12, color: '#888' },
  chevron:     { fontSize: 22, fontWeight: '300', marginLeft: 4 },
});
