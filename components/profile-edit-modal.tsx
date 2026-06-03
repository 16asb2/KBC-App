import { useState } from 'react';

// ─── Phone formatter ─────────────────────────────────────────────────────────
// Formats a phone number string as the user types, inserting spaces:
//   +1 613 555 0123  (North American)
//   +44 207 123 4567  (generic international)
function formatPhone(raw: string): string {
  const hasPlus = raw.startsWith('+');
  const digits  = raw.replace(/\D/g, '');

  if (!digits) return hasPlus ? '+' : '';

  // North American +1: +1 XXX XXX XXXX
  if (hasPlus && digits.startsWith('1')) {
    const local = digits.slice(1);
    let out = '+1';
    if (local.length > 0) out += ' ' + local.slice(0, 3);
    if (local.length > 3) out += ' ' + local.slice(3, 6);
    if (local.length > 6) out += ' ' + local.slice(6, 10);
    return out;
  }

  // Generic international: group after the +
  if (hasPlus) {
    const groups = digits.match(/.{1,3}/g) ?? [];
    return '+' + groups.join(' ');
  }

  // No leading +: group in 3s
  const groups = digits.match(/.{1,3}/g) ?? [];
  return groups.join(' ');
}
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KBC } from '@/constants/theme';
import { EmergencyContact, UserProfile } from '@/services/firestore';

type Props = {
  profile: UserProfile;
  onSave: (updates: Partial<UserProfile>) => Promise<void>;
  onClose: () => void;
  canEditLegalName?: boolean;  // admins only
};

function FieldLabel({ text }: { text: string }) {
  return <Text style={styles.fieldLabel}>{text}</Text>;
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.lockedRow}>
      <View style={{ flex: 1 }}>
        <FieldLabel text={label} />
        <Text style={styles.lockedValue}>{value}</Text>
      </View>
      <Text style={styles.lockIcon}>🔒</Text>
    </View>
  );
}

