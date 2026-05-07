import { useEffect, useRef } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { KBC } from '@/constants/theme';

// ─── Time Picker ────────────────────────────────────────────────────────────

type TimeProps = {
  visible: boolean;
  value: Date;
  onChange: (date: Date) => void;
  onClose: () => void;
  allHours?: boolean; // if true, shows all 24h instead of 6am–midnight
};

const ITEM_HEIGHT = 48;

type Slot = { hour: number; minute: number; label: string };

function makeSlots(startHour: number, endHour: number): Slot[] {
  const slots: Slot[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (const m of [0, 15, 30, 45]) {
      const period   = h < 12 ? 'AM' : 'PM';
      const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
      slots.push({ hour: h, minute: m, label: `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}` });
    }
  }
  return slots;
}

// 6 AM → 11:45 PM for the schedule (+ midnight sentinel at end)
const SLOTS: Slot[] = [...makeSlots(6, 24), { hour: 0, minute: 0, label: '12:00 AM (midnight)' }];

// Full 24-hour set for special events
const ALL_SLOTS: Slot[] = makeSlots(0, 24);

function slotIndex(date: Date, slots: Slot[]): number {
  const h = date.getHours();
  const m = date.getMinutes();
  const idx = slots.findIndex(s => s.hour === h && s.minute === m);
  return idx >= 0 ? idx : 0;
}

export function TimePickerModal({ visible, value, onChange, onClose, allHours }: TimeProps) {
  const scrollRef = useRef<ScrollView>(null);
  const slots = allHours ? ALL_SLOTS : SLOTS;

  useEffect(() => {
    if (visible) {
      const idx = slotIndex(value, slots);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: false });
      }, 50);
    }
  }, [visible]);

  function select(slot: Slot) {
    const next = new Date(value);
    next.setHours(slot.hour, slot.minute, 0, 0);
    onChange(next);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Select Time</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.done}>Done</Text>
          </TouchableOpacity>
        </View>
        <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
          {slots.map((slot, i) => {
            const selected = slotIndex(value, slots) === i;
            return (
              <TouchableOpacity
                key={slot.label}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => select(slot)}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {slot.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Calendar Date Picker ────────────────────────────────────────────────────

type DateProps = {
  visible: boolean;
  value: Date;
  onChange: (date: Date) => void;
  onClose: () => void;
  allowPast?: boolean;
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function buildCalendarDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days: (Date | null)[] = [];
  // Leading nulls for offset
  for (let i = 0; i < first.getDay(); i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}

import { useState } from 'react';

export function DatePickerModal({ visible, value, onChange, onClose, allowPast }: DateProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(value.getFullYear());
  const [viewMonth, setViewMonth] = useState(value.getMonth());

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function selectDay(d: Date) {
    const next = new Date(value);
    next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    onChange(next);
    onClose();
  }

  const days = buildCalendarDays(viewYear, viewMonth);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.calSheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Select Date</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.done}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Month navigation */}
        <View style={styles.monthNav}>
          <TouchableOpacity style={styles.monthArrow} onPress={prevMonth}>
            <Text style={styles.monthArrowText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
          <TouchableOpacity style={styles.monthArrow} onPress={nextMonth}>
            <Text style={styles.monthArrowText}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Day headers */}
        <View style={styles.dayHeaders}>
          {DAY_NAMES.map(d => (
            <Text key={d} style={styles.dayHeader}>{d}</Text>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={styles.grid}>
          {days.map((d, i) => {
            if (!d) return <View key={`empty-${i}`} style={styles.dayCell} />;
            const isSelected = sameDay(d, value);
            const isToday = sameDay(d, today);
            const isPast = !allowPast && d < today && !sameDay(d, today);
            return (
              <TouchableOpacity
                key={d.toISOString()}
                style={[styles.dayCell, isSelected && styles.dayCellSelected, isToday && !isSelected && styles.dayCellToday]}
                onPress={() => selectDay(d)}
                disabled={isPast}
              >
                <Text style={[
                  styles.dayText,
                  isSelected && styles.dayTextSelected,
                  isToday && !isSelected && styles.dayTextToday,
                  isPast && styles.dayTextPast,
                ]}>
                  {d.getDate()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '55%' },
  calSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  title: { fontSize: 17, fontWeight: '700', color: KBC.black },
  done: { fontSize: 16, color: KBC.pink, fontWeight: '600' },
  scroll: { padding: 8 },
  option: { height: ITEM_HEIGHT, justifyContent: 'center', borderRadius: 8, paddingHorizontal: 16 },
  optionSelected: { backgroundColor: KBC.pink },
  optionText: { fontSize: 16, color: KBC.black, textAlign: 'center' },
  optionTextSelected: { color: '#fff', fontWeight: '700' },

  // Calendar
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  monthArrow: { padding: 8 },
  monthArrowText: { fontSize: 28, color: KBC.pink, lineHeight: 32 },
  monthTitle: { fontSize: 17, fontWeight: '700', color: KBC.black },
  dayHeaders: { flexDirection: 'row', paddingHorizontal: 8, marginBottom: 4 },
  dayHeader: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#999' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 24 },
  dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 100 },
  dayCellSelected: { backgroundColor: KBC.pink },
  dayCellToday: { borderWidth: 2, borderColor: KBC.pink },
  dayText: { fontSize: 15, color: KBC.black },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  dayTextToday: { color: KBC.pink, fontWeight: '700' },
  dayTextPast: { color: '#ccc' },
});
