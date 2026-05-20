import { Image } from 'expo-image';
// expo-image-picker requires a native dev build; gracefully degrade in Expo Go
let ImagePicker: typeof import('expo-image-picker') | null = null;
try { ImagePicker = require('expo-image-picker'); } catch {}
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BadgeIcon } from '@/components/badge-icon';
import { DropdownPicker, DropdownOption } from '@/components/dropdown-picker';
import { EffortBar, effortToNumber, effortLabel } from '@/components/effort-bar';
import { DatePickerModal } from '@/components/time-picker-modal';
import { KBC } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useProfile } from '@/context/profile';
import { BADGE_GROUPS } from '@/services/boulders';
import {
  ClimbDiscipline, ClimbLocation, GradeSystem, PersonalClimb, Sector,
  addClimb, createLocation, deleteClimb, deleteLocation,
  getMyLocations, getMyLogs,
  gradeSystemsForDiscipline, updateClimb,
} from '@/services/climblog';

// ─── Constants ────────────────────────────────────────────────────────────────

const DISCIPLINE_LABELS: Record<ClimbDiscipline, string> = {
  'boulder': 'Boulder', 'top-rope': 'Top-Rope', 'lead': 'Lead', 'trad': 'Trad',
};
const GRADE_SYSTEM_LABELS: Record<GradeSystem, string> = {
  'kbc': 'KBC', 'v-scale': 'V-Scale', 'font': 'Font', 'yosemite': 'Yosemite',
};
const STAR_COLORS = ['#fbbf24', '#fbbf24', '#fbbf24'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday)     return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} ${time}`;
}

function dateSectionLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString())       return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

type ListItem =
  | { type: 'header'; key: string; label: string }
  | { type: 'climb';  key: string; climb: PersonalClimb };

// ─── StarRow (simple, non-vote, display only) ─────────────────────────────────

function StarRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3].map(i => (
        <TouchableOpacity key={i} onPress={() => onChange(value === i ? 0 : i)}>
          <Text style={{ fontSize: 26, color: i <= value ? '#fbbf24' : '#ddd' }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}


// ─── BadgeSection ─────────────────────────────────────────────────────────────

function BadgeSection({ selected, onToggle }: {
  selected: string[]; onToggle: (badge: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = selected.length;
  return (
    <View>
      <TouchableOpacity style={styles.collapseHeader} onPress={() => setOpen(o => !o)}>
        <Text style={styles.fieldLabel}>Badges {count > 0 ? `(${count} selected)` : ''}</Text>
        <Text style={{ color: KBC.pink, fontSize: 13 }}>{open ? '▲ Collapse' : '▼ Expand'}</Text>
      </TouchableOpacity>
      {open && BADGE_GROUPS.map(group => (
        <View key={group.title} style={{ marginBottom: 10 }}>
          <Text style={styles.badgeGroupTitle}>{group.title}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {group.badges.map(badge => (
              <BadgeIcon
                key={badge}
                label={badge}
                selected={selected.includes(badge)}
                onPress={() => onToggle(badge)}
                size="sm"
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── NewLocationModal ─────────────────────────────────────────────────────────

function NewLocationModal({
  visible, onClose, onCreated, uid,
}: {
  visible: boolean; onClose: () => void; onCreated: (loc: ClimbLocation) => void; uid: string;
}) {
  const insets = useSafeAreaInsets();
  const [name,       setName]       = useState('');
  const [locType,    setLocType]    = useState<'indoor' | 'outdoor'>('outdoor');
  const [useBadges,  setUseBadges]  = useState(false);
  const [address,    setAddress]    = useState('');
  const [gps,        setGps]        = useState('');
  const [sectors,    setSectors]    = useState<Sector[]>([]);
  const [saving,     setSaving]     = useState(false);

  function reset() {
    setName(''); setLocType('outdoor'); setUseBadges(false);
    setAddress(''); setGps(''); setSectors([]); setSaving(false);
  }

  function addSector() {
    setSectors(prev => [...prev, { name: '', discipline: 'boulder', gradeSystem: 'v-scale' }]);
  }

  function removeSector(i: number) {
    setSectors(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateSector(i: number, patch: Partial<Sector>) {
    setSectors(prev => prev.map((s, idx) => {
      if (idx !== i) return s;
      const updated = { ...s, ...patch };
      // Auto-set gradeSystem when discipline changes
      if (patch.discipline) {
        const systems = gradeSystemsForDiscipline(patch.discipline);
        if (!systems.includes(updated.gradeSystem)) updated.gradeSystem = systems[0];
      }
      return updated;
    }));
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      const loc = await createLocation({
        uid, name: name.trim(), type: locType, sectors,
        address: address.trim(), gps: gps.trim(), useBadges,
        createdAt: new Date().toISOString(),
      });
      onCreated(loc);
      reset();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>New Location</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.sheetClose}>✕</Text></TouchableOpacity>
          </View>

          <ScrollView style={styles.sheetBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Name */}
            <Text style={styles.fieldLabel}>Location Name</Text>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Local Crag, Home Wall…"
              placeholderTextColor="#aaa"
            />

            {/* Type */}
            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.toggleRow}>
              {(['outdoor', 'indoor'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.toggleBtn, locType === t && styles.toggleBtnActive]}
                  onPress={() => setLocType(t)}
                >
                  <Text style={[styles.toggleBtnText, locType === t && { color: '#fff' }]}>
                    {t === 'outdoor' ? '🏔 Outdoor' : '🏛 Indoor'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Use Badges */}
            <TouchableOpacity style={styles.checkRow} onPress={() => setUseBadges(b => !b)}>
              <View style={[styles.checkbox, useBadges && styles.checkboxOn]}>
                {useBadges && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View>
                <Text style={styles.checkLabel}>Use Climbing Badges</Text>
                <Text style={styles.checkSub}>Enable KBC-style hold type &amp; technique badges</Text>
              </View>
            </TouchableOpacity>

            {/* Sectors */}
            <Text style={styles.fieldLabel}>Sectors</Text>
            {sectors.map((s, i) => (
              <View key={i} style={styles.sectorRow}>
                <TextInput
                  style={[styles.textInput, { flex: 1, marginTop: 0 }]}
                  value={s.name}
                  onChangeText={v => updateSector(i, { name: v })}
                  placeholder={`Sector ${i + 1} name`}
                  placeholderTextColor="#aaa"
                />
                {/* Discipline chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    {(Object.keys(DISCIPLINE_LABELS) as ClimbDiscipline[]).map(d => (
                      <TouchableOpacity
                        key={d}
                        style={[styles.miniChip, s.discipline === d && styles.miniChipActive]}
                        onPress={() => updateSector(i, { discipline: d })}
                      >
                        <Text style={[styles.miniChipText, s.discipline === d && { color: '#fff' }]}>
                          {DISCIPLINE_LABELS[d]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                {/* Grade system (boulder only — roped = yosemite locked) */}
                {s.discipline === 'boulder' ? (
                  <View style={{ flexDirection: 'row', gap: 5, marginTop: 6 }}>
                    {(['v-scale', 'font'] as GradeSystem[]).map(gs => (
                      <TouchableOpacity
                        key={gs}
                        style={[styles.miniChip, s.gradeSystem === gs && styles.miniChipActive]}
                        onPress={() => updateSector(i, { gradeSystem: gs })}
                      >
                        <Text style={[styles.miniChipText, s.gradeSystem === gs && { color: '#fff' }]}>
                          {GRADE_SYSTEM_LABELS[gs]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.lockedGrade}>Yosemite (YDS) scale</Text>
                )}
                <TouchableOpacity onPress={() => removeSector(i)} style={styles.removeSectorBtn}>
                  <Text style={styles.removeSectorText}>Remove sector</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addSectorBtn} onPress={addSector}>
              <Text style={styles.addSectorText}>＋ Add Sector</Text>
            </TouchableOpacity>

            {/* Address */}
            <Text style={styles.fieldLabel}>Address (optional)</Text>
            <TextInput
              style={styles.textInput}
              value={address}
              onChangeText={setAddress}
              placeholder="Street address or area description"
              placeholderTextColor="#aaa"
            />

            {/* GPS */}
            <Text style={styles.fieldLabel}>GPS Coordinates (optional)</Text>
            <TextInput
              style={styles.textInput}
              value={gps}
              onChangeText={setGps}
              placeholder="e.g. 44.2312, -76.4819"
              placeholderTextColor="#aaa"
              keyboardType="numbers-and-punctuation"
            />

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>Create Location</Text>}
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── LogClimbModal ────────────────────────────────────────────────────────────

function LogClimbModal({
  visible, onClose, onSaved, uid, userName,
  locations, initialLocationId, editingClimb,
}: {
  visible: boolean; onClose: () => void;
  onSaved: (climb: PersonalClimb, isEdit: boolean) => void;
  uid: string; userName: string;
  locations: ClimbLocation[];
  initialLocationId: string;
  editingClimb?: PersonalClimb | null;
}) {
  const insets = useSafeAreaInsets();
  const isEdit = !!editingClimb;

  const defaultLocId = initialLocationId === 'all' ? (locations[0]?.id ?? 'kbc') : initialLocationId;

  const [locationId,      setLocationId]      = useState(editingClimb?.locationId ?? defaultLocId);
  const [sectorIdx,       setSectorIdx]       = useState(0);
  const [logDate,         setLogDate]         = useState(editingClimb ? new Date(editingClimb.timestamp) : new Date());
  const [climbName,       setClimbName]       = useState(editingClimb?.name ?? '');
  const [establishedGrade,setEstablishedGrade]= useState(editingClimb?.establishedGrade ?? '');
  const [personalGrade,   setPersonalGrade]   = useState(editingClimb?.personalGrade ?? '');
  const [type,            setType]            = useState<'ascent' | 'attempt'>(editingClimb?.type ?? 'ascent');
  const [quality,         setQuality]         = useState(editingClimb?.quality ?? 0);
  const [effort,          setEffort]          = useState<number | null>(effortToNumber(editingClimb?.effort));
  const [attempts,        setAttempts]        = useState(editingClimb?.attempts ? String(editingClimb.attempts) : '1');
  const [project,         setProject]         = useState(editingClimb?.project ?? false);
  const [badges,          setBadges]          = useState<string[]>(editingClimb?.badges ?? []);
  const [comment,         setComment]         = useState(editingClimb?.comment ?? '');
  const [photo,           setPhoto]           = useState(editingClimb?.photo ?? '');
  const [saving,          setSaving]          = useState(false);
  const [showDate,        setShowDate]        = useState(false);

  // Re-initialise when editingClimb changes or modal opens — useEffect avoids concurrent-mode mutation bugs
  useEffect(() => {
    const defLoc = initialLocationId === 'all' ? (locations[0]?.id ?? 'kbc') : initialLocationId;
    if (editingClimb) {
      setLocationId(editingClimb.locationId);
      const editLoc = editingClimb.locationId !== 'kbc'
        ? locations.find(l => l.id === editingClimb.locationId)
        : null;
      const sIdx = editLoc ? editLoc.sectors.findIndex(s => s.name === editingClimb.sectorId) : -1;
      setSectorIdx(sIdx >= 0 ? sIdx : 0);
      setLogDate(new Date(editingClimb.timestamp));
      setClimbName(editingClimb.name);
      setEstablishedGrade(editingClimb.establishedGrade);
      setPersonalGrade(editingClimb.personalGrade);
      setType(editingClimb.type);
      setQuality(editingClimb.quality);
      setEffort(effortToNumber(editingClimb.effort));
      setAttempts(editingClimb.attempts ? String(editingClimb.attempts) : '1');
      setProject(editingClimb.project);
      setBadges(editingClimb.badges ?? []);
      setComment(editingClimb.comment);
      setPhoto(editingClimb.photo ?? '');
    } else {
      setLocationId(defLoc);
      setSectorIdx(0); setLogDate(new Date()); setClimbName('');
      setEstablishedGrade(''); setPersonalGrade(''); setType('ascent');
      setQuality(0); setEffort(null); setAttempts('1'); setProject(false); setBadges([]); setComment(''); setPhoto('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingClimb?.id, visible]);

  const activeLoc = locationId === 'kbc'
    ? null
    : locations.find(l => l.id === locationId) ?? null;
  const sectors    = activeLoc?.sectors ?? [];
  const sector     = sectors[sectorIdx] ?? null;
  const showBadges = locationId === 'kbc' || (activeLoc?.useBadges ?? false);

  function reset() {
    setLocationId(defaultLocId);
    setSectorIdx(0); setLogDate(new Date()); setClimbName('');
    setEstablishedGrade(''); setPersonalGrade(''); setType('ascent');
    setQuality(0); setEffort(null); setAttempts('1'); setProject(false); setBadges([]); setComment(''); setPhoto('');
  }

  async function handleSave() {
    if (!climbName.trim()) { Alert.alert('Please enter a climb name'); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const payload = {
        uid, userName, locationId,
        boulderId:         editingClimb?.boulderId         ?? '',
        sectorId:          sector?.name                    ?? (editingClimb?.sectorId ?? ''),
        timestamp:         logDate.toISOString(),
        name:              climbName.trim(),
        establishedGrade:  locationId === 'kbc' ? '' : establishedGrade,
        personalGrade:     editingClimb?.personalGrade ?? '',
        gradeVote:         editingClimb?.gradeVote ?? null,
        problemInternalId: editingClimb?.problemInternalId ?? '',
        quality,
        effort: effort ?? '',
        attempts: Math.min(99, Math.max(1, parseInt(attempts || '1', 10) || 1)),
        type, project, badges,
        comment: comment.trim(),
        photo,
        createdAt: editingClimb?.createdAt ?? now,
      };

      let saved: PersonalClimb;
      if (isEdit && editingClimb) {
        await updateClimb(editingClimb.id, payload);
        saved = { ...editingClimb, ...payload };
      } else {
        saved = await addClimb(payload);
      }
      onSaved(saved, isEdit);
      reset();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function pickPhoto() {
    if (!ImagePicker) { Alert.alert('Not available', 'Photo picker requires a dev build.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.4,
      base64: true,
      exif: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhoto(asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri);
    }
  }

  const dateStr = logDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  // All available location options for picker
  const locOptions = [
    { id: 'kbc', label: 'KBC Gym' },
    ...locations.map(l => ({ id: l.id, label: l.name })),
  ];

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{isEdit ? 'Edit Climb' : 'Log Climb'}</Text>
              <TouchableOpacity onPress={onClose}><Text style={styles.sheetClose}>✕</Text></TouchableOpacity>
            </View>

            <ScrollView style={styles.sheetBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

              {/* Sent / Attempted */}
              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[styles.typeBtn, type === 'ascent' && styles.typeBtnSent]}
                  onPress={() => setType('ascent')}
                >
                  <Text style={[styles.typeBtnText, type === 'ascent' && { color: '#fff' }]}>✓  Sent</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, type === 'attempt' && styles.typeBtnTried]}
                  onPress={() => setType('attempt')}
                >
                  <Text style={[styles.typeBtnText, type === 'attempt' && { color: '#fff' }]}>△  Attempted</Text>
                </TouchableOpacity>
              </View>

              {/* Number of attempts */}
              <View style={styles.attemptsRow}>
                <Text style={styles.attemptsLabel}>Number of attempts:</Text>
                <TextInput
                  style={styles.attemptsInput}
                  value={attempts}
                  onChangeText={t => {
                    const n = t.replace(/[^0-9]/g, '');
                    if (n === '' || (parseInt(n, 10) >= 1 && parseInt(n, 10) <= 99)) setAttempts(n);
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="—"
                  placeholderTextColor="#bbb"
                />
              </View>

              {/* Location */}
              <Text style={styles.fieldLabel}>Location</Text>
              <DropdownPicker
                options={locOptions.map(o => ({ label: o.label, value: o.id }))}
                value={locationId}
                onChange={id => { setLocationId(id); setSectorIdx(0); setPersonalGrade(''); }}
                placeholder="Select location…"
                accentColor={KBC.cyan}
              />

              {/* Area / Sector */}
              {sectors.length > 0 && (
                <>
                  <Text style={styles.fieldLabel}>Area</Text>
                  <DropdownPicker
                    options={sectors.map((s, i) => ({ label: s.name || `Sector ${i + 1}`, value: String(i) }))}
                    value={String(sectorIdx)}
                    onChange={v => { setSectorIdx(Number(v)); setPersonalGrade(''); }}
                    placeholder="Select area…"
                    accentColor={KBC.cyan}
                  />
                </>
              )}

              {/* Date */}
              <Text style={styles.fieldLabel}>Date</Text>
              <TouchableOpacity style={[styles.textInput, { justifyContent: 'center' }]} onPress={() => setShowDate(true)}>
                <Text style={{ color: '#111', fontSize: 14 }}>{dateStr}</Text>
              </TouchableOpacity>

              {/* Climb Name */}
              <Text style={styles.fieldLabel}>Climb Name</Text>
              <TextInput
                style={styles.textInput}
                value={climbName}
                onChangeText={setClimbName}
                placeholder="Name or description"
                placeholderTextColor="#aaa"
              />

              {/* Established Grade (custom locations only, editable) */}
              {locationId !== 'kbc' && (
                <>
                  <Text style={styles.fieldLabel}>Established Grade</Text>
                  <TextInput
                    style={styles.textInput}
                    value={establishedGrade}
                    onChangeText={setEstablishedGrade}
                    placeholder="Grade as set by the route setter"
                    placeholderTextColor="#aaa"
                  />
                </>
              )}

              {/* Quality */}
              <Text style={styles.fieldLabel}>Quality</Text>
              <StarRow value={quality} onChange={setQuality} />

              {/* Effort */}
              <Text style={styles.fieldLabel}>Effort</Text>
              <EffortBar value={effort} onChange={setEffort} />

              {/* Project */}
              <TouchableOpacity style={styles.checkRow} onPress={() => setProject(p => !p)}>
                <View style={[styles.checkbox, project && styles.checkboxOn]}>
                  {project && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View>
                  <Text style={styles.checkLabel}>Project</Text>
                  <Text style={styles.checkSub}>Still working on it</Text>
                </View>
              </TouchableOpacity>

              {/* Badges */}
              {showBadges && (
                <BadgeSection
                  selected={badges}
                  onToggle={b => setBadges(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])}
                />
              )}

              {/* Comment */}
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={comment}
                onChangeText={setComment}
                placeholder="Personal notes about this climb…"
                placeholderTextColor="#aaa"
                multiline
              />

              {/* Photo */}
              <Text style={styles.fieldLabel}>Photo</Text>
              {photo ? (
                <View style={{ marginBottom: 8 }}>
                  <Image source={{ uri: photo }} style={styles.logPhotoPreview} contentFit="cover" />
                  <TouchableOpacity style={styles.logPhotoRemoveBtn} onPress={() => setPhoto('')}>
                    <Text style={styles.logPhotoRemoveBtnText}>Remove Photo</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.logPhotoPickBtn} onPress={pickPhoto}>
                  <Text style={styles.logPhotoPickBtnText}>📷  Add Photo</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{isEdit ? 'Save Changes' : 'Log Climb'}</Text>}
              </TouchableOpacity>
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <DatePickerModal
        visible={showDate}
        value={logDate}
        onChange={d => setLogDate(d)}
        onClose={() => setShowDate(false)}
        allowPast
      />
    </>
  );
}

// ─── ClimbRow ─────────────────────────────────────────────────────────────────

function ClimbRow({
  climb, locationName, onPress, onDelete,
}: {
  climb: PersonalClimb; locationName: string; onPress: () => void; onDelete: () => void;
}) {
  const isSent = climb.type === 'ascent';

  return (
    <TouchableOpacity
      style={styles.climbRow}
      onPress={onPress}
      onLongPress={() => {
        Alert.alert('Delete Entry', 'Remove this climb from your logbook?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: onDelete },
        ]);
      }}
      activeOpacity={0.8}
    >
      {/* Top line: location / sector + timestamp */}
      <View style={styles.climbRowTop}>
        <Text style={styles.climbRowLoc} numberOfLines={1}>
          {locationName}{climb.sectorId ? ` · ${climb.sectorId}` : ''}
        </Text>
        <Text style={styles.climbRowTime}>{formatTimestamp(climb.timestamp)}</Text>
      </View>

      {/* Name */}
      <Text style={styles.climbRowName} numberOfLines={1}>{climb.name}</Text>

      {/* Meta row: type badge, personal grade, stars, effort */}
      <View style={styles.climbRowMeta}>
        <Text style={[styles.typeBadge, isSent ? styles.typeBadgeSent : styles.typeBadgeTried]}>
          {isSent ? '✓ Sent' : '△ Tried'}
        </Text>
        {climb.personalGrade ? (
          <Text style={styles.gradeTag}>{climb.personalGrade}</Text>
        ) : null}
        {climb.quality > 0 && (
          <Text style={{ color: '#fbbf24', fontSize: 12 }}>{'★'.repeat(climb.quality)}</Text>
        )}
        {(climb.effort !== '' && climb.effort !== null && climb.effort !== undefined) ? (
          <Text style={[styles.effortBadge, { backgroundColor: '#888' }]}>
            {effortLabel(climb.effort)}
          </Text>
        ) : null}
        {climb.project && <Text style={styles.projectBadge}>🏔 Project</Text>}
      </View>

      {/* Badge icons — up to 5, left-aligned */}
      {climb.badges && climb.badges.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 4, marginTop: 4, alignSelf: 'flex-start' }}>
          {climb.badges.slice(0, 5).map(b => (
            <BadgeIcon key={b} label={b} selected size="sm" compact />
          ))}
        </View>
      )}

      {/* Comment preview */}
      {!!climb.comment && (
        <Text style={styles.climbRowComment} numberOfLines={2}>{climb.comment}</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Climb Filter ─────────────────────────────────────────────────────────────

type ClimbSort = 'newest' | 'oldest' | 'name-az' | 'name-za' | 'quality';
type ClimbFilter = {
  type: 'all' | 'sent' | 'attempted';
  projectsOnly: boolean;
  sort: ClimbSort;
};
const DEFAULT_CLIMB_FILTER: ClimbFilter = { type: 'all', projectsOnly: false, sort: 'newest' };

const SORT_OPTIONS: { key: ClimbSort; label: string }[] = [
  { key: 'newest',  label: '↓ Date'  },
  { key: 'oldest',  label: '↑ Date'  },
  { key: 'name-az', label: 'A – Z'   },
  { key: 'name-za', label: 'Z – A'   },
  { key: 'quality', label: '★ Stars' },
];

function ClimbFilterModal({
  visible, onClose, filter, onApply,
}: {
  visible: boolean; onClose: () => void; filter: ClimbFilter; onApply: (f: ClimbFilter) => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ClimbFilter>(filter);

  // Sync draft when modal opens
  const openRef = useRef(visible);
  if (visible !== openRef.current) {
    openRef.current = visible;
    if (visible) setDraft({ ...filter });
  }

  function apply() { onApply(draft); onClose(); }
  function reset()  { setDraft(d => ({ ...DEFAULT_CLIMB_FILTER, sort: d.sort })); }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Filter Climbs</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.sheetClose}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>

          {/* Climb type */}
          <Text style={styles.fieldLabel}>Climb Type</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([['all', 'All'], ['sent', '✓ Sent'], ['attempted', '△ Attempted']] as const).map(([val, label]) => (
              <TouchableOpacity
                key={val}
                style={[styles.miniChip, draft.type === val && styles.miniChipActive]}
                onPress={() => setDraft(d => ({ ...d, type: val }))}
              >
                <Text style={[styles.miniChipText, draft.type === val && { color: '#fff' }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Projects only */}
          <TouchableOpacity style={styles.checkRow} onPress={() => setDraft(d => ({ ...d, projectsOnly: !d.projectsOnly }))}>
            <View style={[styles.checkbox, draft.projectsOnly && styles.checkboxOn]}>
              {draft.projectsOnly && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <View>
              <Text style={styles.checkLabel}>Projects only</Text>
              <Text style={styles.checkSub}>Show only climbs marked as projects</Text>
            </View>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
            <TouchableOpacity
              style={[styles.saveBtn, { flex: 1, backgroundColor: '#eee', marginTop: 0 }]}
              onPress={reset}
            >
              <Text style={[styles.saveBtnText, { color: '#555' }]}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { flex: 2, marginTop: 0 }]}
              onPress={apply}
            >
              <Text style={styles.saveBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 20 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Location Picker Sheet ────────────────────────────────────────────────────

function LocationPickerSheet({
  visible, onClose, locationId, onSelect, locations, onNewLocation,
}: {
  visible: boolean; onClose: () => void;
  locationId: string; onSelect: (id: string) => void;
  locations: ClimbLocation[]; onNewLocation: () => void;
}) {
  const insets = useSafeAreaInsets();
  const options = [
    { id: 'all',  label: 'All Locations', sub: 'Show climbs from everywhere' },
    { id: 'kbc',  label: 'KBC Gym',       sub: 'Kingston Boulder Cooperative' },
    ...locations.map(l => ({ id: l.id, label: l.name, sub: l.type === 'indoor' ? '🏛 Indoor' : '🏔 Outdoor' })),
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: '65%' }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Select Location</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.sheetClose}>✕</Text></TouchableOpacity>
        </View>
        <ScrollView>
          {options.map(o => (
            <TouchableOpacity
              key={o.id}
              style={[styles.locOption, o.id === locationId && styles.locOptionSel]}
              onPress={() => { onSelect(o.id); onClose(); }}
            >
              <Text style={[styles.locOptionLabel, o.id === locationId && { color: KBC.cyan }]}>{o.label}</Text>
              {o.sub ? <Text style={styles.locOptionSub}>{o.sub}</Text> : null}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.newLocBtn} onPress={() => { onClose(); onNewLocation(); }}>
            <Text style={styles.newLocBtnText}>＋ Create New Location</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ClimbLogScreen() {
  const { user }    = useAuth();
  const { profile } = useProfile();
  const uid         = user?.id ?? '';
  const userName    = profile?.preferredName || user?.name || '';
  const insets      = useSafeAreaInsets();

  const [locationId,   setLocationId]   = useState<string>('all');
  const [locations,    setLocations]    = useState<ClimbLocation[]>([]);
  const [climbs,       setClimbs]       = useState<PersonalClimb[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [showLocPick,  setShowLocPick]  = useState(false);
  const [showNewLoc,   setShowNewLoc]   = useState(false);
  const [showLogClimb, setShowLogClimb] = useState(false);
  const [editingClimb, setEditingClimb] = useState<PersonalClimb | null>(null);
  const [filter,       setFilter]       = useState<ClimbFilter>(DEFAULT_CLIMB_FILTER);
  const [showFilter,   setShowFilter]   = useState(false);

  // Build a lookup map: locationId → display name
  const locationNames: Record<string, string> = {
    kbc: 'KBC Gym',
    ...Object.fromEntries(locations.map(l => [l.id, l.name])),
  };

  const filterCount = (filter.type !== 'all' ? 1 : 0) + (filter.projectsOnly ? 1 : 0);

  const displayed = useMemo(() => {
    let list = [...climbs];
    if (filter.type !== 'all') list = list.filter(c => c.type === (filter.type === 'sent' ? 'ascent' : 'attempt'));
    if (filter.projectsOnly) list = list.filter(c => c.project);
    list.sort((a, b) => {
      switch (filter.sort) {
        case 'oldest':  return a.timestamp.localeCompare(b.timestamp);
        case 'name-az': return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        case 'name-za': return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
        case 'quality': return (b.quality || 0) - (a.quality || 0) || b.timestamp.localeCompare(a.timestamp);
        default:        return b.timestamp.localeCompare(a.timestamp);
      }
    });
    return list;
  }, [climbs, filter]);

  const listItems = useMemo((): ListItem[] => {
    const byDate = filter.sort === 'newest' || filter.sort === 'oldest';
    if (!byDate) return displayed.map(c => ({ type: 'climb', key: c.id, climb: c }));
    const items: ListItem[] = [];
    let lastDateKey = '';
    for (const climb of displayed) {
      const dateKey = climb.timestamp.slice(0, 10);
      if (dateKey !== lastDateKey) {
        items.push({ type: 'header', key: `h-${dateKey}`, label: dateSectionLabel(climb.timestamp) });
        lastDateKey = dateKey;
      }
      items.push({ type: 'climb', key: climb.id, climb });
    }
    return items;
  }, [displayed, filter.sort]);

  async function loadAll(silent = false) {
    if (!uid) return;
    if (!silent) setLoading(true);
    try {
      const [locs, logs] = await Promise.all([
        getMyLocations(uid),
        getMyLogs(uid, locationId === 'all' ? undefined : locationId),
      ]);
      setLocations(locs);
      setClimbs(logs);
    } catch (e: any) {
      Alert.alert('Error loading data', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { loadAll(); }, [uid, locationId]));

  async function handleDelete(climb: PersonalClimb) {
    try {
      await deleteClimb(climb.id);
      setClimbs(prev => prev.filter(c => c.id !== climb.id));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  function handleSaved(climb: PersonalClimb, isEdit: boolean) {
    if (isEdit) {
      setClimbs(prev => prev.map(c => c.id === climb.id ? climb : c));
    } else {
      setClimbs(prev => [climb, ...prev]);
    }
  }

  function openEdit(climb: PersonalClimb) {
    setEditingClimb(climb);
    setShowLogClimb(true);
  }

  const activeLocLabel =
    locationId === 'all' ? 'All Locations'
    : locationId === 'kbc' ? 'KBC Gym'
    : locations.find(l => l.id === locationId)?.name ?? 'Unknown';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={KBC.cyan} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f8f8' }}>

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.locPill} onPress={() => setShowLocPick(true)}>
          <Text style={styles.locPillText} numberOfLines={1}>📍 {activeLocLabel} ▾</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, filterCount > 0 && styles.filterBtnActive]}
          onPress={() => setShowFilter(true)}
        >
          <Text style={[styles.filterBtnText, filterCount > 0 && { color: '#fff' }]}>
            ⚙{filterCount > 0 ? ` ${filterCount}` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.summaryBtn} onPress={() => router.push({ pathname: '/climb-summary', params: { locationId } })}>
          <Text style={styles.summaryBtnText}>📊 Summary</Text>
        </TouchableOpacity>
      </View>

      {/* ── Sort bar ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.sortBar}
        contentContainerStyle={styles.sortBarContent}
      >
        {SORT_OPTIONS.map(o => (
          <TouchableOpacity
            key={o.key}
            style={[styles.sortChip, filter.sort === o.key && styles.sortChipActive]}
            onPress={() => setFilter(f => ({ ...f, sort: o.key }))}
          >
            <Text style={[styles.sortChipText, filter.sort === o.key && styles.sortChipTextActive]}>
              {o.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Climb list ── */}
      <FlatList
        data={listItems}
        keyExtractor={item => item.key}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <View style={styles.dateHeader}>
                <Text style={styles.dateHeaderText}>{item.label}</Text>
              </View>
            );
          }
          return (
            <ClimbRow
              climb={item.climb}
              locationName={locationNames[item.climb.locationId] ?? item.climb.locationId}
              onPress={() => openEdit(item.climb)}
              onDelete={() => handleDelete(item.climb)}
            />
          );
        }}
        contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadAll(true); }}
            tintColor={KBC.cyan}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🧗</Text>
            <Text style={styles.emptyTitle}>No climbs logged yet</Text>
            <Text style={styles.emptySub}>Tap + to log your first climb</Text>
          </View>
        }
      />

      {/* ── FAB ── */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => setShowLogClimb(true)}
      >
        <Text style={styles.fabText}>＋ Log Climb</Text>
      </TouchableOpacity>

      {/* ── Modals ── */}
      <LocationPickerSheet
        visible={showLocPick}
        onClose={() => setShowLocPick(false)}
        locationId={locationId}
        onSelect={id => setLocationId(id)}
        locations={locations}
        onNewLocation={() => setShowNewLoc(true)}
      />

      <NewLocationModal
        visible={showNewLoc}
        onClose={() => setShowNewLoc(false)}
        onCreated={loc => setLocations(prev => [...prev, loc])}
        uid={uid}
      />

      <LogClimbModal
        visible={showLogClimb}
        onClose={() => { setShowLogClimb(false); setEditingClimb(null); }}
        onSaved={handleSaved}
        uid={uid}
        userName={userName}
        locations={locations}
        initialLocationId={locationId}
        editingClimb={editingClimb}
      />

      <ClimbFilterModal
        visible={showFilter}
        onClose={() => setShowFilter(false)}
        filter={filter}
        onApply={f => setFilter(f)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  locPill: {
    flex: 1, backgroundColor: '#f0f0f0', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  locPillText: { fontSize: 14, fontWeight: '600', color: KBC.black },
  filterBtn: {
    backgroundColor: '#f0f0f0', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  filterBtnActive: { backgroundColor: KBC.cyan },
  filterBtnText: { fontSize: 13, fontWeight: '700', color: '#555' },
  summaryBtn: {
    backgroundColor: KBC.cyan, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  summaryBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Sort bar
  sortBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  sortBarContent: { paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', gap: 8 },
  sortChip: {
    borderRadius: 20, paddingHorizontal: 13, paddingVertical: 6,
    backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#e0e0e0',
  },
  sortChipActive: { backgroundColor: KBC.green, borderColor: KBC.green },
  sortChipText: { fontSize: 12, fontWeight: '600', color: '#555' },
  sortChipTextActive: { color: '#fff' },

  // Date section header
  dateHeader: { paddingHorizontal: 4, paddingTop: 16, paddingBottom: 4 },
  dateHeaderText: { fontSize: 11, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 0.8 },

  // FAB
  fab: {
    position: 'absolute', right: 16,
    backgroundColor: KBC.cyan, borderRadius: 28,
    paddingHorizontal: 20, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Climb row
  climbRow: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#eee',
  },
  climbRowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  climbRowLoc: { fontSize: 11, color: '#999', flex: 1 },
  climbRowTime: { fontSize: 11, color: '#bbb' },
  climbRowName: { fontSize: 16, fontWeight: '700', color: KBC.black, marginBottom: 6 },
  climbRowMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' },
  climbRowComment: { fontSize: 12, color: '#666', marginTop: 6, fontStyle: 'italic' },

  typeBadge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  typeBadgeSent: { backgroundColor: '#e8f5e9', color: '#2e7d32' },
  typeBadgeTried: { backgroundColor: '#fff3e0', color: '#e65100' },
  gradeTag: { fontSize: 11, fontWeight: '600', backgroundColor: '#f0f0f0', color: '#333', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  effortBadge: { fontSize: 11, fontWeight: '600', color: '#fff', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  projectBadge: { fontSize: 11, color: '#555' },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#999' },

  // Sheet modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 18, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: KBC.black },
  sheetClose: { fontSize: 18, color: '#999' },
  sheetBody: { padding: 16 },

  // Form fields
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#555', marginTop: 16, marginBottom: 6 },
  textInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#111', backgroundColor: '#fafafa',
    marginTop: 4,
  },
  textArea: { height: 80, textAlignVertical: 'top' },

  toggleRow: { flexDirection: 'row', gap: 10 },
  toggleBtn: {
    flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 10,
    padding: 12, alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: KBC.cyan, borderColor: KBC.cyan },
  toggleBtnText: { fontSize: 14, fontWeight: '600', color: '#555' },

  // Checkbox
  checkRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 16 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: '#ddd', alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: KBC.cyan, borderColor: KBC.cyan },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  checkLabel: { fontSize: 15, fontWeight: '700', color: KBC.black },
  checkSub: { fontSize: 12, color: '#999', marginTop: 2 },

  // Sector
  sectorRow: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    padding: 10, marginBottom: 10, backgroundColor: '#fafafa',
  },
  lockedGrade: { fontSize: 12, color: '#999', marginTop: 6, fontStyle: 'italic' },
  removeSectorBtn: { marginTop: 8 },
  removeSectorText: { fontSize: 12, color: '#e00' },
  addSectorBtn: {
    borderWidth: 1.5, borderColor: KBC.cyan, borderRadius: 10, borderStyle: 'dashed',
    padding: 12, alignItems: 'center', marginVertical: 4,
  },
  addSectorText: { color: KBC.cyan, fontWeight: '600', fontSize: 14 },

  // Mini chips
  miniChip: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#f5f5f5',
  },
  miniChipActive: { backgroundColor: KBC.cyan, borderColor: KBC.cyan },
  miniChipText: { fontSize: 12, fontWeight: '600', color: '#555' },

  // Grade chip
  gradeChip: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f5f5f5',
  },
  gradeChipSel: { backgroundColor: KBC.lime, borderColor: KBC.lime },
  gradeChipText: { fontSize: 12, fontWeight: '700', color: '#333' },

  // Effort chip
  effortChip: {
    borderWidth: 1.5, borderColor: '#ddd', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  effortChipText: { fontSize: 13, fontWeight: '600', color: '#555' },

  // Badges
  collapseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  badgeGroupTitle: { fontSize: 12, fontWeight: '700', color: '#888', marginBottom: 6, marginTop: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badgeChip: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 16,
    paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#f5f5f5',
  },
  badgeChipSel: { backgroundColor: KBC.lime, borderColor: KBC.lime },
  badgeChipText: { fontSize: 12, color: '#444' },

  // Attempts
  attemptsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  attemptsLabel: { fontSize: 14, fontWeight: '600', color: '#555' },
  attemptsInput: {
    width: 56, borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 8, fontSize: 15, color: '#111', backgroundColor: '#fafafa',
    textAlign: 'center',
  },

  // Type buttons (log modal)
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  typeBtn: {
    flex: 1, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 10,
    padding: 14, alignItems: 'center',
  },
  typeBtnSent: { backgroundColor: '#2ecc71', borderColor: '#2ecc71' },
  typeBtnTried: { backgroundColor: '#f39c12', borderColor: '#f39c12' },
  typeBtnText: { fontSize: 15, fontWeight: '700', color: '#555' },

  // Photo picker
  logPhotoPreview:       { width: '100%', height: 160, borderRadius: 10, marginBottom: 8 },
  logPhotoPickBtn:       { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 8 },
  logPhotoPickBtnText:   { fontSize: 14, color: '#555', fontWeight: '600' },
  logPhotoRemoveBtn:     { alignItems: 'center', marginBottom: 4 },
  logPhotoRemoveBtnText: { fontSize: 12, color: '#FF453A', fontWeight: '600' },

  // Save button
  saveBtn: { backgroundColor: KBC.cyan, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Location picker sheet
  locOption: {
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  locOptionSel: { backgroundColor: '#e8f9ff' },
  locOptionLabel: { fontSize: 15, fontWeight: '600', color: KBC.black },
  locOptionSub: { fontSize: 12, color: '#999', marginTop: 2 },
  newLocBtn: { padding: 16, alignItems: 'center' },
  newLocBtnText: { fontSize: 15, fontWeight: '700', color: KBC.cyan },
});
