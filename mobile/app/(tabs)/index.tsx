import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { CalendarPicker } from '@/components/calendar-picker';
import { TimelineView } from '@/components/timeline-view';
import { KBC } from '@/constants/theme';
import { isAdmin } from '@/constants/admins';
import { useAuth } from '@/context/auth';
import { useProfile } from '@/context/profile';
import { useSchedule } from '@/context/schedule';
import type { CalendarEvent } from '@/services/calendarService';

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isAllDayOnDay(event: CalendarEvent, day: Date): boolean {
  if (!event.start?.date || !event.end?.date) return false;
  const [sy, sm, sd] = event.start.date.split('-').map(Number);
  const [ey, em, ed] = event.end.date.split('-').map(Number);
  const startDate = new Date(sy, sm - 1, sd);
  const endDate   = new Date(ey, em - 1, ed); // exclusive
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  return d >= startDate && d < endDate;
}

function formatHeaderDate(date: Date): string {
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatHeaderLabel(date: Date): string | null {
  const today = new Date();
  if (isSameDay(date, today)) return '(Today)';
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (isSameDay(date, tomorrow)) return '(Tomorrow)';
  return null;
}

export default function ScheduleScreen() {
  const { user, signOut } = useAuth();
  const { profile }       = useProfile();
  const { selectedDate, setSelectedDate, allEvents, loading, error, reload } = useSchedule();
  const isSupervisor = profile?.isSupervisor ?? false;
  const isAdminUser  = isAdmin(user?.email, profile?.isAdmin);

  const [calPickerVisible, setCalPickerVisible] = useState(false);

  useFocusEffect(useCallback(() => { reload(); }, []));

  function changeDay(offset: number) {
    const next = new Date(selectedDate);
    next.setDate(selectedDate.getDate() + offset);
    setSelectedDate(next);
  }

  const daySwipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-25, 25])
    .failOffsetY([-20, 20])
    .onEnd(e => {
      if (Math.abs(e.translationX) < 60) return;
      changeDay(e.translationX < 0 ? 1 : -1);
    });

  const dayEvents = allEvents.filter(e => {
    if (e.start?.dateTime) return isSameDay(new Date(e.start.dateTime), selectedDate);
    if (e.start?.date)     return isAllDayOnDay(e, selectedDate);
    return false;
  });

  return (
    <GestureDetector gesture={daySwipe}>
    <View style={styles.container}>
      {/* Day navigator */}
      <View style={styles.dayNav}>
        <TouchableOpacity style={styles.dayTitleGroup} onPress={() => setCalPickerVisible(true)} activeOpacity={0.7}>
          <View style={styles.dayTitleRow}>
            <Text style={styles.dayTitle}>{formatHeaderDate(selectedDate)}</Text>
            <Text style={styles.calIcon}>📅</Text>
          </View>
          {formatHeaderLabel(selectedDate) && (
            <Text style={styles.dayLabel}>{formatHeaderLabel(selectedDate)}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.refreshBtn} onPress={reload}>
          <Text style={styles.refreshBtnText}>↻</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navArrow} onPress={() => changeDay(-1)}>
          <Text style={styles.navArrowText}>‹</Text>
        </TouchableOpacity>
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
          onEventPress={event => {
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
          }}
          onTimePress={date => router.push({ pathname: '/add-session', params: {
            presetStart: date.toISOString(),
            ...(!isSupervisor && !isAdminUser ? { isRequest: 'true' } : {}),
          }})}
        />
      )}

      {/* Bottom action buttons */}
      <View style={styles.buttonRow}>
        {(isSupervisor || isAdminUser) ? (
          // Supervisors/admins: pink "+ Climb Session" button
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/add-session')}
          >
            <Text style={styles.addButtonText}>+ Climb Session</Text>
          </TouchableOpacity>
        ) : (
          // Regular members: single purple "Request Climb Session" button
          <TouchableOpacity
            style={[styles.addButton, styles.addButtonRequest]}
            onPress={() => router.push({ pathname: '/add-session', params: { isRequest: 'true' } } as any)}
          >
            <Text style={styles.addButtonText}>Request Climb Session</Text>
          </TouchableOpacity>
        )}

        {(isAdminUser || isSupervisor) && (
          <TouchableOpacity
            style={styles.addEventButton}
            onPress={() => router.push({ pathname: '/add-event', params: { presetStart: selectedDate.toISOString() } } as any)}
          >
            <Text style={styles.addEventButtonLabel}>+ Special Event</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Calendar picker modal — outside GestureDetector to avoid gesture conflicts */}
      <Modal
        visible={calPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCalPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setCalPickerVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <CalendarPicker
              selectedDate={selectedDate}
              allEvents={allEvents}
              onDayPress={day => {
                setSelectedDate(day);
                setCalPickerVisible(false);
              }}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
    </GestureDetector>
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
  dayTitleGroup: { flex: 1, alignItems: 'flex-start' },
  refreshBtn: { padding: 8, marginRight: 2 },
  refreshBtnText: { fontSize: 24, color: '#c0005a', lineHeight: 30 },
  dayTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  dayLabel: { fontSize: 11, color: '#aaa', fontWeight: '500', marginTop: 1 },
  calIcon: { fontSize: 15, opacity: 0.8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 28,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#ddd',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
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
