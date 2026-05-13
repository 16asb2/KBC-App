import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// ─── Badge colour map ─────────────────────────────────────────────────────────

export const BADGE_COLOR: Record<string, string> = {
  // Hold Types
  'Jugs':           '#43a047',
  'Crimps':         '#e74c3c',
  'Slopers':        '#3498db',
  'Pinches':        '#c62828',
  'Pockets':        '#00bcd4',
  'Underclings':    '#ab47bc',
  'Side Pulls':     '#e67e22',
  'Gaston':         '#16a085',
  'Crack':          '#8d6e63',
  'Small-feet':     '#90a4ae',
  'Slippery-feet':  '#29b6f6',
  // Climbing Technique
  'Balancing':      '#1abc9c',
  'Drop Knee':      '#f57c00',
  'Flagging':       '#7b1fa2',
  'Heel Hook':      '#ff7043',
  'Toe Hook':       '#ef5350',
  'Bicycle':        '#00838f',
  'Deadpoint':      '#f39c12',
  'Compression':    '#8e44ad',
  'Dyno':           '#9b59b6',
  'Double Dyno':    '#e91e63',
  'Campus':         '#ec407a',
  'Bat Hang':       '#37474f',
  'Hand-Jam':       '#ff6b35',
  'Finger-Jam':     '#ffb347',
  'Foot-Jam':       '#4ecdc4',
  // Body Dependent
  'Flexibility':    '#00acc1',
  'Reachy':         '#2196f3',
  'Shouldery':      '#607d8b',
  'Body Tension':   '#ff5722',
  'Contortionism':  '#4caf50',
  'Small-fit':      '#27ae60',
  // Others
  'Joy':            '#f9a825',
  'Peaceful':       '#74b9ff',
  'Pain':           '#b71c1c',
  'Cry':            '#1565c0',
  'Anger':          '#bf360c',
  'Ego-Breaker':    '#ad1457',
  'Joke':           '#fdd835',
  'Outrageous':     '#fd79a8',
  'OMG':            '#e17055',
  'Love it':        '#e91e63',
  'Hate it':        '#424242',
  'Suffer':         '#6a1b9a',
};

// ─── HoldIcon ─────────────────────────────────────────────────────────────────