export function ProfileEditModal({ profile, onSave, onClose, canEditLegalName = false }: Props) {
  const insets = useSafeAreaInsets();
  // ── Legal name (admin-only editable) ──
  const [legalName, setLegalName] = useState(profile.legalName ?? '');
  // ── Preferred name ──
  const [preferredName, setPreferredName] = useState(profile.preferredName ?? '');

  // ── Emails ──
  const [additionalEmails, setAdditionalEmails] = useState<string[]>(
    profile.additionalEmails ? JSON.parse(profile.additionalEmails) : [],
  );
  const [preferredEmail, setPreferredEmail] = useState(
    profile.preferredEmail ?? profile.email,
  );
  const [newEmail, setNewEmail] = useState('');

  // ── Phone ──
  const [phone, setPhone] = useState(profile.phone ?? '');

  // ── Emergency contact ──
  const ec: EmergencyContact = profile.emergencyContact
    ? JSON.parse(profile.emergencyContact)
    : { name: '', relationship: '', phone: '' };
  const [ecName, setEcName]         = useState(ec.name);
  const [ecRelation, setEcRelation] = useState(ec.relationship);
  const [ecPhone, setEcPhone]       = useState(ec.phone);

  // ── Additional comments ──
  const [comments, setComments] = useState(profile.additionalComments ?? '');

  const [saving, setSaving] = useState(false);

  // ── Helpers ──
  function addEmail() {
    const e = newEmail.trim().toLowerCase();
    if (!e) return;
    if (e === profile.email.toLowerCase()) {
      Alert.alert('Duplicate', 'That is already your Google account email.'); return;
    }
    if (additionalEmails.map(x => x.toLowerCase()).includes(e)) {
      Alert.alert('Duplicate', 'That email is already in your list.'); return;
    }
    if (!e.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.'); return;
    }
    setAdditionalEmails(prev => [...prev, e]);
    setNewEmail('');
  }

  function removeEmail(email: string) {
    setAdditionalEmails(prev => prev.filter(x => x !== email));
    if (preferredEmail === email) setPreferredEmail(profile.email);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const emergencyContactJson =
        ecName || ecRelation || ecPhone
          ? JSON.stringify({ name: ecName.trim(), relationship: ecRelation.trim(), phone: ecPhone.trim() })
          : '';

      const updates: Partial<UserProfile> = {
        preferredName:      preferredName.trim(),
        additionalEmails:   additionalEmails.length > 0 ? JSON.stringify(additionalEmails) : '',
        preferredEmail:     preferredEmail !== profile.email ? preferredEmail : '',
        phone:              phone.trim(),
        emergencyContact:   emergencyContactJson,
        additionalComments: comments.trim(),
      };
      if (canEditLegalName) updates.legalName = legalName.trim();
      await onSave(updates);
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  const allEmails = [profile.email, ...additionalEmails];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Tap outside the sheet to dismiss */}
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Edit My Profile</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.sheetCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.sheetBody}
            contentContainerStyle={styles.sheetBodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Legal Name (admin-only) ── */}
            {canEditLegalName ? (
              <>
                <Text style={styles.sectionHeader}>Legal Name</Text>
                <FieldLabel text="Full Legal Name" />
                <TextInput
                  style={styles.input}
                  value={legalName}
                  onChangeText={setLegalName}
                  placeholder={profile.name}
                  placeholderTextColor="#bbb"
                  autoCapitalize="words"
                />
                <Text style={styles.hint}>Admin-only field. Used for waiver records.</Text>
              </>
            ) : profile.legalName ? (
              <>
                <Text style={styles.sectionHeader}>Legal Name</Text>
                <LockedField label="Full Legal Name" value={profile.legalName} />
              </>
            ) : null}

            {/* ── Display Name ── */}
            <Text style={styles.sectionHeader}>Display Name</Text>
            <LockedField label="Legal Name" value={profile.name} />
            <FieldLabel text="Preferred Name (shown in app)" />
            <TextInput
              style={styles.input}
              value={preferredName}
              onChangeText={setPreferredName}
              placeholder={profile.name}
              placeholderTextColor="#bbb"
              autoCapitalize="words"
            />

            {/* ── Emails ── */}
            <Text style={styles.sectionHeader}>Email Addresses</Text>
            <LockedField label="Google Account Email" value={profile.email} />

            {additionalEmails.map(email => (
              <View key={email} style={styles.emailRow}>
                <TouchableOpacity
                  style={styles.radioBtn}
                  onPress={() => setPreferredEmail(email)}
                >
                  <View style={[styles.radioOuter, preferredEmail === email && styles.radioOuterActive]}>
                    {preferredEmail === email && <View style={styles.radioInner} />}
                  </View>
                </TouchableOpacity>
                <Text style={styles.emailText}>{email}</Text>
                <TouchableOpacity onPress={() => removeEmail(email)} style={styles.removeBtn}>
                  <Text style={styles.removeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* Preferred toggle for Google email */}
            <TouchableOpacity
              style={styles.emailRow}
              onPress={() => setPreferredEmail(profile.email)}
            >
              <View style={styles.radioBtn}>
                <View style={[styles.radioOuter, preferredEmail === profile.email && styles.radioOuterActive]}>
                  {preferredEmail === profile.email && <View style={styles.radioInner} />}
                </View>
              </View>
              <Text style={[styles.emailText, { color: '#888' }]}>Use Google email as preferred</Text>
            </TouchableOpacity>

            <View style={styles.addEmailRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder="Add email address…"
                placeholderTextColor="#bbb"
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={addEmail}
              />
              <TouchableOpacity style={styles.addBtn} onPress={addEmail}>
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>

            {/* ── Phone ── */}
            <Text style={styles.sectionHeader}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={v => setPhone(formatPhone(v))}
              placeholder="+1 613 555 0123"
              placeholderTextColor="#bbb"
              keyboardType="phone-pad"
            />
            <Text style={styles.hint}>International format — e.g. +1 613 555 0123</Text>

            {/* ── Emergency Contact ── */}
            <Text style={styles.sectionHeader}>Emergency Contact</Text>
            <FieldLabel text="Full Name" />
            <TextInput
              style={styles.input}
              value={ecName}
              onChangeText={setEcName}
              placeholder="Jane Doe"
              placeholderTextColor="#bbb"
              autoCapitalize="words"
            />
            <FieldLabel text="Relationship" />
            <TextInput
              style={styles.input}
              value={ecRelation}
              onChangeText={setEcRelation}
              placeholder="e.g. Partner, Parent, Friend"
              placeholderTextColor="#bbb"
              autoCapitalize="words"
            />
            <FieldLabel text="Phone Number" />
            <TextInput
              style={styles.input}
              value={ecPhone}
              onChangeText={v => setEcPhone(formatPhone(v))}
              placeholder="+1 613 555 0123"
              placeholderTextColor="#bbb"
              keyboardType="phone-pad"
            />

            {/* ── Additional Comments ── */}
            <Text style={styles.sectionHeader}>Additional Comments</Text>
            <Text style={styles.hint}>
              Allergies, medical info, or anything else relevant for KBC staff.
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={comments}
              onChangeText={setComments}
              placeholder="Any additional information…"
              placeholderTextColor="#bbb"
              multiline
              textAlignVertical="top"
            />

            {/* ── Save ── */}
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>Save Profile</Text>
              }
            </TouchableOpacity>

            <View style={{ height: 8 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '92%',
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  sheetTitle:  { fontSize: 17, fontWeight: '700', color: KBC.black },
  sheetCancel: { fontSize: 16, color: KBC.pink, fontWeight: '600' },
  sheetBody:        { padding: 16 },
  sheetBodyContent: { paddingBottom: 48 },

  sectionHeader: {
    fontSize: 13, fontWeight: '800', color: KBC.pink,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 20, marginBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingBottom: 6,
  },
  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: '#999',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 6, marginTop: 10,
  },

  lockedRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8f8f8', borderRadius: 10,
    padding: 12, marginBottom: 4,
    borderWidth: 1, borderColor: '#eee',
  },
  lockedValue: { fontSize: 15, color: KBC.black, fontWeight: '500' },
  lockIcon:    { fontSize: 16, marginLeft: 8 },

  input: {
    backgroundColor: '#f8f8f8', borderRadius: 10, padding: 13,
    fontSize: 15, color: KBC.black, borderWidth: 1, borderColor: '#e8e8e8',
  },
  textArea: { height: 100, paddingTop: 12 },
  hint: { fontSize: 12, color: '#aaa', marginTop: 4, marginBottom: 4 },

  emailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  radioBtn: { padding: 2 },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#ccc',
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterActive: { borderColor: KBC.green },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: KBC.green },
  emailText:  { flex: 1, fontSize: 14, color: KBC.black },
  removeBtn:  { padding: 6 },
  removeBtnText: { fontSize: 14, color: KBC.pink, fontWeight: '700' },

  addEmailRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  addBtn: {
    backgroundColor: KBC.black, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  saveBtn: {
    backgroundColor: KBC.green, borderRadius: 14,
    padding: 18, alignItems: 'center', marginTop: 20,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
