import { Tabs } from 'expo-router';
import React from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KBC } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { ScheduleProvider } from '@/context/schedule';

const logoSource = require('@/assets/images/kbc-logo.png');


function KBCHeader() {
  const { signOut } = useAuth();
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Image source={logoSource} style={styles.logo} resizeMode="contain" />
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>KBC App</Text>
          <Text style={styles.headerSub} numberOfLines={1} adjustsFontSizeToFit>Kingston Boulder Cooperative</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }} collapsable={false}>
      <Tabs
        screenOptions={{
          tabBarInactiveTintColor: '#555',
          tabBarButton: HapticTab,
          headerShown: true,
          header: () => <KBCHeader />,
          tabBarStyle: [styles.tabBar, { height: 56 + insets.bottom, paddingBottom: insets.bottom + 4 }],
          tabBarLabelStyle: styles.tabLabel,
          tabBarIconStyle: { marginBottom: -2 },
        }}>
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarActiveTintColor: KBC.cyan,
            tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="logbook"
          options={{
            href: null, // hidden from tab bar — accessible via Sign-In Book button on Home
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            title: 'Schedule',
            tabBarActiveTintColor: KBC.pink,
            tabBarIcon: ({ color }) => <IconSymbol size={24} name="clock.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Calendar',
            tabBarActiveTintColor: KBC.purple,
            tabBarIcon: ({ color }) => <IconSymbol size={24} name="calendar" color={color} />,
          }}
        />
        <Tabs.Screen
          name="members"
          options={{
            title: 'Members',
            tabBarActiveTintColor: KBC.orange,
            tabBarIcon: ({ color }) => <IconSymbol size={24} name="person.2.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="boulders"
          options={{
            title: 'Climbs',
            tabBarActiveTintColor: KBC.lime,
            tabBarIcon: ({ color }) => <IconSymbol size={24} name="figure.climbing" color={color} />,
          }}
        />
        <Tabs.Screen
          name="climblog"
          options={{
            title: 'Log Book',
            tabBarActiveTintColor: KBC.green,
            tabBarIcon: ({ color }) => <IconSymbol size={24} name="book.fill" color={color} />,
          }}
        />
      </Tabs>
    </View>
  );
}

export default function Layout() {
  return (
    <ScheduleProvider>
      <TabsLayout />
    </ScheduleProvider>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: KBC.black,
    paddingTop: Platform.OS === 'android' ? 40 : 54,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    marginRight: 10,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  headerTitle: {
    color: KBC.white,
    fontSize: 17,
    fontWeight: '700',
  },
  headerTitles: {
    flexShrink: 1,
  },
  headerSub: {
    color: '#888',
    fontSize: 11,
  },
  signOutBtn: {
    borderWidth: 1,
    borderColor: KBC.pink,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  signOutText: {
    color: KBC.pink,
    fontSize: 13,
    fontWeight: '600',
  },
  tabBar: {
    backgroundColor: KBC.black,
    borderTopColor: '#222',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
