import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, router } from 'expo-router';

import { KBC } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useProfile } from '@/context/profile';
import { EmergencyContact, createSelfRegisteredProfile } from '@/services/firestore';

export default function NewMemberSetupScreen() {
  const { user }           = useAuth();
  const { reloadProfile }  = useProfile();

  const [legalName,      setLegalName]      = useState('');
  const [preferredName,  setPreferredName]  = useState('');
  const [memberPhone,    setMemberPhone]    = useState('');
  const [ecName,         setEcName]         = useState('');
  const [ecRelation,     setEcRelation]     = useState('');
  const [ecPhone,        setEcPhone]        = useState('');
  const [saving,         setSaving]         = useState(false);

  async function handleSave() {
    const ln = legalName.trim();
    const en = ecName.trim();
    const er = ecRelation.trim();
    const ep = ecPhone.trim();

    if (!ln) { Alert.alert('Required', 'Please enter your legal name.'); return; }
    if (!en) { Alert.alert('Required', 'Please enter an emergency contact name.'); return; }
    if (!er) { Alert.alert('Required', 'Please enter the emergency contact relationship.'); return; }
    if (!ep) { Alert.alert('Required', 'Please enter the emergency contact phone number.'); return; }
    if (!user) return;

    setSaving(true);
    try {
      const ec: EmergencyContact = { name: en, relationship: er, phone: ep };
      const pn = preferredName.trim() || undefined;
      const mp = memberPhone.trim();
      const phone = mp ? (mp.startsWith('+') ? mp : `+${mp}`) : undefined;

      await createSelfRegisteredProfile(
        user.id, user.name ?? user.email, user.email, user.photo ?? null,
        ln, ec, pn, phone,
      );
      await reloadProfile();
      router.replace('/waiver/liability?fromOnboarding=true' as any);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen options={{ title: 'Welcome to KBC', headerLeft: () => null }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introCard}>
          <Text style={styles.heading}>Welcome to KBC!</Text>
          <Text style={styles.sub}>
            Before you get started, please complete your member profile.
            This information is kept on file for your membership.
          </Text>
        </View>

        <Text style={styles.sectionHeader}>Member Info</Text>

        <Text style={styles.label}>Full Legal Name *</Text>
        <TextInput
          style={styles.input}
          value={legalName}
          onChangeText={setLegalName}
          placeholder="e.g. Jane Smith"
          placeholderTextColor="#aaa"
          autoCapitalize="words"
        />

        <Text style={styles.label}>Preferred Name (shown in app)</Text>
        <TextInput
          style={styles.input}
          value={preferredName}
          onChangeText={setPreferredName}
          placeholder="e.g. Jane"
          placeholderTextColor="#aaa"
          autoCapitalize="words"
        />

        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          style={styles.input}
          value={memberPhone}
          onChangeText={setMemberPhone}
          placeholder="+1 613 555 0123"
          placeholderTextColor="#aaa"
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Email Address</Text>
        <View style={styles.lockedField}>
          <Text style={styles.lockedText}>{user?.email ?? ''}</Text>
        </View>

        <Text style={styles.sectionHeader}>Emergency Contact</Text>

        <Text style={styles.label}>Full Name *</Text>
        <TextInput
          style={styles.input}
          value={ecName}
          onChangeText={setEcName}
          placeholder="e.g. John Smith"
          placeholderTextColor="#aaa"
          autoCapitalize="words"
        />

        <Text style={styles.label}>Relationship *</Text>
        <TextInput
          style={styles.input}
          value={ecRelation}
          onChangeText={setEcRelation}
          placeholder="e.g. Partner, Parent, Friend"
          placeholderTextColor="#aaa"
          autoCapitalize="words"
        />

        <Text style={styles.label}>Phone Number *</Text>
        <TextInput
          style={styles.input}
          value={ecPhone}
          onChangeText={setEcPhone}
          placeholder="+1 613 555 0123"
          placeholderTextColor="#aaa"
          keyboardType="phone-pad"
        />

        <TouchableOpacity
          style={[styles.btn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Continue to Waiver</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f2' },
  content:   { padding: 24, paddingBottom: 48, gap: 6 },

  introCard: {
    backgroundColor: KBC.black, borderRadius: 20, padding: 24, gap: 10, marginBottom: 10,
  },
  heading: { fontSize: 26, fontWeight: '900', color: KBC.white },
  sub:     { fontSize: 14, color: '#aaa', lineHeight: 20 },

  sectionHeader: {
    fontSize: 12, fontWeight: '800', color: KBC.pink,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 18, marginBottom: 4,
    borderBottomWidth: 1, borderBottomColor: '#e0e0e0', paddingBottom: 6,
  },
  label: {
    fontSize: 11, fontWeight: '700', color: '#999',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 4,
  },
  input: {
    backgroundColor: '#fff', borderRadius: 10, padding: 13,
    fontSize: 15, color: KBC.black, borderWidth: 1, borderColor: '#e8e8e8',
  },
  lockedField: {
    backgroundColor: '#f0f0f0', borderRadius: 10, padding: 13,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  lockedText: { fontSize: 15, color: '#888' },

  btn: {
    backgroundColor: KBC.cyan, borderRadius: 14, padding: 18,
    alignItems: 'center', marginTop: 28,
    shadowColor: KBC.cyan, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  btnText: { color: KBC.black, fontSize: 16, fontWeight: '800' },
});
