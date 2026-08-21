import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { KBC } from '@/constants/theme';
import { WAIVER_META, WaiverType } from '@/constants/waivers';
import { useAuth } from '@/context/auth';
import { useProfile } from '@/context/profile';
import { updateProfile, WaiverRecord } from '@/services/firestore';
import { createWaiverDoc } from '@/services/waiver-doc';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSignedDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function WaiverScreen() {
  const { type, targetUid, targetName, fromOnboarding } = useLocalSearchParams<{
    type: string;
    targetUid?: string;
    targetName?: string;
    fromOnboarding?: string;
  }>();
  const isOnboarding = fromOnboarding === 'true';
  const config = WAIVER_META[type as WaiverType];

  const { user, getAccessToken } = useAuth();
  const { profile, reloadProfile } = useProfile();

  // When signing on behalf of another member, use their uid/name
  const isForOther  = !!targetUid;
  const saveUid     = isForOther ? targetUid! : (user?.id ?? '');
  const memberName  = isForOther
    ? decodeURIComponent(targetName ?? 'Member')
    : (profile?.legalName || user?.name || user?.email || 'Unknown');

  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [isMinor, setIsMinor]             = useState(false);
  const [signedBy, setSignedBy]           = useState('');
  const [guardianName, setGuardianName]   = useState('');
  const [saving, setSaving]               = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  if (!config) return (
    <View style={styles.center}><Text style={styles.errorText}>Unknown waiver type.</Text></View>
  );

  // Parse existing signature — only for own profile (target profiles aren't in context)
  const existing: WaiverRecord | null = isForOther ? null : (() => {
    try { return profile?.[config.profileKey] ? JSON.parse(profile[config.profileKey]!) : null; }
    catch { return null; }
  })();

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 48) {
      setScrolledToEnd(true);
    }
  }

  const nameMatches = signedBy.trim().toLowerCase() === memberName.toLowerCase();

  async function handleSign() {
    const name = signedBy.trim();
    if (!name) {
      Alert.alert('Name required', `Please enter the ${isForOther ? "member's" : "your"} full legal name.`);
      return;
    }
    if (!nameMatches) {
      Alert.alert('Name mismatch', `The name entered must exactly match the member's legal name: "${memberName}".`);
      return;
    }
    if (isMinor && !guardianName.trim()) {
      Alert.alert('Guardian name required', 'Please enter the guardian\'s full legal name.'); return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const record: WaiverRecord = {
        signedAt: new Date().toISOString(),
        signedBy: name,
        ...(isMinor ? { guardian: guardianName.trim() } : {}),
      };

      const savedBy = isForOther ? `supervisor:${user.email}` : user.email;

      // Save signature immediately
      await updateProfile(saveUid, { [config.profileKey]: JSON.stringify(record) }, savedBy);

      // Create Google Doc in background — don't block or fail signing if it errors
      try {
        const token = await getAccessToken();
        if (token) {
          const docUrl = await createWaiverDoc(
            config.fullTitle, memberName, config.sections, record, token,
          );
          await updateProfile(
            saveUid,
            { [config.profileKey]: JSON.stringify({ ...record, docUrl }) },
            savedBy,
          );
        }
      } catch (docErr) {
        console.warn('Google Doc creation failed (non-fatal):', docErr);
      }

      // Only reload own profile
      if (!isForOther) await reloadProfile();
      if (isOnboarding) {
        // Membership waiver is always followed by the liability waiver
        if (type === 'membership') {
          router.replace('/waiver/liability?fromOnboarding=true' as any);
        } else {
          router.replace('/(tabs)/home');
        }
      } else {
        router.back();
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    router.back();
  }

  // Scroll to the very bottom after the keyboard has fully animated in.
  // The large paddingBottom on the content means the keyboard overlaps empty
  // space rather than the inputs, so scrollToEnd always exposes them.
  function scrollToEnd() {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 350);
  }

  return (
    // iOS: KAV pushes content up. Android: ScrollView + large paddingBottom handle it.
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      {/* In onboarding mode the waiver is mandatory — suppress back navigation */}
      <Stack.Screen
        options={{
          headerLeft: isOnboarding
            ? () => null
            : () => (
                <TouchableOpacity onPress={handleCancel} style={{ paddingHorizontal: 4 }}>
                  <Text style={{ color: KBC.pink, fontSize: 16, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
              ),
        }}
      />
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Text style={styles.fullTitle}>{config.fullTitle}</Text>

        {/* Already signed banner */}
        {existing && (
          <View style={styles.signedBanner}>
            <Text style={styles.signedIcon}>✅</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.signedLabel}>Signed by {existing.guardian ? existing.guardian + ' (guardian)' : existing.signedBy}</Text>
              {existing.guardian && <Text style={styles.signedSub}>On behalf of: {existing.signedBy}</Text>}
              <Text style={styles.signedDate}>{formatSignedDate(existing.signedAt)}</Text>
            </View>
          </View>
        )}

        {/* Waiver body */}
        <View style={styles.waiverBody}>
          {config.sections.map((section, i) => {
            if (section.type === 'heading') {
              return <Text key={i} style={styles.sectionHeading}>{section.text}</Text>;
            }
            if (section.type === 'warning') {
              return <Text key={i} style={styles.sectionWarning}>{section.text}</Text>;
            }
            if (section.type === 'consent') {
              return <Text key={i} style={styles.sectionConsent}>{section.text}</Text>;
            }
            return <Text key={i} style={styles.sectionBody}>{section.text}</Text>;
          })}
        </View>

        {/* Signature section — only shown if not yet signed */}
        {!existing && (
          <View style={styles.signatureSection}>
            {!scrolledToEnd && (
              <View style={styles.scrollNotice}>
                <Text style={styles.scrollNoticeText}>↓  Please read the full waiver before signing</Text>
              </View>
            )}

            {scrolledToEnd && (
              <>
                {/* Minor toggle */}
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>I am signing on behalf of a minor</Text>
                  <Switch
                    value={isMinor}
                    onValueChange={setIsMinor}
                    trackColor={{ true: KBC.pink, false: '#ccc' }}
                    thumbColor="#fff"
                  />
                </View>

                {isMinor ? (
                  <>
                    <Text style={styles.fieldLabel}>Minor&apos;s full legal name</Text>
                    <TextInput
                      style={styles.input}
                      value={signedBy}
                      onChangeText={setSignedBy}
                      placeholder="Minor's full name"
                      placeholderTextColor="#aaa"
                      autoCapitalize="words"
                      returnKeyType="next"
                      onFocus={scrollToEnd}
                    />
                    <Text style={styles.fieldLabel}>Guardian&apos;s full legal name</Text>
                    <TextInput
                      style={styles.input}
                      value={guardianName}
                      onChangeText={setGuardianName}
                      placeholder="Guardian's full name"
                      placeholderTextColor="#aaa"
                      autoCapitalize="words"
                      returnKeyType="done"
                      onFocus={scrollToEnd}
                    />
                    <Text style={styles.guardianNote}>
                      By signing, you confirm you are the legal guardian and accept these terms on behalf of the minor.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.fieldLabel}>
                      {isForOther ? `${memberName}'s full legal name` : 'Your full legal name'}
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={signedBy}
                      onChangeText={setSignedBy}
                      placeholder="Full legal name"
                      placeholderTextColor="#aaa"
                      autoCapitalize="words"
                      returnKeyType="done"
                      onFocus={scrollToEnd}
                    />
                    {isForOther && (
                      <Text style={styles.guardianNote}>
                        Signing on behalf of {memberName}. Supervised by {user?.name ?? user?.email}.
                      </Text>
                    )}
                  </>
                )}

                <TouchableOpacity
                  style={[styles.signBtn, (!nameMatches || saving) && { opacity: 0.4 }]}
                  onPress={handleSign}
                  disabled={saving || !nameMatches}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.signBtnText}>✍️  I agree and sign this waiver</Text>
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f2' },
  // paddingBottom must exceed keyboard height (~320 dp) so the keyboard always
  // overlaps empty space and scrollToEnd reliably exposes the signature fields.
  content:   { padding: 20, paddingBottom: 380, gap: 20 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#888', fontSize: 15 },

  fullTitle: { fontSize: 18, fontWeight: '800', color: KBC.black, lineHeight: 26 },

  signedBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#e8f8e8', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: KBC.green,
  },
  signedIcon:  { fontSize: 22 },
  signedLabel: { fontSize: 14, fontWeight: '700', color: KBC.black },
  signedSub:   { fontSize: 13, color: '#555', marginTop: 2 },
  signedDate:  { fontSize: 12, color: '#888', marginTop: 4 },

  waiverBody: {
    backgroundColor: '#fff', borderRadius: 14, padding: 20, gap: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  sectionHeading: { fontSize: 13, fontWeight: '800', color: KBC.black, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 },
  sectionBody:    { fontSize: 14, color: '#333', lineHeight: 22 },
  sectionWarning: { fontSize: 14, fontWeight: '700', color: '#b45309', lineHeight: 22, backgroundColor: '#fff8e1', borderRadius: 8, padding: 10, overflow: 'hidden' },
  sectionConsent: { fontSize: 13, fontWeight: '600', color: '#444', lineHeight: 20, fontStyle: 'italic', borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 12, marginTop: 4 },

  signatureSection: { gap: 12 },

  scrollNotice: {
    backgroundColor: '#fff3cd', borderRadius: 10, padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#f0c040',
  },
  scrollNoticeText: { fontSize: 13, fontWeight: '700', color: '#7a5c00' },

  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
  },
  switchLabel: { fontSize: 15, fontWeight: '600', color: KBC.black, flex: 1, marginRight: 12 },

  fieldLabel: { fontSize: 11, fontWeight: '800', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    fontSize: 15, color: KBC.black, borderWidth: 1, borderColor: '#e0e0e0',
  },
  guardianNote: { fontSize: 12, color: '#888', lineHeight: 18, fontStyle: 'italic' },

  signBtn: {
    backgroundColor: KBC.green, borderRadius: 14, padding: 18,
    alignItems: 'center', marginTop: 8,
    shadowColor: KBC.green, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  signBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
