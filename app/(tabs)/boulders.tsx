import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
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

import { BADGE_COLOR } from '@/components/badge-icon';
import { GradeBar } from '@/components/grade-bar';
import { DatePickerModal, TimePickerModal } from '@/components/time-picker-modal';
import { KBC } from '@/constants/theme';
import { isAdmin } from '@/constants/admins';
import { useAuth } from '@/context/auth';
import { useProfile } from '@/context/profile';
import {
  BADGE_GROUPS, BADGES, GRADE_COLORS, GRADE_TEXT, GRADES,
  Boulder, BoulderComment, BoulderSeason,
  avgQuality,
  addComment, createBoulder, createSeason, deleteComment,
  getBouldersForSeason, getComments, getNextBoulderNumber, getSeasons,
  removeBoulder, updateBoulder,
} from '@/services/boulders';
import { addClimb, ClimbDiscipline, ClimbLocation, GradeSystem, Sector, getKBCLogs, getMyLocations, getMyLogs, gradesForSystem, createLocation, updateLocation, deleteLocation, KBC_GRADE_LABELS, PersonalClimb } from '@/services/climblog';
import { PersonalProblem, createProblem as createPersonalProblem, updateProblem, deleteProblem, getMyProblems } from '@/services/personalProblems';
import { ClimbAggregates, computeAggregates, getPersonalStatus } from '@/utils/climbAggregates';

// Badge grid: 5 columns, 16 px padding each side
const BADGE_COL_W = Math.floor((Dimensions.get('window').width - 32) / 5);

// ─── Filter / sort state ──────────────────────────────────────────────────────

type SortKey = 'number' | 'name' | 'grade' | 'setter' | 'updatedAt';
type SortDir = 'asc' | 'desc';

type FilterState = {
  locations: string[];
  grades: number[];  // grade indices 0-4; empty = all
  badges: string[];  // badge names; empty = all
  setter: string;
};

const DEFAULT_FILTER: FilterState = { locations: [], grades: [], badges: [], setter: '' };
const FILTER_FILE = (FileSystem.documentDirectory ?? '') + 'boulder_filters.json';

async function loadSavedFilters(): Promise<FilterState> {
  try {
    const raw = await FileSystem.readAsStringAsync(FILTER_FILE);
    return { ...DEFAULT_FILTER, ...JSON.parse(raw) };
  } catch { return DEFAULT_FILTER; }
}
async function saveFilters(f: FilterState) {
  try { await FileSystem.writeAsStringAsync(FILTER_FILE, JSON.stringify(f)); } catch {}
}

function filterCount(f: FilterState) {
  return f.locations.length + f.grades.length + f.badges.length + (f.setter ? 1 : 0);
}


// ─── Star Rating ─────────────────────────────────────────────────────────────

function StarRating({
  votes,
  userUid,
  onVote,
  compact = false,
}: {
  votes: Record<string, number>;
  userUid?: string;
  onVote?: (stars: number) => void;
  compact?: boolean;
}) {
  const avg       = avgQuality(votes);
  const userVote  = userUid !== undefined && userUid in votes ? votes[userUid] : null;
  const voteCount = Object.keys(votes).length;
  const display   = userVote ?? avg ?? 0;

  const starSize = compact ? 14 : 22;
  const color    = '#f5a623';

  return (
    <View style={{ gap: compact ? 0 : 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 2 : 4 }}>
        {[1, 2, 3].map(n => {
          const filled = display >= n - 0.25;
          const half   = !filled && display >= n - 0.75;
          return (
            <TouchableOpacity
              key={n}
              onPress={() => onVote?.(userVote === n ? 0 : n)}
              disabled={!onVote}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            >
              <Text style={{ fontSize: starSize, color: filled || half ? color : '#ddd' }}>
                {filled ? '★' : half ? '⯨' : '☆'}
              </Text>
            </TouchableOpacity>
          );
        })}
        {!compact && (
          <Text style={styles.starInfo}>
            {voteCount === 0
              ? 'Tap to rate quality'
              : `${voteCount} vote${voteCount !== 1 ? 's' : ''}${avg !== null ? `  ·  ${avg.toFixed(1)}★` : ''}`}
            {userVote ? `  ·  ` : ''}
            {userVote ? <Text style={{ color }}> yours: {'★'.repeat(userVote)}</Text> : null}
          </Text>
        )}
      </View>
    </View>
  );
}