export function HoldIcon({ badge, color, size }: { badge: string; color: string; size: number }) {
  const s = size;
  switch (badge) {
    case 'Crimps':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
          <View style={{ width: s * 0.82, height: s * 0.2, backgroundColor: color, borderRadius: 3 }} />
          <View style={{ width: s * 0.55, height: s * 0.13, backgroundColor: color + 'aa', borderRadius: 2 }} />
        </View>
      );
    case 'Slopers':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.82, height: s * 0.52, backgroundColor: color, borderTopLeftRadius: s * 0.41, borderTopRightRadius: s * 0.41, borderBottomLeftRadius: s * 0.1, borderBottomRightRadius: s * 0.1 }} />
        </View>
      );
    case 'Deadpoint':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.68, height: s * 0.68, borderRadius: s * 0.34, borderWidth: 2.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: s * 0.28, height: s * 0.28, borderRadius: s * 0.14, backgroundColor: color }} />
          </View>
        </View>
      );
    case 'Dyno':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', gap: 0 }}>
          <View style={{ width: 0, height: 0, borderLeftWidth: s * 0.26, borderRightWidth: s * 0.26, borderBottomWidth: s * 0.38, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color }} />
          <View style={{ width: s * 0.2, height: s * 0.28, backgroundColor: color, borderRadius: 2, marginTop: -1 }} />
        </View>
      );
    case 'Double Dyno':
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
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 }}>
          <View style={{ width: s * 0.24, height: s * 0.46, backgroundColor: color, borderRadius: s * 0.12, transform: [{ rotate: '-22deg' }] }} />
          <View style={{ width: s * 0.24, height: s * 0.46, backgroundColor: color, borderRadius: s * 0.12, transform: [{ rotate: '22deg' }] }} />
        </View>
      );
    case 'Pockets':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.62, height: s * 0.62, borderRadius: s * 0.31, borderWidth: s * 0.1, borderColor: color }} />
        </View>
      );
    case 'Contortionism':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.42, height: s * 0.42, borderRadius: s * 0.21, borderWidth: 2.5, borderColor: color, position: 'absolute', top: s * 0.04 }} />
          <View style={{ width: s * 0.42, height: s * 0.42, borderRadius: s * 0.21, borderWidth: 2.5, borderColor: color, position: 'absolute', bottom: s * 0.04 }} />
        </View>
      );
    case 'Body Tension':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <View style={{ width: s * 0.22, height: s * 0.22, borderRadius: s * 0.11, backgroundColor: color }} />
          <View style={{ width: s * 0.82, height: s * 0.16, backgroundColor: color, borderRadius: 3 }} />
        </View>
      );
    case 'Shouldery':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.8, height: s * 0.46, borderTopLeftRadius: s * 0.4, borderTopRightRadius: s * 0.4, borderWidth: 3, borderColor: color, borderBottomWidth: 0, marginTop: s * 0.08 }} />
        </View>
      );
    case 'Reachy':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.65, height: 3, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '-45deg' }] }} />
          <View style={{ position: 'absolute', top: s * 0.1, right: s * 0.1, width: 0, height: 0, borderLeftWidth: 7, borderBottomWidth: 7, borderLeftColor: 'transparent', borderBottomColor: color, transform: [{ rotate: '45deg' }] }} />
        </View>
      );
    case 'Flexibility':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.2, height: s * 0.2, borderRadius: s * 0.1, backgroundColor: color, position: 'absolute', top: s * 0.04 }} />
          <View style={{ width: s * 0.66, height: 3, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '40deg' }], position: 'absolute', left: s * 0.02, top: s * 0.38 }} />
          <View style={{ width: s * 0.66, height: 3, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '-40deg' }], position: 'absolute', right: s * 0.02, top: s * 0.38 }} />
        </View>
      );
    case 'Heel Hook':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.68, height: s * 0.68, borderRadius: s * 0.34, borderWidth: s * 0.12, borderColor: color, borderRightColor: 'transparent' }} />
        </View>
      );
    case 'Toe Hook':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.46, height: s * 0.46, borderRadius: s * 0.23, borderWidth: s * 0.1, borderColor: color, borderTopColor: 'transparent', borderLeftColor: 'transparent' }} />
          <View style={{ width: s * 0.1, height: s * 0.28, backgroundColor: color, borderRadius: 2, position: 'absolute', top: s * 0.06, right: s * 0.26 }} />
        </View>
      );
    case 'Bicycle':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: s * 0.07 }}>
          <View style={{ width: s * 0.36, height: s * 0.36, borderRadius: s * 0.18, borderWidth: 2.5, borderColor: color }} />
          <View style={{ width: s * 0.36, height: s * 0.36, borderRadius: s * 0.18, borderWidth: 2.5, borderColor: color }} />
        </View>
      );
    case 'Underclings':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.8, height: s * 0.44, borderBottomLeftRadius: s * 0.4, borderBottomRightRadius: s * 0.4, borderWidth: 3, borderColor: color, borderTopWidth: 0, marginBottom: s * 0.06 }} />
        </View>
      );
    case 'Jugs':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.64, height: s * 0.64, borderRadius: s * 0.32, borderWidth: s * 0.12, borderColor: color, borderLeftColor: 'transparent' }} />
        </View>
      );
    case 'Campus':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', gap: s * 0.08 }}>
          {[0, 1, 2].map(i => <View key={i} style={{ width: s * 0.78, height: s * 0.14, backgroundColor: color, borderRadius: 2 }} />)}
        </View>
      );
    case 'No-feet':
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
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: s * 0.2 }}>
          <View style={{ width: s * 0.16, height: s * 0.62, backgroundColor: color, borderRadius: 3 }} />
          <View style={{ width: s * 0.16, height: s * 0.62, backgroundColor: color, borderRadius: 3 }} />
        </View>
      );
    case 'Outrageous':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 0, height: 0, borderLeftWidth: s * 0.3, borderRightWidth: s * 0.3, borderTopWidth: s * 0.44, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: color }} />
        </View>
      );
    case 'Bat Hang':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.2, height: s * 0.2, borderRadius: s * 0.1, backgroundColor: color, position: 'absolute', bottom: s * 0.06 }} />
          <View style={{ width: s * 0.11, height: s * 0.46, backgroundColor: color, borderRadius: 2, position: 'absolute', left: s * 0.2, bottom: s * 0.16, transform: [{ rotate: '-28deg' }] }} />
          <View style={{ width: s * 0.11, height: s * 0.46, backgroundColor: color, borderRadius: 2, position: 'absolute', right: s * 0.2, bottom: s * 0.16, transform: [{ rotate: '28deg' }] }} />
        </View>
      );
    case 'Compression':
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
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.88, height: s * 0.16, backgroundColor: color, borderRadius: 3 }} />
          <View style={{ width: 0, height: 0, borderLeftWidth: s * 0.22, borderRightWidth: s * 0.22, borderTopWidth: s * 0.32, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: color, marginTop: 0 }} />
        </View>
      );
    case 'Joke':
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
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.64, height: s * 0.64, borderRadius: s * 0.32, borderWidth: 2.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: s * 0.16, height: s * 0.22, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-15deg' }], marginBottom: -2 }} />
            <View style={{ width: s * 0.16, height: s * 0.22, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '15deg' }] }} />
          </View>
        </View>
      );
    case 'Pain':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', gap: s * 0.07 }}>
          <View style={{ width: s * 0.17, height: s * 0.48, backgroundColor: color, borderRadius: 3 }} />
          <View style={{ width: s * 0.17, height: s * 0.17, borderRadius: s * 0.09, backgroundColor: color }} />
        </View>
      );
    case 'Cry':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.62, height: s * 0.62, borderRadius: s * 0.31, borderWidth: 2.5, borderColor: color, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: s * 0.08 }}>
            <View style={{ width: s * 0.3, height: s * 0.14, borderTopWidth: 2.5, borderTopColor: color, borderLeftWidth: 2.5, borderLeftColor: color, borderRightWidth: 2.5, borderRightColor: color, borderRadius: s * 0.12, borderBottomWidth: 0 }} />
          </View>
          <View style={{ width: s * 0.1, height: s * 0.16, backgroundColor: color, borderBottomLeftRadius: s * 0.08, borderBottomRightRadius: s * 0.08, position: 'absolute', bottom: s * 0.06, left: s * 0.34 }} />
        </View>
      );
    case 'Joy':
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
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.12, height: s * 0.46, backgroundColor: color, borderRadius: 3, position: 'absolute', left: s * 0.22, top: s * 0.08 }} />
          <View style={{ width: s * 0.46, height: s * 0.12, backgroundColor: color, borderRadius: 3, position: 'absolute', left: s * 0.22, top: s * 0.42 }} />
          <View style={{ width: s * 0.18, height: s * 0.18, borderRadius: s * 0.09, backgroundColor: color, position: 'absolute', right: s * 0.18, bottom: s * 0.08 }} />
        </View>
      );
    case 'Flagging':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.12, height: s * 0.52, backgroundColor: color, borderRadius: 3, position: 'absolute', top: s * 0.04 }} />
          <View style={{ width: s * 0.58, height: s * 0.1, backgroundColor: color, borderRadius: 3, transform: [{ rotate: '35deg' }], position: 'absolute', bottom: s * 0.08, right: s * 0.06 }} />
          <View style={{ width: s * 0.2, height: s * 0.2, borderRadius: s * 0.1, backgroundColor: color, position: 'absolute', top: s * 0.05, left: s * 0.4 }} />
        </View>
      );
    case 'Anger':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', gap: s * 0.07 }}>
          {(['-18deg', '0deg', '18deg'] as const).map((rot, i) => (
            <View key={i} style={{ width: s * 0.6, height: s * 0.14, backgroundColor: color, borderRadius: 2, transform: [{ rotate: rot }] }} />
          ))}
        </View>
      );
    case 'Side Pulls':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.58, height: s * 0.58, borderRadius: s * 0.29, borderWidth: s * 0.1, borderColor: color, borderLeftColor: 'transparent', borderTopColor: 'transparent' }} />
        </View>
      );
    case 'Gaston':
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
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: s * 0.14 }}>
          <View style={{ width: s * 0.18, height: s * 0.32, backgroundColor: color, borderRadius: s * 0.09 }} />
          <View style={{ width: s * 0.18, height: s * 0.32, backgroundColor: color, borderRadius: s * 0.09 }} />
        </View>
      );
    case 'Small-fit':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: s * 0.08 }}>
          <View style={{ width: s * 0.14, height: s * 0.64, backgroundColor: color, borderRadius: 3 }} />
          <View style={{ width: s * 0.14, height: s * 0.64, backgroundColor: color, borderRadius: 3 }} />
        </View>
      );
    case 'Peaceful':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', gap: s * 0.08 }}>
          {[s * 0.7, s * 0.54, s * 0.7].map((w, i) => (
            <View key={i} style={{ width: w, height: s * 0.1, backgroundColor: color, borderRadius: s * 0.05 }} />
          ))}
        </View>
      );
    case 'Crack':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.1, height: s * 0.46, backgroundColor: color, borderRadius: 2, position: 'absolute', top: s * 0.04, transform: [{ rotate: '12deg' }], marginLeft: -s * 0.06 }} />
          <View style={{ width: s * 0.1, height: s * 0.46, backgroundColor: color, borderRadius: 2, position: 'absolute', bottom: s * 0.04, transform: [{ rotate: '-12deg' }], marginLeft: s * 0.06 }} />
        </View>
      );
    case 'Hand-Jam':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.11, height: s * 0.68, backgroundColor: color, borderRadius: 2, position: 'absolute', left: s * 0.22 }} />
          <View style={{ width: s * 0.11, height: s * 0.68, backgroundColor: color, borderRadius: 2, position: 'absolute', right: s * 0.22 }} />
          <View style={{ width: s * 0.44, height: s * 0.11, backgroundColor: color, borderRadius: 2 }} />
        </View>
      );
    case 'Finger-Jam':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.09, height: s * 0.58, backgroundColor: color, borderRadius: 2, position: 'absolute', left: s * 0.28 }} />
          <View style={{ width: s * 0.09, height: s * 0.58, backgroundColor: color, borderRadius: 2, position: 'absolute', right: s * 0.28 }} />
          <View style={{ width: s * 0.32, height: s * 0.09, backgroundColor: color, borderRadius: 2 }} />
        </View>
      );
    case 'Foot-Jam':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.62, height: s * 0.18, backgroundColor: color, borderRadius: 4, position: 'absolute', bottom: s * 0.16 }} />
          <View style={{ width: s * 0.14, height: s * 0.44, backgroundColor: color, borderRadius: 3, position: 'absolute', bottom: s * 0.3 }} />
        </View>
      );
    case 'Love it':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', width: s * 0.32, height: s * 0.32, borderRadius: s * 0.16, backgroundColor: color, top: s * 0.14, left: s * 0.12 }} />
          <View style={{ position: 'absolute', width: s * 0.32, height: s * 0.32, borderRadius: s * 0.16, backgroundColor: color, top: s * 0.14, right: s * 0.12 }} />
          <View style={{ width: 0, height: 0, borderLeftWidth: s * 0.26, borderRightWidth: s * 0.26, borderTopWidth: s * 0.3, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: color, position: 'absolute', bottom: s * 0.12 }} />
        </View>
      );
    case 'Hate it':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.62, height: s * 0.12, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '45deg' }], position: 'absolute' }} />
          <View style={{ width: s * 0.62, height: s * 0.12, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '-45deg' }], position: 'absolute' }} />
        </View>
      );
    case 'Suffer':
      return (
        <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center', gap: s * 0.1 }}>
          {[s * 0.58, s * 0.44, s * 0.32].map((w, i) => (
            <View key={i} style={{ width: w, height: s * 0.1, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '-10deg' }] }} />
          ))}
        </View>
      );
    case 'OMG':
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

