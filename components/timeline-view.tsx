import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { KBC } from '@/constants/theme';
import { CalendarEvent } from '@/services/calendarService';

const HOUR_HEIGHT = 64;
const TIME_COL_WIDTH = 52;
const START_HOUR = 6;
const END_HOUR = 24;
const TOTAL_HOURS = END_HOUR - START_HOUR;

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Matches both current "(super)" and legacy "(sup)" event title formats. */
function isSupervisorSlot(e: CalendarEvent) {
  const s = e.summary?.toLowerCase() ?? '';
  return s.includes('(sup)') || s.includes('(super)');
}
function isRequested(e: CalendarEvent) { return e.summary?.toLowerCase().includes('(requested)') ?? false; }

function isAllDay(e: CalendarEvent) {
  return !!e.start?.date && !e.start?.dateTime;
}

function getEventMinutes(dateTime: string) {
  const d = new Date(dateTime);
  return d.getHours() * 60 + d.getMinutes();
}

function minutesToY(minutes: number) {
  return ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
}

function eventColor(event: CalendarEvent) {
  if (isRequested(event)) return KBC.purple;
  if (isSupervisorSlot(event)) return KBC.pink;
  return KBC.cyan;
}

type PositionedEvent = CalendarEvent & { top: number; height: number; column: number; numColumns: number };

function layoutEvents(events: CalendarEvent[]): PositionedEvent[] {
  const sorted = [...events]
    .filter(e => e.start?.dateTime && e.end?.dateTime)
    .sort((a, b) => getEventMinutes(a.start.dateTime!) - getEventMinutes(b.start.dateTime!));

  const positioned: PositionedEvent[] = [];
  const groups: PositionedEvent[][] = [];

  for (const event of sorted) {
    const startMin = getEventMinutes(event.start.dateTime!);
    const endMin = getEventMinutes(event.end.dateTime!);
    const top = minutesToY(startMin);
    const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 28);
    let placed = false;
    for (const group of groups) {
      const lastEnd = getEventMinutes(group[group.length - 1].end.dateTime!);
      if (startMin < lastEnd) {
        const col = group.length;
        const pe: PositionedEvent = { ...event, top, height, column: col, numColumns: col + 1 };
        group.push(pe);
        group.forEach(e => (e.numColumns = group.length));
        positioned.push(pe);
        placed = true;
        break;
      }
    }
    if (!placed) {
      const pe: PositionedEvent = { ...event, top, height, column: 0, numColumns: 1 };
      groups.push([pe]);
      positioned.push(pe);
    }
  }
  return positioned;
}

function allDayColor(event: CalendarEvent) {
  if (event.summary?.toLowerCase().includes('(requested)')) return KBC.purple;
  if (event.summary?.toLowerCase().includes('(sup)') || event.summary?.toLowerCase().includes('(super)')) return KBC.pink;
  return KBC.cyan;
}

type Props = {
  events: CalendarEvent[];
  onEventPress?: (event: CalendarEvent) => void;
  onTimePress?: (date: Date) => void;
  selectedDate?: Date;
  scrollToFirstEvent?: boolean;
};

