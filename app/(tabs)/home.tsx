import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

import { Toast } from '@/components/toast';

import { KBC } from '@/constants/theme';
import { isAdmin } from '@/constants/admins';
import { useAuth } from '@/context/auth';
import { useProfile } from '@/context/profile';
import { useSchedule } from '@/context/schedule';
import {
  EmergencyContact,
  UserProfile,
  createNewMemberProfile,
  getAllProfiles,
  updateProfile,
} from '@/services/firestore';
import {
  ACCESS_OPTIONS, AccessOption,
  addLogEntry, setGymOpen,
} from '@/services/logbook';

// ─── Gym status logic ────────────────────────────────────────────────────────

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDateTime(date: Date) {
  const today    = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const sameDay  = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const label = sameDay(date, today) ? 'Today' : sameDay(date, tomorrow) ? 'Tomorrow'
    : date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  return `${label} at ${formatTime(date)}`;
}

function passLabel(start: string | null, expiry: string | null): string {
  if (!start || !expiry) return 'Active Member';
  const months = Math.round(
    (new Date(expiry).getTime() - new Date(start).getTime()) / (30.44 * 24 * 60 * 60 * 1000),
  );
  if (months >= 11) return 'Annual Pass';
  if (months >= 7)  return '8-Month Pass';
  if (months >= 3)  return '4-Month Pass';
  if (months >= 1)  return '1-Month Pass';
  return 'Active Member';
}

type GymStatus =
  | { open: true;  until: Date; supervisorName?: string }
  | { open: false; next: Date | null };

