import { useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

type Props = {
  value: number | null;    // 0–100; null = not set
  onChange: (v: number | null) => void;
  interactive?: boolean;
};

const TRACK_HEIGHT = 22;
const MARKER_W     = 4;
const LABEL_STEPS  = ['Easy', 'Medium', 'Hard'] as const;

// Convert legacy string efforts to a 0-100 value for display
export function effortToNumber(effort: string | number | null | undefined): number | null {
  if (effort === null || effort === undefined || effort === '') return null;
  if (typeof effort === 'number') return effort;
  const map: Record<string, number> = { Easy: 0, Medium: 33, Hard: 67, Impossible: 100 };
  return map[effort] ?? null;
}

export function effortLabel(effort: string | number | null | undefined): string {
  const n = effortToNumber(effort);
  if (n === null) return '';
  if (n <= 16) return 'Easy';
  if (n <= 50) return 'Medium';
  if (n <= 83) return 'Hard';
  return 'Max';
}

export function EffortBar({ value, onChange, interactive = true }: Props) {
  const trackRef   = useRef<View>(null);
  const trackWidth = useRef(0);

  function clamp(x: number) { return Math.max(0, Math.min(100, x)); }

  function positionFromGesture(pageX: number, trackPageX: number): number {
    if (trackWidth.current <= 0) return 0;
    return clamp(((pageX - trackPageX) / trackWidth.current) * 100);
  }

  const trackPageX = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => interactive,
      onMoveShouldSetPanResponder:  () => interactive,
      onPanResponderGrant: (e) => {
        trackRef.current?.measure((_fx, _fy, _w, _h, px) => { trackPageX.current = px; });
        onChange(clamp(positionFromGesture(e.nativeEvent.pageX, trackPageX.current)));
      },
      onPanResponderMove: (e) => {
        onChange(clamp(positionFromGesture(e.nativeEvent.pageX, trackPageX.current)));
      },
    }),
  ).current;

  const pct     = value ?? -1;
  const hasValue = value !== null && value !== undefined;

  return (
    <View style={styles.wrap}>
      {/* Labels */}
      <View style={styles.labelRow}>
        <Text style={styles.labelLeft}>Easy</Text>
        <Text style={styles.labelRight}>Hard</Text>
      </View>

      {/* Track */}
      <View
        ref={trackRef}
        style={styles.track}
        onLayout={e => { trackWidth.current = e.nativeEvent.layout.width; }}
        {...(interactive ? panResponder.panHandlers : {})}
      >
        {/* Gradient segments */}
        {Array.from({ length: 100 }).map((_, i) => {
          const r = Math.round(50 + (i / 99) * 180);
          const g = Math.round(200 - (i / 99) * 150);
          return (
            <View
              key={i}
              style={{ flex: 1, backgroundColor: `rgb(${r},${g},80)` }}
            />
          );
        })}

        {/* Vertical marker */}
        {hasValue && (
          <View
            style={[styles.markerWrap, { left: `${pct}%` as any }]}
            pointerEvents="none"
          >
            <View style={styles.marker} />
          </View>
        )}
      </View>

      {/* Current effort label */}
      {hasValue && (
        <Text style={styles.valueLabel}>{effortLabel(value)}</Text>
      )}
      {!hasValue && interactive && (
        <Text style={styles.tapHint}>Tap bar to set effort</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginVertical: 2 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  labelLeft:  { fontSize: 11, fontWeight: '700', color: '#2ecc71' },
  labelRight: { fontSize: 11, fontWeight: '700', color: '#e74c3c' },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
  },
  markerWrap: {
    position: 'absolute',
    top: -4,
    marginLeft: -(MARKER_W / 2),
    width: MARKER_W,
    height: TRACK_HEIGHT + 8,
  },
  marker: {
    width: MARKER_W,
    height: TRACK_HEIGHT + 8,
    borderRadius: MARKER_W / 2,
    backgroundColor: '#FFE600',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  valueLabel: { fontSize: 13, fontWeight: '700', color: '#333', textAlign: 'center', marginTop: 2 },
  tapHint:    { fontSize: 12, color: '#bbb', textAlign: 'center', marginTop: 2 },
});
