import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/auth';
import { ProfileProvider } from '@/context/profile';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace('/(tabs)/home');
    } else {
      router.replace('/login');
    }
  }, [user, loading]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="add-session" options={{ presentation: 'modal', title: 'Add Climb Session', headerTintColor: '#c0005a', headerStyle: { backgroundColor: '#0a0a0a' }, headerTitleStyle: { color: '#ffffff' } }} />
        <Stack.Screen name="edit-session" options={{ presentation: 'modal', title: 'Edit Session', headerTintColor: '#c0005a', headerStyle: { backgroundColor: '#0a0a0a' }, headerTitleStyle: { color: '#ffffff' } }} />
        <Stack.Screen name="waiver/[type]" options={{ presentation: 'card', title: 'Waiver', headerTintColor: '#c0005a', headerStyle: { backgroundColor: '#0a0a0a' }, headerTitleStyle: { color: '#ffffff' } }} />
        <Stack.Screen name="member-history/[uid]" options={{ presentation: 'card', title: 'History', headerTintColor: '#c0005a', headerStyle: { backgroundColor: '#0a0a0a' }, headerTitleStyle: { color: '#ffffff' } }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <ProfileProvider>
          <RootLayoutNav />
        </ProfileProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