function getGymStatus(events: any[]): GymStatus {
  const now    = new Date();
  const supers = events.filter(e => e.summary?.toLowerCase().includes('super'));
  const current = supers.find(e => {
    if (!e.start?.dateTime || !e.end?.dateTime) return false;
    return new Date(e.start.dateTime) <= now && now < new Date(e.end.dateTime);
  });
  if (current) {
    const openEnd = supers.reduce((latest, e) => {
      if (!e.start?.dateTime || !e.end?.dateTime) return latest;
      const s = new Date(e.start.dateTime), end = new Date(e.end.dateTime);
      return (s <= now && end > latest) ? end : latest;
    }, new Date(current.end.dateTime));
    // Extract first supervisor name from summary (e.g. "Artur (sup) + Garry" → "Artur")
    const supervisorName = (current.summary as string | undefined)
      ?.split(/[(+]/)[0]?.trim() || undefined;
    return { open: true, until: openEnd, supervisorName };
  }
  const upcoming = supers
    .filter(e => e.start?.dateTime && new Date(e.start.dateTime) > now)
    .sort((a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime());
  return { open: false, next: upcoming.length > 0 ? new Date(upcoming[0].start.dateTime) : null };
}

// ─── Access Options Modal ────────────────────────────────────────────────────

type ModalStep = 'choose' | 'confirm';

function AccessModal({
  onComplete,
  onOtherPunch,
  onClose,
  isPrivileged,
}: {
  onComplete: (option: AccessOption) => void;
  onOtherPunch: () => void;
  onClose: () => void;
  isPrivileged: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [step, setStep]         = useState<ModalStep>('choose');
  const [selected, setSelected] = useState<AccessOption | null>(null);

  function handleChoose(opt: AccessOption) {
    setSelected(opt);
    setStep('confirm');
  }

  function handleDone() {
    if (selected) onComplete(selected);
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        {step === 'choose' && (
          <>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>How are you accessing KBC?</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.sheetCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetBody}>
              {ACCESS_OPTIONS.map(opt => (
                <TouchableOpacity key={opt.id} style={styles.optionRow} onPress={() => handleChoose(opt)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionLabel}>{opt.label}</Text>
                    {opt.detail && <Text style={styles.optionDetail} textBreakStrategy="simple">{opt.detail}</Text>}
                  </View>
                  <Text style={styles.optionPrice}>{opt.price}</Text>
                </TouchableOpacity>
              ))}

              {isPrivileged && (
                <>
                  <View style={styles.optionDivider} />
                  <TouchableOpacity style={styles.optionRow} onPress={onOtherPunch}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionLabel}>Use Another Member's Punch</Text>
                      <Text style={styles.optionDetail}>Deduct a punch from a different member's account</Text>
                    </View>
                    <Text style={styles.optionPrice}>🎟</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </>
        )}

        {step === 'confirm' && selected && (
          <>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Confirm Payment</Text>
              <TouchableOpacity onPress={() => setStep('choose')}>
                <Text style={styles.sheetCancel}>Back</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.sheetBody}>
              <View style={styles.confirmCard}>
                <Text style={styles.confirmOption}>{selected.label}</Text>
                <Text style={styles.confirmPrice}>{selected.price}</Text>
                {selected.detail && <Text style={styles.confirmDetail} textBreakStrategy="simple">{selected.detail}</Text>}
              </View>
              <Text style={styles.paymentInstructions}>
                Please pay the supervisor on duty in cash, or e-transfer the amount to{' '}
                <Text
                  style={styles.paymentEmail}
                  onPress={() => Share.share({ message: 'climb.kbc@gmail.com' })}
                >
                  climb.kbc@gmail.com
                </Text>
              </Text>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleDone}>
                <Text style={styles.confirmBtnText}>I've paid and confirmed with the supervisor</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

// ─── New Member Modal ────────────────────────────────────────────────────────

function NewMemberModal({
  createdByEmail,
  onCreated,
  onClose,
}: {
  createdByEmail: string;
  onCreated: (member: UserProfile) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [legalName, setLegalName]     = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [email, setEmail]             = useState('');
  const [ecName, setEcName]           = useState('');
  const [ecRelation, setEcRelation]   = useState('');
  const [ecPhone, setEcPhone]         = useState('');
  const [saving, setSaving]           = useState(false);
  const [createdName, setCreatedName] = useState<string | null>(null);

  async function handleCreate() {
    const ln = legalName.trim();
    const em = email.trim().toLowerCase();
    const en = ecName.trim();
    const er = ecRelation.trim();
    const ep = ecPhone.trim();

    if (!ln) { Alert.alert('Required', 'Please enter the member\'s legal name.'); return; }
    if (!em || !em.includes('@')) { Alert.alert('Required', 'Please enter a valid email address.'); return; }
    if (!en) { Alert.alert('Required', 'Please enter the emergency contact name.'); return; }
    if (!er) { Alert.alert('Required', 'Please enter the emergency contact relationship.'); return; }
    if (!ep) { Alert.alert('Required', 'Please enter the emergency contact phone number.'); return; }

    setSaving(true);
    try {
      const ec: EmergencyContact = { name: en, relationship: er, phone: ep };
      const newMember = await createNewMemberProfile(ln, em, ec, createdByEmail);
      const extras: Record<string, string> = {};
      const pn = preferredName.trim();
      const mp = memberPhone.trim();
      if (pn) extras.preferredName = pn;
      if (mp && mp !== '1') extras.phone = `+${mp}`;
      if (Object.keys(extras).length) await updateProfile(newMember.uid, extras, createdByEmail);
      const displayName = preferredName.trim() || ln;
      setCreatedName(displayName);
      onCreated({ ...newMember, ...extras });
      setTimeout(onClose, 2000);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, styles.sheetTall, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Add New Member</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.sheetCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
          {createdName ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16 }}>
              <Text style={{ fontSize: 48 }}>✅</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: KBC.black, textAlign: 'center' }}>
                {createdName} added!
              </Text>
              <Text style={{ fontSize: 14, color: '#888', textAlign: 'center' }}>
                Member profile created successfully.
              </Text>
            </View>
          ) : (
          <ScrollView
            style={styles.sheetBody}
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.newMemberSection}>Member Info</Text>
            <Text style={styles.newMemberLabel}>Full Legal Name *</Text>
            <TextInput
              style={styles.newMemberInput}
              value={legalName}
              onChangeText={setLegalName}
              placeholder="e.g. Jane Smith"
              placeholderTextColor="#aaa"
              autoCapitalize="words"
            />
            <Text style={styles.newMemberLabel}>Preferred Name (shown in app)</Text>
            <TextInput
              style={styles.newMemberInput}
              value={preferredName}
              onChangeText={setPreferredName}
              placeholder="e.g. Jane"
              placeholderTextColor="#aaa"
              autoCapitalize="words"
            />
            <Text style={styles.newMemberLabel}>Phone Number</Text>
            <TextInput
              style={styles.newMemberInput}
              value={memberPhone}
              onChangeText={setMemberPhone}
              placeholder="+1 613 555 0123"
              placeholderTextColor="#aaa"
              keyboardType="phone-pad"
            />
            <Text style={styles.newMemberLabel}>Email Address *</Text>
            <TextInput
              style={styles.newMemberInput}
              value={email}
              onChangeText={setEmail}
              placeholder="member@example.com"
              placeholderTextColor="#aaa"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.newMemberSection}>Emergency Contact</Text>
            <Text style={styles.newMemberLabel}>Full Name *</Text>
            <TextInput
              style={styles.newMemberInput}
              value={ecName}
              onChangeText={setEcName}
              placeholder="e.g. John Smith"
              placeholderTextColor="#aaa"
              autoCapitalize="words"
            />
            <Text style={styles.newMemberLabel}>Relationship *</Text>
            <TextInput
              style={styles.newMemberInput}
              value={ecRelation}
              onChangeText={setEcRelation}
              placeholder="e.g. Partner, Parent, Friend"
              placeholderTextColor="#aaa"
              autoCapitalize="words"
            />
            <Text style={styles.newMemberLabel}>Phone Number *</Text>
            <TextInput
              style={styles.newMemberInput}
              value={ecPhone}
              onChangeText={setEcPhone}
              placeholder="+1 613 555 0123"
              placeholderTextColor="#aaa"
              keyboardType="phone-pad"
            />

            <TouchableOpacity
              style={[styles.confirmBtn, { marginTop: 20, marginBottom: 8 }, saving && { opacity: 0.6 }]}
              onPress={handleCreate}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.confirmBtnText}>Continue</Text>
              }
            </TouchableOpacity>
          </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Other Climber Modal ─────────────────────────────────────────────────────

function OtherClimberModal({
  onSelect,
  onClose,
}: {
  onSelect: (member: UserProfile) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [members, setMembers]   = useState<UserProfile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');

  useEffect(() => {
    getAllProfiles()
      .then(setMembers)
      .catch(e => console.warn('Failed to load members:', e))
      .finally(() => setLoading(false));
  }, []);

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return (
      (m.preferredName ?? m.name).toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
    );
  });

  const statusColor = (m: UserProfile) => {
    if (m.membershipStatus === 'active')  return KBC.green;
    if (m.membershipStatus === 'pending') return KBC.orange;
    if (m.punchPassRemaining > 0)         return KBC.cyan;
    return '#aaa';
  };

  const statusLabel = (m: UserProfile) => {
    if (m.membershipStatus === 'active')     return 'Active member';
    if (m.membershipStatus === 'pending')    return 'Pending';
    if (m.membershipStatus === 'non-member') return 'No access';
    if (m.punchPassRemaining > 0)            return `${m.punchPassRemaining} punch${m.punchPassRemaining !== 1 ? 'es' : ''}`;
    return 'Inactive';
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Sign In Another Climber</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.sheetCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <View style={{ padding: 12 }}>
          <TextInput
            style={styles.memberSearch}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or email…"
            placeholderTextColor="#aaa"
            autoFocus
          />
        </View>
        {loading ? (
          <ActivityIndicator color={KBC.pink} style={{ marginTop: 24 }} />
        ) : (
          <ScrollView style={styles.sheetBody} keyboardShouldPersistTaps="handled">
            {filtered.map(m => (
              <TouchableOpacity
                key={m.uid}
                style={styles.memberPickRow}
                onPress={() => onSelect(m)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberPickName}>{m.preferredName || m.name}</Text>
                  <Text style={styles.memberPickEmail}>{m.email}</Text>
                </View>
                <View style={[styles.memberPickBadge, { backgroundColor: statusColor(m) + '22' }]}>
                  <Text style={[styles.memberPickBadgeText, { color: statusColor(m) }]}>
                    {statusLabel(m)}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            {filtered.length === 0 && (
              <Text style={styles.emptyText}>No members found.</Text>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ─── Punch Donor Modal ───────────────────────────────────────────────────────

function PunchDonorModal({
  excludeUid,
  onSelect,
  onClose,
}: {
  excludeUid?: string;
  onSelect: (member: UserProfile) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    getAllProfiles()
      .then(all => setMembers(all.filter(m => (m.punchPassRemaining ?? 0) > 0 && m.uid !== excludeUid)))
      .catch(e => console.warn('Failed to load members:', e))
      .finally(() => setLoading(false));
  }, [excludeUid]);

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return (m.preferredName ?? m.name).toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Select Punch Donor</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.sheetCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <View style={{ padding: 12 }}>
          <TextInput
            style={styles.memberSearch}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or email…"
            placeholderTextColor="#aaa"
            autoFocus
          />
        </View>
        {loading ? (
          <ActivityIndicator color={KBC.pink} style={{ marginTop: 24 }} />
        ) : filtered.length === 0 ? (
          <Text style={[styles.emptyText, { paddingTop: 32 }]}>
            {members.length === 0 ? 'No members with punch passes.' : 'No matches found.'}
          </Text>
        ) : (
          <ScrollView style={styles.sheetBody} keyboardShouldPersistTaps="handled">
            {filtered.map(m => (
              <TouchableOpacity key={m.uid} style={styles.memberPickRow} onPress={() => onSelect(m)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberPickName}>{m.preferredName || m.name}</Text>
                  <Text style={styles.memberPickEmail}>{m.email}</Text>
                </View>
                <View style={[styles.memberPickBadge, { backgroundColor: KBC.cyan + '22' }]}>
                  <Text style={[styles.memberPickBadgeText, { color: KBC.cyan }]}>
                    {m.punchPassRemaining} punch{m.punchPassRemaining !== 1 ? 'es' : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user }                  = useAuth();
  const { profile, reloadProfile }= useProfile();
  const { allEvents, loading }    = useSchedule();
  const [signingIn, setSigningIn]             = useState(false);
  const [showAccess, setShowAccess]           = useState(false);
  const [showOtherSignIn, setShowOtherSignIn] = useState(false);
  const [showNewMember, setShowNewMember]     = useState(false);
  // When supervisor triggers an access purchase for another member
  const [accessTarget, setAccessTarget]       = useState<UserProfile | null>(null);
  const [showPunchDonor, setShowPunchDonor]   = useState(false);
  const [toastMsg, setToastMsg]               = useState('');
  const [toastVisible, setToastVisible]       = useState(false);
  const isPrivileged = isAdmin(user?.email, profile?.isAdmin) || (profile?.isSupervisor ?? false);

  function showToast(msg: string) {
    setToastMsg(msg);
    setToastVisible(true);
  }

  const scheduleStatus = useMemo(() => getGymStatus(allEvents), [allEvents]);

  const todaySpecialEvents = useMemo(() => {
    const now      = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd   = new Date(todayStart); todayEnd.setDate(todayStart.getDate() + 1);
    return allEvents.filter(e => {
      if (!e.start?.dateTime || !e.end?.dateTime) return false;
      const summary = e.summary?.toLowerCase() ?? '';
      const isSpecial = !summary.includes('super') && !summary.includes('request');
      // Include any special event that overlaps today (started before tomorrow AND ends after today started)
      return isSpecial
        && new Date(e.start.dateTime) < todayEnd
        && new Date(e.end.dateTime)   > todayStart;
    }).sort((a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime());
  }, [allEvents]);

  // Prefer the user's chosen display name for log entries
  const displayName = profile?.preferredName || user?.name || user?.email || 'Unknown';

  /**
   * Core sign-in logic for any target member.
   * Returns true if sign-in completed/initiated, false if the whole chain was cancelled.
   * `isSelf` controls waiver behaviour: hard block vs. "sign on device / override / cancel".
   */
  async function processSignIn(target: UserProfile, isSelf = true): Promise<void> {
    if (!user) return;

    // ── 24-hour sign-in limit ─────────────────────────────────────────────────
    const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;
    if (target.lastSignInAt) {
      const elapsed = Date.now() - new Date(target.lastSignInAt).getTime();
      if (elapsed < TWENTY_FOUR_H) {
        const nextTime = new Date(new Date(target.lastSignInAt).getTime() + TWENTY_FOUR_H);
        const who = isSelf ? 'You have' : `${target.preferredName || target.name} has`;
        Alert.alert(
          'Already Signed In',
          `${who} already signed in today. Next sign-in available at ${nextTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
        );
        return;
      }
    }

    // ── Access check ──────────────────────────────────────────────────────────
    const targetDisplayName = target.preferredName || target.name;
    const { membershipStatus, punchPassRemaining } = target;

    // Non-members with no punch passes cannot be signed in — they have no access pass
    if (membershipStatus === 'non-member' && punchPassRemaining === 0) {
      Alert.alert(
        'No Access Pass',
        isSelf
          ? 'You don\'t have an active access pass or punch passes. Please purchase access to sign in.'
          : `${targetDisplayName} doesn't have an active access pass or punch passes. They need to purchase access before signing in.`,
      );
      return;
    }

    if (membershipStatus === 'active' || membershipStatus === 'pending') {
      setSigningIn(true);
      try {
        const now   = new Date().toISOString();
        const label = passLabel(target.membershipStart, target.membershipExpiry);
        await addLogEntry({ timestamp: now, userId: target.uid, userName: targetDisplayName, accessType: label });
        await updateProfile(target.uid, { lastSignInAt: now }, user.email);
        if (isSelf) await reloadProfile();
        showToast(`✓ ${isSelf ? 'Signed in!' : `${targetDisplayName} signed in!`} Session logged.`);
        // If a supervisor signs in, mark the gym as open
        if (target.isSupervisor) { setGymOpen(targetDisplayName).catch(() => {}); }
      } catch (e: any) { Alert.alert('Error', e.message); }
      finally { setSigningIn(false); }
      return;
    }

    if (punchPassRemaining > 0) {
      const choice = await new Promise<'punch' | 'membership' | null>(resolve =>
        Alert.alert(
          'Sign In',
          `${isSelf ? 'You have' : `${targetDisplayName} has`} ${punchPassRemaining} punch${punchPassRemaining !== 1 ? 'es' : ''} remaining.`,
          [
            { text: 'Cancel',           style: 'cancel', onPress: () => resolve(null)       },
            { text: 'Use Punch Pass',                    onPress: () => resolve('punch')      },
            { text: 'Buy Access Pass',                   onPress: () => resolve('membership') },
          ],
        ),
      );
      if (!choice) return;

      if (choice === 'membership') {
        if (!isSelf) setAccessTarget(target);
        setShowAccess(true);
        return;
      }

      // Use punch pass
      setSigningIn(true);
      try {
        const now = new Date().toISOString();
        const remaining = punchPassRemaining - 1;
        await updateProfile(target.uid, { punchPassRemaining: remaining, lastSignInAt: now }, user.email);
        await addLogEntry({ timestamp: now, userId: target.uid, userName: targetDisplayName, accessType: `Punch Pass (${remaining} left)` });
        if (isSelf) await reloadProfile();
        showToast(`✓ ${isSelf ? 'Signed in!' : `${targetDisplayName} signed in!`} ${remaining} punch${remaining !== 1 ? 'es' : ''} remaining.`);
        // If a supervisor signs in, mark the gym as open
        if (target.isSupervisor) { setGymOpen(targetDisplayName).catch(() => {}); }
      } catch (e: any) { Alert.alert('Error', e.message); }
      finally { setSigningIn(false); }
      return;
    }

    // No access → show purchase options
    if (!isSelf) setAccessTarget(target);
    setShowAccess(true);
  }

  async function handleSignIn() {
    if (!profile || !user) return;

    // Privileged users choose between signing themselves in or another climber
    if (isPrivileged) {
      const choice = await new Promise<'self' | 'other' | null>(resolve =>
        Alert.alert(
          'Session Sign-In',
          'Who are you signing in?',
          [
            { text: 'Myself',           onPress: () => resolve('self')  },
            { text: 'Another Climber',  onPress: () => resolve('other') },
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          ],
        ),
      );
      if (!choice) return;
      if (choice === 'other') { setShowOtherSignIn(true); return; }
    }

    await processSignIn(profile, true);
  }

  function handleOtherPunchRequested() {
    setShowAccess(false);
    setShowPunchDonor(true);
  }

  async function handlePunchDonorSelected(donor: UserProfile) {
    if (!user) return;
    setShowPunchDonor(false);

    const target     = accessTarget ?? profile;
    const isOther    = !!accessTarget;
    if (!target) return;

    const targetName = target.preferredName || target.name;
    const donorName  = donor.preferredName  || donor.name;

    if ((donor.punchPassRemaining ?? 0) < 1) {
      Alert.alert('No punches left', `${donorName} has no punch passes remaining.`);
      return;
    }

    setSigningIn(true);
    setAccessTarget(null);
    try {
      const now          = new Date().toISOString();
      const donorLeft    = donor.punchPassRemaining - 1;

      await updateProfile(donor.uid, { punchPassRemaining: donorLeft }, user.email);
      await updateProfile(target.uid, { lastSignInAt: now }, user.email);
      await addLogEntry({
        timestamp:  now,
        userId:     target.uid,
        userName:   targetName,
        accessType: `Punch Pass (from ${donorName})`,
        notes:      `Punch donated by ${donorName} — ${donorLeft} punch${donorLeft !== 1 ? 'es' : ''} remaining on their account`,
      });

      if (!isOther) await reloadProfile();
      showToast(`✓ ${targetName} signed in using ${donorName}'s punch! ${donorLeft} left on their account.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSigningIn(false);
    }
  }

  function handleOtherClimberSelected(member: UserProfile) {
    setShowOtherSignIn(false);
    processSignIn(member, false);
  }

  async function handleAccessSelected(option: AccessOption) {
    if (!user) return;
    // accessTarget is set when supervisor buys access for someone else
    const target  = accessTarget ?? profile;
    const isOther = !!accessTarget;
    if (!target) return;

    setShowAccess(false);
    setAccessTarget(null);
    setSigningIn(true);

    const targetName = isOther
      ? (target.preferredName || target.name)
      : displayName;

    try {
      const now = new Date();
      const profileUpdates: any = {};
      let accessType = '';
      let notes = `Purchased: ${option.label} ${option.price}`;

      if (option.id === 'dropin') {
        accessType = 'Drop-In';
      } else if (option.punches) {
        const total     = option.punches;
        const remaining = total - 1;
        profileUpdates.punchPassRemaining = remaining;
        profileUpdates.pendingPunches     = total;   // admin confirmation required
        accessType = `Punch Pass (${remaining} left)`;
        notes += ` — ${total} punches added, 1 used`;
      } else if (option.months) {
        const expiry = new Date(now);
        expiry.setMonth(expiry.getMonth() + option.months);
        profileUpdates.membershipStatus   = 'pending';
        profileUpdates.membershipStart    = now.toISOString();
        profileUpdates.membershipExpiry   = expiry.toISOString();
        profileUpdates.pendingMembership  = JSON.stringify({
          label: option.label,
          price: option.price,
          start: now.toISOString(),
          expiry: expiry.toISOString(),
        });
        accessType = 'Active Member';
        notes += ` — expires ${expiry.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
      }

      profileUpdates.lastSignInAt = now.toISOString();
      await updateProfile(target.uid, profileUpdates, user.email);
      if (!isOther) await reloadProfile();

      await addLogEntry({
        timestamp: now.toISOString(),
        userId: target.uid,
        userName: targetName,
        accessType,
        notes,
      });

      showToast(`✓ ${isOther ? `${targetName} signed in!` : 'Signed in!'} Session logged.`);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSigningIn(false); }
  }

  return (
    <View style={styles.container}>
      <Toast message={toastMsg} visible={toastVisible} onHide={() => setToastVisible(false)} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Welcome */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>Welcome to the KBC App!</Text>
          <Text style={styles.welcomeSub}>Created by climbers, for climbers 🧗</Text>
        </View>

        {/* Gym status card */}
        <View style={styles.card}>
          {loading ? (
            <ActivityIndicator size="large" color={KBC.cyan} />
          ) : scheduleStatus.open ? (
            <>
              <View style={[styles.badge, { backgroundColor: KBC.green }]}>
                <Text style={styles.badgeText}>OPEN NOW</Text>
              </View>
              <Text style={styles.headline}>The gym is open!</Text>
              <Text style={styles.subtext}>
                {scheduleStatus.supervisorName ? `Supervisor: ${scheduleStatus.supervisorName}` : 'Come climb!'}
                {' · until '}{formatTime(scheduleStatus.until)}
              </Text>
            </>
          ) : scheduleStatus.next ? (
            <>
              <View style={[styles.badge, { backgroundColor: KBC.darkGrey }]}>
                <Text style={styles.badgeText}>CLOSED</Text>
              </View>
              <Text style={styles.headline}>Gym is closed right now.</Text>
              <Text style={styles.subtext}>
                Next session opens{' '}
                <Text style={styles.highlight}>{formatDateTime(scheduleStatus.next)}</Text>.
              </Text>
            </>
          ) : (
            <>
              <View style={[styles.badge, { backgroundColor: KBC.darkGrey }]}>
                <Text style={styles.badgeText}>CLOSED</Text>
              </View>
              <Text style={styles.headline}>Gym is closed.</Text>
              <Text style={styles.subtext}>
                No upcoming sessions scheduled. Check back soon!
              </Text>
            </>
          )}
        </View>

        {/* Special events today */}
        {todaySpecialEvents.length > 0 && (
          <View style={styles.specialEventsCard}>
            <Text style={styles.specialEventsHeading}>📅  Today's Events</Text>
            {todaySpecialEvents.map(e => (
              <View key={e.id} style={styles.specialEventRow}>
                <View style={styles.specialEventDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.specialEventName}>{e.summary}</Text>
                  <Text style={styles.specialEventTime}>
                    {formatTime(new Date(e.start.dateTime))}
                    {e.end?.dateTime ? ` – ${formatTime(new Date(e.end.dateTime))}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Sign-In button */}
        <TouchableOpacity
          style={[styles.signInBtn, signingIn && { opacity: 0.6 }]}
          onPress={handleSignIn}
          disabled={signingIn}
        >
          {signingIn
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.signInBtnText}>📋  Session Sign-In</Text>
          }
        </TouchableOpacity>

        {/* Sign-In Book */}
        <TouchableOpacity
          style={styles.signInBookBtn}
          onPress={() => router.push('/(tabs)/logbook')}
        >
          <Text style={styles.signInBookText}>📖  Sign-In Book</Text>
        </TouchableOpacity>

        {/* Add Member button — privileged only */}
        {isPrivileged && (
          <TouchableOpacity
            style={styles.addMemberBtn}
            onPress={() => setShowNewMember(true)}
          >
            <Text style={styles.addMemberBtnText}>Add New Member</Text>
          </TouchableOpacity>
        )}

        {/* Connect section */}
        <View style={styles.connectSection}>
          <Text style={styles.connectHeading}>Connect with KBC</Text>

          <View style={styles.socialRow}>
            <TouchableOpacity
              style={[styles.socialBtn, { backgroundColor: '#5865F2' }]}
              onPress={() => Linking.openURL('https://discord.gg/h8PaBftpBu')}
            >
              <FontAwesome5 name="discord" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.socialBtn, { backgroundColor: '#1877F2' }]}
              onPress={() => Linking.openURL('https://www.facebook.com/kingstonboulderingcoop')}
            >
              <FontAwesome5 name="facebook" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.socialBtn, { backgroundColor: '#E1306C' }]}
              onPress={() => Linking.openURL('https://www.instagram.com/kingstonboulderingcoop/')}
            >
              <FontAwesome5 name="instagram" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.socialBtn, styles.emailBtn]}
            onPress={() => Linking.openURL('mailto:climb.kbc@gmail.com')}
          >
            <FontAwesome5 name="envelope" size={14} color="#fff" />
            <Text style={styles.socialText}>climb.kbc@gmail.com</Text>
          </TouchableOpacity>
        </View>


      </ScrollView>

      {showAccess && (
        <AccessModal
          onComplete={handleAccessSelected}
          onOtherPunch={handleOtherPunchRequested}
          onClose={() => { setShowAccess(false); setAccessTarget(null); }}
          isPrivileged={isPrivileged}
        />
      )}

      {showPunchDonor && (
        <PunchDonorModal
          excludeUid={(accessTarget ?? profile)?.uid}
          onSelect={handlePunchDonorSelected}
          onClose={() => { setShowPunchDonor(false); setAccessTarget(null); }}
        />
      )}

      {showOtherSignIn && (
        <OtherClimberModal
          onSelect={handleOtherClimberSelected}
          onClose={() => setShowOtherSignIn(false)}
        />
      )}

      {showNewMember && (
        <NewMemberModal
          createdByEmail={user?.email ?? ''}
          onCreated={(member) => {
            setShowNewMember(false);
            router.push(
              `/waiver/liability?targetUid=${encodeURIComponent(member.uid)}&targetName=${encodeURIComponent(member.legalName || member.name)}` as any,
            );
          }}
          onClose={() => setShowNewMember(false)}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f2' },
  content: { padding: 24, gap: 16, paddingBottom: 40 },

  welcomeSection: { paddingTop: 8 },
  welcomeTitle: { fontSize: 26, fontWeight: '900', color: KBC.black },
  welcomeSub:   { fontSize: 14, color: '#888', marginTop: 4 },

  card: {
    backgroundColor: '#1c1c1e', borderRadius: 20, padding: 28,
    alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginBottom: 4 },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 1.5 },
  headline: { fontSize: 24, fontWeight: '800', color: KBC.white, textAlign: 'center' },
  subtext:  { fontSize: 15, color: '#aaa', textAlign: 'center', lineHeight: 22 },
  highlight: { color: KBC.cyan, fontWeight: '700' },
  specialEventsCard: {
    backgroundColor: '#1c1c1e', borderRadius: 16, padding: 18, gap: 10,
    borderLeftWidth: 4, borderLeftColor: KBC.cyan,
  },
  specialEventsHeading: { fontSize: 12, fontWeight: '800', color: KBC.cyan, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  specialEventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  specialEventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: KBC.cyan, marginTop: 5 },
  specialEventName: { fontSize: 15, fontWeight: '700', color: KBC.white },
  specialEventTime: { fontSize: 12, color: '#aaa', marginTop: 1 },

  signInBtn: {
    backgroundColor: KBC.purple, borderRadius: 14, padding: 18,
    alignItems: 'center',
    shadowColor: KBC.purple, shadowOpacity: 0.35, shadowRadius: 10, elevation: 4,
  },
  signInBtnText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },

  addMemberBtn: {
    backgroundColor: KBC.pink, borderRadius: 14, padding: 18,
    alignItems: 'center',
    shadowColor: KBC.pink, shadowOpacity: 0.35, shadowRadius: 10, elevation: 4,
  },
  addMemberBtnText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },

  connectSection: { marginTop: 24, gap: 10 },
  connectHeading: { fontSize: 12, fontWeight: '800', color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  socialRow: { flexDirection: 'row', gap: 10 },
  socialBtn: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emailBtn: { backgroundColor: KBC.darkGrey, width: undefined, height: undefined, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 8 },
  socialText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  signInBookBtn: {
    marginTop: 4, backgroundColor: KBC.purple, borderRadius: 14, padding: 18, alignItems: 'center',
  },
  signInBookText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },

  // Access modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:   { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  sheetTitle:  { fontSize: 17, fontWeight: '700', color: KBC.black },
  sheetCancel: { fontSize: 16, color: KBC.pink, fontWeight: '600' },
  sheetBody:   { padding: 16 },

  optionDivider: { height: 1, backgroundColor: '#eee', marginVertical: 4 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  optionLabel:  { fontSize: 15, fontWeight: '700', color: KBC.black },
  optionDetail: { fontSize: 12, color: '#888', marginTop: 2 },
  optionPrice:  { fontSize: 16, fontWeight: '800', color: KBC.pink },

  confirmCard: {
    backgroundColor: '#f8f8f8', borderRadius: 14, padding: 20,
    alignItems: 'center', gap: 6, marginBottom: 20,
  },
  confirmOption: { fontSize: 22, fontWeight: '800', color: KBC.black },
  confirmPrice:  { fontSize: 32, fontWeight: '900', color: KBC.pink },
  confirmDetail: { fontSize: 13, color: '#888' },
  paymentInstructions: {
    fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22,
    marginVertical: 20, paddingHorizontal: 4,
  },
  paymentEmail: { color: KBC.cyan, fontWeight: '700' },
  confirmBtn: {
    backgroundColor: KBC.green, borderRadius: 12, padding: 16, alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },

  // NewMemberModal
  sheetTall: { maxHeight: '92%' },
  newMemberSection: {
    fontSize: 12, fontWeight: '800', color: KBC.pink,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 16, marginBottom: 6,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingBottom: 6,
  },
  newMemberLabel: {
    fontSize: 11, fontWeight: '700', color: '#999',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 4,
  },
  newMemberInput: {
    backgroundColor: '#f8f8f8', borderRadius: 10, padding: 13,
    fontSize: 15, color: KBC.black, borderWidth: 1, borderColor: '#e8e8e8',
  },


  // OtherClimberModal
  memberSearch: {
    backgroundColor: '#f2f2f2', borderRadius: 10, padding: 12,
    fontSize: 15, color: KBC.black, borderWidth: 1, borderColor: '#e8e8e8',
  },
  memberPickRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5', gap: 12,
  },
  memberPickName:  { fontSize: 15, fontWeight: '700', color: KBC.black },
  memberPickEmail: { fontSize: 12, color: '#999', marginTop: 1 },
  memberPickBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  memberPickBadgeText: { fontSize: 12, fontWeight: '700' },
  emptyText: { textAlign: 'center', color: '#aaa', fontSize: 14, paddingTop: 40, paddingBottom: 20 },
});
