import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KBC } from '@/constants/theme';
import {
  GRADES, GRADE_COLORS, GRADE_TEXT, LOCATIONS, Boulder,
  getBouldersForSeason, avgGrade,
} from '@/services/boulders';
import { PersonalClimb, getKBCLogs } from '@/services/climblog';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LOC_SHORT: Record<string, string> = {
  'Cave Right':  'Cave R.',
  'Cave Middle': 'Cave M.',
  'Cave Left':   'Cave L.',
  'Green Wall':  'Green',
  'Blue Wall':   'Blue',
  'Yellow Wall': 'Yellow',
};

const SETTER_COLORS = [
  KBC.lime, KBC.cyan, KBC.pink, KBC.purple, KBC.orange,
  '#34d399', '#818cf8', '#fb7185', '#f59e0b', '#06b6d4',
  '#a3e635', '#38bdf8', '#f472b6', '#fbbf24', '#4ade80',
];

function communityGradeIndex(b: Boulder): number | null {
  const votes: Record<string, number> = { ...b.gradeVotes };
  if (b.setterGradeVote !== null && b.setterGradeVote !== undefined) {
    votes['__setter'] = b.setterGradeVote;
  }
  const avg = avgGrade(votes);
  return avg !== null ? Math.round(Math.max(0, Math.min(4, avg))) : null;
}

// ─── Grade × Location table ───────────────────────────────────────────────────

const COL_W    = 52;
const LABEL_W  = 68;

const GRADE_ROWS = [...GRADES, 'Ungraded'] as const;
type GradeRow = typeof GRADE_ROWS[number];

function SummaryTable({ boulders }: { boulders: Boulder[] }) {
  // [gradeLabel][location] → count of boulders
  const matrix: Record<GradeRow, Record<string, number>> = {} as any;
  const colTotals: Record<string, number> = {};
  const rowTotals: Record<GradeRow, number> = {} as any;

  for (const g of GRADE_ROWS) {
    matrix[g] = {};
    rowTotals[g] = 0;
  }
  for (const loc of LOCATIONS) colTotals[loc] = 0;

  for (const b of boulders) {
    const gi = communityGradeIndex(b);
    const gradeLabel = gi !== null ? GRADES[gi] : 'Ungraded';
    rowTotals[gradeLabel]++;
    for (const loc of b.locations) {
      if (colTotals[loc] !== undefined) {
        matrix[gradeLabel][loc] = (matrix[gradeLabel][loc] ?? 0) + 1;
        colTotals[loc]++;
      }
    }
  }

  const gradeColors: Record<GradeRow, string> = {
    White:    GRADE_COLORS[0],
    Blue:     GRADE_COLORS[1],
    Purple:   GRADE_COLORS[2],
    Pink:     GRADE_COLORS[3],
    Black:    GRADE_COLORS[4],
    Ungraded: '#d0d0d0',
  };
  const gradeFg: Record<GradeRow, string> = {
    White:    '#555',
    Blue:     '#fff',
    Purple:   '#fff',
    Pink:     '#fff',
    Black:    '#fff',
    Ungraded: '#666',
  };

  return (
    <View style={card.box}>
      <Text style={styles.sectionTitle}>Boulders by Grade & Location</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, marginTop: 10 }}>
        <View style={{ paddingHorizontal: 16 }}>

          {/* Header */}
          <View style={tbl.row}>
            <View style={[tbl.cell, { width: LABEL_W, borderColor: 'transparent' }]} />
            {LOCATIONS.map(loc => (
              <View key={loc} style={[tbl.cell, tbl.hdrCell]}>
                <Text style={tbl.hdrText} numberOfLines={2}>{LOC_SHORT[loc] ?? loc}</Text>
              </View>
            ))}
            <View style={[tbl.cell, tbl.hdrCell, { backgroundColor: '#e0e0e0' }]}>
              <Text style={tbl.hdrText}>Total</Text>
            </View>
          </View>

          {/* Grade rows */}
          {GRADE_ROWS.map(grade => (
            <View key={grade} style={tbl.row}>
              <View style={[tbl.cell, { width: LABEL_W, backgroundColor: gradeColors[grade] }]}>
                <Text style={[tbl.gradeText, { color: gradeFg[grade] }]} numberOfLines={1}>
                  {grade}
                </Text>
              </View>
              {LOCATIONS.map(loc => (
                <View key={loc} style={tbl.cell}>
                  <Text style={tbl.cellText}>{matrix[grade][loc] || ''}</Text>
                </View>
              ))}
              <View style={[tbl.cell, { backgroundColor: '#f4f4f4' }]}>
                <Text style={[tbl.cellText, { fontWeight: '700' }]}>
                  {rowTotals[grade] || ''}
                </Text>
              </View>
            </View>
          ))}

          {/* Totals row */}
          <View style={tbl.row}>
            <View style={[tbl.cell, { width: LABEL_W, backgroundColor: '#e8e8e8' }]}>
              <Text style={[tbl.gradeText, { color: '#333' }]}>Total</Text>
            </View>
            {LOCATIONS.map(loc => (
              <View key={loc} style={[tbl.cell, { backgroundColor: '#f0f0f0' }]}>
                <Text style={[tbl.cellText, { fontWeight: '700' }]}>{colTotals[loc] || ''}</Text>
              </View>
            ))}
            <View style={[tbl.cell, { backgroundColor: '#ddd' }]}>
              <Text style={[tbl.cellText, { fontWeight: '800', color: '#111' }]}>{boulders.length}</Text>
            </View>
          </View>

        </View>
      </ScrollView>
      <Text style={styles.tableNote}>Counts include boulders set in multiple locations.</Text>
    </View>
  );
}