// ─── BadgeIcon ────────────────────────────────────────────────────────────────

const BADGE_COL_W = Math.floor((Dimensions.get('window').width - 32) / 5);

export function BadgeIcon({
  label, count, selected, onPress, size = 'md', compact = false,
}: {
  label: string; count?: number; selected?: boolean;
  onPress?: () => void; size?: 'xs' | 'sm' | 'md'; compact?: boolean;
}) {
  const color  = BADGE_COLOR[label] ?? '#9b5de5';
  const dim    = size === 'xs' ? 24 : size === 'sm' ? 36 : 44;
  const iconSz = size === 'xs' ? 10 : size === 'sm' ? 15 : 19;

  const disk = (
    <View style={[
      bi.disk,
      { width: dim, height: dim, borderRadius: dim / 2, borderColor: color, backgroundColor: selected ? color : '#fff', shadowColor: color },
    ]}>
      <HoldIcon badge={label} color={selected ? '#fff' : color} size={iconSz} />
      {size !== 'xs' && count != null && count > 0 && (
        <View style={[bi.countDot, { backgroundColor: selected ? '#fff' : color }]}>
          <Text style={[bi.countDotText, { color: selected ? color : '#fff' }]}>{count}</Text>
        </View>
      )}
    </View>
  );

  const medal = size === 'xs' ? (
    <View style={{ opacity: selected ? 1 : 0.4 }}>{disk}</View>
  ) : compact ? (
    // Compact: no fixed width — for list row display
    <View style={[bi.wrap, { opacity: selected ? 1 : 0.4 }]}>
      {disk}
      <Text numberOfLines={1} style={[bi.label, selected && { color, fontWeight: '800' }]}>{label}</Text>
    </View>
  ) : (
    <View style={[bi.wrap, { width: BADGE_COL_W, opacity: selected ? 1 : 0.4 }]}>
      {disk}
      <Text numberOfLines={2} style={[bi.label, selected && { color, fontWeight: '800' }]}>{label}</Text>
    </View>
  );

  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.8}>{medal}</TouchableOpacity>;
  return medal;
}

const bi = StyleSheet.create({
  disk: { alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  countDot: { position: 'absolute', bottom: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },
  countDotText: { fontSize: 9, fontWeight: '900' },
  wrap: { alignItems: 'center', paddingVertical: 6 },
  label: { marginTop: 4, textAlign: 'center', color: '#333', fontWeight: '700', fontSize: 9, lineHeight: 12 },
});
