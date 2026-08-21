import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KBC } from '@/constants/theme';
import { GRADE_COLORS } from '@/services/boulders';
import { useAuth } from '@/context/auth';
import {
  ClimbLocation, GradeSystem, PersonalClimb,
  getMyLocations, getMyLogs, gradesForSystem,
} from '@/services/climblog';

// ─── Color helpers for non-KBC grade scales ───────────────────────────────────

// Simple gradient: green → yellow → red for increasing difficulty
const BOULDER_GRADIENT = [
  '#4caf50', '#66bb6a', '#9ccc65', '#d4e157', '#ffee58',
  '#ffa726', '#ff7043', '#ef5350', '#e53935', '#b71c1c',
  '#9c27b0', '#7b1fa2', '#6a1b9a', '#4a148c', '#311b92',
  '#1a237e', '#0d47a1', '#01579b', '#006064', '#004d40',
];

function gradeColor(index: number, total: number, gs: GradeSystem): string {
  if (gs === 'kbc') return GRADE_COLORS[Math.min(index, 4)];
  const ratio = total > 1 ? index / (total - 1) : 0;
  const gi = Math.round(ratio * (BOULDER_GRADIENT.length - 1));
  return BOULDER_GRADIENT[gi];
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

const CHART_H = 200;
const BAR_W   = 42;
const BAR_GAP = 8;

type BarData = {
  label: string;
  sends: number;
  attempts: number;
  color: string;
};

function BarChart({ bars }: { bars: BarData[] }) {
  if (bars.length === 0) {
    return (
      <View style={chart.empty}>
        <Text style={chart.emptyText}>No data for this location</Text>
      </View>
    );
  }

  const maxVal = Math.max(...bars.map(b => b.sends + b.attempts), 1);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={chart.scroll}>
      <View style={[chart.container, { height: CHART_H + 50 }]}>
        {/* Y gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const y = CHART_H - frac * CHART_H;
          const val = Math.round(frac * maxVal);
          return (
            <View key={frac} style={[chart.gridLine, { top: y }]}>
              <Text style={chart.gridLabel}>{val}</Text>
            </View>
          );
        })}

        {/* Bars */}
        <View style={chart.barsRow}>
          {bars.map((b, i) => {
            const totalH  = CHART_H * (b.sends + b.attempts) / maxVal;
            const sendH   = CHART_H * b.sends / maxVal;
            const tryH    = totalH - sendH;
            return (
              <View key={i} style={[chart.barWrap, { width: BAR_W, marginRight: BAR_GAP }]}>
                <View style={[chart.bar, { height: totalH }]}>
                  {tryH > 0 && (
                    <View style={{ height: tryH, backgroundColor: b.color, opacity: 0.35 }} />
                  )}
                  {sendH > 0 && (
                    <View style={{ height: sendH, backgroundColor: b.color }} />
                  )}
                </View>
                <Text style={chart.barLabel} numberOfLines={2}>{b.label}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const chart = StyleSheet.create({
  scroll: { marginHorizontal: -16 },
  container: { paddingLeft: 36, paddingRight: 16, paddingTop: 8, position: 'relative' },
  gridLine: {
    position: 'absolute', left: 0, right: 0,
    borderTopWidth: 1, borderTopColor: '#e5e5e5',
    flexDirection: 'row', alignItems: 'center',
  },
  gridLabel: { fontSize: 10, color: '#aaa', marginTop: -14, marginLeft: 2, width: 30 },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', height: CHART_H, paddingLeft: 36 },
  barWrap: { alignItems: 'center' },
  bar: { width: BAR_W, borderTopLeftRadius: 4, borderTopRightRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  barLabel: { fontSize: 10, color: '#555', textAlign: 'center', marginTop: 4, width: BAR_W },
  empty: { height: CHART_H, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#bbb', fontSize: 14 },
});

// ─── Build chart data for a grade system ──────────────────────────────────────

function buildBars(climbs: PersonalClimb[], gs: GradeSystem): BarData[] {
  const grades = gradesForSystem(gs);

  // For KBC, use establishedGrade; for others, use personalGrade
  const getGrade = (c: PersonalClimb) => gs === 'kbc' ? c.establishedGrade : c.personalGrade;

  const sends:    Record<string, number> = {};
  const attempts: Record<string, number> = {};

  for (const c of climbs) {
    const g = getGrade(c);
    if (!g) continue;
    if (!grades.includes(g)) continue;
    if (c.type === 'ascent') sends[g]    = (sends[g]    ?? 0) + 1;
    else                     attempts[g] = (attempts[g] ?? 0) + 1;
  }

  // Only show grades that have at least one entry
  const active = grades.filter(g => (sends[g] ?? 0) + (attempts[g] ?? 0) > 0);
  if (active.length === 0) return [];

  return active.map((g, i) => ({
    label:    g,
    sends:    sends[g]    ?? 0,
    attempts: attempts[g] ?? 0,
    color:    gradeColor(i, active.length, gs),
  }));
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[sp.pill, { backgroundColor: color + '18' }]}>
      <Text style={[sp.val, { color }]}>{value}</Text>
      <Text style={sp.lbl}>{label}</Text>
    </View>
  );
}

const sp = StyleSheet.create({
  pill: { borderRadius: 12, padding: 14, alignItems: 'center', flex: 1 },
  val:  { fontSize: 26, fontWeight: '800' },
  lbl:  { fontSize: 11, color: '#888', marginTop: 2, fontWeight: '600' },
});

// ─── Section for one grade system ─────────────────────────────────────────────

function GradeSection({ gs, climbs, title }: { gs: GradeSystem; climbs: PersonalClimb[]; title: string }) {
  const bars = buildBars(climbs, gs);
  if (bars.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <BarChart bars={bars} />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ClimbSummaryScreen() {
  const insets      = useSafeAreaInsets();
  const { user }    = useAuth();
  const uid         = user?.id ?? '';
  const params      = useLocalSearchParams<{ locationId?: string }>();
  const initLocId   = params.locationId ?? 'all';

  const [locationId, setLocationId] = useState(initLocId);
  const [locations,  setLocations]  = useState<ClimbLocation[]>([]);
  const [climbs,     setClimbs]     = useState<PersonalClimb[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    Promise.all([getMyLocations(uid), getMyLogs(uid, locationId === 'all' ? undefined : locationId)])
      .then(([locs, logs]) => { setLocations(locs); setClimbs(logs); })
      .catch(e => Alert.alert('Error', e.message))
      .finally(() => setLoading(false));
  }, [uid, locationId]);

  // Determine which grade systems to show
  const activeLoc = locationId === 'all' ? null : (locationId === 'kbc' ? null : locations.find(l => l.id === locationId));

  // Determine grade system(s) for the current filter
  function getSectionsToShow(): { gs: GradeSystem; title: string; climbs: PersonalClimb[] }[] {
    if (locationId === 'kbc') {
      return [{ gs: 'kbc', title: 'KBC Grades', climbs }];
    }
    if (locationId === 'all') {
      // Group by grade system used
      const kbcClimbs     = climbs.filter(c => c.locationId === 'kbc');
      const vScaleClimbs  = climbs.filter(c => {
        const loc = locations.find(l => l.id === c.locationId);
        const sector = loc?.sectors.find(s => s.name === c.sectorId);
        return sector?.gradeSystem === 'v-scale';
      });
      const fontClimbs    = climbs.filter(c => {
        const loc = locations.find(l => l.id === c.locationId);
        const sector = loc?.sectors.find(s => s.name === c.sectorId);
        return sector?.gradeSystem === 'font';
      });
      const ydsClimbs     = climbs.filter(c => {
        const loc = locations.find(l => l.id === c.locationId);
        const sector = loc?.sectors.find(s => s.name === c.sectorId);
        return sector?.gradeSystem === 'yosemite';
      });
      return [
        { gs: 'kbc'      as GradeSystem, title: 'KBC Grades',    climbs: kbcClimbs    },
        { gs: 'v-scale'  as GradeSystem, title: 'V-Scale',        climbs: vScaleClimbs },
        { gs: 'font'     as GradeSystem, title: 'Font Scale',     climbs: fontClimbs   },
        { gs: 'yosemite' as GradeSystem, title: 'Yosemite (YDS)', climbs: ydsClimbs    },
      ].filter(s => s.climbs.length > 0);
    }
    // Specific custom location — one section per distinct grade system across sectors
    if (!activeLoc) return [];
    const systems = [...new Set(activeLoc.sectors.map(s => s.gradeSystem))];
    if (systems.length === 0) return [{ gs: 'v-scale', title: 'Boulder Grades', climbs }];
    return systems.map(gs => ({
      gs,
      title: gs === 'v-scale' ? 'V-Scale' : gs === 'font' ? 'Font Scale' : 'Yosemite (YDS)',
      climbs,
    }));
  }

  const sections   = getSectionsToShow();
  const totalSends    = climbs.filter(c => c.type === 'ascent').length;
  const totalAttempts = climbs.filter(c => c.type === 'attempt').length;
  const totalProjects = climbs.filter(c => c.project).length;

  const activeLocLabel =
    locationId === 'all' ? 'All Locations'
    : locationId === 'kbc' ? 'KBC Gym'
    : locations.find(l => l.id === locationId)?.name ?? '';

  // Location filter pills
  const locOptions = [
    { id: 'all', label: 'All' },
    { id: 'kbc', label: 'KBC' },
    ...locations.map(l => ({ id: l.id, label: l.name })),
  ];

  // Compute extra stats
  const uniqueDays = new Set(
    climbs.map(c => (c.timestamp || c.createdAt || '').slice(0, 10))
  ).size;

  // Months with any climb (for climbs/month)
  const uniqueMonths = new Set(
    climbs.map(c => (c.timestamp || c.createdAt || '').slice(0, 7))
  ).size;

  const climbsPerSession = uniqueDays > 0 ? (climbs.length / uniqueDays).toFixed(1) : '—';
  const climbsPerMonth   = uniqueMonths > 0 ? (climbs.length / uniqueMonths).toFixed(1) : '—';

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f8f8' }}>
      {/* Header — no back button (navigator arrow handles it) */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Climb Summary</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {/* Location filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, marginHorizontal: -16 }}>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
            {locOptions.map(o => {
              const sel = o.id === locationId;
              return (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.filterPill, sel && styles.filterPillSel]}
                  onPress={() => setLocationId(o.id)}
                >
                  <Text style={[styles.filterPillText, sel && { color: '#fff' }]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {loading ? (
          <ActivityIndicator size="large" color={KBC.cyan} style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* Stat pills — row 1 */}
            <View style={styles.statRow}>
              <StatPill label="Sends"    value={totalSends}    color={KBC.lime}  />
              <StatPill label="Attempts" value={totalAttempts} color={KBC.orange} />
              <StatPill label="Projects" value={totalProjects} color={KBC.purple} />
            </View>

            {/* Stat pills — row 2 */}
            <View style={[styles.statRow, { marginTop: 0 }]}>
              <View style={[sp.pill, { backgroundColor: KBC.cyan + '18', flex: 1 }]}>
                <Text style={[sp.val, { color: KBC.cyan }]}>{uniqueDays}</Text>
                <Text style={sp.lbl}>Sessions</Text>
              </View>
              <View style={[sp.pill, { backgroundColor: KBC.pink + '18', flex: 1 }]}>
                <Text style={[sp.val, { color: KBC.pink }]}>{climbsPerSession}</Text>
                <Text style={sp.lbl}>Climbs/Session</Text>
              </View>
              <View style={[sp.pill, { backgroundColor: '#888' + '18', flex: 1 }]}>
                <Text style={[sp.val, { color: '#888' }]}>{climbsPerMonth}</Text>
                <Text style={sp.lbl}>Climbs/Month</Text>
              </View>
            </View>

            {/* Legend */}
            <View style={styles.legend}>
              <View style={[styles.legendSwatch, { backgroundColor: KBC.lime }]} />
              <Text style={styles.legendText}>Sends</Text>
              <View style={[styles.legendSwatch, { backgroundColor: KBC.lime, opacity: 0.35, marginLeft: 12 }]} />
              <Text style={styles.legendText}>Attempts</Text>
            </View>

            {/* Chart sections */}
            {sections.length === 0 ? (
              <View style={styles.noData}>
                <Text style={styles.noDataText}>No graded climbs logged for {activeLocLabel}</Text>
              </View>
            ) : (
              sections.map(s => (
                <GradeSection key={s.gs} gs={s.gs} climbs={s.climbs} title={s.title} />
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: KBC.black, paddingHorizontal: 16, paddingBottom: 14,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },

  filterPill: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: '#eee',
  },
  filterPillSel: { backgroundColor: KBC.cyan },
  filterPillText: { fontSize: 13, fontWeight: '600', color: '#555' },

  statRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },

  legend: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  legendSwatch: { width: 14, height: 14, borderRadius: 3 },
  legendText: { fontSize: 12, color: '#777', marginLeft: 4 },

  section: {
    backgroundColor: '#fff', borderRadius: 14,
    padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#eee',
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: KBC.black, marginBottom: 12 },

  noData: { alignItems: 'center', paddingVertical: 48 },
  noDataText: { color: '#bbb', fontSize: 14, textAlign: 'center' },
});
