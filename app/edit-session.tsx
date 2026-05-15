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
import {
  joinSession,
  leaveSession,
  updateSupervisorEvent,
  deleteSupervisorEvent,
  fulfillSessionRequest,
} from '@/services/calendarService';

function formatDate(date: Date) {
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}
function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
// Parse a YYYY-MM-DD date string in local time (avoids UTC midnight timezone shift).
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

type PickerField = 'date' | 'start' | 'end' | null;

export default function EditSessionScreen() {
  const { id, summary, start, end, description } = useLocalSearchParams<{
    id: string; summary: string; start: string; end: string; description?: string;
  }>();
  const { user, getAccessToken } = useAuth();
  const { profile }              = useProfile();

  // ── Role detection ───────────────────────────────────────────────────────────
  const isAdminUser      = isAdmin(user?.email, profile?.isAdmin);
  const isSupervisorUser = (profile?.isSupervisor ?? false) || isAdminUser;

  // ── Event type detection ─────────────────────────────────────────────────────
  const isRequestEvent  = summary?.toLowerCase().includes('(requested)') ?? false;
  const isSuperEvent    = summary?.toLowerCase().includes('(sup)') || summary?.toLowerCase().includes('(super)');
  const isSpecialEvent  = !isSuperEvent && !isRequestEvent;
  const isAllDayEvent   = !!start && !start.includes('T');

  // Past event: start is before now (all-day: before today midnight local).
  const isPastEvent = (() => {
    if (!start) return false;
    if (isAllDayEvent) {
      const [y, m, d] = start.split('-').map(Number);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return new Date(y, m - 1, d) < today;
    }
    return new Date(start) < new Date();
  })();
  const requesterName  = isRequestEvent ? (summary?.replace(/\s*\(requested\)/i, '').trim() ?? '') : '';
  const requesterEmail = (() => {
    const m = description?.match(/^requested_by:(.+)$/);
    return m ? m[1].trim() : '';
  })();
  const isCreator = !!user?.email && requesterEmail !== '' && requesterEmail === user.email;

  // ── Join session state ───────────────────────────────────────────────────────
  const [joining, setJoining]       = useState(false);
  const [joinedId, setJoinedId]     = useState<string | null>(null);
  const [leaving, setLeaving]       = useState(false);
  const [leftSession, setLeftSession] = useState(false);

  // Detect if current user is already in the title (heuristic)
  const userName        = profile?.preferredName || user?.name || '';
  const alreadyInTitle  = !!userName && summary?.toLowerCase().includes(userName.toLowerCase());

  // ── Edit form state ──────────────────────────────────────────────────────────
  const isSuperInit = summary?.toLowerCase().includes('sup') ?? false;
  const baseName    = summary
    ?.replace(/\s*\(sup\)/i, '')
    .replace(/\s*\(super\)/i, '')
    .replace(/\s*\(requested\)/i, '')
    .trim() ?? '';

  const startDate = new Date(start);
  const endDate   = new Date(end);

  const [title, setTitle]               = useState(
    isRequestEvent && isSupervisorUser ? (profile?.preferredName || (user?.name ?? '')) : baseName,
  );
  const [date, setDate]                 = useState(startDate);
  const [startTime, setStartTime]       = useState(startDate);
  const [endTime, setEndTime]           = useState(endDate);
  const [isSupervisor, setIsSupervisor] = useState(isSuperInit);
  const [activePicker, setActivePicker] = useState<PickerField>(null);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);

  const eventTitle = isSupervisor ? `${title} (super)` : title;

  function buildDateTime(datePart: Date, timePart: Date) {
    const result = new Date(datePart);
    result.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
    if (timePart.getHours() === 0 && timePart.getMinutes() === 0) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  function calUser() {
    return {
      uid:              user!.id,
      name:             profile?.preferredName || user?.name || user?.email || '',
      email:            user!.email,
      isSupervisor:     profile?.isSupervisor ?? false,
      isAdmin:          isAdminUser,
      membershipStatus: profile?.membershipStatus ?? 'inactive',
    };
  }

  // ── Join session ─────────────────────────────────────────────────────────────

  async function handleJoin() {
    if (!user || !profile) return;
    setJoining(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const newId = await joinSession(id, calUser(), token);
      setJoinedId(newId);
      setLeftSession(false);
      Alert.alert('Joined!', 'You\'ve been added to this session.');
    } catch (e: any) {
      Alert.alert('Could not join', e.message);
    } finally {
      setJoining(false);
    }
  }

  async function handleLeave() {
    if (!user || !profile) return;
    setLeaving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      await leaveSession(id, calUser(), token);
      setJoinedId(null);
      setLeftSession(true);
      Alert.alert('Cancelled', 'You\'ve been removed from this session.');
    } catch (e: any) {
      Alert.alert('Could not cancel', e.message);
    } finally {
      setLeaving(false);
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    const newStart = buildDateTime(date, startTime);
    const newEnd   = buildDateTime(date, endTime);
    if (newEnd <= newStart) { Alert.alert('Invalid time', 'End time must be after start time.'); return; }

    setSaving(true);
    try {
      await updateSupervisorEvent(
        id,
        {
          start:        newStart.toISOString(),
          end:          newEnd.toISOString(),
          timeZone:     'America/Toronto',
          nameOverride: title,
          isSupervisor,
        },
        calUser(),
      );
      router.back();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    Alert.alert('Delete Event', 'Are you sure you want to delete this session?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setDeleting(true);
        try {
          await deleteSupervisorEvent(id, calUser());
          router.back();
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setDeleting(false); }
      }},
    ]);
  }

  async function handleCancelRequest() {
    Alert.alert('Cancel Request', 'Remove your climb session request?', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel Request', style: 'destructive', onPress: async () => {
        setDeleting(true);
        try {
          // Requests are created by the admin account, deleted by admin account too
          await deleteSupervisorEvent(id, { ...calUser(), isSupervisor: true });
          router.back();
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setDeleting(false); }
      }},
    ]);
  }

  async function handleFulfill() {
    const newStart = buildDateTime(date, startTime);
    const newEnd   = buildDateTime(date, endTime);
    if (newEnd <= newStart) { Alert.alert('Invalid time', 'End time must be after start time.'); return; }

    setSaving(true);
    try {
      await fulfillSessionRequest(
        id,
        newStart.toISOString(),
        newEnd.toISOString(),
        requesterName,
        calUser(),
      );
      router.back();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  }

  // ── Join Session banner (shown on supervisor events to ALL users) ─────────────
  function JoinBanner() {
    if (!isSuperEvent || isRequestEvent) return null;
    if (isPastEvent) return null;

    // Organizer: supervisor whose name was already in the title before any explicit join.
    // They manage the event via the edit form — no join/cancel button for them.
    const isOrganizer = isSupervisorUser && alreadyInTitle && joinedId === null && !leftSession;
    if (isOrganizer) return null;

    const isInSession = (alreadyInTitle && !leftSession) || (joinedId !== null && !leftSession);

    if (isInSession) {
      return (
        <TouchableOpacity
          style={[styles.leaveBtn, leaving && styles.buttonDisabled]}
          onPress={handleLeave}
          disabled={leaving}
        >
          {leaving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.leaveBtnText}>✕  Cancel Session</Text>
          }
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.joinBtn, joining && styles.buttonDisabled]}
        onPress={handleJoin}
        disabled={joining}
      >
        {joining
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.joinBtnText}>🧗  Join This Session</Text>
        }
      </TouchableOpacity>
    );
  }

  // ── Read-only card (non-supervisor, non-creator viewing a request) ────────────
  if (isRequestEvent && !isCreator && !isSupervisorUser) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: 'Climb Session Request' }} />
        <View style={styles.requestCard}>
          <View style={[styles.requestBadge, { backgroundColor: KBC.purple }]}>
            <Text style={styles.requestBadgeText}>SESSION REQUEST</Text>
          </View>
          <Text style={styles.requestCardName}>{requesterName}</Text>
          <Text style={styles.requestCardTime}>{formatDate(startDate)}</Text>
          <Text style={styles.requestCardTime}>
            {formatTime(startDate)} – {formatTime(endDate)}
          </Text>
        </View>
        <Text style={styles.requestInfoText}>
          A supervisor will review this request and confirm the session.
        </Text>
      </ScrollView>
    );
  }

  // ── Creator viewing their own request ────────────────────────────────────────
  if (isRequestEvent && isCreator) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: 'Your Session Request' }} />
        <View style={styles.requestCard}>
          <View style={[styles.requestBadge, { backgroundColor: KBC.purple }]}>
            <Text style={styles.requestBadgeText}>YOUR REQUEST</Text>
          </View>
          <Text style={styles.requestCardName}>{requesterName}</Text>
          <Text style={styles.requestCardTime}>{formatDate(startDate)}</Text>
          <Text style={styles.requestCardTime}>
            {formatTime(startDate)} – {formatTime(endDate)}
          </Text>
        </View>
        <Text style={styles.requestInfoText}>
          {isPastEvent
            ? 'This session request has passed.'
            : 'Awaiting supervisor confirmation. You\'ll be able to climb once a supervisor fulfills this request.'}
        </Text>
        {!isPastEvent && (
          <TouchableOpacity
            style={[styles.cancelRequestBtn, deleting && styles.buttonDisabled]}
            onPress={handleCancelRequest}
            disabled={deleting}
          >
            {deleting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveButtonText}>Cancel Request</Text>
            }
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  // ── Supervisor fulfilling a request ──────────────────────────────────────────
  if (isRequestEvent && isSupervisorUser) {
    return (
      <>
        <Stack.Screen options={{ title: 'Fulfill Request' }} />
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <View style={styles.requestCard}>
            <View style={[styles.requestBadge, { backgroundColor: KBC.purple }]}>
              <Text style={styles.requestBadgeText}>SESSION REQUEST</Text>
            </View>
            <Text style={styles.requestCardName}>Requested by {requesterName}</Text>
            <Text style={styles.requestCardTime}>{formatDate(startDate)}</Text>
            <Text style={styles.requestCardTime}>
              {formatTime(startDate)} – {formatTime(endDate)}
            </Text>
          </View>

          <Text style={styles.sectionLabel}>Your Name (Supervisor)</Text>
          <TextInput
            style={[styles.field, styles.fieldValue]}
            value={title}
            onChangeText={setTitle}
            placeholder="Supervisor name"
            placeholderTextColor="#aaa"
          />

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

          <View style={[styles.previewBox, { borderLeftColor: KBC.green }]}>
            <Text style={styles.previewLabel}>Fulfilled session preview</Text>
            <Text style={styles.previewTitle}>{title} + {requesterName} (super)</Text>
            <Text style={styles.previewTime}>
              {formatDate(date)}  ·  {formatTime(startTime)} – {formatTime(endTime)}
            </Text>
          </View>

          {isPastEvent ? (
            <Text style={styles.requestInfoText}>This request has passed and can no longer be fulfilled.</Text>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.fulfillBtn, saving && styles.buttonDisabled]}
                onPress={handleFulfill}
                disabled={saving || deleting}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveButtonText}>✓  Fulfill Request</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deleteButton, deleting && styles.buttonDisabled]}
                onPress={handleDelete}
                disabled={saving || deleting}
              >
                {deleting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveButtonText}>Delete Request</Text>
                }
              </TouchableOpacity>
            </>
          )}

          <DatePickerModal visible={activePicker === 'date'} value={date} onChange={setDate} onClose={() => setActivePicker(null)} />
          <TimePickerModal visible={activePicker === 'start'} value={startTime} onChange={setStartTime} onClose={() => setActivePicker(null)} />
          <TimePickerModal visible={activePicker === 'end'} value={endTime} onChange={setEndTime} onClose={() => setActivePicker(null)} />
        </ScrollView>
      </>
    );
  }

  // ── Special event view (competitions, workshops, etc.) ──────────────────────
  if (isSpecialEvent) {
    const dateDisplay = (() => {
      if (isAllDayEvent) {
        const s = parseLocalDate(start);
        // Google Calendar end.date is exclusive — subtract 1 day for display
        const endParts = end.split('-').map(Number);
        const e = new Date(endParts[0], endParts[1] - 1, endParts[2] - 1);
        const sStr = formatDate(s);
        return s.getTime() === e.getTime() ? `${sStr} · All Day` : `${sStr} – ${formatDate(e)} · All Day`;
      }
      return `${formatDate(startDate)} · ${formatTime(startDate)} – ${formatTime(endDate)}`;
    })();

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: 'Event Details' }} />
        <View style={[styles.sessionInfoCard, { borderLeftColor: KBC.cyan }]}>
          <Text style={styles.sessionInfoTitle}>{summary}</Text>
          <Text style={styles.sessionInfoTime}>{dateDisplay}</Text>
        </View>
        {isAdminUser && !isPastEvent && (
          <TouchableOpacity
            style={[styles.deleteButton, deleting && styles.buttonDisabled]}
            onPress={handleDelete}
            disabled={deleting}
          >
            {deleting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveButtonText}>Delete Event</Text>
            }
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  // ── Regular session view / edit ───────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: isSupervisorUser && !isPastEvent ? 'Edit Session' : 'Session Details' }} />

      {/* Join Session banner — shown to ALL users at top */}
      <JoinBanner />

      {/* Session info card — non-supervisors always, supervisors when past */}
      {(!isSupervisorUser || isPastEvent) && (
        <View style={styles.sessionInfoCard}>
          <Text style={styles.sessionInfoTitle}>{summary}</Text>
          <Text style={styles.sessionInfoTime}>
            {formatDate(startDate)}  ·  {formatTime(startDate)} – {formatTime(endDate)}
          </Text>
          {isPastEvent && <Text style={styles.pastBadge}>Past event</Text>}
        </View>
      )}

      {/* Edit form — supervisors/admins only, future events only */}
      {isSupervisorUser && !isPastEvent && (
        <>
          <Text style={styles.sectionLabel}>Name</Text>
          <TextInput
            style={[styles.field, styles.fieldValue]}
            value={title}
            onChangeText={setTitle}
            placeholder="Your name"
            placeholderTextColor="#aaa"
          />

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

          <TouchableOpacity style={styles.checkRow} onPress={() => setIsSupervisor(v => !v)}>
            <View style={[styles.checkbox, isSupervisor && styles.checkboxChecked]}>
              {isSupervisor && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkLabel}>Supervisor</Text>
          </TouchableOpacity>

          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>Event title preview</Text>
            <Text style={styles.previewTitle}>{eventTitle}</Text>
            <Text style={styles.previewTime}>
              {formatDate(date)}  ·  {formatTime(startTime)} – {formatTime(endTime)}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving || deleting}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.deleteButton, deleting && styles.buttonDisabled]}
            onPress={handleDelete}
            disabled={saving || deleting}
          >
            {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Delete Session</Text>}
          </TouchableOpacity>

          <DatePickerModal visible={activePicker === 'date'} value={date} onChange={setDate} onClose={() => setActivePicker(null)} />
          <TimePickerModal visible={activePicker === 'start'} value={startTime} onChange={setStartTime} onClose={() => setActivePicker(null)} />
          <TimePickerModal visible={activePicker === 'end'} value={endTime} onChange={setEndTime} onClose={() => setActivePicker(null)} />
        </>
      )}
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f2' },
  content: { padding: 20, gap: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#999', textTransform: 'uppercase', marginTop: 16, letterSpacing: 0.5 },
  field: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  fieldValue: { fontSize: 16, color: KBC.black },
  checkRow: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 1,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: KBC.pink,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: KBC.pink },
  checkmark: { color: KBC.white, fontSize: 14, fontWeight: '700' },
  checkLabel: { fontSize: 16, color: KBC.black, flex: 1 },
  previewBox: {
    backgroundColor: KBC.black, borderRadius: 12, padding: 16, marginTop: 24, gap: 4,
    borderLeftWidth: 4, borderLeftColor: KBC.pink,
  },
  previewLabel: { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
  previewTitle: { fontSize: 20, fontWeight: '700', color: KBC.white },
  previewTime: { fontSize: 13, color: '#aaa' },

  // Join session banner
  joinBtn: {
    backgroundColor: KBC.cyan, borderRadius: 12, padding: 16,
    alignItems: 'center', marginBottom: 8,
    shadowColor: KBC.cyan, shadowOpacity: 0.3, shadowRadius: 8, elevation: 3,
  },
  joinBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  leaveBtn: {
    backgroundColor: KBC.darkGrey, borderRadius: 12, padding: 16,
    alignItems: 'center', marginBottom: 8,
    borderWidth: 1, borderColor: '#666',
  },
  leaveBtnText: { color: '#ccc', fontSize: 16, fontWeight: '700' },

  // Session info card (non-supervisors)
  sessionInfoCard: {
    backgroundColor: KBC.black, borderRadius: 14, padding: 20, gap: 6, marginBottom: 8,
    borderLeftWidth: 4, borderLeftColor: '#c0005a',
  },
  sessionInfoTitle: { fontSize: 20, fontWeight: '800', color: KBC.white },
  sessionInfoTime:  { fontSize: 14, color: '#aaa' },
  pastBadge: { fontSize: 11, color: '#666', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },

  // Request card
  requestCard: {
    backgroundColor: KBC.black, borderRadius: 14, padding: 20, gap: 6, marginBottom: 8,
    borderLeftWidth: 4, borderLeftColor: KBC.purple,
  },
  requestBadge: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 4 },
  requestBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  requestCardName: { fontSize: 20, fontWeight: '800', color: KBC.white },
  requestCardTime: { fontSize: 14, color: '#aaa' },
  requestInfoText: { fontSize: 13, color: '#888', lineHeight: 20, marginTop: 4, marginBottom: 16 },

  cancelRequestBtn: {
    backgroundColor: KBC.darkGrey, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8, marginBottom: 40,
    borderWidth: 1, borderColor: '#c0005a',
  },
  fulfillBtn: {
    backgroundColor: KBC.green, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 24,
  },
  saveButton: {
    backgroundColor: KBC.pink, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 24,
  },
  deleteButton: {
    backgroundColor: KBC.darkGrey, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 12, marginBottom: 40,
    borderWidth: 1, borderColor: '#444',
  },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
