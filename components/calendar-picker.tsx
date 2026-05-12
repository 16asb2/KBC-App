import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';

import { KBC } from '@/constants/theme';
import type { CalendarEvent } from '@/services/calendarService';

const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function buildCalendarDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const days: (Date | null)[] = [];
  for (let i = 0; i < first.getDay(); i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}

function isSupervisorEvent(summary: string | undefined): boolean {
  if (!summary) return false;
  const s = summary.toLowerCase();
  return s.includes('(sup)') || s.includes('(super)');
}

function eventOnDay(e: CalendarEvent, day: Date): boolean {
  if (e.start?.dateTime) return isSameDay(new Date(e.start.dateTime), day);
  if (e.start?.date && e.end?.date) {
    const [sy, sm, sd] = e.start.date.split('-').map(Number);
    const [ey, em, ed] = e.end.date.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end   = new Date(ey, em - 1, ed); // exclusive
    const d     = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    return d >= start && d < end;
  }
  return false;
}

type Props = {
  selectedDate: Date;
  allEvents: CalendarEvent[];
  onDayPress: (day: Date) => void;
};

export function CalendarPicker({ selectedDate, allEvents, onDayPress }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  // Measure actual container width on layout; fall back to screen width minus padding
  const [containerWidth, setContainerWidth] = useState(screenWidth - 24);
  const cellSize = Math.floor(containerWidth / 7);

  const today = new Date();
  const [viewYear, setViewYear]   = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const days = buildCalendarDays(viewYear, viewMonth);

  return (
    <View
      style={styles.container}
      onLayout={e => setContainerWidth(e.nativeEvent.layout.width - 24)}
    >
      {/* Month navigation */}
      <View style={styles.monthNav}>
        <TouchableOpacity style={styles.arrow} onPress={prevMonth}>
          <Text style={styles.arrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity style={styles.arrow} onPress={nextMonth}>
          <Text style={styles.arrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day name headers */}
      <View style={styles.dayHeaders}>
        {DAY_NAMES.map(d => (
          <Text key={d} style={[styles.dayHeader, { width: cellSize }]}>{d}</Text>
        ))}
      </View>
      <View style={styles.divider} />

      {/* Calendar grid */}
      <View style={styles.grid}>
        {days.map((day, i) => {
          if (!day) return <View key={`e-${i}`} style={{ width: cellSize, height: cellSize }} />;
          const isToday    = isSameDay(day, today);
          const isSelected = !isToday && isSameDay(day, selectedDate);
          const withSuper     = allEvents.some(e => eventOnDay(e, day) && isSupervisorEvent(e.summary));
          const withRequested = allEvents.some(e => eventOnDay(e, day) && e.summary?.toLowerCase().includes('(requested)'));
          const withRegular   = allEvents.some(e => eventOnDay(e, day) && !isSupervisorEvent(e.summary) && !e.summary?.toLowerCase().includes('(requested)'));
          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={{ width: cellSize, height: cellSize, alignItems: 'center', justifyContent: 'center' }}
              onPress={() => onDayPress(day)}
            >
              <View style={[
                styles.dayCircle,
                isToday    && styles.todayCircle,
                isSelected && styles.selectedCircle,
              ]}>
                <Text style={[
                  styles.dayText,
                  isToday    && styles.todayText,
                  isSelected && styles.selectedText,
                ]}>{day.getDate()}</Text>
              </View>
              <View style={styles.dots}>
                {withSuper     && <View style={[styles.dot, { backgroundColor: KBC.pink }]} />}
                {withRequested && <View style={[styles.dot, { backgroundColor: KBC.purple }]} />}
                {withRegular   && <View style={[styles.dot, { backgroundColor: KBC.cyan }]} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: KBC.pink }]} />
          <Text style={styles.legendText}>Supervisor</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: KBC.cyan }]} />
          <Text style={styles.legendText}>Events</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: KBC.purple }]} />
          <Text style={styles.legendText}>Requested</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 12, paddingTop: 12 },
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 4, marginBottom: 12,
  },
  arrow: { padding: 10 },
  arrowText: { fontSize: 32, color: KBC.pink, lineHeight: 36 },
  monthTitle: { fontSize: 22, fontWeight: '800', color: KBC.black },
  dayHeaders: { flexDirection: 'row', marginBottom: 6 },
  dayHeader: { textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#aaa' },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  todayCircle:    { backgroundColor: KBC.pink },
  selectedCircle: { backgroundColor: KBC.cyan },
  dayText:      { fontSize: 15, color: '#111' },
  todayText:    { color: '#fff', fontWeight: '800' },
  selectedText: { color: '#fff', fontWeight: '800' },
  dots: { flexDirection: 'row', gap: 3, marginTop: 1, height: 6 },
  dot:  { width: 5, height: 5, borderRadius: 3 },
  legend: {
    flexDirection: 'row', justifyContent: 'center', gap: 20,
    paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0', marginTop: 8,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: '#666', fontWeight: '500' },
});
