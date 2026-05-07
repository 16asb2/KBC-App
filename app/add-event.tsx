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
import { useAuth } from '@/context/auth';
import { createEvent } from '@/services/calendar';

function formatDate(date: Date) {
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

type PickerField = 'startDate' | 'startTime' | 'endDate' | 'endTime' | null;

export default function AddEventScreen() {
  const { getAccessToken } = useAuth();
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
  const [activePicker, setActivePicker] = useState<PickerField>(null);
  const [saving, setSaving] = useState(false);

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
    if (!title.trim()) {
      Alert.alert('Title required', 'Please enter a title for the event.');
      return;
    }
    if (end <= start) {
      Alert.alert('Invalid time', 'End must be after start.');
      return;
    }

    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');

      await createEvent(token, {
        summary: title.trim(),
        start: { dateTime: start.toISOString(), timeZone: 'America/Toronto' },
        end:   { dateTime: end.toISOString(),   timeZone: 'America/Toronto' },
      });

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
            <TouchableOpacity style={[styles.field, styles.dateCell]} onPress={() => setActivePicker('startDate')}>
              <Text style={styles.fieldValue}>{formatDate(start)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.field, styles.timeCell]} onPress={() => setActivePicker('startTime')}>
              <Text style={styles.fieldValue}>{formatTime(start)}</Text>
            </TouchableOpacity>
          </View>

          {/* End */}
          <Text style={styles.sectionLabel}>End</Text>
          <View style={styles.dateTimeRow}>
            <TouchableOpacity style={[styles.field, styles.dateCell]} onPress={() => setActivePicker('endDate')}>
              <Text style={styles.fieldValue}>{formatDate(end)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.field, styles.timeCell]} onPress={() => setActivePicker('endTime')}>
              <Text style={styles.fieldValue}>{formatTime(end)}</Text>
            </TouchableOpacity>
          </View>

          {multiDay && (
            <View style={styles.multiDayBadge}>
              <Text style={styles.multiDayText}>📅 Multi-day event</Text>
            </View>
          )}

          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>Event preview</Text>
            <Text style={styles.previewTitle}>{title.trim() || '—'}</Text>
            <Text style={styles.previewTime}>
              {formatDate(start)}  {formatTime(start)}
              {' → '}
              {multiDay ? `${formatDate(end)}  ` : ''}{formatTime(end)}
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

  dateTimeRow: { flexDirection: 'row', gap: 8 },
  dateCell: { flex: 3 },
  timeCell: { flex: 2 },

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