export function TimelineView({ events, onEventPress, onTimePress, selectedDate, scrollToFirstEvent }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [now, setNow] = useState(new Date());

  // Tick every minute to keep the time line current
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const isToday = selectedDate ? isSameDay(selectedDate, now) : false;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowY = minutesToY(nowMinutes);
  const nowInRange = nowY >= 0 && nowY <= TOTAL_HOURS * HOUR_HEIGHT;

  const allDayEvents = events.filter(isAllDay);
  const timedEvents  = events.filter(e => !isAllDay(e));
  const positioned   = layoutEvents(timedEvents);

  useEffect(() => {
    if (!scrollToFirstEvent) return;
    // Scroll to current time when viewing today; otherwise scroll to first event
    if (isToday && nowInRange) {
      const y = Math.max(0, nowY - HOUR_HEIGHT * 1.5);
      setTimeout(() => scrollRef.current?.scrollTo({ y, animated: true }), 100);
    } else if (timedEvents.length > 0) {
      const sorted = [...timedEvents].sort((a, b) =>
        new Date(a.start.dateTime!).getTime() - new Date(b.start.dateTime!).getTime()
      );
      const firstMin = getEventMinutes(sorted[0].start.dateTime!);
      const y = Math.max(0, minutesToY(firstMin) - HOUR_HEIGHT);
      setTimeout(() => scrollRef.current?.scrollTo({ y, animated: true }), 100);
    }
  }, [events, scrollToFirstEvent, isToday]);
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i);

  return (
    <View style={styles.outerContainer}>
    {allDayEvents.length > 0 && (
      <View style={styles.allDayBanner}>
        <Text style={styles.allDayLabel} numberOfLines={1}>All day</Text>
        <View style={styles.allDayPills}>
          {allDayEvents.map(e => (
            <TouchableOpacity
              key={e.id}
              style={[styles.allDayPill, { backgroundColor: allDayColor(e) }]}
              onPress={() => onEventPress?.(e)}
              activeOpacity={0.8}
            >
              <Text style={styles.allDayPillText} numberOfLines={1}>{e.summary}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    )}
    <ScrollView ref={scrollRef} style={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.container}>
        {/* Time labels */}
        <View style={styles.timeCol}>
          {hours.map(h => (
            <View key={h} style={styles.hourLabel}>
              <Text style={styles.hourText}>
                {h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`}
              </Text>
            </View>
          ))}
        </View>

        {/* Events area */}
        <Pressable
          style={[styles.eventsArea, { height: TOTAL_HOURS * HOUR_HEIGHT }]}
          onPress={e => {
            if (!onTimePress) return;
            const y = e.nativeEvent.locationY;
            const totalMinutes = (y / HOUR_HEIGHT) * 60 + START_HOUR * 60;
            const rounded = Math.round(totalMinutes / 15) * 15;
            const hour = Math.floor(rounded / 60) % 24;
            const minute = rounded % 60;
            const date = selectedDate ? new Date(selectedDate) : new Date();
            date.setHours(hour, minute, 0, 0);
            onTimePress(date);
          }}
        >
          {hours.map(h => (
            <View key={h} style={[styles.gridLine, { top: (h - START_HOUR) * HOUR_HEIGHT }]} />
          ))}

          {/* Current-time line — today only */}
          {isToday && nowInRange && (
            <View style={[styles.nowLine, { top: nowY }]} pointerEvents="none">
              <View style={styles.nowDot} />
              <View style={styles.nowBar} />
            </View>
          )}

          {positioned.map(event => {
            const color = eventColor(event);
            const width = `${100 / event.numColumns}%` as any;
            const left = `${(event.column / event.numColumns) * 100}%` as any;
            return (
              <TouchableOpacity
                key={event.id}
                style={[styles.event, { top: event.top, height: event.height, width, left, backgroundColor: color }]}
                onPress={() => onEventPress?.(event)}
                activeOpacity={0.8}
              >
                <Text style={styles.eventTitle} numberOfLines={2}>{event.summary}</Text>
                <Text style={styles.eventTime} numberOfLines={1}>
                  {new Date(event.start.dateTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' – '}
                  {new Date(event.end.dateTime!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </TouchableOpacity>
            );
          })}
        </Pressable>
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1 },
  allDayBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#f0f0f0', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  allDayLabel: { fontSize: 11, fontWeight: '600', color: '#999', width: TIME_COL_WIDTH - 4 },
  allDayPills: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  allDayPill: { borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8 },
  allDayPillText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  scroll: { flex: 1, backgroundColor: '#f7f7f7' },
  container: { flexDirection: 'row' },
  timeCol: { width: TIME_COL_WIDTH, backgroundColor: '#f7f7f7' },
  hourLabel: { height: HOUR_HEIGHT, justifyContent: 'flex-start', alignItems: 'flex-end', paddingRight: 8, paddingTop: 4 },
  hourText: { fontSize: 11, color: '#999', fontWeight: '500' },
  eventsArea: { flex: 1, position: 'relative', backgroundColor: '#fff' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#eee' },
  event: { position: 'absolute', borderRadius: 6, padding: 6, overflow: 'hidden', borderLeftWidth: 3, borderLeftColor: 'rgba(0,0,0,0.2)' },
  eventTitle: { fontSize: 12, fontWeight: '700', color: '#fff' },
  eventTime: { fontSize: 10, color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  nowLine: { position: 'absolute', left: -4, right: 0, flexDirection: 'row', alignItems: 'center', zIndex: 20 },
  nowDot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00e676', marginRight: 0 },
  nowBar:  { flex: 1, height: 2, backgroundColor: '#00e676' },
});