// Minimal climbing-hold icons drawn with Views
function HoldIcon({ badge, color, size }: { badge: string; color: string; size: number }) {
  const s = size;
  switch (badge) {
    case 'Crimps':
      // Thin horizontal crimp ledge
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
          <View style={{ width: s * 0.82, height: s * 0.2, backgroundColor: color, borderRadius: 3 }} />
          <View style={{ width: s * 0.55, height: s * 0.13, backgroundColor: color + 'aa', borderRadius: 2 }} />
        </View>
      );
    case 'Slopers':
      // Wide dome — sloper hold
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{
            width: s * 0.82, height: s * 0.52, backgroundColor: color,
            borderTopLeftRadius: s * 0.41, borderTopRightRadius: s * 0.41,
            borderBottomLeftRadius: s * 0.1, borderBottomRightRadius: s * 0.1,
          }} />
        </View>
      );
    case 'Deadpoint':
      // Bullseye target
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.68, height: s * 0.68, borderRadius: s * 0.34, borderWidth: 2.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: s * 0.28, height: s * 0.28, borderRadius: s * 0.14, backgroundColor: color }} />
          </View>
        </View>
      );
    case 'Dyno':
      // Single upward arrow
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', gap: 0 }}>
          <View style={{ width: 0, height: 0, borderLeftWidth: s * 0.26, borderRightWidth: s * 0.26, borderBottomWidth: s * 0.38, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color }} />
          <View style={{ width: s * 0.2, height: s * 0.28, backgroundColor: color, borderRadius: 2, marginTop: -1 }} />
        </View>
      );
    case 'Double Dyno':
      // Two upward arrows side by side
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}>
          {[0, 1].map(i => (
            <View key={i} style={{ alignItems: 'center' }}>
              <View style={{ width: 0, height: 0, borderLeftWidth: s * 0.18, borderRightWidth: s * 0.18, borderBottomWidth: s * 0.28, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color }} />
              <View style={{ width: s * 0.14, height: s * 0.2, backgroundColor: color, borderRadius: 1, marginTop: -1 }} />
            </View>
          ))}
        </View>
      );
    case 'Slippery-feet':
      // Two angled foot ovals — slipping off
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}>
          <View style={{ width: s * 0.24, height: s * 0.46, backgroundColor: color, borderRadius: s * 0.12, transform: [{ rotate: '-22deg' }] }} />
          <View style={{ width: s * 0.24, height: s * 0.46, backgroundColor: color, borderRadius: s * 0.12, transform: [{ rotate: '22deg' }] }} />
        </View>
      );
    case 'Pockets':
      // Ring — a pocket hold (just the opening)
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.62, height: s * 0.62, borderRadius: s * 0.31, borderWidth: s * 0.1, borderColor: color }} />
        </View>
      );
    case 'Contortionism':
      // Figure-8 (two stacked rings)
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.42, height: s * 0.42, borderRadius: s * 0.21, borderWidth: 2.5, borderColor: color, position: 'absolute', top: s * 0.04 }} />
          <View style={{ width: s * 0.42, height: s * 0.42, borderRadius: s * 0.21, borderWidth: 2.5, borderColor: color, position: 'absolute', bottom: s * 0.04 }} />
        </View>
      );
    case 'Body Tension':
      // Stick figure planking (head + horizontal bar)
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <View style={{ width: s * 0.22, height: s * 0.22, borderRadius: s * 0.11, backgroundColor: color }} />
          <View style={{ width: s * 0.82, height: s * 0.16, backgroundColor: color, borderRadius: 3 }} />
        </View>
      );
    case 'Shouldery':
      // Wide open arch — shoulder press shape
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{
            width: s * 0.8, height: s * 0.46,
            borderTopLeftRadius: s * 0.4, borderTopRightRadius: s * 0.4,
            borderWidth: 3, borderColor: color, borderBottomWidth: 0,
            marginTop: s * 0.08,
          }} />
        </View>
      );
    case 'Reachy':
      // Diagonal reach line + arrowhead
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.65, height: 3, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '-45deg' }] }} />
          <View style={{
            position: 'absolute', top: s * 0.1, right: s * 0.1,
            width: 0, height: 0,
            borderLeftWidth: 7, borderBottomWidth: 7,
            borderLeftColor: 'transparent', borderBottomColor: color,
            transform: [{ rotate: '45deg' }],
          }} />
        </View>
      );
    case 'Flexibility':
      // V-split: head top + two legs spread wide
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.2, height: s * 0.2, borderRadius: s * 0.1, backgroundColor: color, position: 'absolute', top: s * 0.04 }} />
          <View style={{ width: s * 0.66, height: 3, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '40deg' }], position: 'absolute', left: s * 0.02, top: s * 0.38 }} />
          <View style={{ width: s * 0.66, height: 3, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '-40deg' }], position: 'absolute', right: s * 0.02, top: s * 0.38 }} />
        </View>
      );
    case 'Heel Hook':
      // Bold C-hook — heel wrapping a hold
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.68, height: s * 0.68, borderRadius: s * 0.34, borderWidth: s * 0.12, borderColor: color, borderRightColor: 'transparent' }} />
        </View>
      );
    case 'Toe Hook':
      // Smaller J-curl — toe flicking over a hold
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.46, height: s * 0.46, borderRadius: s * 0.23, borderWidth: s * 0.1, borderColor: color, borderTopColor: 'transparent', borderLeftColor: 'transparent' }} />
          <View style={{ width: s * 0.1, height: s * 0.28, backgroundColor: color, borderRadius: 2, position: 'absolute', top: s * 0.06, right: s * 0.26 }} />
        </View>
      );
    case 'Bicycle':
      // Two circles side by side (wheels)
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: s * 0.07 }}>
          <View style={{ width: s * 0.36, height: s * 0.36, borderRadius: s * 0.18, borderWidth: 2.5, borderColor: color }} />
          <View style={{ width: s * 0.36, height: s * 0.36, borderRadius: s * 0.18, borderWidth: 2.5, borderColor: color }} />
        </View>
      );
    case 'Underclings':
      // Inverted arch — gripping from below, pulling up
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.8, height: s * 0.44, borderBottomLeftRadius: s * 0.4, borderBottomRightRadius: s * 0.4, borderWidth: 3, borderColor: color, borderTopWidth: 0, marginBottom: s * 0.06 }} />
        </View>
      );
    case 'Jugs':
      // D-shape jug handle — big positive hold
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.64, height: s * 0.64, borderRadius: s * 0.32, borderWidth: s * 0.12, borderColor: color, borderLeftColor: 'transparent' }} />
        </View>
      );
    case 'Campus':
      // Three horizontal rungs (campus board)
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', gap: s * 0.08 }}>
          {[0, 1, 2].map(i => (
            <View key={i} style={{ width: s * 0.78, height: s * 0.14, backgroundColor: color, borderRadius: 2 }} />
          ))}
        </View>
      );
    case 'No-feet':
      // Two foot ovals with a cross through them
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 3, opacity: 0.45 }}>
            <View style={{ width: s * 0.22, height: s * 0.42, backgroundColor: color, borderRadius: s * 0.11 }} />
            <View style={{ width: s * 0.22, height: s * 0.42, backgroundColor: color, borderRadius: s * 0.11 }} />
          </View>
          <View style={{ position: 'absolute', width: s * 0.72, height: 3, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '45deg' }] }} />
          <View style={{ position: 'absolute', width: s * 0.72, height: 3, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '-45deg' }] }} />
        </View>
      );
    case 'Pinches':
      // Two vertical parallel bars (squeeze a pinch hold)
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: s * 0.2 }}>
          <View style={{ width: s * 0.16, height: s * 0.62, backgroundColor: color, borderRadius: 3 }} />
          <View style={{ width: s * 0.16, height: s * 0.62, backgroundColor: color, borderRadius: 3 }} />
        </View>
      );
    case 'Outrageous':
      // Downward-pointing triangle — things are upside-down / outrageous
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 0, height: 0, borderLeftWidth: s * 0.3, borderRightWidth: s * 0.3, borderTopWidth: s * 0.44, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: color }} />
        </View>
      );
    case 'Bat Hang':
      // Small head at bottom, two legs angling up (hanging inverted)
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.2, height: s * 0.2, borderRadius: s * 0.1, backgroundColor: color, position: 'absolute', bottom: s * 0.06 }} />
          <View style={{ width: s * 0.11, height: s * 0.46, backgroundColor: color, borderRadius: 2, position: 'absolute', left: s * 0.2, bottom: s * 0.16, transform: [{ rotate: '-28deg' }] }} />
          <View style={{ width: s * 0.11, height: s * 0.46, backgroundColor: color, borderRadius: 2, position: 'absolute', right: s * 0.2, bottom: s * 0.16, transform: [{ rotate: '28deg' }] }} />
        </View>
      );
    case 'Compression':
      // Two arrows pointing inward — squeezing / compressing
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: s * 0.06 }}>
          <View style={{ alignItems: 'center', flexDirection: 'row' }}>
            <View style={{ width: 0, height: 0, borderTopWidth: s * 0.18, borderBottomWidth: s * 0.18, borderLeftWidth: s * 0.28, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: color }} />
            <View style={{ width: s * 0.14, height: s * 0.13, backgroundColor: color, borderRadius: 1 }} />
          </View>
          <View style={{ alignItems: 'center', flexDirection: 'row' }}>
            <View style={{ width: s * 0.14, height: s * 0.13, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ width: 0, height: 0, borderTopWidth: s * 0.18, borderBottomWidth: s * 0.18, borderRightWidth: s * 0.28, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: color }} />
          </View>
        </View>
      );
    case 'Balancing':
      // Balance beam — wide bar with a triangle support underneath
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.88, height: s * 0.16, backgroundColor: color, borderRadius: 3 }} />
          <View style={{ width: 0, height: 0, borderLeftWidth: s * 0.22, borderRightWidth: s * 0.22, borderTopWidth: s * 0.32, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: color, marginTop: 0 }} />
        </View>
      );
    case 'Joke':
      // Smiley face
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.68, height: s * 0.68, borderRadius: s * 0.34, borderWidth: 2.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', gap: s * 0.18, marginBottom: s * 0.05 }}>
              <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: color }} />
              <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: color }} />
            </View>
            <View style={{ width: s * 0.32, height: s * 0.16, borderBottomWidth: 2.5, borderBottomColor: color, borderLeftWidth: 2.5, borderLeftColor: color, borderRightWidth: 2.5, borderRightColor: color, borderRadius: s * 0.14, borderTopWidth: 0 }} />
          </View>
        </View>
      );
    case 'Ego-Breaker':
      // Circle with a crack/lightning through it
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.64, height: s * 0.64, borderRadius: s * 0.32, borderWidth: 2.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: s * 0.16, height: s * 0.22, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-15deg' }], marginBottom: -2 }} />
            <View style={{ width: s * 0.16, height: s * 0.22, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '15deg' }] }} />
          </View>
        </View>
      );
    case 'Pain':
      // Exclamation mark
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', gap: s * 0.07 }}>
          <View style={{ width: s * 0.17, height: s * 0.48, backgroundColor: color, borderRadius: 3 }} />
          <View style={{ width: s * 0.17, height: s * 0.17, borderRadius: s * 0.09, backgroundColor: color }} />
        </View>
      );
    case 'Cry':
      // Sad face with teardrop
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.62, height: s * 0.62, borderRadius: s * 0.31, borderWidth: 2.5, borderColor: color, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: s * 0.08 }}>
            <View style={{ width: s * 0.3, height: s * 0.14, borderTopWidth: 2.5, borderTopColor: color, borderLeftWidth: 2.5, borderLeftColor: color, borderRightWidth: 2.5, borderRightColor: color, borderRadius: s * 0.12, borderBottomWidth: 0 }} />
          </View>
          <View style={{ width: s * 0.1, height: s * 0.16, backgroundColor: color, borderBottomLeftRadius: s * 0.08, borderBottomRightRadius: s * 0.08, position: 'absolute', bottom: s * 0.06, left: s * 0.34 }} />
        </View>
      );
    case 'Joy':
      // Big open grin
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.68, height: s * 0.68, borderRadius: s * 0.34, borderWidth: 2.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', gap: s * 0.2, marginBottom: s * 0.04 }}>
              <View style={{ width: s * 0.09, height: s * 0.09, borderRadius: s * 0.05, backgroundColor: color }} />
              <View style={{ width: s * 0.09, height: s * 0.09, borderRadius: s * 0.05, backgroundColor: color }} />
            </View>
            <View style={{ width: s * 0.38, height: s * 0.2, borderBottomWidth: 2.5, borderBottomColor: color, borderLeftWidth: 2.5, borderLeftColor: color, borderRightWidth: 2.5, borderRightColor: color, borderRadius: s * 0.18, borderTopWidth: 0 }} />
          </View>
        </View>
      );
    case 'Drop Knee':
      // Right-angle bent knee shape
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.12, height: s * 0.46, backgroundColor: color, borderRadius: 3, position: 'absolute', left: s * 0.22, top: s * 0.08 }} />
          <View style={{ width: s * 0.46, height: s * 0.12, backgroundColor: color, borderRadius: 3, position: 'absolute', left: s * 0.22, top: s * 0.42 }} />
          <View style={{ width: s * 0.18, height: s * 0.18, borderRadius: s * 0.09, backgroundColor: color, position: 'absolute', right: s * 0.18, bottom: s * 0.08 }} />
        </View>
      );
    case 'Flagging':
      // Body with one leg extended diagonally (flag position)
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.12, height: s * 0.52, backgroundColor: color, borderRadius: 3, position: 'absolute', top: s * 0.04 }} />
          <View style={{ width: s * 0.58, height: s * 0.1, backgroundColor: color, borderRadius: 3, transform: [{ rotate: '35deg' }], position: 'absolute', bottom: s * 0.08, right: s * 0.06 }} />
          <View style={{ width: s * 0.2, height: s * 0.2, borderRadius: s * 0.1, backgroundColor: color, position: 'absolute', top: s * 0.05, left: s * 0.4 }} />
        </View>
      );
    case 'Anger':
      // Three short diagonal lines (brow furrow)
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', gap: s * 0.07 }}>
          {(['-18deg', '0deg', '18deg'] as const).map((rot, i) => (
            <View key={i} style={{ width: s * 0.6, height: s * 0.14, backgroundColor: color, borderRadius: 2, transform: [{ rotate: rot }] }} />
          ))}
        </View>
      );

    case 'Side Pulls':
      // Horizontal half-circle opening to the right — side-pull hold
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.58, height: s * 0.58, borderRadius: s * 0.29, borderWidth: s * 0.1, borderColor: color, borderLeftColor: 'transparent', borderTopColor: 'transparent' }} />
        </View>
      );
    case 'Gaston':
      // Two arrows pointing outward from center — pushing hands apart
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: s * 0.06 }}>
          <View style={{ alignItems: 'center', flexDirection: 'row' }}>
            <View style={{ width: s * 0.14, height: s * 0.13, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ width: 0, height: 0, borderTopWidth: s * 0.18, borderBottomWidth: s * 0.18, borderRightWidth: s * 0.28, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: color }} />
          </View>
          <View style={{ alignItems: 'center', flexDirection: 'row' }}>
            <View style={{ width: 0, height: 0, borderTopWidth: s * 0.18, borderBottomWidth: s * 0.18, borderLeftWidth: s * 0.28, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: color }} />
            <View style={{ width: s * 0.14, height: s * 0.13, backgroundColor: color, borderRadius: 1 }} />
          </View>
        </View>
      );
    case 'Small-feet':
      // Two small compact foot dots — tiny feet
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: s * 0.14 }}>
          <View style={{ width: s * 0.18, height: s * 0.32, backgroundColor: color, borderRadius: s * 0.09 }} />
          <View style={{ width: s * 0.18, height: s * 0.32, backgroundColor: color, borderRadius: s * 0.09 }} />
        </View>
      );
    case 'Small-fit':
      // Two vertical bars very close together — tight squeeze
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: s * 0.08 }}>
          <View style={{ width: s * 0.14, height: s * 0.64, backgroundColor: color, borderRadius: 3 }} />
          <View style={{ width: s * 0.14, height: s * 0.64, backgroundColor: color, borderRadius: 3 }} />
        </View>
      );
    case 'Peaceful':
      // Three gentle wavy lines — calm / serene
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', gap: s * 0.08 }}>
          {[s * 0.7, s * 0.54, s * 0.7].map((w, i) => (
            <View key={i} style={{ width: w, height: s * 0.1, backgroundColor: color, borderRadius: s * 0.05 }} />
          ))}
        </View>
      );
    case 'One-try':
      // Bold "1" — sent it first try
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.14, height: s * 0.56, backgroundColor: color, borderRadius: 3 }} />
          <View style={{ width: s * 0.28, height: s * 0.12, backgroundColor: color, borderRadius: 2, position: 'absolute', bottom: s * 0.1 }} />
          <View style={{ width: s * 0.22, height: s * 0.14, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '-45deg' }], position: 'absolute', top: s * 0.15, left: s * 0.26 }} />
        </View>
      );
    case 'Last-try':
      // Down arrow with a dot at bottom — made it on the last go
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', gap: s * 0.04 }}>
          <View style={{ width: s * 0.16, height: s * 0.38, backgroundColor: color, borderRadius: 2 }} />
          <View style={{ width: 0, height: 0, borderLeftWidth: s * 0.22, borderRightWidth: s * 0.22, borderTopWidth: s * 0.28, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: color, marginTop: -2 }} />
          <View style={{ width: s * 0.16, height: s * 0.16, borderRadius: s * 0.08, backgroundColor: color, marginTop: s * 0.04 }} />
        </View>
      );
    case 'OMG':
      // Three exclamation dots stacked — oh my god!
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: s * 0.12 }}>
          {[0, 1, 2].map(i => (
            <View key={i} style={{ alignItems: 'center', gap: s * 0.06 }}>
              <View style={{ width: s * 0.12, height: s * 0.38, backgroundColor: color, borderRadius: 2 }} />
              <View style={{ width: s * 0.12, height: s * 0.12, borderRadius: s * 0.06, backgroundColor: color }} />
            </View>
          ))}
        </View>
      );
    default:
      return <View style={{ width: s * 0.5, height: s * 0.5, borderRadius: s * 0.25, backgroundColor: color }} />;
  }
}

function BadgeIcon({
  label,
  count,
  selected,
  onPress,
  size = 'md',
}: {
  label: string;
  count?: number;
  selected?: boolean;
  onPress?: () => void;
  size?: 'xs' | 'sm' | 'md';
}) {
  const color   = BADGE_COLOR[label] ?? KBC.purple;
  const dim     = size === 'xs' ? 24 : size === 'sm' ? 36 : 44;
  const iconSz  = size === 'xs' ? 10 : size === 'sm' ? 15 : 19;
  const labelSz = 9;

  const disk = (
    <View style={[
      styles.badgeDisk,
      {
        width: dim, height: dim, borderRadius: dim / 2,
        borderColor: color,
        backgroundColor: selected ? color : '#fff',
        shadowColor: color,
      },
    ]}>
      <HoldIcon badge={label} color={selected ? '#fff' : color} size={iconSz} />
      {size !== 'xs' && count != null && count > 0 && (
        <View style={[styles.badgeCountDot, { backgroundColor: selected ? '#fff' : color }]}>
          <Text style={[styles.badgeCountDotText, { color: selected ? color : '#fff' }]}>{count}</Text>
        </View>
      )}
    </View>
  );

  const medal = size === 'xs' ? (
    <View style={{ opacity: selected ? 1 : 0.4 }}>{disk}</View>
  ) : (
    <View style={[styles.badgeIconWrap, { opacity: selected ? 1 : 0.4 }]}>
      {disk}
      <Text numberOfLines={2} style={[styles.badgeIconLabel, { fontSize: labelSz }, selected && { color, fontWeight: '800' }]}>
        {label}
      </Text>
    </View>
  );

  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.8}>{medal}</TouchableOpacity>;
  }
  return medal;
}


// ─── Gym Map ──────────────────────────────────────────────────────────────────
//
// Layout derived from the actual KBC floor plan (proportions from gym sketch).
// H/W ≈ 0.62.  All fractions are of the component W and H.
//
// Wall shapes are solid-colored, non-interactive decorations.
// Floating label chips are positioned in the interior floor space in front of
// each wall — these are the selectable elements.

type WallSpec = {
  id: string; color: string;
  // shape rect (all fracs of W / H)
  sx: number; sy: number; sw: number; sh: number; srot: number;
  // label chip: top-left corner (fracs of W / H) + rotation to align with wall direction
  // Chip is centered on the wall midpoint and rotated to run parallel to the wall.
  // Vertical walls: lrot=±90 (chip appears as a tall vertical pill).
  // Horizontal walls: lrot=0 (chip appears below the bar as a normal horizontal pill).
  // Diagonal: lrot matches srot.
  lx: number; ly: number; lrot: number;
};

