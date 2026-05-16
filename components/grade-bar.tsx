import { useEffect, useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

import { GRADE_COLORS, GRADES, avgGrade } from '@/services/boulders';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GradeBarProps = {
  votes: Record<string, number>;
  userUid?: string;
  onVote?: (grade: number) => void; // pass -1 to remove vote
  interactive?: boolean;
  compact?: boolean;
};

// ─── GradeBar ─────────────────────────────────────────────────────────────────

export function GradeBar({ votes, userUid, onVote, interactive = false, compact = false }: GradeBarProps) {
  const barRef         = useRef<View>(null);
  const barWidthRef    = useRef(0);
  const barPageXRef    = useRef(0);
  const onVoteRef      = useRef(onVote);
  const interactiveRef = useRef(interactive);
  useEffect(() => { onVoteRef.current = onVote; },           [onVote]);
  useEffect(() => { interactiveRef.current = interactive; }, [interactive]);

  const avg       = avgGrade(votes);
  const userVote  = userUid !== undefined && userUid in votes ? votes[userUid] : null;
  const voteCount = Object.keys(votes).length;

  function gradeFromPageX(pageX: number): number {
    const w = barWidthRef.current;
    if (w === 0) return 0;
    const relX = Math.max(0, Math.min(w, pageX - barPageXRef.current));
    return Math.max(0, Math.min(4, (relX / w) * 4));
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => interactiveRef.current,
      onMoveShouldSetPanResponder:  () => interactiveRef.current,
      onPanResponderGrant: evt => onVoteRef.current?.(gradeFromPageX(evt.nativeEvent.pageX)),
      onPanResponderMove:  evt => onVoteRef.current?.(gradeFromPageX(evt.nativeEvent.pageX)),
    }),
  ).current;

  function onLayout() {
    barRef.current?.measure((_x, _y, w, _h, pageX) => {
      barWidthRef.current = w;
      barPageXRef.current = pageX;
    });
  }

  function Marker({ value, color }: { value: number; color: string }) {
    return (
      <View style={[StyleSheet.absoluteFillObject, { flexDirection: 'row' }]} pointerEvents="none">
        <View style={{ flex: Math.max(value, 0) }} />
        <View style={{ width: 3, backgroundColor: color, borderRadius: 2 }} />
        <View style={{ flex: Math.max(4 - value, 0) }} />
      </View>
    );
  }

  return (
    <View>
      <View
        ref={barRef}
        onLayout={onLayout}
        style={[s.gradeBar, compact && s.gradeBarCompact]}
        {...pan.panHandlers}
      >
        {GRADE_COLORS.map((color, i) => (
          <View
            key={i}
            style={[
              s.gradeSegment,
              { backgroundColor: color },
              i === 0 && s.gradeSegmentFirst,
              i === GRADE_COLORS.length - 1 && s.gradeSegmentLast,
            ]}
          />
        ))}

        {/* Red — community average */}
        {avg !== null && <Marker value={avg} color="#FF3B30" />}

        {/* Green — this user's selection */}
        {userVote !== null && <Marker value={userVote} color="#00e676" />}
      </View>

      {!compact && (
        <>
          <View style={s.gradeLabelsRow}>
            {GRADES.map((g, i) => (
              <Text key={i} style={s.gradeLabel}>{g}</Text>
            ))}
          </View>
          <View style={s.gradeInfoRow}>
            {voteCount > 0 && (
              <Text style={s.gradeVoteInfo}>
                {`${voteCount} vote${voteCount !== 1 ? 's' : ''}${avg !== null ? `  ·  avg: ${GRADES[Math.round(avg)]}` : ''}`}
              </Text>
            )}
            {userVote !== null && (
              <Text style={s.gradeVoteInfo}>
                {'  '}
                <Text style={s.gradeVoteYours}>● {GRADES[Math.round(userVote)]}</Text>
                {'  '}
                <Text style={s.gradeRemove} onPress={() => onVote?.(-1)}>Remove</Text>
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  gradeBar: {
    height: 28,
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  gradeBarCompact: { height: 18, borderRadius: 9 },
  gradeSegment:      { flex: 1 },
  gradeSegmentFirst: { borderTopLeftRadius: 14,  borderBottomLeftRadius: 14 },
  gradeSegmentLast:  { borderTopRightRadius: 14, borderBottomRightRadius: 14 },
  gradeLabelsRow:    { flexDirection: 'row', marginTop: 4 },
  gradeLabel:        { flex: 1, textAlign: 'center', fontSize: 10, color: '#999', fontWeight: '600' },
  gradeInfoRow:      { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, alignItems: 'center' },
  gradeVoteInfo:     { fontSize: 11, color: '#aaa' },
  gradeVoteYours:    { fontSize: 11, color: '#00e676', fontWeight: '700' },
  gradeRemove:       { fontSize: 11, color: '#FF453A', fontWeight: '600' },
});
