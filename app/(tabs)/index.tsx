import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { TimelineView } from '@/components/timeline-view';
import { KBC } from '@/constants/theme';
import { isAdmin } from '@/constants/admins';
import { useAuth } from '@/context/auth';
import { useProfile } from '@/context/profile';
import { useSchedule } from '@/context/schedule';

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatHeader(date: Date) {
  const today = new Date();
  if (isSameDay(date, today)) return 'Today';
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (isSameDay(date, tomorrow)) return 'Tomorrow';
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function ScheduleScreen() {
  const { user, signOut } = useAuth();
  const { profile }       = useProfile();
  const { selectedDate, setSelectedDate, goToToday, allEvents, loading, error, reload } = useSchedule();
  const isSupervisor = profile?.isSupervisor ?? false;
  const isAdminUser  = isAdmin(user?.email, profile?.isAdmin);

  useFocusEffect(useCallback(() => { reload(); }, []));

  function changeDay(offset: number) {
    const next = new Date(selectedDate);
    next.setDate(selectedDate.getDate() + offset);
    setSelectedDate(next);
  }

  const isToday = isSameDay(selectedDate, new Date());

  const dayEvents = allEvents.filter(e =>
    e.start?.dateTime && isSameDay(new Date(e.start.dateTime), selectedDate)
  );

  return (
    <View style={styles.container}>
      {/* Day navigator */}
      <View style={styles.dayNav}>
        <TouchableOpacity style={styles.navArrow} onPress={() => changeDay(-1)}>
          <Text style={styles.navArrowText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.dayTitleGroup}>
          <Text style={styles.dayTitle}>{formatHeader(selectedDate)}</Text>
          {!isToday && (
            <TouchableOpacity style={styles.todayBtn} onPress={goToToday}>
              <Text style={styles.todayBtnText}>Today</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.navArrow} onPress={() => changeDay(1)}>
          <Text style={styles.navArrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#c0005a' }]} />
          <Text style={styles.legendLabel}>Supervisor</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: KBC.purple }]} />
          <Text style={styles.legendLabel}>Requested</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: KBC.cyan }]} />
          <Text style={styles.legendLabel}>Events</Text>
        </View>
      </View>

      {/* Timeline */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#c0005a" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={reload}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: '#666', marginTop: 10 }]} onPress={signOut}>
            <Text style={styles.retryText}>Sign out & try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TimelineView
          events={dayEvents}
          selectedDate={selectedDate}
          scrollToFirstEvent
          onEventPress={event => router.push({ pathname: '/edit-session', params: {
            id: event.id,
            summary: event.summary,
            start: event.start.dateTime,
            end: event.end.dateTime,
            description: event.description ?? '',
          }})}
          onTimePress={date => router.push({ pathname: '/add-session', params: {
            presetStart: date.toISOString(),
          }})}
        />
      )}

      {/* Bottom action buttons */}
      <View style={styles.buttonRow}>
        {isSupervisor ? (
          // Supervisors: single "Climb Session" button
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/add-session')}
          >
            <Text style={styles.addButtonText}>+ Climb Session</Text>
          </TouchableOpacity>
        ) : (
          // Non-supervisors: session button always shown; request only for members (not non-members)
          <>
            <TouchableOpacity
              style={[styles.addButton, styles.addButtonSession]}
              onPress={() => router.push('/add-session')}
            >
              <Text style={styles.addButtonText}>+ Session</Text>
            </TouchableOpacity>
            {profile?.membershipStatus !== 'non-member' && (
              <TouchableOpacity
                style={[styles.addButton, styles.addButtonRequest]}
                onPress={() => router.push({ pathname: '/add-session', params: { isRequest: 'true' } } as any)}
              >
                <Text style={styles.addButtonText}>+ Request</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {isAdminUser && (
          <TouchableOpacity
            style={styles.addEventButton}
            onPress={() => router.push({ pathname: '/add-event', params: { presetStart: selectedDate.toISOString() } } as any)}
          >
            <Text style={styles.addEventButtonLabel}>+ Special Event</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1c',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  navArrow: { padding: 8 },
  navArrowText: { fontSize: 32, color: '#c0005a', lineHeight: 36 },
  dayTitleGroup: { flex: 1, alignItems: 'center' },
  dayTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  todayBtn: {
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c0005a',
  },
  todayBtnText: { fontSize: 11, color: '#c0005a', fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#c0005a', fontSize: 14, marginBottom: 16, textAlign: 'center' },
  retryButton: { backgroundColor: '#c0005a', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  legend: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11, color: '#888', fontWeight: '500' },
  buttonRow: {
    flexDirection: 'row',
    marginHorizontal: 10,
    marginVertical: 14,
    gap: 8,
    alignItems: 'center',
  },
  addButton: {
    flex: 3,
    backgroundColor: '#c0005a',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#c0005a',
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  addButtonSession: { backgroundColor: '#c0005a' },
  addButtonRequest: { backgroundColor: KBC.purple },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  addEventButton: {
    flex: 2,
    backgroundColor: KBC.cyan,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: KBC.cyan,
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  addEventButtonLabel: { fontSize: 16, color: '#fff', fontWeight: '700', textAlign: 'center' },
});
