import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { createSupervisorEvent, createSessionRequest } from '@/services/calendarService';

function formatDate(date: Date) {
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type PickerField = 'date' | 'start' | 'end' | null;

export default function AddSessionScreen() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { presetStart, isRequest } = useLocalSearchParams<{ presetStart?: string; isRequest?: string }>();
  const requestMode  = isRequest === 'true';
  const isAdminUser  = isAdmin(user?.email, profile?.isAdmin);
  const isSupervisor = (profile?.isSupervisor ?? false) || isAdminUser;

  const now = new Date();
  const defaultStart = presetStart ? new Date(presetStart) : (() => {
    const d = new Date(now);
    d.setMinutes(0, 0, 0);
    d.setHours(now.getHours() + 1);
    return d;
  })();
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setHours(defaultStart.getHours() + 2);

  const [date, setDate]                 = useState(presetStart ? new Date(presetStart) : now);
  const [startTime, setStartTime]       = useState(defaultStart);
  const [endTime, setEndTime]           = useState(defaultEnd);
  const [activePicker, setActivePicker] = useState<PickerField>(null);
  const [saving, setSaving]             = useState(false);
  // Supervisors can add either as supervisor slot or plain session
  const [addAsSup, setAddAsSup]         = useState(true);

  // Name shown in the event title — defaults to the user's display name
  const defaultName = profile?.preferredName || user?.name || 'Unknown';
  const [nameOverride, setNameOverride] = useState(defaultName);

  // Preview title — mirrors what calendarService will build
  const previewTitle = requestMode
    ? `${nameOverride} (requested)`
    : isSupervisor && addAsSup
      ? `${nameOverride} (sup)`
      : nameOverride;

  function buildDateTime(datePart: Date, timePart: Date) {
    const result = new Date(datePart);
    result.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
    // Midnight (00:00) in the time picker represents end-of-day — advance to next day
    if (timePart.getHours() === 0 && timePart.getMinutes() === 0) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  async function handleSave() {
    if (!user || !profile) return;

    const start = buildDateTime(date, startTime);
    const end   = buildDateTime(date, endTime);

    if (end <= start) {
      Alert.alert('Invalid time', 'End time must be after start time.');
      return;
    }

    setSaving(true);
    try {
      const calUser = {
        uid:              user.id,
        name:             nameOverride || defaultName,
        email:            user.email,
        isSupervisor:     profile.isSupervisor,
        isAdmin:          isAdminUser,
        membershipStatus: profile.membershipStatus,
      };

      if (requestMode) {
        await createSessionRequest(
          {
            start:        start.toISOString(),
            end:          end.toISOString(),
            timeZone:     'America/Toronto',
            nameOverride: nameOverride || defaultName,
          },
          calUser,
        );
      } else {
        await createSupervisorEvent(
          {
            start:        start.toISOString(),
            end:          end.toISOString(),
            timeZone:     'America/Toronto',
            nameOverride: addAsSup ? (nameOverride || defaultName) : undefined,
          },
          { ...calUser, isSupervisor: addAsSup || calUser.isSupervisor, isAdmin: addAsSup ? calUser.isAdmin : false },
        );
      }

      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: requestMode ? 'Request a Climb Session' : 'Add Climb Session' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        <Text style={styles.sectionLabel}>Name</Text>
        <TextInput
          style={[styles.field, styles.fieldValue]}
          value={nameOverride}
          onChangeText={setNameOverride}
          placeholder="Your name"
          placeholderTextColor="#aaa"
        />

        {/* Supervisor checkbox — only for supervisors adding a normal (non-request) session */}
        {isSupervisor && !requestMode && (
          <TouchableOpacity style={styles.checkRow} onPress={() => setAddAsSup(v => !v)}>
            <View style={[styles.checkbox, addAsSup && styles.checkboxOn]}>
              {addAsSup && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <View>
              <Text style={styles.checkLabel}>Add as Supervisor</Text>
              <Text style={styles.checkSub}>Session will appear as a supervisor slot (pink)</Text>
            </View>
          </TouchableOpacity>
        )}

        <Text style={styles.sectionLabel}>Date</Text>
        <TouchableOpacity style={styles.field} onPress={() => setActivePicker('date')}>
          <Text style={styles.fieldValue}>{formatDate(date)}</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Start Time</Text>
        <TouchableOpacity style={styles.field} onPress={() => setActivePicker('start')}>
          <Text style={styles.fieldValue}>{formatTime(startTime)}</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>End Time</Text>
        <TouchableOpacity style={styles.field} onPress={() => setActivePicker('end')}>
          <Text style={styles.fieldValue}>{formatTime(endTime)}</Text>
        </TouchableOpacity>

        <View style={[styles.previewBox, requestMode && styles.previewBoxRequest]}>
          <Text style={styles.previewLabel}>
            {requestMode ? 'Request preview' : 'Event title preview'}
          </Text>
          <Text style={styles.previewTitle}>{previewTitle}</Text>
          <Text style={styles.previewTime}>
            {formatDate(date)}  ·  {formatTime(startTime)} – {formatTime(endTime)}
          </Text>
        </View>

        {requestMode && (
          <View style={styles.requestNote}>
            <Text style={styles.requestNoteText}>
              📋  Our supervisors will do their best to fulfil your request.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.saveButton, requestMode && styles.saveButtonRequest, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveButtonText}>
                {requestMode ? 'Submit Request' : 'Add to Schedule'}
              </Text>
          }
        </TouchableOpacity>

        <DatePickerModal
          visible={activePicker === 'date'}
          value={date}
          onChange={setDate}
          onClose={() => setActivePicker(null)}
        />
        <TimePickerModal
          visible={activePicker === 'start'}
          value={startTime}
          onChange={setStartTime}
          onClose={() => setActivePicker(null)}
        />
        <TimePickerModal
          visible={activePicker === 'end'}
          value={endTime}
          onChange={setEndTime}
          onClose={() => setActivePicker(null)}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f2' },
  content: { padding: 20, gap: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#999', textTransform: 'uppercase', marginTop: 16, letterSpacing: 0.5 },
  field: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  fieldValue: { fontSize: 16, color: '#111' },

  previewBox: {
    backgroundColor: KBC.black, borderRadius: 12, padding: 16, marginTop: 24, gap: 4,
    borderLeftWidth: 4, borderLeftColor: KBC.pink,
  },
  previewBoxRequest: { borderLeftColor: KBC.purple },
  previewLabel: { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
  previewTitle: { fontSize: 20, fontWeight: '700', color: KBC.white },
  previewTime: { fontSize: 13, color: '#aaa' },
  requestNote: {
    backgroundColor: KBC.purple + '18', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: KBC.purple + '44',
  },
  requestNoteText: { fontSize: 13, color: KBC.purple, lineHeight: 20 },
  saveButton: {
    backgroundColor: KBC.pink, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 24, marginBottom: 40,
  },
  saveButtonRequest: { backgroundColor: KBC.purple },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Supervisor checkbox
  checkRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 10, backgroundColor: '#fff', borderRadius: 10, padding: 14 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: '#ddd', alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkboxOn: { backgroundColor: KBC.pink, borderColor: KBC.pink },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  checkLabel: { fontSize: 15, fontWeight: '700', color: '#111' },
  checkSub: { fontSize: 12, color: '#999', marginTop: 2 },
});
