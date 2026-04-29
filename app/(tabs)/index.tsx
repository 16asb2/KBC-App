import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '@/context/auth';
import { CalendarEvent, fetchEvents } from '@/services/calendar';

function formatTime(dateTime: string) {
  return new Date(dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateTime: string) {
  return new Date(dateTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function isSupervisorSlot(event: CalendarEvent) {
  const title = event.summary?.toLowerCase() ?? '';
  return title.includes('super') || title.includes('supervisor');
}

function isRequested(event: CalendarEvent) {
  const title = event.summary?.toLowerCase() ?? '';
  return title.includes('request');
}

function EventCard({ event }: { event: CalendarEvent }) {
  const supervisor = isSupervisorSlot(event);
  const requested = isRequested(event);

  return (
    <View style={[styles.card, supervisor && styles.supervisorCard, requested && styles.requestedCard]}>
      <View style={styles.cardLeft}>
        <Text style={styles.cardDate}>{formatDate(event.start.dateTime)}</Text>
        <Text style={styles.cardTime}>
          {formatTime(event.start.dateTime)} – {formatTime(event.end.dateTime)}
        </Text>
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.cardTitle}>{event.summary}</Text>
        {supervisor && <Text style={styles.badge}>SUPERVISOR</Text>}
        {requested && <Text style={[styles.badge, styles.requestedBadge]}>REQUESTED</Text>}
      </View>
    </View>
  );
}

export default function ScheduleScreen() {
  const { getAccessToken, signOut } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadEvents() {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated - please sign out and sign in again');
      const data = await fetchEvents(token);
      setEvents(data);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error('Calendar error:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#c0005a" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadEvents}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: '#666', marginTop: 12 }]} onPress={signOut}>
          <Text style={styles.retryText}>Sign out & try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <EventCard event={item} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.heading}>KBC Schedule</Text>}
        ListEmptyComponent={<Text style={styles.emptyText}>No upcoming events</Text>}
        onRefresh={loadEvents}
        refreshing={loading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16, gap: 10 },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 8, color: '#111' },
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  supervisorCard: { borderLeftWidth: 4, borderLeftColor: '#c0005a' },
  requestedCard: { borderLeftWidth: 4, borderLeftColor: '#f5a623' },
  cardLeft: { alignItems: 'center', justifyContent: 'center', minWidth: 60 },
  cardDate: { fontSize: 11, color: '#666', textAlign: 'center' },
  cardTime: { fontSize: 12, fontWeight: '600', color: '#333', textAlign: 'center' },
  cardRight: { flex: 1, justifyContent: 'center', gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#c0005a',
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  requestedBadge: { backgroundColor: '#f5a623' },
  errorText: { color: '#c0005a', fontSize: 15, marginBottom: 16, textAlign: 'center' },
  retryButton: { backgroundColor: '#c0005a', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  emptyText: { color: '#999', textAlign: 'center', marginTop: 40 },
});
