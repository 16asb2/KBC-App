import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KBC } from '@/constants/theme';
import { isAdmin } from '@/constants/admins';
import { useAuth } from '@/context/auth';
import { useProfile } from '@/context/profile';
import { LogEntry, getRecentLogs, getArchiveLogs, updateLogEntry } from '@/services/logbook';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatLogTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday)     return time;
  if (isYesterday) return `Yesterday\n${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}\n${time}`;
}

function accessColor(accessType: string): string {
  if (accessType.toLowerCase().includes('active'))  return KBC.green;
  if (accessType.toLowerCase().includes('punch'))   return KBC.cyan;
  if (accessType.toLowerCase().includes('drop'))    return KBC.orange;
  if (accessType.toLowerCase().includes('annual') ||
      accessType.toLowerCase().includes('month'))   return KBC.purple;
  return '#888';
}

// ─── Amend Modal ─────────────────────────────────────────────────────────────

function AmendModal({
  entry, onSave, onClose,
}: {
  entry: LogEntry;
  onSave: (accessType: string, notes: string) => Promise<void>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [accessType, setAccessType] = useState(entry.accessType);
  const [notes, setNotes]           = useState(entry.notes ?? '');
  const [saving, setSaving]         = useState(false);

  async function handleSave() {
    setSaving(true);
    try { await onSave(accessType, notes); onClose(); }
    catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Amend Entry</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.sheetCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.sheetBody}>
            <Text style={styles.fieldLabel}>Access Type</Text>
            <TextInput
              style={styles.input}
              value={accessType}
              onChangeText={setAccessType}
              placeholder="e.g. Active Member"
              placeholderTextColor="#aaa"
              returnKeyType="next"
            />
            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={[styles.input, { height: 80 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional note…"
              placeholderTextColor="#aaa"
              multiline
            />
            <Text style={styles.amendMeta}>
              {entry.amendedBy ? `Last amended by ${entry.amendedBy}` : `Original entry by ${entry.userName}`}
            </Text>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Amendment</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Log Row ─────────────────────────────────────────────────────────────────

function LogRow({
  entry, canAmend, onAmend, onViewProfile,
}: {
  entry: LogEntry;
  canAmend: boolean;
  onAmend: () => void;
  onViewProfile?: () => void;
}) {
  const color = accessColor(entry.accessType);
  return (
    <View style={styles.row}>
      <Text style={styles.rowTime}>{formatLogTime(entry.timestamp)}</Text>
      <View style={styles.rowMiddle}>
        <TouchableOpacity onPress={onViewProfile} disabled={!onViewProfile} activeOpacity={0.6}>
          <Text style={[styles.rowName, onViewProfile && styles.rowNameLink]}>
            {entry.userName}
          </Text>
        </TouchableOpacity>
        <View style={[styles.accessPill, { backgroundColor: color + '22' }]}>
          <Text style={[styles.accessText, { color }]}>{entry.accessType}</Text>
        </View>
        {entry.notes ? <Text style={styles.rowNotes}>{entry.notes}</Text> : null}
        {entry.amendedBy ? (
          <Text style={styles.amendedTag}>✏ amended</Text>
        ) : null}
      </View>
      {canAmend && (
        <TouchableOpacity style={styles.amendBtn} onPress={onAmend}>
          <Text style={styles.amendBtnText}>Edit</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function LogBookScreen() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [archive, setArchive]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [amending, setAmending]   = useState<LogEntry | null>(null);

  const canAmend    = isAdmin(user?.email) || (profile?.isSupervisor ?? false);
  const canSeePurchases = canAmend; // admins + supervisors only

  async function loadLogs(isArchive = archive) {
    try {
      const data = isArchive ? await getArchiveLogs() : await getRecentLogs();
      setLogs(data);
    } catch (e) {
      console.warn('Failed to load logs:', e);
    }
  }

  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadLogs().finally(() => setLoading(false));
  }, []));

  async function handleToggle(toArchive: boolean) {
    setArchive(toArchive);
    setLoading(true);
    await loadLogs(toArchive);
    setLoading(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadLogs();
    setRefreshing(false);
  }

  async function handleAmend(entry: LogEntry, accessType: string, notes: string) {
    await updateLogEntry(entry.id, { accessType, notes: notes || undefined }, user?.email ?? '');
    await loadLogs();
  }

  return (
    <View style={styles.container}>
      {/* Toggle: Recent / Archive */}
      <View style={styles.toggleBar}>
        <TouchableOpacity
          style={[styles.toggleBtn, !archive && styles.toggleBtnActive]}
          onPress={() => handleToggle(false)}
        >
          <Text style={[styles.toggleBtnText, !archive && styles.toggleBtnTextActive]}>
            Last 30 Days
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, archive && styles.toggleBtnActive]}
          onPress={() => handleToggle(true)}
        >
          <Text style={[styles.toggleBtnText, archive && styles.toggleBtnTextActive]}>
            Archive
          </Text>
        </TouchableOpacity>
      </View>

      {/* Table header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderCell, { width: 72 }]}>Time</Text>
        <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Member · Access</Text>
        {canAmend && <Text style={[styles.tableHeaderCell, { width: 44 }]} />}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={KBC.green} />
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={KBC.green} />}
        >
          {(() => {
            const visible = canSeePurchases
              ? logs
              : logs.filter(l => !l.notes?.includes('Purchased:'));
            return visible.length === 0 ? (
              <Text style={styles.emptyText}>
                {archive ? 'No archived entries.' : 'No sign-ins in the last 30 days.'}
              </Text>
            ) : (
              visible.map(entry => (
                <LogRow
                  key={entry.id}
                  entry={entry}
                  canAmend={canAmend}
                  onAmend={() => setAmending(entry)}
                  onViewProfile={canAmend && entry.userId
                    ? () => router.push({ pathname: '/(tabs)/members', params: { openUid: entry.userId } } as any)
                    : undefined
                  }
                />
              ))
            );
          })()}
        </ScrollView>
      )}

      {amending && (
        <AmendModal
          entry={amending}
          onSave={(at, notes) => handleAmend(amending, at, notes)}
          onClose={() => setAmending(null)}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f2' },

  toggleBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    padding: 8,
    gap: 6,
  },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: '#f0f0f0' },
  toggleBtnActive: { backgroundColor: KBC.green },
  toggleBtnText: { fontSize: 13, fontWeight: '700', color: '#888' },
  toggleBtnTextActive: { color: '#fff' },

  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tableHeaderCell: { fontSize: 10, fontWeight: '800', color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.5 },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 10,
  },
  rowTime: { width: 72, fontSize: 12, color: '#999', lineHeight: 18, textAlign: 'right', paddingTop: 2 },
  rowMiddle: { flex: 1, gap: 4 },
  rowName:     { fontSize: 14, fontWeight: '700', color: KBC.black },
  rowNameLink: { color: KBC.cyan, textDecorationLine: 'underline' },
  accessPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  accessText: { fontSize: 12, fontWeight: '700' },
  rowNotes: { fontSize: 12, color: '#888' },
  amendedTag: { fontSize: 11, color: '#bbb', fontStyle: 'italic' },

  amendBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f0f0f0', alignSelf: 'flex-start' },
  amendBtnText: { fontSize: 12, fontWeight: '700', color: '#666' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { textAlign: 'center', color: '#aaa', fontSize: 14, paddingTop: 60 },

  // Amend modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: KBC.black },
  sheetCancel: { fontSize: 16, color: KBC.pink, fontWeight: '600' },
  sheetBody: { padding: 16, gap: 8 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  input: { backgroundColor: '#f8f8f8', borderRadius: 10, padding: 12, fontSize: 15, color: KBC.black, borderWidth: 1, borderColor: '#eee' },
  amendMeta: { fontSize: 12, color: '#bbb', marginTop: 4 },
  saveBtn: { backgroundColor: KBC.green, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
