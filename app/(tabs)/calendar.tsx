import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { CalendarPicker } from '@/components/calendar-picker';
import { KBC } from '@/constants/theme';
import { useSchedule } from '@/context/schedule';

export default function CalendarScreen() {
  const { selectedDate, setSelectedDate, allEvents, loading } = useSchedule();

  function handleDayPress(day: Date) {
    setSelectedDate(day);
    router.navigate('/(tabs)');
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={KBC.pink} />
        </View>
      ) : (
        <ScrollView>
          <CalendarPicker
            selectedDate={selectedDate}
            allEvents={allEvents}
            onDayPress={handleDayPress}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