const GYM_WALLS: WallSpec[] = [
  // Thin yellow vertical bar — chip runs vertically alongside, just inside the gym floor (right)
  { id:'Yellow Wall', color:'#b8a800', sx:0.012, sy:0.028, sw:0.021, sh:0.540, srot:  0, lx:-0.015, ly:0.335, lrot: -90 },
  // Wide cyan horizontal bar — chip sits centered below the bar
  { id:'Blue Wall',   color:'#0095bb', sx:0.033, sy:0.028, sw:0.352, sh:0.107, srot:  0, lx:0.124,  ly:0.099, lrot:   0 },
  // Thin green vertical bar, extended behind Cave Left — chip runs vertically on the gym-floor side (left)
  { id:'Green Wall',  color:'#2ea829', sx:0.380, sy:0.028, sw:0.019, sh:0.680, srot:  0, lx:0.230,  ly:0.334, lrot: -90 },
  // Diagonal Cave Left — chip perpendicular to wall (-84° = 90° off the +6° wall angle)
  { id:'Cave Left',   color:'#8b1a1a', sx:0.396, sy:0.158, sw:0.028, sh:0.545, srot:  6, lx:0.383,  ly:0.417, lrot: -84 },
  // Wide horizontal cave ceiling — chip sits centered below
  { id:'Cave Middle', color:'#8b1a1a', sx:0.432, sy:0.158, sw:0.552, sh:0.107, srot:  0, lx:0.595,  ly:0.230, lrot:   0 },
  // Thin right wall of cave — chip runs vertically, close to wall, lower half
  { id:'Cave Right',  color:'#8b1a1a', sx:0.975, sy:0.158, sw:0.021, sh:0.676, srot:  0, lx:0.833,  ly:0.505, lrot:  90 },
];

