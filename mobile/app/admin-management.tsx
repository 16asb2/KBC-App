import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { KBC } from '@/constants/theme';
import { SUPER_ADMIN_EMAIL, isAdmin } from '@/constants/admins';
import { useAuth } from '@/context/auth';
import { useProfile } from '@/context/profile';
import { UserProfile, getAllProfiles, updateProfile } from '@/services/firestore';

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

export default function AdminManagementScreen() {
  const { user }    = useAuth();
  const { profile } = useProfile();
  const [members, setMembers]   = useState<UserProfile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState<string | null>(null); // uid currently being saved

  const viewerIsAdmin = isAdmin(user?.email, profile?.isAdmin);

  useEffect(() => {
    // Guard: only admins can access this screen
    if (!viewerIsAdmin) { router.back(); return; }
    loadMembers();
  }, [viewerIsAdmin]);

  async function loadMembers() {
    setLoading(true);
    try {
      const all = await getAllProfiles();
      setMembers(all);
    } catch (e) {
      console.warn('Failed to load members:', e);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAdmin(member: UserProfile) {
    if (!user?.email) return;

    // Guard: cannot change own status or super-admin
    if (member.uid === profile?.uid) return;
    if (member.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) return;

    const newValue = !member.isAdmin;
    const name = member.preferredName || member.name;

    Alert.alert(
      newValue ? 'Grant Admin Access' : 'Revoke Admin Access',
      newValue
        ? `Give ${name} full admin access? They will be able to manage members, supervisors, and other admins.`
        : `Remove admin access from ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: newValue ? 'Grant' : 'Revoke',
          style: newValue ? 'default' : 'destructive',
          onPress: async () => {
            setSaving(member.uid);
            try {
              await updateProfile(member.uid, { isAdmin: newValue }, user.email);
              setMembers(prev =>
                prev.map(m => m.uid === member.uid ? { ...m, isAdmin: newValue } : m),
              );
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setSaving(null);
            }
          },
        },
      ],
    );
  }

  if (!viewerIsAdmin) return null;

  return (
    <>
      <Stack.Screen options={{ title: 'Admin Management' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>🔑  Admin Accounts</Text>
          <Text style={styles.infoText}>
            Admins can manage memberships, grant supervisor status, and manage other admins.
            The super-admin account ({SUPER_ADMIN_EMAIL}) cannot be modified.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={KBC.purple} style={{ marginTop: 32 }} />
        ) : (
          <View style={styles.list}>
            {members.map(member => {
              const isSelf         = member.uid === profile?.uid;
              const isSuperAdmin   = member.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
              const isLocked       = isSelf || isSuperAdmin;
              const hasAdmin       = isAdmin(member.email, member.isAdmin);
              const displayName    = member.preferredName || member.name;
              const isSavingThis   = saving === member.uid;

              return (
                <View key={member.uid} style={styles.row}>
                  <Avatar name={displayName} />
                  <View style={styles.rowInfo}>
                    <View style={styles.rowNameRow}>
                      <Text style={styles.rowName}>{displayName}</Text>
                      {isSuperAdmin && (
                        <View style={[styles.tag, { backgroundColor: KBC.purple }]}>
                          <Text style={styles.tagText}>SUPER</Text>
                        </View>
                      )}
                      {isSelf && (
                        <View style={[styles.tag, { backgroundColor: '#555' }]}>
                          <Text style={styles.tagText}>YOU</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.rowEmail}>{member.email}</Text>
                  </View>

                  {isSavingThis ? (
                    <ActivityIndicator color={KBC.purple} />
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.toggle,
                        hasAdmin && styles.toggleOn,
                        isLocked && styles.toggleLocked,
                      ]}
                      onPress={() => !isLocked && toggleAdmin(member)}
                      disabled={isLocked}
                      activeOpacity={isLocked ? 1 : 0.7}
                    >
                      <Text style={[styles.toggleText, hasAdmin && styles.toggleTextOn]}>
                        {hasAdmin ? 'Admin ✓' : 'Admin'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f2' },
  content:   { padding: 16, paddingBottom: 40, gap: 12 },

  infoBox: {
    backgroundColor: KBC.purple + '18', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: KBC.purple + '44', gap: 6,
  },
  infoTitle: { fontSize: 14, fontWeight: '800', color: KBC.purple },
  infoText:  { fontSize: 13, color: '#555', lineHeight: 20 },

  list: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', elevation: 1 },

  row: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    gap: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  avatar: { backgroundColor: KBC.purple, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800' },

  rowInfo:    { flex: 1 },
  rowNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rowName:    { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  rowEmail:   { fontSize: 12, color: '#888', marginTop: 1 },

  tag:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  tagText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  toggle: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#f8f8f8',
  },
  toggleOn:     { backgroundColor: KBC.purple + '22', borderColor: KBC.purple },
  toggleLocked: { opacity: 0.35 },
  toggleText:   { fontSize: 12, fontWeight: '700', color: '#aaa' },
  toggleTextOn: { color: KBC.purple },
});
