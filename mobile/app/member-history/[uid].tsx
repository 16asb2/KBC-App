import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { KBC } from '@/constants/theme';
import { LogEntry, getUserLogs } from '@/services/logbook';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function accessColor(accessType: string): string {
  const t = accessType.toLowerCase();
  if (t.includes('active'))  return KBC.green;
  if (t.includes('punch'))   return KBC.cyan;
  if (t.includes('drop'))    return KBC.orange;
  if (t.includes('annual') || t.includes('month')) return KBC.purple;
  return '#888';
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ─── Table primitives ────────────────────────────────────────────────────────

function THead({ cols }: { cols: string[] }) {
  return (
    <View style={styles.thead}>
      {cols.map((c, i) => (
        <Text key={i} style={[styles.th, i === 0 && { flex: 1.4 }]}>{c}</Text>
      ))}
    </View>
  );
}

function TRow({ children, shaded }: { children: React.ReactNode; shaded?: boolean }) {
  return (
    <View style={[styles.trow, shaded && styles.trowShaded]}>{children}</View>
  );
}

function TD({ children, flex, align }: { children: React.ReactNode; flex?: number; align?: 'left' | 'right' | 'center' }) {
  return (
    <View style={[styles.td, flex !== undefined && { flex }]}>
      <Text style={[styles.tdText, align === 'right' && { textAlign: 'right' }, align === 'center' && { textAlign: 'center' }]}>
        {children}
      </Text>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function MemberHistoryScreen() {
  const { uid, type, memberName } = useLocalSearchParams<{
    uid: string;
    type: 'access' | 'signins';
    memberName?: string;
  }>();

  const isAccess = type === 'access';
  const title    = isAccess ? 'Access Pass History' : 'Sign-In History';
  const name     = decodeURIComponent(memberName ?? '');

  const [logs, setLogs]       = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    getUserLogs(uid)
      .then(all => {
        const filtered = isAccess
          ? all.filter(h => h.notes?.includes('Purchased:'))
          : all.filter(h => !h.notes?.includes('Purchased:'));
        setLogs(filtered);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [uid, type]);

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerBackTitle: name || 'Back',
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {name ? <Text style={styles.subtitle}>{name}</Text> : null}

        {loading && <ActivityIndicator color={KBC.pink} style={{ marginTop: 40 }} />}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Failed to load: {error}</Text>
          </View>
        )}

        {!loading && !error && logs.length === 0 && (
          <Text style={styles.empty}>No records found.</Text>
        )}

        {!loading && !error && logs.length > 0 && (
          <View style={styles.table}>

            {/* ── Access Pass table ── */}
            {isAccess && (
              <>
                <THead cols={['Date', 'Pass Type', 'Details']} />
                {logs.map((h, i) => {
                  const note = h.notes?.replace('Purchased: ', '') ?? '';
                  // Split e.g. "Month Membership $55 — expires Jun 2, 2026" into type + details
                  const dashIdx = note.indexOf(' — ');
                  const passLabel = dashIdx > -1 ? note.slice(0, dashIdx) : note;
                  const detail    = dashIdx > -1 ? note.slice(dashIdx + 3) : '';
                  return (
                    <TRow key={h.id} shaded={i % 2 === 1}>
                      <View style={[styles.td, { flex: 1.4 }]}>
                        <Text style={styles.tdDate}>{fmtDate(h.timestamp)}</Text>
                        <Text style={styles.tdTime}>{fmtTime(h.timestamp)}</Text>
                      </View>
                      <View style={[styles.td, { flex: 1 }]}>
                        <View style={[styles.pill, { backgroundColor: accessColor(h.accessType) + '22' }]}>
                          <Text style={[styles.pillText, { color: accessColor(h.accessType) }]}>
                            {h.accessType}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.td, { flex: 1.4 }]}>
                        <Text style={styles.tdNote}>{passLabel}</Text>
                        {detail ? <Text style={styles.tdSub}>{detail}</Text> : null}
                      </View>
                    </TRow>
                  );
                })}
              </>
            )}

            {/* ── Sign-In table ── */}
            {!isAccess && (
              <>
                <THead cols={['Date', 'Time', 'Access Used']} />
                {logs.map((h, i) => (
                  <TRow key={h.id} shaded={i % 2 === 1}>
                    <View style={[styles.td, { flex: 1.4 }]}>
                      <Text style={styles.tdDate}>{fmtDate(h.timestamp)}</Text>
                    </View>
                    <TD flex={0.9} align="center">{fmtTime(h.timestamp)}</TD>
                    <View style={[styles.td, { flex: 1.4 }]}>
                      <View style={[styles.pill, { backgroundColor: accessColor(h.accessType) + '22' }]}>
                        <Text style={[styles.pillText, { color: accessColor(h.accessType) }]}>
                          {h.accessType}
                        </Text>
                      </View>
                    </View>
                  </TRow>
                ))}
              </>
            )}

            <View style={styles.footer}>
              <Text style={styles.footerText}>{logs.length} record{logs.length !== 1 ? 's' : ''}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f2' },
  content:   { padding: 16, paddingBottom: 40 },

  subtitle: { fontSize: 13, color: '#888', marginBottom: 16, fontWeight: '600' },

  errorBox: { backgroundColor: '#ffe4e4', borderRadius: 10, padding: 14, marginTop: 20 },
  errorText: { color: KBC.pink, fontSize: 14 },
  empty:     { textAlign: 'center', color: '#aaa', fontSize: 15, marginTop: 60, fontStyle: 'italic' },

  table: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },

  thead: {
    flexDirection: 'row', backgroundColor: KBC.black,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  th: {
    flex: 1, fontSize: 11, fontWeight: '800', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.6,
  },

  trow:       { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  trowShaded: { backgroundColor: '#fafafa' },

  td:     { flex: 1, justifyContent: 'center' },
  tdText: { fontSize: 13, color: '#333' },
  tdDate: { fontSize: 13, fontWeight: '700', color: KBC.black },
  tdTime: { fontSize: 11, color: '#999', marginTop: 1 },
  tdNote: { fontSize: 12, color: '#444', fontWeight: '600' },
  tdSub:  { fontSize: 11, color: '#999', marginTop: 1 },

  pill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pillText: { fontSize: 11, fontWeight: '700' },

  footer:     { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0', alignItems: 'flex-end' },
  footerText: { fontSize: 12, color: '#aaa', fontStyle: 'italic' },
});
