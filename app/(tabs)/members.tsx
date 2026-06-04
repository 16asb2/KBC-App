import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DatePickerModal } from '@/components/time-picker-modal';
import { ProfileEditModal } from '@/components/profile-edit-modal';
import { KBC } from '@/constants/theme';
import { isAdmin } from '@/constants/admins';
import { WAIVER_META } from '@/constants/waivers';
import { useAuth } from '@/context/auth';
import { useProfile } from '@/context/profile';
import { MembershipStatus, UserProfile, WaiverRecord, checkAndUpdateMembershipStatus, getAllProfiles, updateProfile } from '@/services/firestore';
import { LogEntry, getUserLogs } from '@/services/logbook';

// ─── Types & constants ───────────────────────────────────────────────────────

const PASS_OPTIONS = [
  { id: 'annual', label: 'Annual pass',  months: 12 },
  { id: '8month', label: '8-month pass', months: 8  },
  { id: '4month', label: '4-month pass', months: 4  },
  { id: '1month', label: '1-month pass', months: 1  },
] as const;
type PassId = typeof PASS_OPTIONS[number]['id'] | 'inactive';

const STATUS_LABELS: Record<MembershipStatus, string> = {
  active: 'Active', pending: 'Pending', inactive: 'Inactive',
};
const STATUS_COLORS: Record<MembershipStatus, string> = {
  active: KBC.green, pending: KBC.orange, inactive: '#aaa',
};

/** Derives the closest PassId from a start/expiry date pair. */
function getPassId(start: string | null, expiry: string | null): PassId {
  if (!start || !expiry) return 'inactive';
  const months = Math.round(
    (new Date(expiry).getTime() - new Date(start).getTime()) / (30.44 * 24 * 60 * 60 * 1000),
  );
  if (months >= 11) return 'annual';
  if (months >= 7)  return '8month';
  if (months >= 3)  return '4month';
  if (months >= 1)  return '1month';
  return 'inactive';
}