function GymMap({ selected, onToggle }: { selected: string[]; onToggle: (loc: string) => void }) {
  const W = Dimensions.get('window').width - 32;
  const H = Math.round(W * 0.62);

  const r = (frac: number, base: number) => Math.round(frac * base);

  return (
    <View style={{ width: W, height: H, backgroundColor: '#f0f0f0', borderRadius: 10, marginBottom: 4 }}>

      {/* ── Non-interactive floor elements ─────────────────────────────────── */}

      {/* Tension Board 2 — outlined white box, text rotated vertical */}
      <View style={{
        position: 'absolute',
        left: r(0.012, W), top: r(0.620, H),
        width: r(0.068, W), height: r(0.355, H),
        backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#555', borderRadius: 2,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        <Text style={{
          fontSize: 7, color: '#444', fontWeight: '700',
          width: r(0.355, H),          // width = box height (rotated)
          textAlign: 'center',
          transform: [{ rotate: '-90deg' }],
        }}>Tension Board 2</Text>
      </View>

      {/* Garage Door */}
      <View style={{
        position: 'absolute',
        left: r(0.380, W), top: r(0.876, H),
        width: r(0.438, W), height: r(0.096, H),
        backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#555', borderRadius: 2,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 8, color: '#444', fontWeight: '600' }}>Garage Door</Text>
      </View>

      {/* Door */}
      <View style={{
        position: 'absolute',
        left: r(0.831, W), top: r(0.876, H),
        width: r(0.143, W), height: r(0.096, H),
        backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#555', borderRadius: 2,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 8, color: '#444', fontWeight: '600' }}>Door</Text>
      </View>

      {/* ── Wall shapes (solid, purely visual) ─────────────────────────────── */}
      {GYM_WALLS.map(w => (
        <View
          key={`ws-${w.id}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: r(w.sx, W), top: r(w.sy, H),
            width: r(w.sw, W), height: r(w.sh, H),
            backgroundColor: w.color,
            borderRadius: 2,
            transform: w.srot ? [{ rotate: `${w.srot}deg` }] : undefined,
          }}
        />
      ))}

      {/* ── Selectable label chips — aligned with wall direction, centered on wall midpoint */}
      {GYM_WALLS.map(w => {
        const sel = selected.includes(w.id);
        return (
          <TouchableOpacity
            key={`wl-${w.id}`}
            activeOpacity={0.75}
            style={{
              position: 'absolute',
              left: r(w.lx, W), top: r(w.ly, H),
              backgroundColor: sel ? w.color : 'rgba(255,255,255,0.95)',
              borderRadius: 6,
              paddingHorizontal: 8, paddingVertical: 5,
              borderWidth: 1.5, borderColor: w.color,
              transform: w.lrot ? [{ rotate: `${w.lrot}deg` }] : undefined,
            }}
            onPress={() => onToggle(w.id)}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: sel ? '#fff' : w.color, letterSpacing: 0.2 }}>
              {w.id}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Climb Card (KBC boulders) ────────────────────────────────────────────────

function ClimbCard({ boulder, logs, uid, onPress, onLog }: {
  boulder: Boulder;
  logs: PersonalClimb[];
  uid: string;
  onPress: () => void;
  onLog: () => void;
}) {
  const agg   = useMemo(() => computeAggregates(logs), [logs]);
  const myLog = useMemo(() => getPersonalStatus(logs, uid), [logs, uid]);

  // Reconstruct per-user vote maps from logs (most recent log per user wins)
  const { gradeVotesMap, qualityVotesMap, badgeCounts } = useMemo(() => {
    const gv: Record<string, number>  = {};
    const qv: Record<string, number>  = {};
    const bc: Record<string, number>  = {};
    const seen = new Set<string>();
    for (const log of logs) {
      if (!seen.has(log.uid)) {
        seen.add(log.uid);
        if (log.gradeVote !== null) gv[log.uid] = log.gradeVote;
        if (log.quality > 0)        qv[log.uid] = log.quality;
      }
      for (const b of log.badges ?? []) bc[b] = (bc[b] ?? 0) + 1;
    }
    return { gradeVotesMap: gv, qualityVotesMap: qv, badgeCounts: bc };
  }, [logs]);

  const locsToShow = boulder.locations.slice(0, 2);
  const extraLocs  = boulder.locations.length - locsToShow.length;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>

      {/* Row 1: number · name · setter · personal status · Log button */}
      <View style={styles.cardRow}>
        <View style={styles.cardNumberBadge}>
          <Text style={styles.cardNumber}>#{boulder.number}</Text>
        </View>
        <View style={{ flexShrink: 1 }}>
          {boulder.name ? <Text style={styles.cardName} numberOfLines={1}>{boulder.name}</Text> : null}
          {boulder.setter ? <Text style={styles.cardSetter} numberOfLines={1}>by {boulder.setter}</Text> : null}
        </View>
        <View style={{ flex: 1 }} />
        {myLog && (
          <View style={[styles.statusPill, myLog.type === 'ascent' ? styles.statusPillSent : styles.statusPillTried]}>
            <Text style={styles.statusPillText}>{myLog.type === 'ascent' ? '✓ Sent' : '△ Tried'}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.cardLogBtn} onPress={onLog}>
          <Text style={styles.cardLogBtnText}>+ Log</Text>
        </TouchableOpacity>
      </View>

      {/* Row 2: grade bar */}
      <View style={{ marginTop: 8 }}>
        <GradeBar votes={gradeVotesMap} compact />
      </View>

      {/* Row 3: locations · quality · counts */}
      <View style={[styles.cardRow, { marginTop: 6 }]}>
        {locsToShow.map(loc => (
          <View key={loc} style={styles.locationChip}>
            <Text style={styles.locationChipText}>{loc}</Text>
          </View>
        ))}
        {extraLocs > 0 && <Text style={styles.locationChipText}>+{extraLocs}</Text>}
        <View style={{ flex: 1 }} />
        {Object.keys(qualityVotesMap).length > 0 && <StarRating votes={qualityVotesMap} compact />}
        {agg.sendCount > 0 && <Text style={styles.cardCountSent}>  ✓{agg.sendCount}</Text>}
        {agg.attemptCount > 0 && <Text style={styles.cardCountTried}>  △{agg.attemptCount}</Text>}
      </View>

      {/* Row 4: top badges (community) — up to 5, single row */}
      {agg.topBadges.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
          {agg.topBadges.slice(0, 5).map(b => (
            <BadgeIcon key={b} label={b} count={badgeCounts[b] ?? 0} selected size="sm" />
          ))}
        </View>
      )}

    </TouchableOpacity>
  );
}

// ─── Personal Problem Card ────────────────────────────────────────────────────

function PersonalProblemCard({ problem, logs, uid, onPress, onLog }: {
  problem: PersonalProblem;
  logs: PersonalClimb[];
  uid: string;
  onPress: () => void;
  onLog: () => void;
}) {
  const agg   = useMemo(() => computeAggregates(logs), [logs]);
  const myLog = useMemo(() => getPersonalStatus(logs, uid), [logs, uid]);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardRow}>
        <View style={{ flexShrink: 1, flex: 1 }}>
          <Text style={styles.cardName} numberOfLines={1}>{problem.name || 'Untitled'}</Text>
          <Text style={styles.cardSetter} numberOfLines={1}>
            {[problem.grade, problem.area || problem.local].filter(Boolean).join('  ·  ')}
          </Text>
        </View>
        {myLog && (
          <View style={[styles.statusPill, myLog.type === 'ascent' ? styles.statusPillSent : styles.statusPillTried]}>
            <Text style={styles.statusPillText}>{myLog.type === 'ascent' ? '✓ Sent' : '△ Tried'}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.cardLogBtn} onPress={onLog}>
          <Text style={styles.cardLogBtnText}>+ Log</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.cardRow, { marginTop: 4 }]}>
        <Text style={{ fontSize: 12, color: '#999' }}>
          {problem.discipline}  ·  {problem.gradeSystem}
        </Text>
        <View style={{ flex: 1 }} />
        {agg.sendCount > 0 && <Text style={styles.cardCountSent}>✓{agg.sendCount}</Text>}
        {agg.attemptCount > 0 && <Text style={styles.cardCountTried}>  △{agg.attemptCount}</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ─── Boulder Form Modal ───────────────────────────────────────────────────────

type FormMode = { type: 'add'; seasonId: string; nextNumber: number } | { type: 'edit'; boulder: Boulder };

function BoulderFormModal({
  mode,
  visible,
  onClose,
  onSaved,
  userUid,
  defaultSetter,
  canRemove,
}: {
  mode: FormMode;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  userUid: string;
  defaultSetter: string;
  canRemove: boolean;
}) {
  const insets = useSafeAreaInsets();
  const isEdit = mode.type === 'edit';
  const b      = isEdit ? mode.boulder : null;

  const [name,           setName]           = useState(b?.name      ?? '');
  const [setter,         setSetter]         = useState(b?.setter    ?? defaultSetter);
  const [locations,      setLocations]      = useState<string[]>(b?.locations ?? []);
  const [photo,          setPhoto]          = useState(b?.photo     ?? '');
  const [gradeIdx,       setGradeIdx]       = useState<number | null>(null);
  const [selectedBadges, setSelectedBadges] = useState<string[]>([]);
  const [badgesOpen,     setBadgesOpen]     = useState(false);
  const [saving,         setSaving]         = useState(false);

  // Comments thread
  const [comments,    setComments]    = useState<BoulderComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment,  setPostingComment]  = useState(false);

  // Re-sync when modal re-opens for a different boulder
  useEffect(() => {
    if (!visible) return;
    setName(b?.name      ?? '');
    setSetter(b?.setter  ?? defaultSetter);
    setLocations(b?.locations ?? []);
    setPhoto(b?.photo    ?? '');
    setGradeIdx(null);
    setSelectedBadges([]);
    setBadgesOpen(false);
    setCommentText('');
    if (isEdit && b) {
      setLoadingComments(true);
      getComments(b.id)
        .then(setComments)
        .catch(() => {})
        .finally(() => setLoadingComments(false));
    } else {
      setComments([]);
    }
  }, [visible, mode]);

  function toggleLocation(loc: string) {
    setLocations(prev =>
      prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc],
    );
  }


  async function handlePostComment() {
    const text = commentText.trim();
    if (!text || !isEdit || !b) return;
    setPostingComment(true);
    try {
      const c = await addComment(b.id, {
        uid: userUid, name: defaultSetter,
        text, createdAt: new Date().toISOString(),
      });
      setComments(prev => [...prev, c]);
      setCommentText('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setPostingComment(false);
    }
  }

  async function handleDeleteComment(c: BoulderComment) {
    if (!b) return;
    Alert.alert('Delete comment?', c.text.slice(0, 60), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteComment(b.id, c.id);
            setComments(prev => prev.filter(x => x.id !== c.id));
          } catch (e: any) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  }

  async function handleSave() {
    if (!setter.trim()) {
      Alert.alert('Setter required', 'Please enter the setter name.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (isEdit && b) {
        await updateBoulder(b.id, { name, setter, locations, photo, updatedAt: now });
      } else if (mode.type === 'add') {
        const newBoulder = await createBoulder({
          seasonId:  mode.seasonId,
          number:    mode.nextNumber,
          name, setter, setterEmail: '',
          createdAt: now,
          updatedAt: now,
          locations, photo,
          removed: false,
        });
        // Setter's initial grade + badge votes become the first log entry
        if (gradeIdx !== null || selectedBadges.length > 0) {
          const gradeLabel = gradeIdx !== null
            ? KBC_GRADE_LABELS[Math.round(Math.max(0, Math.min(4, gradeIdx)))]
            : '';
          await addClimb({
            uid:               userUid,
            locationId:        'kbc',
            boulderId:         newBoulder.id,
            sectorId:          '',
            timestamp:         now,
            name:              newBoulder.name || `Boulder #${newBoulder.number}`,
            establishedGrade:  gradeLabel,
            personalGrade:     gradeLabel,
            gradeVote:         gradeIdx,
            problemInternalId: newBoulder.internalId,
            quality:           0,
            effort:            '',
            type:              'ascent',
            project:           false,
            badges:            selectedBadges,
            comment:           '',
            createdAt:         now,
          });
        }
      }
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!isEdit || !b) return;
    Alert.alert('Remove Boulder', `Remove boulder #${b.number}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try { await removeBoulder(b.id); onSaved(); onClose(); }
          catch (e: any) { Alert.alert('Error', e.message); }
          finally { setSaving(false); }
        },
      },
    ]);
  }

  const title = isEdit ? `Boulder #${b?.number ?? ''}` : 'Add Boulder';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
        <View style={[styles.formSheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Header */}
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.formClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Name */}
            <Text style={styles.fieldLabel}>Name (optional)</Text>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. The Crimper"
              placeholderTextColor="#aaa"
            />

            {/* Setter */}
            <Text style={styles.fieldLabel}>Setter</Text>
            <TextInput
              style={styles.textInput}
              value={setter}
              onChangeText={setSetter}
              placeholder="Setter name"
              placeholderTextColor="#aaa"
            />

            {/* Locations */}
            <Text style={styles.fieldLabel}>Location</Text>
            <GymMap selected={locations} onToggle={toggleLocation} />

            {/* Setter's grade vote — create only */}
            {!isEdit && (
              <>
                <Text style={styles.fieldLabel}>Setter Grade (counts as first vote)</Text>
                <GradeBar
                  votes={gradeIdx !== null ? { [userUid]: gradeIdx } : {}}
                  userUid={userUid}
                  onVote={g => setGradeIdx(g < 0 ? null : g)}
                  interactive
                />
              </>
            )}

            {/* Setter's badge selection — create only */}
            {!isEdit && (() => {
              const cnt = selectedBadges.length;
              return (
                <>
                  <TouchableOpacity style={styles.collapseHeader} onPress={() => setBadgesOpen(o => !o)}>
                    <Text style={styles.fieldLabel}>Badges{cnt > 0 ? `  ·  ${cnt} selected` : ''}</Text>
                    <Text style={styles.collapseArrow}>{badgesOpen ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                  {badgesOpen && BADGE_GROUPS.map(group => (
                    <View key={group.title}>
                      <Text style={styles.badgeGroupLabel}>{group.title}</Text>
                      <View style={styles.badgeGrid}>
                        {group.badges.map(badge => {
                          const on = selectedBadges.includes(badge);
                          return (
                            <BadgeIcon
                              key={badge} label={badge} count={0} selected={on}
                              onPress={() => setSelectedBadges(prev =>
                                on ? prev.filter(x => x !== badge) : [...prev, badge],
                              )}
                            />
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </>
              );
            })()}

            {/* Photo URL */}
            <Text style={styles.fieldLabel}>Photo URL (optional)</Text>
            <TextInput
              style={styles.textInput}
              value={photo}
              onChangeText={setPhoto}
              placeholder="https://…"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
              keyboardType="url"
            />

            {/* Comments thread — edit mode only */}
            {isEdit && (
              <>
                <Text style={styles.fieldLabel}>Discussion</Text>
                {loadingComments ? (
                  <ActivityIndicator color={KBC.lime} style={{ marginVertical: 12 }} />
                ) : comments.length === 0 ? (
                  <Text style={styles.noComments}>No comments yet — be the first!</Text>
                ) : (
                  <View style={styles.threadList}>
                    {comments.map(c => {
                      const mine   = c.uid === userUid;
                      const canDel = mine || canRemove;
                      const time   = new Date(c.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
                      return (
                        <View key={c.id} style={[styles.threadItem, mine && styles.threadItemMine]}>
                          <View style={styles.threadBubble}>
                            <Text style={styles.threadName}>{c.name}  <Text style={styles.threadTime}>{time}</Text></Text>
                            <Text style={styles.threadText}>{c.text}</Text>
                          </View>
                          {canDel && (
                            <TouchableOpacity onPress={() => handleDeleteComment(c)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Text style={styles.threadDelete}>✕</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Post a comment */}
                <View style={styles.commentInputRow}>
                  <TextInput
                    style={styles.commentInput}
                    value={commentText}
                    onChangeText={setCommentText}
                    placeholder="Add a comment…"
                    placeholderTextColor="#aaa"
                    multiline
                  />
                  <TouchableOpacity
                    style={[styles.commentSendBtn, (!commentText.trim() || postingComment) && { opacity: 0.4 }]}
                    onPress={handlePostComment}
                    disabled={!commentText.trim() || postingComment}
                  >
                    {postingComment
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.commentSendText}>↑</Text>
                    }
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Actions */}
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.saveBtnText}>{isEdit ? 'Save Changes' : 'Add Boulder'}</Text>
              }
            </TouchableOpacity>

            {isEdit && canRemove && (
              <TouchableOpacity style={styles.removeBtn} onPress={handleRemove} disabled={saving}>
                <Text style={styles.removeBtnText}>Remove Boulder</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Season Picker Modal ──────────────────────────────────────────────────────

function SeasonPickerModal({
  visible,
  seasons,
  selectedId,
  canCreate,
  onSelect,
  onClose,
}: {
  visible: boolean;
  seasons: BoulderSeason[];
  selectedId: string | null;
  canCreate: boolean;
  onSelect: (season: BoulderSeason) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [creating, setCreating] = useState(false);
  const [newName,  setNewName]  = useState('');
  const [saving,   setSaving]   = useState(false);

  async function handleCreate() {
    const n = newName.trim();
    if (!n) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      // Optimistically handled by parent via onSelect
      const season = await createSeason(n);
      setCreating(false);
      setNewName('');
      onSelect(season);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Select Season</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.formClose}>✕</Text></TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            {seasons.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[styles.seasonRow, s.id === selectedId && styles.seasonRowSelected]}
                onPress={() => { onSelect(s); onClose(); }}
              >
                <Text style={[styles.seasonName, s.id === selectedId && styles.seasonNameSelected]}>{s.name}</Text>
                {s.id === selectedId && <Text style={styles.seasonCheck}>✓</Text>}
              </TouchableOpacity>
            ))}

            {canCreate && !creating && (
              <TouchableOpacity style={styles.newSeasonBtn} onPress={() => setCreating(true)}>
                <Text style={styles.newSeasonBtnText}>+ New Season</Text>
              </TouchableOpacity>
            )}

            {creating && (
              <View style={{ padding: 16, gap: 12 }}>
                <TextInput
                  style={styles.textInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="e.g. Summer 2026"
                  placeholderTextColor="#aaa"
                  autoFocus
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.saveBtn, { flex: 1, marginTop: 0 }, saving && { opacity: 0.6 }]}
                    onPress={handleCreate}
                    disabled={saving}
                  >
                    {saving
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.saveBtnText}>Create</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.removeBtn, { flex: 1, marginTop: 0 }]}
                    onPress={() => { setCreating(false); setNewName(''); }}
                  >
                    <Text style={styles.removeBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Filter Modal ─────────────────────────────────────────────────────────────

function FilterModal({
  visible,
  filters,
  onChange,
  onClose,
}: {
  visible: boolean;
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onClose: () => void;
}) {
  const insets  = useSafeAreaInsets();
  const [local,      setLocal]      = useState(filters);
  const [badgesOpen, setBadgesOpen] = useState(false);
  useEffect(() => { if (visible) setLocal(filters); }, [visible]);

  function toggleLoc(loc: string) {
    setLocal(f => ({
      ...f,
      locations: f.locations.includes(loc) ? f.locations.filter(l => l !== loc) : [...f.locations, loc],
    }));
  }
  function toggleGrade(g: number) {
    setLocal(f => ({
      ...f,
      grades: f.grades.includes(g) ? f.grades.filter(x => x !== g) : [...f.grades, g],
    }));
  }
  function toggleBadge(b: string) {
    setLocal(f => ({
      ...f,
      badges: f.badges.includes(b) ? f.badges.filter(x => x !== b) : [...f.badges, b],
    }));
  }
  function apply() { onChange(local); onClose(); }
  function clear()  { const c = DEFAULT_FILTER; setLocal(c); onChange(c); onClose(); }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.formHeader}>
          <Text style={styles.formTitle}>Filter Boulders</Text>
          <TouchableOpacity onPress={onClose}><Text style={styles.formClose}>✕</Text></TouchableOpacity>
        </View>

        <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.filterSectionLabel}>Location</Text>
          <GymMap selected={local.locations} onToggle={toggleLoc} />

          <Text style={styles.filterSectionLabel}>Grade</Text>
          <View style={styles.gradeFilterRow}>
            {GRADES.map((g, i) => {
              const on = local.grades.includes(i);
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.gradeFilterChip, { backgroundColor: GRADE_COLORS[i] }, on && styles.gradeFilterChipOn]}
                  onPress={() => toggleGrade(i)}
                >
                  <Text style={[styles.gradeFilterText, { color: GRADE_TEXT[i] }]}>{g}</Text>
                  {on && <Text style={[styles.gradeFilterCheck, { color: GRADE_TEXT[i] }]}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Badges — collapsed, grouped */}
          {(() => {
            const activeCount = local.badges.length;
            return (
              <>
                <TouchableOpacity style={styles.collapseHeader} onPress={() => setBadgesOpen(o => !o)}>
                  <Text style={styles.filterSectionLabel}>
                    Badges{activeCount > 0 ? `  ·  ${activeCount} active` : ''}
                  </Text>
                  <Text style={styles.collapseArrow}>{badgesOpen ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {badgesOpen && BADGE_GROUPS.map(group => (
                  <View key={group.title}>
                    <Text style={styles.badgeGroupLabel}>{group.title}</Text>
                    <View style={styles.badgeGrid}>
                      {group.badges.map(b => (
                        <BadgeIcon key={b} label={b} selected={local.badges.includes(b)} onPress={() => toggleBadge(b)} />
                      ))}
                    </View>
                  </View>
                ))}
              </>
            );
          })()}

          <Text style={styles.filterSectionLabel}>Setter</Text>
          <TextInput
            style={styles.textInput}
            value={local.setter}
            onChangeText={t => setLocal(f => ({ ...f, setter: t }))}
            placeholder="Search by setter name…"
            placeholderTextColor="#aaa"
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
            <TouchableOpacity style={[styles.saveBtn, { flex: 1, marginTop: 0 }]} onPress={apply}>
              <Text style={styles.saveBtnText}>Apply Filters</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.removeBtn, { flex: 1, marginTop: 0 }]} onPress={clear}>
              <Text style={[styles.removeBtnText, { fontSize: 16 }]}>Clear All</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Sort keys ────────────────────────────────────────────────────────────────

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'number',    label: 'Number'   },
  { key: 'name',      label: 'Name'     },
  { key: 'grade',     label: 'Grade'    },
  { key: 'setter',    label: 'Setter'   },
  { key: 'updatedAt', label: 'Modified' },
];

// ─── Boulder Log Modal ────────────────────────────────────────────────────────

const EFFORT_OPTIONS = ['Easy', 'Medium', 'Hard', 'Impossible'] as const;
const EFFORT_COLORS: Record<string, string> = {
  Easy: '#2ecc71', Medium: '#f39c12', Hard: '#e74c3c', Impossible: '#8e44ad',
};

function BoulderLogModal({
  visible, boulder, logs, onClose, onSaved, userUid, userName,
}: {
  visible: boolean;
  boulder: Boulder;
  logs: PersonalClimb[];
  onClose: () => void;
  onSaved: (newLog: PersonalClimb) => void;
  userUid: string;
  userName: string;
}) {
  const insets = useSafeAreaInsets();

  const [logDate,        setLogDate]        = useState(new Date());
  const [type,           setType]           = useState<'ascent' | 'attempt'>('ascent');
  const [gradeVotes,     setGradeVotes]     = useState<Record<string, number>>({});
  const [qualityVotes,   setQualityVotes]   = useState<Record<string, number>>({});
  const [selectedBadges, setSelectedBadges] = useState<string[]>([]);
  const [badgesOpen,     setBadgesOpen]     = useState(false);
  const [effort,         setEffort]         = useState('');
  const [project,        setProject]        = useState(false);
  const [publicComment,  setPublicComment]  = useState('');
  const [privateComment, setPrivateComment] = useState('');
  const [saving,         setSaving]         = useState(false);
  const [showDate,       setShowDate]       = useState(false);
  const [showTime,       setShowTime]       = useState(false);

  useEffect(() => {
    if (visible) {
      setLogDate(new Date());
      setType('ascent');
      setGradeVotes({});
      setQualityVotes({});
      setSelectedBadges([]);
      setBadgesOpen(false);
      setEffort('');
      setProject(false);
      setPublicComment('');
      setPrivateComment('');
    }
  }, [visible]);

  async function handleSave() {
    setSaving(true);
    try {
      const gradeIdx = userUid in gradeVotes ? gradeVotes[userUid] : null;
      const quality  = userUid in qualityVotes ? qualityVotes[userUid] : 0;
      const now      = new Date().toISOString();
      const ts       = logDate.toISOString();

      // Established grade = community avg from existing logs; personal grade = user's vote
      const communityAvg     = computeAggregates(logs).avgGrade;
      const establishedGrade = communityAvg !== null
        ? KBC_GRADE_LABELS[Math.round(Math.max(0, Math.min(4, communityAvg)))]
        : '';
      const personalGrade = gradeIdx !== null
        ? KBC_GRADE_LABELS[Math.round(Math.max(0, Math.min(4, gradeIdx)))]
        : '';

      const entry = await addClimb({
        uid: userUid,
        locationId: 'kbc',
        boulderId: boulder.id,
        sectorId: '',
        timestamp: ts,
        name: boulder.name || `Boulder #${boulder.number}`,
        establishedGrade,
        personalGrade,
        gradeVote: gradeIdx,
        problemInternalId: boulder.internalId,
        quality,
        effort,
        type,
        project,
        badges: selectedBadges,
        comment: privateComment,
        createdAt: now,
      });

      if (publicComment.trim()) {
        await addComment(boulder.id, {
          uid: userUid, name: userName,
          text: publicComment.trim(),
          createdAt: now,
        });
      }

      onSaved(entry);
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  const dateStr = logDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
          <View style={[styles.formSheet, { paddingBottom: insets.bottom + 16 }]}>

            {/* Header */}
            <View style={styles.formHeader}>
              <View>
                <Text style={styles.formTitle}>Log Climb</Text>
                <Text style={{ fontSize: 12, color: '#999', marginTop: 1 }}>
                  {boulder.name || `Boulder #${boulder.number}`}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.formClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

              {/* Sent / Attempted */}
              <View style={styles.logTypeRow}>
                <TouchableOpacity
                  style={[styles.logTypeBtn, type === 'ascent' && styles.logTypeBtnSent]}
                  onPress={() => setType('ascent')}
                >
                  <Text style={[styles.logTypeBtnText, type === 'ascent' && { color: '#fff' }]}>✓  Sent</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.logTypeBtn, type === 'attempt' && styles.logTypeBtnTried]}
                  onPress={() => setType('attempt')}
                >
                  <Text style={[styles.logTypeBtnText, type === 'attempt' && { color: '#fff' }]}>△  Attempted</Text>
                </TouchableOpacity>
              </View>

              {/* Date & Time */}
              <Text style={styles.fieldLabel}>When</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.textInput, { flex: 1, justifyContent: 'center' }]}
                  onPress={() => setShowDate(true)}
                >
                  <Text style={{ color: '#111', fontSize: 14 }}>{dateStr}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.textInput, { width: 100, justifyContent: 'center' }]}
                  onPress={() => setShowTime(true)}
                >
                  <Text style={{ color: '#111', fontSize: 14 }}>{timeStr}</Text>
                </TouchableOpacity>
              </View>

              {/* Proposed Grade */}
              <Text style={styles.fieldLabel}>Proposed Grade</Text>
              <GradeBar
                votes={gradeVotes}
                userUid={userUid}
                onVote={g => setGradeVotes(prev => {
                  const next = { ...prev };
                  if (g < 0) delete next[userUid]; else next[userUid] = g;
                  return next;
                })}
                interactive
              />

              {/* Quality */}
              <Text style={styles.fieldLabel}>Quality</Text>
              <StarRating
                votes={qualityVotes}
                userUid={userUid}
                onVote={stars => setQualityVotes(prev => {
                  const next = { ...prev };
                  if (stars === 0) delete next[userUid]; else next[userUid] = stars;
                  return next;
                })}
              />

              {/* Effort */}
              <Text style={styles.fieldLabel}>Effort</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {EFFORT_OPTIONS.map(e => {
                  const sel = effort === e;
                  return (
                    <TouchableOpacity
                      key={e}
                      style={[styles.effortChip, sel && { backgroundColor: EFFORT_COLORS[e], borderColor: EFFORT_COLORS[e] }]}
                      onPress={() => setEffort(sel ? '' : e)}
                    >
                      <Text style={[styles.effortChipText, sel && { color: '#fff' }]}>{e}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Badges */}
              {(() => {
                const cnt = selectedBadges.length;
                return (
                  <>
                    <TouchableOpacity style={styles.collapseHeader} onPress={() => setBadgesOpen(o => !o)}>
                      <Text style={styles.fieldLabel}>
                        Badges{cnt > 0 ? `  ·  ${cnt} selected` : ''}
                      </Text>
                      <Text style={styles.collapseArrow}>{badgesOpen ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {badgesOpen && BADGE_GROUPS.map(group => (
                      <View key={group.title}>
                        <Text style={styles.badgeGroupLabel}>{group.title}</Text>
                        <View style={styles.badgeGrid}>
                          {group.badges.map(badge => {
                            const on = selectedBadges.includes(badge);
                            return (
                              <BadgeIcon
                                key={badge}
                                label={badge}
                                count={0}
                                selected={on}
                                onPress={() => setSelectedBadges(prev =>
                                  on ? prev.filter(b => b !== badge) : [...prev, badge],
                                )}
                              />
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </>
                );
              })()}

              {/* Project */}
              <TouchableOpacity style={styles.projectRow} onPress={() => setProject(p => !p)}>
                <View style={[styles.checkbox, project && styles.checkboxChecked]}>
                  {project && <Text style={styles.checkboxCheck}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.projectLabel}>Project</Text>
                  <Text style={styles.projectSub}>Still working on it — save for your logbook</Text>
                </View>
              </TouchableOpacity>

              {/* Public comment */}
              <Text style={styles.fieldLabel}>Public Comment</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={publicComment}
                onChangeText={setPublicComment}
                placeholder="Share your thoughts… posted to the boulder discussion"
                placeholderTextColor="#aaa"
                multiline
              />

              {/* Private notes */}
              <Text style={styles.fieldLabel}>Personal Notes</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={privateComment}
                onChangeText={setPrivateComment}
                placeholder="Private notes — only visible to you"
                placeholderTextColor="#aaa"
                multiline
              />

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>Log Climb</Text>
                }
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
      <TimePickerModal
        visible={showTime}
        value={logDate}
        onChange={d => setLogDate(d)}
        onClose={() => setShowTime(false)}
        allHours
      />
    </>
  );
}

// ─── Personal Log Modal ───────────────────────────────────────────────────────

function PersonalLogModal({
  visible, problem, onClose, onSaved, userUid,
}: {
  visible: boolean;
  problem: PersonalProblem;
  onClose: () => void;
  onSaved: (newLog: PersonalClimb) => void;
  userUid: string;
}) {
  const insets = useSafeAreaInsets();
  const [logDate, setLogDate] = useState(new Date());
  const [type,    setType]    = useState<'ascent' | 'attempt'>('ascent');
  const [effort,  setEffort]  = useState('');
  const [project, setProject] = useState(false);
  const [comment, setComment] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  useEffect(() => {
    if (visible) {
      setLogDate(new Date()); setType('ascent');
      setEffort(''); setProject(false); setComment('');
    }
  }, [visible]);

  async function handleSave() {
    setSaving(true);
    try {
      const now   = new Date().toISOString();
      const entry = await addClimb({
        uid:               userUid,
        locationId:        problem.local,
        boulderId:         '',
        sectorId:          problem.area,
        timestamp:         logDate.toISOString(),
        name:              problem.name,
        establishedGrade:  problem.grade,
        personalGrade:     problem.grade,
        gradeVote:         null,
        problemInternalId: problem.internalId,
        quality:           0,
        effort,
        type,
        project,
        badges:            [],
        comment,
        createdAt:         now,
      });
      onSaved(entry);
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  const dateStr = logDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
          <View style={[styles.formSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.formHeader}>
              <View>
                <Text style={styles.formTitle}>Log Session</Text>
                <Text style={{ fontSize: 12, color: '#999', marginTop: 1 }}>{problem.name}</Text>
              </View>
              <TouchableOpacity onPress={onClose}><Text style={styles.formClose}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView style={styles.formBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.logTypeRow}>
                <TouchableOpacity style={[styles.logTypeBtn, type === 'ascent' && styles.logTypeBtnSent]} onPress={() => setType('ascent')}>
                  <Text style={[styles.logTypeBtnText, type === 'ascent' && { color: '#fff' }]}>✓  Sent</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.logTypeBtn, type === 'attempt' && styles.logTypeBtnTried]} onPress={() => setType('attempt')}>
                  <Text style={[styles.logTypeBtnText, type === 'attempt' && { color: '#fff' }]}>△  Attempted</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.fieldLabel}>When</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={[styles.textInput, { flex: 1, justifyContent: 'center' }]} onPress={() => setShowDate(true)}>
                  <Text style={{ color: '#111', fontSize: 14 }}>{dateStr}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.textInput, { width: 100, justifyContent: 'center' }]} onPress={() => setShowTime(true)}>
                  <Text style={{ color: '#111', fontSize: 14 }}>{timeStr}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.fieldLabel}>Effort</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {EFFORT_OPTIONS.map(e => {
                  const sel = effort === e;
                  return (
                    <TouchableOpacity key={e} style={[styles.effortChip, sel && { backgroundColor: EFFORT_COLORS[e], borderColor: EFFORT_COLORS[e] }]} onPress={() => setEffort(sel ? '' : e)}>
                      <Text style={[styles.effortChipText, sel && { color: '#fff' }]}>{e}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity style={styles.projectRow} onPress={() => setProject(p => !p)}>
                <View style={[styles.checkbox, project && styles.checkboxChecked]}>
                  {project && <Text style={styles.checkboxCheck}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.projectLabel}>Project</Text>
                  <Text style={styles.projectSub}>Still working on it</Text>
                </View>
              </TouchableOpacity>
              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput style={[styles.textInput, styles.textArea]} value={comment} onChangeText={setComment} placeholder="Private notes…" placeholderTextColor="#aaa" multiline />
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Log Session</Text>}
              </TouchableOpacity>
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <DatePickerModal visible={showDate} value={logDate} onChange={d => setLogDate(d)} onClose={() => setShowDate(false)} allowPast />
      <TimePickerModal visible={showTime} value={logDate} onChange={d => setLogDate(d)} onClose={() => setShowTime(false)} allHours />
    </>
  );
}

// ─── Locations Modal ──────────────────────────────────────────────────────────

function LocationsModal({
  visible, onClose, uid, locations, onLocationsChanged, selectedId, onSelectId,
}: {
  visible: boolean;
  onClose: () => void;
  uid: string;
  locations: ClimbLocation[];
  onLocationsChanged: (locs: ClimbLocation[]) => void;
  selectedId: string;
  onSelectId: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();

  // Editor state
  const [editing,     setEditing]     = useState<ClimbLocation | null>(null);
  const [isNew,       setIsNew]       = useState(false);
  const [name,        setName]        = useState('');
  const [type,        setType]        = useState<'indoor' | 'outdoor'>('indoor');
  const [address,     setAddress]     = useState('');
  const [gps,         setGps]         = useState('');
  const [sectors,     setSectors]     = useState<Sector[]>([]);
  const [newSector,   setNewSector]   = useState('');
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(false);

  function openNew() {
    setEditing(null); setIsNew(true);
    setName(''); setType('indoor'); setAddress(''); setGps('');
    setSectors([]); setNewSector('');
  }

  function openEdit(loc: ClimbLocation) {
    setEditing(loc); setIsNew(false);
    setName(loc.name); setType(loc.type); setAddress(loc.address); setGps(loc.gps);
    setSectors([...loc.sectors]); setNewSector('');
  }

  function cancelEdit() { setEditing(null); setIsNew(false); }

  function addSector() {
    const s = newSector.trim();
    if (!s || sectors.some(x => x.name === s)) { setNewSector(''); return; }
    setSectors(prev => [...prev, { name: s, discipline: 'boulder', gradeSystem: 'v-scale' }]);
    setNewSector('');
  }

  function removeSector(name: string) {
    setSectors(prev => prev.filter(x => x.name !== name));
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (isNew) {
        const doc = await createLocation({
          uid, name: name.trim(), type, sectors, address: address.trim(),
          gps: gps.trim(), useBadges: false, createdAt: now,
        });
        onLocationsChanged([...locations, doc]);
      } else if (editing) {
        await updateLocation(editing.id, {
          name: name.trim(), type, sectors, address: address.trim(), gps: gps.trim(),
        });
        onLocationsChanged(locations.map(l => l.id === editing.id
          ? { ...l, name: name.trim(), type, sectors, address: address.trim(), gps: gps.trim() }
          : l));
      }
      cancelEdit();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    Alert.alert('Delete Location', `Delete "${editing.name}"? Problems linked to it are not affected.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setDeleting(true);
        try {
          await deleteLocation(editing.id);
          if (selectedId === editing.id) onSelectId('all');
          onLocationsChanged(locations.filter(l => l.id !== editing.id));
          cancelEdit();
        } catch (e: any) {
          Alert.alert('Error', e.message);
        } finally {
          setDeleting(false);
        }
      }},
    ]);
  }

  const showForm = isNew || !!editing;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={[locStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Header */}
          <View style={locStyles.sheetHeader}>
            <Text style={locStyles.sheetTitle}>
              {showForm ? (isNew ? 'New Location' : 'Edit Location') : 'Locations'}
            </Text>
            {showForm
              ? <TouchableOpacity onPress={cancelEdit}><Text style={locStyles.cancelLink}>Cancel</Text></TouchableOpacity>
              : <TouchableOpacity onPress={onClose}><Text style={locStyles.cancelLink}>Done</Text></TouchableOpacity>
            }
          </View>

          {showForm ? (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
              {/* Name */}
              <View>
                <Text style={locStyles.label}>Name *</Text>
                <TextInput
                  style={locStyles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Red River Gorge"
                  placeholderTextColor="#666"
                />
              </View>

              {/* Type */}
              <View>
                <Text style={locStyles.label}>Type</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['indoor', 'outdoor'] as const).map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[locStyles.chip, type === t && locStyles.chipActive]}
                      onPress={() => setType(t)}
                    >
                      <Text style={[locStyles.chipText, type === t && locStyles.chipTextActive]}>
                        {t === 'indoor' ? 'Indoors' : 'Outdoors'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Areas / Sectors */}
              <View>
                <Text style={locStyles.label}>Areas</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {sectors.map(sec => (
                    <TouchableOpacity
                      key={sec.name}
                      style={locStyles.sectorChip}
                      onPress={() => removeSector(sec.name)}
                    >
                      <Text style={locStyles.sectorChipText}>{sec.name}  ×</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[locStyles.input, { flex: 1 }]}
                    value={newSector}
                    onChangeText={setNewSector}
                    placeholder="Add area / sector"
                    placeholderTextColor="#666"
                    onSubmitEditing={addSector}
                    returnKeyType="done"
                  />
                  <TouchableOpacity style={locStyles.addSectorBtn} onPress={addSector}>
                    <Text style={locStyles.addSectorBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Address */}
              <View>
                <Text style={locStyles.label}>Address <Text style={{ color: '#666', fontWeight: '400' }}>(optional)</Text></Text>
                <TextInput
                  style={locStyles.input}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Street address or region"
                  placeholderTextColor="#666"
                />
              </View>

              {/* GPS */}
              <View>
                <Text style={locStyles.label}>GPS <Text style={{ color: '#666', fontWeight: '400' }}>(optional)</Text></Text>
                <TextInput
                  style={locStyles.input}
                  value={gps}
                  onChangeText={setGps}
                  placeholder="lat, lon"
                  placeholderTextColor="#666"
                  keyboardType="default"
                />
              </View>

              <TouchableOpacity
                style={[locStyles.saveBtn, saving && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={locStyles.saveBtnText}>{saving ? 'Saving…' : isNew ? 'Create Location' : 'Save Changes'}</Text>
              </TouchableOpacity>

              {editing && (
                <TouchableOpacity
                  style={[locStyles.deleteBtn, deleting && { opacity: 0.5 }]}
                  onPress={handleDelete}
                  disabled={deleting}
                >
                  <Text style={locStyles.deleteBtnText}>{deleting ? 'Deleting…' : 'Delete Location'}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 8 }}>
              {/* All Locations filter chip */}
              <TouchableOpacity
                style={[locStyles.locRow, selectedId === 'all' && locStyles.locRowActive]}
                onPress={() => { onSelectId('all'); onClose(); }}
              >
                <Text style={[locStyles.locName, selectedId === 'all' && { color: KBC.lime }]}>
                  All Locations
                </Text>
              </TouchableOpacity>

              {locations.map(loc => (
                <View key={loc.id} style={locStyles.locItem}>
                  <TouchableOpacity
                    style={[locStyles.locRow, selectedId === loc.id && locStyles.locRowActive]}
                    onPress={() => { onSelectId(loc.id); onClose(); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[locStyles.locName, selectedId === loc.id && { color: KBC.lime }]}>
                        {loc.name}
                      </Text>
                      <Text style={locStyles.locMeta}>
                        {loc.type === 'indoor' ? 'Indoors' : 'Outdoors'}
                        {loc.sectors.length > 0 ? `  ·  ${loc.sectors.length} area${loc.sectors.length !== 1 ? 's' : ''}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => openEdit(loc)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={locStyles.editLink}>Edit</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                </View>
              ))}

              {locations.length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Text style={{ color: '#666', fontSize: 14 }}>No locations yet.</Text>
                </View>
              )}

              <TouchableOpacity style={[locStyles.saveBtn, { marginTop: 8 }]} onPress={openNew}>
                <Text style={locStyles.saveBtnText}>+ New Location</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const locStyles = StyleSheet.create({
  sheet: {
    flex: 1, marginTop: 80,
    backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#333',
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cancelLink: { color: KBC.lime, fontSize: 15, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', color: '#aaa', marginBottom: 6 },
  input: {
    backgroundColor: '#2a2a2a', color: '#fff', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    borderWidth: 1, borderColor: '#333',
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#444',
  },
  chipActive: { backgroundColor: KBC.lime + '33', borderColor: KBC.lime },
  chipText:       { color: '#888', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: KBC.lime },
  sectorChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#333', borderWidth: 1, borderColor: '#555',
  },
  sectorChipText: { color: '#ddd', fontSize: 13 },
  addSectorBtn: {
    backgroundColor: KBC.lime + '33', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: KBC.lime,
  },
  addSectorBtnText: { color: KBC.lime, fontSize: 13, fontWeight: '700' },
  saveBtn: {
    backgroundColor: KBC.lime, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  deleteBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#d44',
  },
  deleteBtnText: { color: '#d44', fontSize: 15, fontWeight: '700' },
  locRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#242424', borderRadius: 12, padding: 14, gap: 8,
    borderWidth: 1, borderColor: '#333',
  },
  locRowActive: { borderColor: KBC.lime },
  locItem: {},
  locName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  locMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  editLink: { color: KBC.lime, fontSize: 13, fontWeight: '600' },
});

// ─── New Problem Modal ────────────────────────────────────────────────────────

const DISCIPLINES: ClimbDiscipline[] = ['boulder', 'top-rope', 'lead', 'trad'];

function NewProblemModal({
  visible, onClose, onSaved, onDeleted, uid, locations, editing,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: (problem: PersonalProblem) => void;
  onDeleted?: (id: string) => void;
  uid: string;
  locations: ClimbLocation[];
  editing?: PersonalProblem;
}) {
  const insets  = useSafeAreaInsets();
  const isEdit  = !!editing;

  const [name,        setName]        = useState('');
  const [locationId,  setLocationId]  = useState('');   // ClimbLocation.id or ''
  const [customLocal, setCustomLocal] = useState('');   // free-text fallback
  const [area,        setArea]        = useState('');
  const [customArea,  setCustomArea]  = useState('');
  const [discipline,  setDiscipline]  = useState<ClimbDiscipline>('boulder');
  const [gradeSystem, setGradeSystem] = useState<GradeSystem>('v-scale');
  const [grade,       setGrade]       = useState('');
  const [description, setDescription] = useState('');
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(false);

  const selectedLoc = locations.find(l => l.id === locationId) ?? null;
  const sectors     = selectedLoc?.sectors ?? [];
  const gradeSystems: GradeSystem[] = discipline === 'boulder' ? ['v-scale', 'font'] : ['yosemite'];
  const gradeOptions = gradesForSystem(gradeSystem);

  useEffect(() => {
    if (discipline === 'boulder' && !['v-scale', 'font'].includes(gradeSystem))
      setGradeSystem('v-scale');
    else if (discipline !== 'boulder' && gradeSystem !== 'yosemite')
      setGradeSystem('yosemite');
  }, [discipline]);

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name);
      // Try to match to a saved location by name
      const match = locations.find(l => l.name === editing.local);
      setLocationId(match?.id ?? '');
      setCustomLocal(match ? '' : editing.local);
      setArea(editing.area);
      setCustomArea('');
      setDiscipline(editing.discipline);
      setGradeSystem(editing.gradeSystem);
      setGrade(editing.grade);
      setDescription(editing.description);
    } else {
      setName(''); setLocationId(''); setCustomLocal(''); setArea(''); setCustomArea('');
      setDiscipline('boulder'); setGradeSystem('v-scale'); setGrade(''); setDescription('');
    }
  }, [visible, editing]);

  // When location changes, reset area
  useEffect(() => { setArea(''); setCustomArea(''); }, [locationId]);

  // Derive final local / area strings
  const finalLocal = (selectedLoc?.name ?? customLocal.trim()) || 'Unknown';
  const finalArea  = area || customArea.trim();

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (isEdit && editing) {
        await updateProblem(editing.id, {
          name: name.trim(), local: finalLocal, area: finalArea,
          discipline, gradeSystem, grade, description: description.trim(), updatedAt: now,
        });
        onSaved({ ...editing, name: name.trim(), local: finalLocal, area: finalArea, discipline, gradeSystem, grade, description: description.trim(), updatedAt: now });
      } else {
        const p = await createPersonalProblem({
          uid, name: name.trim(), local: finalLocal, area: finalArea,
          discipline, gradeSystem, grade, description: description.trim(),
          permissions: { view: 'private', edit: 'owner' },
          createdAt: now, updatedAt: now,
        });
        onSaved(p);
      }
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!editing) return;
    Alert.alert('Delete Problem', `Delete "${editing.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setDeleting(true);
        try {
          await deleteProblem(editing.id);
          onDeleted?.(editing.id);
          onClose();
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setDeleting(false); }
      }},
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
        <View style={[styles.formSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>{isEdit ? 'Edit Problem' : 'New Problem'}</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.formClose}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView style={styles.formBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput style={styles.textInput} value={name} onChangeText={setName} placeholder="e.g. Juggernaut" placeholderTextColor="#aaa" />

            <Text style={styles.fieldLabel}>Location</Text>
            {locations.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}>
                  {locations.map(l => (
                    <TouchableOpacity
                      key={l.id}
                      style={[styles.selectChip, locationId === l.id && styles.selectChipOn]}
                      onPress={() => setLocationId(prev => prev === l.id ? '' : l.id)}
                    >
                      <Text style={[styles.selectChipText, locationId === l.id && styles.selectChipTextOn]}>{l.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
            {!selectedLoc && (
              <TextInput style={styles.textInput} value={customLocal} onChangeText={setCustomLocal}
                placeholder="Type location name…" placeholderTextColor="#aaa" />
            )}

            <Text style={styles.fieldLabel}>Area / Sector</Text>
            {sectors.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}>
                  {sectors.map(s => (
                    <TouchableOpacity
                      key={s.name}
                      style={[styles.selectChip, area === s.name && styles.selectChipOn]}
                      onPress={() => setArea(prev => prev === s.name ? '' : s.name)}
                    >
                      <Text style={[styles.selectChipText, area === s.name && styles.selectChipTextOn]}>{s.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
            {(!area || !sectors.length) && (
              <TextInput style={styles.textInput} value={customArea} onChangeText={setCustomArea}
                placeholder="Area name (optional)" placeholderTextColor="#aaa" />
            )}

            <Text style={styles.fieldLabel}>Discipline</Text>
            <View style={styles.chipGrid}>
              {DISCIPLINES.map(d => (
                <TouchableOpacity key={d} style={[styles.selectChip, discipline === d && styles.selectChipOn]} onPress={() => setDiscipline(d)}>
                  <Text style={[styles.selectChipText, discipline === d && styles.selectChipTextOn]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Grade System</Text>
            <View style={styles.chipGrid}>
              {gradeSystems.map(gs => (
                <TouchableOpacity key={gs} style={[styles.selectChip, gradeSystem === gs && styles.selectChipOn]} onPress={() => setGradeSystem(gs)}>
                  <Text style={[styles.selectChipText, gradeSystem === gs && styles.selectChipTextOn]}>{gs}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Grade</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}>
                {gradeOptions.map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.selectChip, grade === g && styles.selectChipOn]}
                    onPress={() => setGrade(prev => prev === g ? '' : g)}
                  >
                    <Text style={[styles.selectChipText, grade === g && styles.selectChipTextOn]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.fieldLabel}>Description (optional)</Text>
            <TextInput style={[styles.textInput, styles.textArea]} value={description} onChangeText={setDescription}
              placeholder="Beta, notes…" placeholderTextColor="#aaa" multiline />

            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving || deleting}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{isEdit ? 'Save Changes' : 'Create Problem'}</Text>}
            </TouchableOpacity>

            {isEdit && (
              <TouchableOpacity style={[styles.removeBtn, deleting && { opacity: 0.6 }]} onPress={handleDelete} disabled={saving || deleting}>
                {deleting ? <ActivityIndicator color="#e00" /> : <Text style={styles.removeBtnText}>Delete Problem</Text>}
              </TouchableOpacity>
            )}

            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BouldersScreen() {
  const { user }           = useAuth();
  const { profile }        = useProfile();
  const isPrivileged       = isAdmin(user?.email) || (profile?.isSupervisor ?? false);
  const isAdminUser        = isAdmin(user?.email);
  const userUid            = user?.id ?? '';
  const defaultSetter      = profile?.preferredName || user?.name || '';

  const [mode,                setMode]                = useState<'kbc' | 'personal'>('kbc');
  const [seasons,             setSeasons]             = useState<BoulderSeason[]>([]);
  const [selectedSeason,      setSelectedSeason]      = useState<BoulderSeason | null>(null);
  const [boulders,            setBoulders]            = useState<Boulder[]>([]);
  const [logsByProblem,       setLogsByProblem]       = useState<Record<string, PersonalClimb[]>>({});
  const [myProblems,          setMyProblems]          = useState<PersonalProblem[]>([]);
  const [personalLogsByProblem, setPersonalLogsByProblem] = useState<Record<string, PersonalClimb[]>>({});
  const [loading,             setLoading]             = useState(true);
  const [showSeasonPicker,    setShowSeasonPicker]    = useState(false);
  const [formMode,            setFormMode]            = useState<FormMode | null>(null);
  const [nextNumber,          setNextNumber]          = useState(1);
  const [showFilter,          setShowFilter]          = useState(false);
  const [filters,             setFilters]             = useState<FilterState>(DEFAULT_FILTER);
  const [sortKey,             setSortKey]             = useState<SortKey>('number');
  const [sortDir,             setSortDir]             = useState<SortDir>('desc');
  const [logBoulder,          setLogBoulder]          = useState<Boulder | null>(null);
  const [logProblem,          setLogProblem]          = useState<PersonalProblem | null>(null);
  const [showNewProblem,      setShowNewProblem]      = useState(false);
  const [editingProblem,      setEditingProblem]      = useState<PersonalProblem | undefined>(undefined);
  const [myLocations,         setMyLocations]         = useState<ClimbLocation[]>([]);
  const [personalLocalFilter, setPersonalLocalFilter] = useState<string>('all');
  const [showLocations,       setShowLocations]       = useState(false);

  // Load saved filters once
  useEffect(() => {
    loadSavedFilters().then(setFilters);
  }, []);

  // Save filters whenever they change
  useEffect(() => { saveFilters(filters); }, [filters]);

  async function loadData(forceSeason?: BoulderSeason) {
    setLoading(true);
    try {
      const [s, kbcLogs] = await Promise.all([getSeasons(), getKBCLogs()]);
      setSeasons(s);

      const map: Record<string, PersonalClimb[]> = {};
      for (const log of kbcLogs) {
        if (!log.problemInternalId) continue;
        (map[log.problemInternalId] ??= []).push(log);
      }
      setLogsByProblem(map);

      const target = forceSeason ?? selectedSeason ?? (s.length ? s[s.length - 1] : null);
      if (target) {
        setSelectedSeason(target);
        const b = await getBouldersForSeason(target.id);
        setBoulders(b);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadPersonalData() {
    setLoading(true);
    try {
      const [problems, myLogs, locs] = await Promise.all([
        getMyProblems(userUid), getMyLogs(userUid), getMyLocations(userUid),
      ]);
      setMyProblems(problems);
      setMyLocations(locs);
      const map: Record<string, PersonalClimb[]> = {};
      for (const log of myLogs) {
        if (!log.problemInternalId) continue;
        (map[log.problemInternalId] ??= []).push(log);
      }
      setPersonalLogsByProblem(map);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));

  useEffect(() => {
    if (mode === 'personal' && myProblems.length === 0) loadPersonalData();
  }, [mode]);

  async function handleSelectSeason(season: BoulderSeason) {
    setSelectedSeason(season);
    setLoading(true);
    try {
      const [b, kbcLogs] = await Promise.all([getBouldersForSeason(season.id), getKBCLogs()]);
      setBoulders(b);
      const map: Record<string, PersonalClimb[]> = {};
      for (const log of kbcLogs) {
        if (!log.problemInternalId) continue;
        (map[log.problemInternalId] ??= []).push(log);
      }
      setLogsByProblem(map);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function openAddForm() {
    if (!selectedSeason) { Alert.alert('No season selected', 'Please select or create a season first.'); return; }
    const n = await getNextBoulderNumber(selectedSeason.id);
    setNextNumber(n);
    setFormMode({ type: 'add', seasonId: selectedSeason.id, nextNumber: n });
  }

  function handleSortPress(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'number' || key === 'updatedAt' ? 'desc' : 'asc'); }
  }

  // ── Pre-computed aggregates per boulder (for filter/sort) ───────────────────
  const boulderAggregates = useMemo(() => {
    const map: Record<string, ClimbAggregates> = {};
    for (const b of boulders) {
      map[b.internalId] = computeAggregates(logsByProblem[b.internalId] ?? []);
    }
    return map;
  }, [boulders, logsByProblem]);

  // ── Derived list ────────────────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = [...boulders];

    // Filter
    if (filters.locations.length)
      list = list.filter(b => b.locations.some(l => filters.locations.includes(l)));
    if (filters.grades.length) {
      list = list.filter(b => {
        const avg = boulderAggregates[b.internalId]?.avgGrade;
        return avg !== null && avg !== undefined && filters.grades.includes(Math.round(avg));
      });
    }
    if (filters.badges.length) {
      list = list.filter(b => {
        const logs = logsByProblem[b.internalId] ?? [];
        return filters.badges.some(ba => logs.some(log => (log.badges ?? []).includes(ba)));
      });
    }
    if (filters.setter)
      list = list.filter(b => b.setter.toLowerCase().includes(filters.setter.toLowerCase()));

    // Sort
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'number':    return dir * (a.number - b.number);
        case 'name':      return dir * (a.name || `#${a.number}`).localeCompare(b.name || `#${b.number}`);
        case 'grade': {
          const ag = boulderAggregates[a.internalId]?.avgGrade ?? -1;
          const bg = boulderAggregates[b.internalId]?.avgGrade ?? -1;
          return dir * (ag - bg);
        }
        case 'setter':    return dir * a.setter.localeCompare(b.setter);
        case 'updatedAt': return dir * a.updatedAt.localeCompare(b.updatedAt);
      }
    });
    return list;
  }, [boulders, filters, sortKey, sortDir, boulderAggregates, logsByProblem]);

  const fc = filterCount(filters);

  return (
    <View style={styles.screen}>
      {/* Top bar */}
      <View style={styles.topBar}>
        {/* KBC / Personal toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'kbc' && styles.modeBtnActive]}
            onPress={() => setMode('kbc')}
          >
            <Text style={[styles.modeBtnText, mode === 'kbc' && styles.modeBtnTextActive]}>KBC</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'personal' && styles.modeBtnActive]}
            onPress={() => setMode('personal')}
          >
            <Text style={[styles.modeBtnText, mode === 'personal' && styles.modeBtnTextActive]}>Personal</Text>
          </TouchableOpacity>
        </View>

        {mode === 'kbc' && (
          <TouchableOpacity style={styles.seasonBtn} onPress={() => setShowSeasonPicker(true)}>
            <Text style={styles.seasonBtnText} numberOfLines={1}>
              {selectedSeason ? selectedSeason.name : 'Select Season'}
            </Text>
            <Text style={styles.seasonArrow}>▾</Text>
          </TouchableOpacity>
        )}

        {mode === 'kbc' && (
          <TouchableOpacity
            style={[styles.filterBtn, fc > 0 && styles.filterBtnActive]}
            onPress={() => setShowFilter(true)}
          >
            <Text style={[styles.filterBtnText, fc > 0 && styles.filterBtnTextActive]}>
              Filter{fc > 0 ? ` (${fc})` : ''}
            </Text>
          </TouchableOpacity>
        )}

      </View>

      {/* Personal location filter bar */}
      {mode === 'personal' && (
        <View style={styles.personalBar}>
          <TouchableOpacity style={styles.personalLocationBtn} onPress={() => setShowLocations(true)}>
            <Text style={styles.personalLocationText} numberOfLines={1}>
              {personalLocalFilter === 'all'
                ? 'All Locations'
                : (myLocations.find(l => l.id === personalLocalFilter)?.name ?? personalLocalFilter)}
            </Text>
            <Text style={styles.seasonArrow}>▾</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.personalManageBtn} onPress={() => setShowLocations(true)}>
            <Text style={styles.personalManageText}>Manage Locations</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sort bar — KBC only */}
      {mode === 'kbc' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortBar} contentContainerStyle={styles.sortBarContent}>
          {SORT_OPTIONS.map(opt => {
            const active = sortKey === opt.key;
            const arrow  = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.sortPill, active && styles.sortPillActive]}
                onPress={() => handleSortPress(opt.key)}
              >
                <Text style={[styles.sortPillText, active && styles.sortPillTextActive]}>
                  {opt.label}{arrow}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={KBC.lime} />
        </View>
      ) : mode === 'kbc' ? (
        <>
          {seasons.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>No seasons yet</Text>
              {isPrivileged
                ? <TouchableOpacity style={styles.saveBtn} onPress={() => setShowSeasonPicker(true)}>
                    <Text style={styles.saveBtnText}>Create First Season</Text>
                  </TouchableOpacity>
                : <Text style={styles.emptyText}>Ask an admin to set up the first season.</Text>
              }
            </View>
          ) : displayed.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>{boulders.length === 0 ? 'No boulders this season' : 'No results'}</Text>
              <Text style={styles.emptyText}>{boulders.length === 0 ? 'Add the first problem!' : 'Try adjusting your filters.'}</Text>
              {fc > 0 && (
                <TouchableOpacity style={[styles.saveBtn, { marginTop: 12 }]} onPress={() => setFilters(DEFAULT_FILTER)}>
                  <Text style={styles.saveBtnText}>Clear Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <FlatList
              data={displayed}
              keyExtractor={b => b.id}
              renderItem={({ item }) => (
                <ClimbCard
                  boulder={item}
                  logs={logsByProblem[item.internalId] ?? []}
                  uid={userUid}
                  onPress={() => setFormMode({ type: 'edit', boulder: item })}
                  onLog={() => setLogBoulder(item)}
                />
              )}
              contentContainerStyle={styles.list}
            />
          )}

          {/* Add boulder button */}
          {isPrivileged && seasons.length > 0 && (
            <TouchableOpacity style={styles.addBtn} onPress={openAddForm}>
              <Text style={styles.addBtnText}>+ Add Boulder</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <>
          {(() => {
            const filteredProblems = personalLocalFilter === 'all'
              ? myProblems
              : myProblems.filter(p => {
                  const loc = myLocations.find(l => l.id === personalLocalFilter);
                  return p.local === (loc?.name ?? personalLocalFilter);
                });
            return filteredProblems.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.emptyTitle}>
                  {myProblems.length === 0 ? 'No personal problems yet' : 'No problems at this location'}
                </Text>
                <Text style={styles.emptyText}>
                  {myProblems.length === 0 ? 'Add your own climbs from any location.' : 'Try a different location filter.'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredProblems}
                keyExtractor={p => p.id}
                renderItem={({ item }) => (
                  <PersonalProblemCard
                    problem={item}
                    logs={personalLogsByProblem[item.internalId] ?? []}
                    uid={userUid}
                    onPress={() => { setEditingProblem(item); setShowNewProblem(true); }}
                    onLog={() => setLogProblem(item)}
                  />
                )}
                contentContainerStyle={styles.list}
              />
            );
          })()}

          {/* Add personal problem FAB */}
          <TouchableOpacity style={styles.addBtn} onPress={() => { setEditingProblem(undefined); setShowNewProblem(true); }}>
            <Text style={styles.addBtnText}>+ Add Problem</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Modals */}
      <SeasonPickerModal
        visible={showSeasonPicker}
        seasons={seasons}
        selectedId={selectedSeason?.id ?? null}
        canCreate={isAdminUser}
        onSelect={s => { handleSelectSeason(s); setSeasons(prev => prev.find(x => x.id === s.id) ? prev : [...prev, s]); }}
        onClose={() => setShowSeasonPicker(false)}
      />

      {formMode && (
        <BoulderFormModal
          mode={formMode}
          visible
          onClose={() => setFormMode(null)}
          onSaved={() => { if (selectedSeason) handleSelectSeason(selectedSeason); }}
          userUid={userUid}
          defaultSetter={defaultSetter}
          canRemove={isPrivileged}
        />
      )}

      <FilterModal
        visible={showFilter}
        filters={filters}
        onChange={setFilters}
        onClose={() => setShowFilter(false)}
      />

      {logBoulder && (
        <BoulderLogModal
          visible
          boulder={logBoulder}
          logs={logsByProblem[logBoulder.internalId] ?? []}
          onClose={() => setLogBoulder(null)}
          onSaved={newLog => {
            setLogsByProblem(prev => ({
              ...prev,
              [logBoulder.internalId]: [newLog, ...(prev[logBoulder.internalId] ?? [])],
            }));
            setLogBoulder(null);
          }}
          userUid={userUid}
          userName={defaultSetter}
        />
      )}

      {logProblem && (
        <PersonalLogModal
          visible
          problem={logProblem}
          onClose={() => setLogProblem(null)}
          onSaved={newLog => {
            setPersonalLogsByProblem(prev => ({
              ...prev,
              [logProblem.internalId]: [newLog, ...(prev[logProblem.internalId] ?? [])],
            }));
            setLogProblem(null);
          }}
          userUid={userUid}
        />
      )}

      <LocationsModal
        visible={showLocations}
        onClose={() => setShowLocations(false)}
        uid={userUid}
        locations={myLocations}
        onLocationsChanged={setMyLocations}
        selectedId={personalLocalFilter}
        onSelectId={id => setPersonalLocalFilter(id)}
      />

      <NewProblemModal
        visible={showNewProblem}
        onClose={() => { setShowNewProblem(false); setEditingProblem(undefined); }}
        onSaved={p => {
          if (editingProblem) {
            setMyProblems(prev => prev.map(x => x.id === p.id ? p : x));
          } else {
            setMyProblems(prev => [p, ...prev]);
          }
          setShowNewProblem(false);
          setEditingProblem(undefined);
        }}
        onDeleted={id => {
          setMyProblems(prev => prev.filter(x => x.id !== id));
          setShowNewProblem(false);
          setEditingProblem(undefined);
        }}
        uid={userUid}
        locations={myLocations}
        editing={editingProblem}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#555', textAlign: 'center' },
  emptyText:  { fontSize: 14, color: '#999', textAlign: 'center' },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1c1c1c', paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#333',
  },
  modeToggle: { flexDirection: 'row', backgroundColor: '#2a2a2a', borderRadius: 10, overflow: 'hidden' },
  modeBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  modeBtnActive: { backgroundColor: KBC.lime },
  modeBtnText:       { fontSize: 13, fontWeight: '700', color: '#888' },
  modeBtnTextActive: { color: '#fff' },
  seasonBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#2a2a2a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 6,
  },
  seasonBtnText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '700' },

  // Personal status pill
  statusPill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginRight: 4 },
  statusPillSent:  { backgroundColor: '#1a4d2e' },
  statusPillTried: { backgroundColor: '#4d3210' },
  statusPillText:  { fontSize: 11, fontWeight: '700', color: '#fff' },
  seasonArrow:   { color: KBC.lime, fontSize: 14 },
  filterBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: '#444', backgroundColor: '#2a2a2a',
  },
  filterBtnActive:     { borderColor: KBC.lime, backgroundColor: KBC.lime + '22' },
  filterBtnText:       { color: '#888', fontSize: 14, fontWeight: '600' },
  filterBtnTextActive: { color: KBC.lime },

  // Personal location bar
  personalBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1c1c1c', paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#333',
  },
  personalLocationBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#2a2a2a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 6,
  },
  personalLocationText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '700' },
  personalManageBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: '#555', backgroundColor: '#2a2a2a',
  },
  personalManageText: { color: '#aaa', fontSize: 13, fontWeight: '600' },

  // Sort bar
  sortBar: { backgroundColor: '#f5f5f5', borderBottomWidth: 1, borderBottomColor: '#e0e0e0', maxHeight: 48 },
  sortBarContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row', alignItems: 'center' },
  sortPill: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
    backgroundColor: '#e8e8e8', borderWidth: 1, borderColor: '#ddd',
  },
  sortPillActive:     { backgroundColor: KBC.lime + '22', borderColor: KBC.lime },
  sortPillText:       { fontSize: 13, fontWeight: '600', color: '#666' },
  sortPillTextActive: { color: '#5a8a00' },

  // Card
  list: { padding: 10, gap: 8, paddingBottom: 100 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 10,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 7,
  },
  cardRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardNumberBadge: {
    backgroundColor: KBC.lime + '22', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: KBC.lime + '55',
  },
  cardNumber: { fontSize: 12, fontWeight: '800', color: '#5a8a00' },
  cardName:   { fontSize: 14, fontWeight: '700', color: '#111' },
  chipScroll: { flexGrow: 0 },

  // Grade block
  gradeBlock: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  gradeBlockText: { fontSize: 11, fontWeight: '800' },

  locationChip: {
    backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3,
    marginRight: 6, borderWidth: 1, borderColor: '#ddd',
  },
  locationChipText: { fontSize: 11, color: '#555', fontWeight: '600' },

  badgeRow:  { flexDirection: 'row', flexWrap: 'nowrap', gap: 6, paddingVertical: 2 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap' },

  badgeIconWrap: { width: BADGE_COL_W, alignItems: 'center', paddingVertical: 6 },

  badgeDisk: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5,
    shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

  badgeCountDot: {
    position: 'absolute', bottom: -2, right: -2,
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: '#fff',
  },
  badgeCountDotText: { fontSize: 9, fontWeight: '900' },

  badgeIconLabel: {
    marginTop: 4, textAlign: 'center', color: '#333', fontWeight: '700',
    lineHeight: 12, width: BADGE_COL_W - 4,
  },

  cardSetter:     { fontSize: 11, color: '#aaa', fontWeight: '500' },
  cardCountSent:  { fontSize: 11, color: '#2ecc71', fontWeight: '700' },
  cardCountTried: { fontSize: 11, color: '#f39c12', fontWeight: '700' },

  // Collapse header (badges section)
  collapseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 },
  collapseArrow:  { fontSize: 12, color: '#aaa', fontWeight: '700' },

  // Badge group label inside expanded section
  badgeGroupLabel: { fontSize: 10, fontWeight: '800', color: '#bbb', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 8 },

  // Stars
  starInfo: { fontSize: 11, color: '#aaa', marginLeft: 4 },

  // Card log button
  cardLogBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: KBC.lime + '22', borderWidth: 1, borderColor: KBC.lime + '88',
  },
  cardLogBtnText: { fontSize: 12, fontWeight: '700', color: '#5a8a00' },

  // Log modal type toggle
  logTypeRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  logTypeBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#f8f8f8',
  },
  logTypeBtnSent:  { backgroundColor: '#1a6640', borderColor: '#1a6640' },
  logTypeBtnTried: { backgroundColor: '#7a4d10', borderColor: '#7a4d10' },
  logTypeBtnText:  { fontSize: 15, fontWeight: '700', color: '#999' },

  // Effort chips
  effortChip: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#f8f8f8',
  },
  effortChipText: { fontSize: 12, fontWeight: '700', color: '#777' },

  // Project checkbox
  projectRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, marginBottom: 4 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#ccc',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f8f8',
  },
  checkboxChecked: { backgroundColor: KBC.lime, borderColor: KBC.lime },
  checkboxCheck:   { fontSize: 14, color: '#fff', fontWeight: '800' },
  projectLabel:    { fontSize: 15, fontWeight: '700', color: '#222' },
  projectSub:      { fontSize: 12, color: '#aaa', marginTop: 1 },

  // Comments thread
  noComments:   { color: '#bbb', fontSize: 13, fontStyle: 'italic', marginVertical: 8 },
  threadList:   { gap: 10, marginBottom: 4 },
  threadItem:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  threadItemMine: { flexDirection: 'row-reverse' },
  threadBubble: {
    flex: 1, backgroundColor: '#f2f2f2', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  threadName:   { fontSize: 11, fontWeight: '700', color: '#555', marginBottom: 2 },
  threadTime:   { fontSize: 10, color: '#aaa', fontWeight: '400' },
  threadText:   { fontSize: 14, color: '#222', lineHeight: 19 },
  threadDelete: { fontSize: 14, color: '#ccc', paddingTop: 6 },

  commentInputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 10,
  },
  commentInput: {
    flex: 1, backgroundColor: '#f8f8f8', borderRadius: 12, paddingHorizontal: 13,
    paddingVertical: 10, fontSize: 14, color: '#111',
    borderWidth: 1, borderColor: '#e8e8e8', maxHeight: 100,
  },
  commentSendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: KBC.lime, alignItems: 'center', justifyContent: 'center',
  },
  commentSendText: { fontSize: 18, color: '#fff', fontWeight: '700', lineHeight: 20 },

  // Add button
  addBtn: {
    margin: 14, backgroundColor: KBC.lime, borderRadius: 14, padding: 16,
    alignItems: 'center', elevation: 3, shadowColor: KBC.lime, shadowOpacity: 0.3, shadowRadius: 8,
  },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Form modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  formSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%',
  },
  formHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 18, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  formTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  formClose: { fontSize: 18, color: '#999', fontWeight: '700', paddingHorizontal: 4 },
  formBody:  { padding: 16 },

  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: '#999',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 20, marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#f8f8f8', borderRadius: 10, padding: 13,
    fontSize: 15, color: '#111', borderWidth: 1, borderColor: '#e8e8e8',
  },
  textArea: { height: 90, textAlignVertical: 'top' },

  // Multi-select chips
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ddd',
  },
  selectChipOn:     { backgroundColor: KBC.lime + '22', borderColor: KBC.lime },
  selectChipText:   { fontSize: 13, color: '#555', fontWeight: '600' },
  selectChipTextOn: { color: '#5a8a00' },

  saveBtn: {
    backgroundColor: KBC.lime, borderRadius: 12, padding: 15,
    alignItems: 'center', marginTop: 24,
  },
  saveBtnText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  removeBtn: {
    backgroundColor: '#f5f5f5', borderRadius: 12, padding: 15,
    alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#ddd',
  },
  removeBtnText: { color: '#e00', fontSize: 15, fontWeight: '700' },

  // Season picker
  pickerSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%',
  },
  seasonRow:         { flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  seasonRowSelected: { backgroundColor: KBC.lime + '11' },
  seasonName:        { flex: 1, fontSize: 16, fontWeight: '600', color: '#222' },
  seasonNameSelected:{ color: '#5a8a00', fontWeight: '800' },
  seasonCheck:       { fontSize: 16, color: KBC.lime, fontWeight: '800' },
  newSeasonBtn:      { margin: 16, backgroundColor: '#f5f5f5', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
  newSeasonBtnText:  { fontSize: 15, fontWeight: '700', color: KBC.lime },

  // Grade filter
  filterSectionLabel: {
    fontSize: 12, fontWeight: '800', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 20, marginBottom: 10,
  },
  gradeFilterRow:    { flexDirection: 'row', gap: 6 },
  gradeFilterChip:   { flex: 1, borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  gradeFilterChipOn: { borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  gradeFilterText:   { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  gradeFilterCheck:  { fontSize: 12, fontWeight: '900', marginTop: 2 },
});
