import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { DatePickerModal, TimePickerModal } from '@/components/time-picker-modal';
import { KBC } from '@/constants/theme';
import { isAdmin } from '@/constants/admins';
import { useAuth } from '@/context/auth';
import { useProfile } from '@/context/profile';
import { createSpecialEvent } from '@/services/calendarService';

function formatDate(date: Date) {
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type PickerField = 'startDate' | 'startTime' | 'endDate' | 'endTime' | null;

export default function AddEventScreen() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { presetStart } = useLocalSearchParams<{ presetStart?: string }>();

  const base = presetStart ? new Date(presetStart) : new Date();
  const defaultStart = new Date(base);
  defaultStart.setMinutes(0, 0, 0);
  if (!presetStart) defaultStart.setHours(base.getHours() + 1);

  const defaultEnd = new Date(defaultStart);
  defaultEnd.setHours(defaultStart.getHours() + 1);

  const [start, setStart]   = useState(defaultStart);
  const [end, setEnd]       = useState(defaultEnd);
  const [title, setTitle]   = useState('');
  const [allDay, setAllDay] = useState(false);
  const [activePicker, setActivePicker] = useState<PickerField>(null);
  const [saving, setSaving] = useState(false);

  function handleAllDayToggle(value: boolean) {
    setAllDay(value);
    if (value) {
      // Reset end to same day as start when switching to all-day
      const sameDay = new Date(start);
      setEnd(sameDay);
    }
  }

  // Merge a new date part into an existing datetime
  function applyDate(current: Date, newDate: Date): Date {
    const result = new Date(current);
    result.setFullYear(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
    return result;
  }

  // Merge a new time part into an existing datetime
  function applyTime(current: Date, newTime: Date): Date {
    const result = new Date(current);
    result.setHours(newTime.getHours(), newTime.getMinutes(), 0, 0);
    return result;
  }

  function handleStartDateChange(d: Date) {
    const newStart = applyDate(start, d);
    setStart(newStart);
    // If end is now before start, push end to 1h after new start
    if (end <= newStart) {
      const newEnd = new Date(newStart);
      newEnd.setHours(newStart.getHours() + 1);
      setEnd(newEnd);
    }
  }

  function handleStartTimeChange(t: Date) {
    const newStart = applyTime(start, t);
    setStart(newStart);
    if (end <= newStart) {
      const newEnd = new Date(newStart);
      newEnd.setHours(newStart.getHours() + 1);
      setEnd(newEnd);
    }
  }

  function handleEndDateChange(d: Date) {
    setEnd(applyDate(end, d));
  }

  function handleEndTimeChange(t: Date) {
    setEnd(applyTime(end, t));
  }

  const multiDay = !isSameDay(start, end);

  async function handleSave() {
    if (!user || !profile) return;
    if (!title.trim()) {
      Alert.alert('Title required', 'Please enter a title for the event.');
      return;
    }
    if (allDay) {
      const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay   = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      if (endDay < startDay) {
        Alert.alert('Invalid date', 'End date must be on or after start date.');
        return;
      }
    } else if (end <= start) {
      Alert.alert('Invalid time', 'End must be after start.');
      return;
    }

    const isAdminUser = isAdmin(user.email, profile.isAdmin);
    if (!profile.isSupervisor && !isAdminUser) {
      Alert.alert('Not authorized', 'Only supervisors and admins can create special events.');
      return;
    }

    setSaving(true);
    try {
      let eventStart: string;
      let eventEnd: string;
      if (allDay) {
        eventStart = toDateString(start);
        // end.date in Google Calendar is exclusive — add 1 day
        const exclusiveEnd = new Date(end);
        exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
        eventEnd = toDateString(exclusiveEnd);
      } else {
        eventStart = start.toISOString();
        eventEnd   = end.toISOString();
      }
      await createSpecialEvent(
        {
          summary:  title.trim(),
          start:    eventStart,
          end:      eventEnd,
          timeZone: 'America/Toronto',
          allDay,
        },
        {
          uid:              user.id,
          name:             profile.preferredName || user.name || user.email,
          email:            user.email,
          isSupervisor:     profile.isSupervisor,
          isAdmin:          isAdminUser,
          membershipStatus: profile.membershipStatus,
        },
      );
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Special Event' }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.screenTitle}>Special Event</Text>

          <Text style={styles.sectionLabel}>Title</Text>
          <TextInput
            style={[styles.field, styles.fieldValue]}
            value={title}
            onChangeText={setTitle}
            placeholder="Event title"
            placeholderTextColor="#aaa"
            autoFocus
          />

          {/* Start */}
          <Text style={styles.sectionLabel}>Start</Text>
          <View style={styles.dateTimeRow}>
            <TouchableOpacity style={[styles.field, allDay ? styles.fullCell : styles.dateCell]} onPress={() => setActivePicker('startDate')}>
              <Text style={styles.fieldValue}>{formatDate(start)}</Text>
            </TouchableOpacity>
            {!allDay && (
              <TouchableOpacity style={[styles.field, styles.timeCell]} onPress={() => setActivePicker('startTime')}>
                <Text style={styles.fieldValue}>{formatTime(start)}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* End */}
          <Text style={styles.sectionLabel}>End</Text>
          <View style={styles.dateTimeRow}>
            <TouchableOpacity style={[styles.field, allDay ? styles.fullCell : styles.dateCell]} onPress={() => setActivePicker('endDate')}>
              <Text style={styles.fieldValue}>{formatDate(end)}</Text>
            </TouchableOpacity>
            {!allDay && (
              <TouchableOpacity style={[styles.field, styles.timeCell]} onPress={() => setActivePicker('endTime')}>
                <Text style={styles.fieldValue}>{formatTime(end)}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* All day checkbox */}
          <TouchableOpacity style={styles.allDayRow} onPress={() => handleAllDayToggle(!allDay)} activeOpacity={0.7}>
            <View style={[styles.checkbox, allDay && styles.checkboxChecked]}>
              {allDay && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={styles.allDayLabel}>All day</Text>
          </TouchableOpacity>

          {multiDay && (
            <View style={styles.multiDayBadge}>
              <Text style={styles.multiDayText}>📅 Multi-day event</Text>
            </View>
          )}

          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>Event preview</Text>
            <Text style={styles.previewTitle}>{title.trim() || '—'}</Text>
            <Text style={styles.previewTime}>
              {allDay
                ? multiDay
                  ? `${formatDate(start)} → ${formatDate(end)}`
                  : `${formatDate(start)} · All Day`
                : `${formatDate(start)}  ${formatTime(start)} → ${multiDay ? `${formatDate(end)}  ` : ''}${formatTime(end)}`
              }
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveButtonText}>Add Special Event</Text>
            }
          </TouchableOpacity>

          <DatePickerModal
            visible={activePicker === 'startDate'}
            value={start}
            onChange={handleStartDateChange}
            onClose={() => setActivePicker(null)}
          />
          <TimePickerModal
            visible={activePicker === 'startTime'}
            value={start}
            onChange={handleStartTimeChange}
            onClose={() => setActivePicker(null)}
            allHours
          />
          <DatePickerModal
            visible={activePicker === 'endDate'}
            value={end}
            onChange={handleEndDateChange}
            onClose={() => setActivePicker(null)}
          />
          <TimePickerModal
            visible={activePicker === 'endTime'}
            value={end}
            onChange={handleEndTimeChange}
            onClose={() => setActivePicker(null)}
            allHours
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#f2f2f2' },
  content: { padding: 20, gap: 6, paddingBottom: 40 },
  screenTitle: { fontSize: 28, fontWeight: '800', color: KBC.black, marginBottom: 8, marginTop: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#999', textTransform: 'uppercase', marginTop: 16, letterSpacing: 0.5 },

  allDayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: '#ccc', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { borderColor: KBC.cyan, backgroundColor: KBC.cyan },
  checkboxMark: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 },
  allDayLabel: { fontSize: 15, color: KBC.black },

  dateTimeRow: { flexDirection: 'row', gap: 8 },
  dateCell: { flex: 3 },
  timeCell: { flex: 2 },
  fullCell: { flex: 1 },

  field: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  fieldValue: { fontSize: 16, color: KBC.black },

  multiDayBadge: {
    backgroundColor: KBC.cyan + '18', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: KBC.cyan + '44', marginTop: 4,
  },
  multiDayText: { fontSize: 13, color: KBC.cyan, fontWeight: '600' },

  previewBox: {
    backgroundColor: KBC.black, borderRadius: 12, padding: 16, marginTop: 24, gap: 4,
    borderLeftWidth: 4, borderLeftColor: KBC.cyan,
  },
  previewLabel: { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
  previewTitle: { fontSize: 20, fontWeight: '700', color: KBC.white },
  previewTime: { fontSize: 13, color: '#aaa' },

  saveButton: {
    backgroundColor: KBC.cyan, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 24,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