function accessBadgeColor(accessType: string): string {
  const t = accessType.toLowerCase();
  if (t.includes('active'))  return KBC.green;
  if (t.includes('punch'))   return KBC.cyan;
  if (t.includes('drop'))    return KBC.orange;
  if (t.includes('annual') || t.includes('month')) return KBC.purple;
  return '#888';
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Derives the human-readable pass label from start/expiry dates (e.g. "Annual pass"). */
function getPassLabel(start: string | null, expiry: string | null): string {
  const id = getPassId(start, expiry);
  return PASS_OPTIONS.find(p => p.id === id)?.label ?? 'Access pass';
}

// ─── Small components ────────────────────────────────────────────────────────

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusBadge({ status }: { status: MembershipStatus }) {
  return (
    <View style={[styles.badge, { backgroundColor: STATUS_COLORS[status] }]}>
      <Text style={styles.badgeText}>{STATUS_LABELS[status].toUpperCase()}</Text>
    </View>
  );
}

/** A simple collapsible card section. */
function CollapsibleSection({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string | number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.collapsible}>
      <TouchableOpacity style={styles.collapsibleHeader} onPress={() => setOpen(v => !v)} activeOpacity={0.7}>
        <Text style={styles.collapsibleTitle}>{title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {badge !== undefined && (
            <View style={styles.collapsibleBadge}>
              <Text style={styles.collapsibleBadgeText}>{badge}</Text>
            </View>
          )}
          <Text style={styles.collapsibleChevron}>{open ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>
      {open && <View style={styles.collapsibleBody}>{children}</View>}
    </View>
  );
}

// ─── Edit Modal ──────────────────────────────────────────────────────────────

type EditModalProps = {
  member: UserProfile;
  canEditMembership: boolean;   // admin or supervisor — controls edit panel visibility
  canDirectActivate: boolean;   // admin only — saves directly as active (supervisor → pending)
  canEditSupervisor: boolean;   // admin only — supervisor checkbox in edit panel
  onSave: (updates: Partial<UserProfile>) => Promise<void>;
  onEditFullProfile: () => void;
  onClose: () => void;
};

function EditModal({
  member,
  canEditMembership,
  canDirectActivate,
  canEditSupervisor,
  onSave,
  onEditFullProfile,
  onClose,
}: EditModalProps) {
  const insets = useSafeAreaInsets();

  // ── Edit panel state ──
  const [showMembershipEdit, setShowMembershipEdit] = useState(false);
  const [selectedPass, setSelectedPass] = useState<PassId>(() => {
    if (member.membershipStatus === 'inactive')
      return 'inactive';
    return getPassId(member.membershipStart, member.membershipExpiry);
  });
  const [isSupervisor, setIsSupervisor] = useState(member.isSupervisor);
  const [punches, setPunches]           = useState(member.punchPassRemaining);
  const [startDate, setStartDate]       = useState(
    member.membershipStart ? new Date(member.membershipStart) : new Date(),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving]             = useState(false);

  // ── History ──
  const [history, setHistory]           = useState<LogEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    getUserLogs(member.uid)
      .then(setHistory)
      .catch(e => console.warn('Failed to load history:', e))
      .finally(() => setHistoryLoading(false));
  }, [member.uid]);

  // ── Computed display values ──
  const pendingMembership: { label: string; price: string; start: string; expiry: string } | null = (() => {
    try { return member.pendingMembership ? JSON.parse(member.pendingMembership) : null; }
    catch { return null; }
  })();
  const pendingPunches = member.pendingPunches ?? 0;

  const displayName  = member.preferredName || member.name;
  const passOption   = PASS_OPTIONS.find(p => p.id === selectedPass) ?? null;
  const endDate      = passOption ? addMonths(startDate, passOption.months) : null;

  async function handleSaveMembership() {
    setSaving(true);
    try {
      const updates: Partial<UserProfile> = {};
      if (canEditMembership) {
        if (selectedPass === 'inactive') {
          updates.membershipStatus  = 'inactive';
          updates.membershipStart   = null;
          updates.membershipExpiry  = null;
          updates.pendingMembership = null;
        } else {
          const pass   = PASS_OPTIONS.find(p => p.id === selectedPass)!;
          const expiry = addMonths(startDate, pass.months);
          if (canDirectActivate) {
            updates.membershipStatus  = 'active';
            updates.membershipStart   = startDate.toISOString();
            updates.membershipExpiry  = expiry.toISOString();
            updates.pendingMembership = null;
          } else {
            // Supervisor → pending, admin must confirm
            updates.membershipStatus  = 'pending';
            updates.membershipStart   = startDate.toISOString();
            updates.membershipExpiry  = expiry.toISOString();
            updates.pendingMembership = JSON.stringify({
              label: pass.label,
              price: '',
              start: startDate.toISOString(),
              expiry: expiry.toISOString(),
            });
          }
        }
        updates.punchPassRemaining = punches;
      }
      if (canEditSupervisor) updates.isSupervisor = isSupervisor;
      await onSave(updates);
      setShowMembershipEdit(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── History split ──
  const purchases = history.filter(h => h.notes?.includes('Purchased:'));
  const signIns   = history.filter(h => !h.notes?.includes('Purchased:'));
  const fmtDate   = (iso: string) =>
    new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>

        {/* ── Header ── */}
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <Text style={styles.sheetTitle}>{displayName}</Text>
              {member.isSupervisor && (
                <View style={[styles.badge, { backgroundColor: KBC.pink }]}>
                  <Text style={styles.badgeText}>SUPER</Text>
                </View>
              )}
            </View>
            {member.legalName && member.legalName !== member.name && (
              <Text style={styles.sheetSubtitle}>Legal: {member.legalName}</Text>
            )}
            {canEditMembership && (
              <TouchableOpacity onPress={onEditFullProfile} style={{ marginTop: 5 }}>
                <Text style={styles.personalInfoBtn}>Personal Information ›</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>

          {/* ── Access Pass Status line ── */}
          <View style={styles.membershipDisplayRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.membershipDisplayLabel}>Access Pass Status</Text>
              {(() => {
                // Pending (self-purchased or supervisor-assigned)
                if (pendingMembership) {
                  return (
                    <>
                      <Text style={[styles.membershipStatusText, { color: KBC.orange }]}>
                        {pendingMembership.label} (pending)
                      </Text>
                      {pendingMembership.start && pendingMembership.expiry && (
                        <Text style={styles.membershipDisplayValue}>
                          {formatDate(pendingMembership.start)} → {formatDate(pendingMembership.expiry)}
                        </Text>
                      )}
                    </>
                  );
                }
                if (member.membershipStatus === 'active' && member.membershipStart) {
                  return (
                    <>
                      <Text style={[styles.membershipStatusText, { color: KBC.green }]}>
                        {getPassLabel(member.membershipStart, member.membershipExpiry)}
                      </Text>
                      <Text style={styles.membershipDisplayValue}>
                        {formatDate(member.membershipStart)} → {formatDate(member.membershipExpiry)}
                      </Text>
                    </>
                  );
                }
                return (
                  <Text style={[styles.membershipStatusText, { color: STATUS_COLORS[member.membershipStatus] }]}>
                    Inactive
                  </Text>
                );
              })()}
            </View>
            {canEditMembership && (
              <TouchableOpacity
                style={[styles.editMembershipBtn, showMembershipEdit && styles.editMembershipBtnActive]}
                onPress={() => setShowMembershipEdit(v => !v)}
              >
                <Text style={[styles.editMembershipBtnText, showMembershipEdit && { color: '#fff' }]}>
                  {showMembershipEdit ? '✕  Close' : '✏️  Edit'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Pending membership confirmation ── */}
          {pendingMembership && (
            <View style={styles.pendingRow}>
              <Text style={styles.pendingIcon}>🟡</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingLabel}>{pendingMembership.label} (pending)</Text>
                {pendingMembership.start && pendingMembership.expiry && (
                  <Text style={styles.pendingDetail}>
                    {formatDate(pendingMembership.start)} → {formatDate(pendingMembership.expiry)}
                  </Text>
                )}
              </View>
              {canEditMembership && canDirectActivate && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={styles.pendingCancelBtn}
                    onPress={() => onSave({ membershipStatus: 'inactive', pendingMembership: null, membershipStart: null, membershipExpiry: null })}
                  >
                    <Text style={styles.pendingCancelBtnText}>✕</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.pendingConfirmBtn}
                    onPress={() => onSave({ membershipStatus: 'active', pendingMembership: null })}
                  >
                    <Text style={styles.pendingConfirmBtnText}>Confirm ✓</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── Punch passes (read-only display) ── */}
          {member.punchPassRemaining > 0 && (
            <View style={styles.punchDisplayRow}>
              <Text style={styles.punchDisplayText}>
                🎟  {member.punchPassRemaining} punch{member.punchPassRemaining !== 1 ? 'es' : ''} remaining
              </Text>
            </View>
          )}

          {/* ── Pending punch confirmation ── */}
          {pendingPunches > 0 && (
            <View style={styles.pendingRow}>
              <Text style={styles.pendingIcon}>🟡</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingLabel}>Punch passes pending confirmation</Text>
                <Text style={styles.pendingDetail}>{pendingPunches} punches purchased</Text>
              </View>
              {canEditMembership && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={styles.pendingCancelBtn}
                    onPress={() => onSave({
                      pendingPunches: null,
                      punchPassRemaining: Math.max(0, member.punchPassRemaining - (pendingPunches - 1)),
                    })}
                  >
                    <Text style={styles.pendingCancelBtnText}>✕</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.pendingConfirmBtn}
                    onPress={() => onSave({ pendingPunches: null })}
                  >
                    <Text style={styles.pendingConfirmBtnText}>Confirm ✓</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── Inline membership edit panel (admin only) ── */}
          {showMembershipEdit && canEditMembership && (
            <View style={styles.editPanel}>

              {/* Pass type selection */}
              <Text style={styles.fieldLabel}>Access Pass Status</Text>
              <View style={styles.passRow}>
                {PASS_OPTIONS.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.passBtn, selectedPass === p.id && styles.passBtnActive]}
                    onPress={() => setSelectedPass(p.id)}
                  >
                    <Text style={[styles.passBtnText, selectedPass === p.id && styles.passBtnTextActive]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.passBtn, selectedPass === 'inactive' && styles.passBtnInactive]}
                  onPress={() => setSelectedPass('inactive')}
                >
                  <Text style={[styles.passBtnText, selectedPass === 'inactive' && styles.passBtnTextInactive]}>
                    Inactive
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Date fields — only when a pass (not Inactive) is selected */}
              {selectedPass !== 'inactive' && (
                <>
                  <Text style={styles.fieldLabel}>Start Date</Text>
                  <TouchableOpacity style={styles.dateField} onPress={() => setShowDatePicker(true)}>
                    <Text style={styles.dateFieldText}>{formatDate(startDate.toISOString())}</Text>
                    <Text style={styles.dateFieldEdit}>Change</Text>
                  </TouchableOpacity>

                  <Text style={styles.fieldLabel}>End Date</Text>
                  <View style={[styles.dateField, { backgroundColor: '#f0f0f0' }]}>
                    <Text style={styles.dateFieldText}>{endDate ? formatDate(endDate.toISOString()) : '—'}</Text>
                  </View>
                </>
              )}

              {/* Punch pass stepper */}
              <Text style={styles.fieldLabel}>Punch Passes Remaining</Text>
              <View style={styles.counterRow}>
                <TouchableOpacity style={styles.counterBtn} onPress={() => setPunches(p => Math.max(0, p - 1))}>
                  <Text style={styles.counterBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.counterValue}>{punches}</Text>
                <TouchableOpacity style={styles.counterBtn} onPress={() => setPunches(p => p + 1)}>
                  <Text style={styles.counterBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Supervisor checkbox (admin only) */}
              {canEditSupervisor && (
                <TouchableOpacity style={[styles.toggleRow, { marginTop: 12 }]} onPress={() => setIsSupervisor(v => !v)}>
                  <View style={[styles.checkbox, isSupervisor && styles.checkboxChecked]}>
                    {isSupervisor && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.toggleLabel}>Supervisor</Text>
                </TouchableOpacity>
              )}

              {/* Panel save / cancel */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={styles.panelCancelBtn}
                  onPress={() => setShowMembershipEdit(false)}
                >
                  <Text style={styles.panelCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { flex: 1 }, saving && { opacity: 0.6 }]}
                  onPress={handleSaveMembership}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.saveBtnText}>Save Changes</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Documents (collapsible, everyone) ── */}
          <CollapsibleSection title="Documents">
            {(['liability'] as const).map(wType => {
              const meta = WAIVER_META[wType];
              const raw  = member[meta.profileKey];
              const record: WaiverRecord | null = (() => {
                try { return raw ? JSON.parse(raw) : null; } catch { return null; }
              })();

              // Tapping the row: open signed doc if available, else navigate to waiver screen
              function handleWaiverPress() {
                if (record?.docUrl) {
                  Linking.openURL(record.docUrl!);
                } else {
                  router.push(
                    `/waiver/${wType}?targetUid=${encodeURIComponent(member.uid)}&targetName=${encodeURIComponent(displayName)}` as any,
                  );
                }
              }

              return (
                <TouchableOpacity key={wType} style={styles.waiverRow} onPress={handleWaiverPress} activeOpacity={0.7}>
                  <Text style={styles.waiverIcon}>{record ? '✅' : '❌'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.waiverTitle}>{meta.title}</Text>
                    {record ? (
                      <Text style={styles.waiverDate}>
                        {record.guardian ? `${record.guardian} (guardian) — ` : ''}
                        {new Date(record.signedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        {record.docUrl ? '  📄' : ''}
                      </Text>
                    ) : (
                      <Text style={styles.waiverUnsigned}>Tap to sign →</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </CollapsibleSection>

          {/* ── History navigation buttons ── */}
          <View style={styles.historyBtnRow}>
            <TouchableOpacity
              style={styles.historyNavBtn}
              onPress={() => router.push({
                pathname: '/member-history/[uid]',
                params: {
                  uid: member.uid,
                  type: 'access',
                  memberName: encodeURIComponent(displayName),
                },
              } as any)}
            >
              <View style={styles.historyNavBtnInner}>
                <Text style={styles.historyNavBtnTitle}>Access Pass History</Text>
                {historyLoading
                  ? <ActivityIndicator color={KBC.cyan} size="small" />
                  : <Text style={styles.historyNavBtnCount}>{purchases.length}</Text>
                }
              </View>
              <Text style={styles.historyNavBtnChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.historyNavBtn}
              onPress={() => router.push({
                pathname: '/member-history/[uid]',
                params: {
                  uid: member.uid,
                  type: 'signins',
                  memberName: encodeURIComponent(displayName),
                },
              } as any)}
            >
              <View style={styles.historyNavBtnInner}>
                <Text style={styles.historyNavBtnTitle}>Sign-In History</Text>
                {historyLoading
                  ? <ActivityIndicator color={KBC.cyan} size="small" />
                  : <Text style={styles.historyNavBtnCount}>{signIns.length}</Text>
                }
              </View>
              <Text style={styles.historyNavBtnChevron}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>
      </View>

      <DatePickerModal
        visible={showDatePicker}
        value={startDate}
        onChange={setStartDate}
        onClose={() => setShowDatePicker(false)}
      />
    </Modal>
  );
}

// ─── Member Row ──────────────────────────────────────────────────────────────

function MemberRow({ member, onPress }: { member: UserProfile; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.memberRow} onPress={onPress}>
      <Avatar name={member.name} size={42} />
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>
          {member.preferredName || member.name}
          {member.isSupervisor ? '  ' : ''}
          {member.isSupervisor && (
            <Text style={styles.memberSuperTag}>(Super)</Text>
          )}
        </Text>
        {(member.membershipStatus === 'active' || member.membershipStatus === 'pending') && member.membershipExpiry
          ? <Text style={styles.memberSub}>Until {formatDate(member.membershipExpiry)}</Text>
          : <Text style={styles.memberSub}>{member.email}</Text>
        }
      </View>
      <StatusBadge status={member.membershipStatus} />
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function MembersScreen() {
  const { user } = useAuth();
  const { profile, reloadProfile } = useProfile();
  const { openUid } = useLocalSearchParams<{ openUid?: string }>();
  const [allMembers, setAllMembers]         = useState<UserProfile[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [search, setSearch]                 = useState('');
  const [editing, setEditing]               = useState<UserProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingMemberProfile, setEditingMemberProfile] = useState<UserProfile | null>(null);

  const viewerIsAdmin      = isAdmin(user?.email, profile?.isAdmin);
  const viewerIsSupervisor = profile?.isSupervisor ?? false;
  const canSeeAllMembers   = viewerIsAdmin || viewerIsSupervisor;

  // When admin navigates to Personal Info, we remember which member was open
  // so we can restore the EditModal when they come back.
  const prevEditingUidRef = useRef<string | null>(null);

  useFocusEffect(useCallback(() => { if (canSeeAllMembers) loadMembers(); }, [canSeeAllMembers]));

  // Auto-open a member's modal when navigated here from the LogBook
  const handledOpenUidRef = useRef('');
  useEffect(() => {
    if (!openUid || openUid === handledOpenUidRef.current || allMembers.length === 0) return;
    const member = allMembers.find(m => m.uid === openUid);
    if (member) {
      handledOpenUidRef.current = openUid;
      setEditing(member);
      router.setParams({ openUid: '' });
    }
  }, [openUid, allMembers]);

  /** Loads all profiles, updates state, and returns the fresh list. */
  async function loadMembers(): Promise<UserProfile[]> {
    setLoadingMembers(true);
    try {
      const members = await getAllProfiles();
      setAllMembers(members);
      return members;
    } catch (e) {
      console.warn('Failed to load members:', e);
      return [];
    } finally {
      setLoadingMembers(false);
    }
  }

  async function handleSave(member: UserProfile, updates: Partial<UserProfile>) {
    await updateProfile(member.uid, updates, user?.email ?? '');
    // After any membership change, check and auto-transition status if needed
    const freshDoc = { ...member, ...updates } as UserProfile;
    await checkAndUpdateMembershipStatus(freshDoc, user?.email ?? 'admin');
    const fresh = await loadMembers();
    if (member.uid === profile?.uid) await reloadProfile();
    // Re-point editing to fresh data so the modal reflects the saved values
    const freshMember = fresh.find(m => m.uid === member.uid);
    if (freshMember) setEditing(freshMember);
  }

  const filtered = allMembers.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Own profile card ── */}
      {profile && (
        <View style={styles.profileCard}>
          <View style={styles.profileCardTop}>
            <Avatar name={profile.preferredName || profile.name} size={64} />
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {profile.preferredName || profile.name}
                {profile.isSupervisor ? '  ' : ''}
              </Text>
              {profile.isSupervisor && (
                <Text style={{ fontSize: 12, color: KBC.pink, fontWeight: '700', marginTop: -4 }}>(Supervisor)</Text>
              )}
              {profile.preferredName ? (
                <Text style={styles.profileSubName}>{profile.name}</Text>
              ) : null}
              <Text style={styles.profileEmail}>{profile.preferredEmail || profile.email}</Text>
              {profile.phone ? <Text style={styles.profilePhone}>📞 {profile.phone}</Text> : null}
              <View style={styles.profileBadges}>
                <StatusBadge status={profile.membershipStatus} />
                {viewerIsAdmin && (
                  <View style={[styles.badge, { backgroundColor: KBC.purple }]}>
                    <Text style={styles.badgeText}>ADMIN</Text>
                  </View>
                )}
                {profile.isSupervisor && !viewerIsAdmin && (
                  <View style={[styles.badge, { backgroundColor: KBC.pink }]}>
                    <Text style={styles.badgeText}>SUPER</Text>
                  </View>
                )}
              </View>
              {(profile.membershipStatus === 'active' || profile.membershipStatus === 'pending') && profile.membershipStart && (
                <Text style={styles.membershipDates}>
                  {getPassLabel(profile.membershipStart, profile.membershipExpiry)}
                  {'  '}{formatDate(profile.membershipStart)} → {formatDate(profile.membershipExpiry)}
                </Text>
              )}
              {profile.punchPassRemaining > 0 && (
                <Text style={styles.punchText}>
                  🎟  {profile.punchPassRemaining} punch{profile.punchPassRemaining !== 1 ? 'es' : ''} remaining
                </Text>
              )}
              <Text style={styles.memberSince}>Member since {formatDate(profile.memberSince)}</Text>
            </View>
          </View>

          {profile.emergencyContact && (() => {
            try {
              const ec = JSON.parse(profile.emergencyContact);
              if (!ec.name) return null;
              return (
                <View style={styles.ecRow}>
                  <Text style={styles.ecLabel}>Emergency:</Text>
                  <Text style={styles.ecValue}>{ec.name} ({ec.relationship}) · {ec.phone}</Text>
                </View>
              );
            } catch { return null; }
          })()}

          <TouchableOpacity style={styles.editProfileBtn} onPress={() => setEditingProfile(true)}>
            <Text style={styles.editProfileBtnText}>✏️  Edit My Profile</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Members list ── */}
      {canSeeAllMembers && (
        <>
          <Text style={styles.sectionLabel}>All Members</Text>
          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or email…"
            placeholderTextColor="#aaa"
          />
          {loadingMembers ? (
            <ActivityIndicator color={KBC.pink} style={{ marginTop: 24 }} />
          ) : (
            <View style={styles.memberList}>
              {filtered.map(m => (
                <MemberRow key={m.uid} member={m} onPress={() => setEditing(m)} />
              ))}
              {filtered.length === 0 && (
                <Text style={styles.emptyText}>No members found.</Text>
              )}
            </View>
          )}
        </>
      )}

      {!canSeeAllMembers && (
        <Text style={styles.infoText}>
          Only supervisors and admins can view the full member list.
        </Text>
      )}

      {/* ── Edit modal ── */}
      {editing && (
        <EditModal
          member={editing}
          canEditMembership={viewerIsAdmin || viewerIsSupervisor}
          canDirectActivate={viewerIsAdmin}
          canEditSupervisor={viewerIsAdmin}
          onSave={(updates) => handleSave(editing, updates)}
          onEditFullProfile={() => {
            prevEditingUidRef.current = editing.uid;
            setEditingMemberProfile(editing);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {/* ── Edit own profile modal ── */}
      {editingProfile && profile && (
        <ProfileEditModal
          profile={profile}
          onSave={async (updates) => {
            await updateProfile(profile.uid, updates, user?.email ?? '');
            await reloadProfile();
          }}
          onClose={() => setEditingProfile(false)}
        />
      )}

      {/* ── Admin editing another member's full profile ── */}
      {editingMemberProfile && (
        <ProfileEditModal
          profile={editingMemberProfile}
          canEditLegalName={viewerIsAdmin}
          onSave={async (updates) => {
            await updateProfile(editingMemberProfile.uid, updates, user?.email ?? '');
            await loadMembers();
            if (editingMemberProfile.uid === profile?.uid) await reloadProfile();
          }}
          onClose={() => {
            // Restore the EditModal for the member we came from
            const uid = prevEditingUidRef.current;
            prevEditingUidRef.current = null;
            setEditingMemberProfile(null);
            if (uid) {
              const member = allMembers.find(m => m.uid === uid);
              if (member) setEditing(member);
            }
          }}
        />
      )}
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f2' },
  content: { padding: 16, paddingBottom: 40, gap: 8 },

  // ── Own profile card ──
  profileCard: {
    backgroundColor: KBC.black, borderRadius: 16, padding: 20,
    gap: 14, borderLeftWidth: 4, borderLeftColor: KBC.cyan,
  },
  profileCardTop: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  profileInfo: { flex: 1, gap: 5 },
  profileName: { fontSize: 20, fontWeight: '800', color: KBC.white },
  profileSubName: { fontSize: 12, color: '#666', marginTop: -3 },
  profileEmail: { fontSize: 13, color: '#888' },
  profilePhone: { fontSize: 13, color: '#888' },
  profileBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  membershipDates: { fontSize: 13, color: KBC.green, fontWeight: '600' },
  punchText: { fontSize: 13, color: KBC.cyan, fontWeight: '600' },
  memberSince: { fontSize: 12, color: '#555' },
  ecRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  ecLabel: { fontSize: 12, color: KBC.pink, fontWeight: '700' },
  ecValue: { fontSize: 12, color: '#888', flex: 1 },
  editProfileBtn: {
    borderWidth: 1, borderColor: KBC.cyan, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  editProfileBtnText: { color: KBC.cyan, fontSize: 14, fontWeight: '700' },
  // ── Shared ──
  avatar: { backgroundColor: KBC.pink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.8 },

  // ── Members list ──
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16 },
  search: { backgroundColor: '#fff', borderRadius: 10, padding: 12, fontSize: 15, color: KBC.black, elevation: 1 },
  memberList: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', elevation: 1 },
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '700', color: KBC.black },
  memberSuperTag: { fontSize: 12, color: KBC.pink, fontWeight: '700' },
  memberSub: { fontSize: 12, color: '#888', marginTop: 1 },
  emptyText: { textAlign: 'center', color: '#aaa', padding: 24 },
  infoText: { textAlign: 'center', color: '#999', fontSize: 13, marginTop: 32, paddingHorizontal: 24 },

  // ── Modal shell ──
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  sheetTitle:    { fontSize: 17, fontWeight: '700', color: KBC.black },
  sheetSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },
  sheetDone:     { fontSize: 16, color: KBC.pink, fontWeight: '600' },
  closeBtn:      { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  closeBtnText:  { fontSize: 14, color: '#666', fontWeight: '700', lineHeight: 17 },
  sheetBody:     { padding: 16 },
  personalInfoBtn: { fontSize: 12, color: KBC.purple, fontWeight: '700' },

  // ── Status & membership display ──
  statusRow: { marginBottom: 12 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusDot:  { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontSize: 13, fontWeight: '800' },

  membershipDisplayRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8f8f8', borderRadius: 12, padding: 14, marginBottom: 8,
  },
  membershipDisplayLabel:  { fontSize: 10, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  membershipStatusText:    { fontSize: 15, fontWeight: '800', marginBottom: 1 },
  membershipDisplayValue:  { fontSize: 13, fontWeight: '600', color: '#555' },
  membershipNone:          { fontSize: 14, color: '#bbb', fontStyle: 'italic' },

  editMembershipBtn: {
    backgroundColor: '#f0f0f0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7, marginLeft: 8,
  },
  editMembershipBtnActive: { backgroundColor: KBC.pink },
  editMembershipBtnText:   { fontSize: 12, fontWeight: '700', color: '#555' },

  punchDisplayRow: {
    backgroundColor: KBC.cyan + '18', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
  },
  punchDisplayText: { fontSize: 14, color: KBC.cyan, fontWeight: '700' },

  // ── Inline edit panel ──
  editPanel: {
    backgroundColor: '#f4f4f8', borderRadius: 14, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: '#e4e4ee',
  },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 8 },

  passRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  passBtn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#eee', borderWidth: 2, borderColor: 'transparent' },
  passBtnActive: { backgroundColor: '#e8f5e9', borderColor: KBC.green },
  passBtnInactive: { backgroundColor: '#f0f0f0', borderColor: '#aaa' },
  passBtnText: { fontSize: 13, fontWeight: '700', color: '#666' },
  passBtnTextActive: { color: KBC.green },
  passBtnTextInactive: { color: '#888' },

  dateField: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#e8e8e8' },
  dateFieldText: { fontSize: 15, color: KBC.black, fontWeight: '600' },
  dateFieldEdit: { fontSize: 13, color: KBC.pink, fontWeight: '600' },

  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 20, justifyContent: 'center', paddingVertical: 4 },
  counterBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center' },
  counterBtnText: { fontSize: 22, color: KBC.black, lineHeight: 26 },
  counterValue: { fontSize: 28, fontWeight: '800', color: KBC.black, minWidth: 44, textAlign: 'center' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: KBC.pink, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: KBC.pink },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  toggleLabel: { fontSize: 15, color: KBC.black, flex: 1 },

  panelCancelBtn: { backgroundColor: '#e8e8e8', borderRadius: 10, padding: 14, alignItems: 'center', minWidth: 80 },
  panelCancelBtnText: { color: '#555', fontSize: 15, fontWeight: '600' },
  saveBtn: { backgroundColor: KBC.pink, borderRadius: 12, padding: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ── Collapsible sections ──
  collapsible: {
    backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden',
    marginBottom: 8, borderWidth: 1, borderColor: '#f0f0f0',
  },
  collapsibleHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13,
  },
  collapsibleTitle:     { fontSize: 14, fontWeight: '700', color: KBC.black },
  collapsibleChevron:   { fontSize: 10, color: '#aaa', fontWeight: '700' },
  collapsibleBadge:     { backgroundColor: '#f0f0f0', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  collapsibleBadgeText: { fontSize: 11, fontWeight: '700', color: '#888' },
  collapsibleBody:      { paddingHorizontal: 14, paddingBottom: 12, borderTopWidth: 1, borderTopColor: '#f5f5f5' },

  // ── Waiver rows (inside collapsible) ──
  waiverRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f8f8f8' },
  waiverIcon:     { fontSize: 18 },
  waiverTitle:    { fontSize: 14, fontWeight: '700', color: KBC.black },
  waiverDate:     { fontSize: 12, color: '#888', marginTop: 2 },
  waiverUnsigned: { fontSize: 12, color: KBC.pink, marginTop: 2 },
  pdfBtn:    { backgroundColor: '#f0f0f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  pdfBtnText: { fontSize: 12, fontWeight: '700', color: '#555' },

  // ── Pending confirmation cards ──
  pendingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff8e1', borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#f0c040',
  },
  pendingIcon:  { fontSize: 18 },
  pendingLabel: { fontSize: 13, fontWeight: '700', color: '#7a5c00' },
  pendingDetail: { fontSize: 12, color: '#a07800', marginTop: 2 },
  pendingCancelBtn: {
    backgroundColor: '#e0e0e0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  pendingCancelBtnText: { color: '#555', fontSize: 12, fontWeight: '800' },
  pendingConfirmBtn: {
    backgroundColor: KBC.green, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  pendingConfirmBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // ── History navigation buttons ──
  historyBtnRow: { gap: 8, marginBottom: 8 },
  historyNavBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: '#f0f0f0',
  },
  historyNavBtnInner:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: 8 },
  historyNavBtnTitle:  { fontSize: 14, fontWeight: '700', color: KBC.black },
  historyNavBtnCount:  { fontSize: 13, fontWeight: '700', color: KBC.cyan, backgroundColor: KBC.cyan + '18', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
  historyNavBtnChevron: { fontSize: 20, color: '#ccc', fontWeight: '300' },

});