const tbl = StyleSheet.create({
  row:      { flexDirection: 'row' },
  cell:     {
    width: COL_W, height: 38,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 0.5, borderColor: '#e0e0e0',
  },
  hdrCell:  { backgroundColor: '#f5f5f5', height: 44 },
  hdrText:  { fontSize: 9, fontWeight: '700', color: '#555', textAlign: 'center' },
  gradeText:{ fontSize: 11, fontWeight: '700' },
  cellText: { fontSize: 14, color: '#333', textAlign: 'center' },
});

// ─── Quality / Stars section ──────────────────────────────────────────────────

type StarBucket = { label: string; stars: number; count: number; color: string };

function StarsSection({
  boulders,
  logsByInternalId,
}: {
  boulders: Boulder[];
  logsByInternalId: Record<string, PersonalClimb[]>;
}) {
  let star3 = 0, star2 = 0, star1 = 0, unrated = 0;

  for (const b of boulders) {
    const bl = logsByInternalId[b.internalId] ?? [];
    const qualVotes = bl.map(l => l.quality).filter(q => q > 0);
    if (qualVotes.length === 0) {
      unrated++;
    } else {
      const avg = qualVotes.reduce((s, v) => s + v, 0) / qualVotes.length;
      if (avg >= 2.5)      star3++;
      else if (avg >= 1.5) star2++;
      else                 star1++;
    }
  }

  const buckets: StarBucket[] = [
    { label: '3 ★★★', stars: 3, count: star3,   color: '#f5a623' },
    { label: '2 ★★',  stars: 2, count: star2,   color: '#f5a623' },
    { label: '1 ★',   stars: 1, count: star1,   color: '#f5a623' },
    { label: 'Unrated', stars: 0, count: unrated, color: '#ccc'    },
  ];

  return (
    <View style={card.box}>
      <Text style={styles.sectionTitle}>Quality Ratings</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        {buckets.map(b => (
          <View key={b.label} style={starPill.wrap}>
            <Text style={[starPill.count, { color: b.stars > 0 ? '#333' : '#bbb' }]}>{b.count}</Text>
            <Text style={[starPill.label, { color: b.stars > 0 ? '#888' : '#ccc' }]}>{b.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const starPill = StyleSheet.create({
  wrap:  {
    flex: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 4,
    alignItems: 'center', backgroundColor: '#f9f9f9',
    borderWidth: 1, borderColor: '#eee',
  },
  count: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  label: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
});

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[sp.pill, { backgroundColor: color + '1a' }]}>
      <Text style={[sp.val, { color }]}>{value}</Text>
      <Text style={sp.lbl}>{label}</Text>
    </View>
  );
}

const sp = StyleSheet.create({
  pill: { borderRadius: 12, padding: 14, alignItems: 'center', flex: 1 },
  val:  { fontSize: 24, fontWeight: '800' },
  lbl:  { fontSize: 11, color: '#888', marginTop: 2, fontWeight: '600' },
});

// ─── Setter chart ─────────────────────────────────────────────────────────────

function SetterChart({ boulders }: { boulders: Boulder[] }) {
  const counts: Record<string, number> = {};
  for (const b of boulders) {
    const name = b.setter.trim() || 'Unknown';
    counts[name] = (counts[name] ?? 0) + 1;
  }

  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
  const total  = boulders.length;
  if (sorted.length === 0 || total === 0) return null;

  const colored = sorted.map(([name, count], i) => ({
    name,
    count,
    color: SETTER_COLORS[i % SETTER_COLORS.length],
    pct:   Math.round((count / total) * 100),
  }));

  return (
    <View style={card.box}>
      <Text style={styles.sectionTitle}>Setter Contributions</Text>

      {/* Proportional bar */}
      <View style={{ flexDirection: 'row', height: 28, borderRadius: 10, overflow: 'hidden', marginTop: 14, marginBottom: 16 }}>
        {colored.map((s, i) => (
          <View key={i} style={{ flex: s.count, backgroundColor: s.color }} />
        ))}
      </View>

      {/* Legend rows */}
      {colored.map((s, i) => (
        <View key={i} style={sett.row}>
          <View style={[sett.dot, { backgroundColor: s.color }]} />
          <Text style={sett.name} numberOfLines={1}>{s.name}</Text>
          <View style={sett.barWrap}>
            <View style={{ flex: s.count, backgroundColor: s.color + 'bb', borderRadius: 4, height: '100%' }} />
            <View style={{ flex: total - s.count }} />
          </View>
          <Text style={sett.count}>{s.count}</Text>
          <Text style={sett.pct}>{s.pct}%</Text>
        </View>
      ))}
    </View>
  );
}

const sett = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  dot:    { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  name:   { width: 88, fontSize: 12, color: '#333', fontWeight: '600', flexShrink: 0 },
  barWrap:{ flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', backgroundColor: '#f0f0f0' },
  count:  { width: 26, fontSize: 12, fontWeight: '700', color: '#333', textAlign: 'right', flexShrink: 0 },
  pct:    { width: 36, fontSize: 11, color: '#999', textAlign: 'right', flexShrink: 0 },
});

// ─── Shared card ──────────────────────────────────────────────────────────────

const card = StyleSheet.create({
  box: {
    backgroundColor: '#fff', borderRadius: 14,
    padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#eee',
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function BoulderSummaryScreen() {
  const insets     = useSafeAreaInsets();
  const params     = useLocalSearchParams<{ seasonId?: string; seasonName?: string }>();
  const seasonId   = params.seasonId   ?? '';
  const seasonName = params.seasonName ?? '';

  const [boulders, setBoulders] = useState<Boulder[]>([]);
  const [kbcLogs,  setKbcLogs]  = useState<PersonalClimb[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!seasonId) return;
    setLoading(true);
    Promise.all([getBouldersForSeason(seasonId), getKBCLogs()])
      .then(([bs, logs]) => { setBoulders(bs); setKbcLogs(logs); })
      .catch(e => Alert.alert('Error', e.message))
      .finally(() => setLoading(false));
  }, [seasonId]);

  // Filter logs to the current season's boulders only
  const internalIdSet = useMemo(() => new Set(boulders.map(b => b.internalId)), [boulders]);
  const docIdToBoulder = useMemo(() => {
    const m: Record<string, Boulder> = {};
    for (const b of boulders) m[b.id] = b;
    return m;
  }, [boulders]);

  const seasonLogs = useMemo(
    () => kbcLogs.filter(l =>
      (l.problemInternalId && internalIdSet.has(l.problemInternalId)) ||
      (l.boulderId && docIdToBoulder[l.boulderId] !== undefined)
    ),
    [kbcLogs, internalIdSet, docIdToBoulder],
  );

  const logsByInternalId = useMemo(() => {
    const map: Record<string, PersonalClimb[]> = {};
    for (const log of seasonLogs) {
      let key = '';
      if (log.problemInternalId && internalIdSet.has(log.problemInternalId)) {
        key = log.problemInternalId;
      } else if (log.boulderId && docIdToBoulder[log.boulderId]) {
        key = docIdToBoulder[log.boulderId].internalId;
      }
      if (key) (map[key] ??= []).push(log);
    }
    return map;
  }, [seasonLogs, internalIdSet, docIdToBoulder]);

  const totalSends    = seasonLogs.filter(l => l.type === 'ascent').length;
  const totalAttempts = seasonLogs.filter(l => l.type === 'attempt').length;
  const totalLikes    = boulders.reduce((s, b) => s + b.likes.length, 0);

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f8f8' }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Boulder Summary</Text>
          {seasonName ? <Text style={styles.headerSub}>{seasonName}</Text> : null}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={KBC.lime} style={{ marginTop: 80 }} />
      ) : boulders.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#aaa', fontSize: 15 }}>No boulders in this season.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>

          {/* Top stat pills */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <StatPill label="Boulders" value={boulders.length} color={KBC.lime}   />
            <StatPill label="Sends"    value={totalSends}      color={KBC.cyan}   />
            <StatPill label="Attempts" value={totalAttempts}   color={KBC.orange} />
            <StatPill label="Likes"    value={totalLikes}      color={KBC.pink}   />
          </View>

          <SummaryTable boulders={boulders} />
          <StarsSection boulders={boulders} logsByInternalId={logsByInternalId} />
          <SetterChart  boulders={boulders} />

        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    backgroundColor: KBC.black,
    paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  backBtn:     { padding: 4 },
  backIcon:    { color: '#fff', fontSize: 30, lineHeight: 32 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerSub:   { color: '#aaa', fontSize: 12, marginTop: 1 },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: KBC.black },
  tableNote:    { fontSize: 10, color: '#bbb', marginTop: 8, textAlign: 'center' },
});
