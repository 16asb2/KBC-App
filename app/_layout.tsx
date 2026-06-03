import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/auth';
import { ProfileProvider, useProfile } from '@/context/profile';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user, loading } = useAuth();
  const { profile, profileReady } = useProfile();
  const hasRouted = useRef(false);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      hasRouted.current = false;
      router.replace('/login');
      return;
    }

    // Wait for the first profile lookup to complete
    if (!profileReady) return;

    // Only route once per session; subsequent navigation is controlled by each screen
    if (hasRouted.current) return;
    hasRouted.current = true;

    // No profile in DB → brand-new user who hasn't completed setup
    // Missing legalName → existing Google-only user who needs to complete setup
    if (!profile || !profile.legalName) {
      router.replace('/new-member-setup');
      return;
    }

    // Waiver required before accessing the app
    if (!profile.waiverLiability) {
      router.replace('/waiver/liability?fromOnboarding=true' as any);
      return;
    }

    router.replace('/(tabs)/home');
  }, [user, loading, profile, profileReady]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="new-member-setup" options={{ title: 'Welcome to KBC', headerTintColor: '#c0005a', headerStyle: { backgroundColor: '#0a0a0a' }, headerTitleStyle: { color: '#ffffff' } }} />
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
