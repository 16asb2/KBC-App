import type { CSSProperties, ReactNode } from 'react'
import { KBC } from '@/constants/theme'

// Ported from mobile@1cdfada/components/badge-icon.tsx. Each hold/technique/mood
// "icon" is hand-drawn from plain boxes (rectangles, circles via
// border-radius, triangles via transparent-border tricks) — same technique
// translates directly from RN View+style to div+CSSProperties. Box-shadow
// below approximates RN's shadowColor/shadowOpacity/shadowRadius/elevation
// with a fixed neutral shadow rather than a per-badge-color-tinted one —
// a minor visual simplification, not a functional change.

// eslint-disable-next-line react-refresh/only-export-components -- shared constant, colocated with the components that use it
export const BADGE_COLOR: Record<string, string> = {
  // Hold Types
  Jugs: '#43a047',
  Crimps: '#e74c3c',
  Slopers: '#3498db',
  Pinches: '#c62828',
  Pockets: '#00bcd4',
  Underclings: '#ab47bc',
  'Side Pulls': '#e67e22',
  Gaston: '#16a085',
  Crack: '#8d6e63',
  'Small-feet': '#90a4ae',
  'Slippery-feet': '#29b6f6',
  // Climbing Technique
  Balancing: '#1abc9c',
  'Drop Knee': '#f57c00',
  Flagging: '#7b1fa2',
  'Heel Hook': '#ff7043',
  'Toe Hook': '#ef5350',
  Bicycle: '#00838f',
  Deadpoint: '#f39c12',
  Compression: '#8e44ad',
  Dyno: '#9b59b6',
  'Double Dyno': '#e91e63',
  Campus: '#ec407a',
  'Bat Hang': '#37474f',
  'Hand-Jam': '#ff6b35',
  'Finger-Jam': '#ffb347',
  'Foot-Jam': '#4ecdc4',
  // Body Dependent
  Flexibility: '#00acc1',
  Reachy: '#2196f3',
  Shouldery: '#607d8b',
  'Body Tension': '#ff5722',
  Contortionism: '#4caf50',
  'Small-fit': '#27ae60',
  // Others
  Joy: '#f9a825',
  Peaceful: '#74b9ff',
  Pain: '#b71c1c',
  Cry: '#1565c0',
  Anger: '#bf360c',
  'Ego-Breaker': '#ad1457',
  Joke: '#fdd835',
  Outrageous: '#fd79a8',
  OMG: '#e17055',
  'Love it': '#e91e63',
  'Hate it': '#424242',
  Suffer: '#6a1b9a',
}

function Box({ style, children }: { style: CSSProperties; children?: ReactNode }) {
  return <div style={style}>{children}</div>
}

const wrap = (s: number, extra?: CSSProperties): CSSProperties => ({
  width: s,
  height: s,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  ...extra,
})

const triangle = (
  dir: 'up' | 'down' | 'left' | 'right',
  base: number,
  height: number,
  color: string,
): CSSProperties => {
  const t: CSSProperties = { width: 0, height: 0 }
  if (dir === 'up') {
    t.borderLeft = `${base}px solid transparent`
    t.borderRight = `${base}px solid transparent`
    t.borderBottom = `${height}px solid ${color}`
  } else if (dir === 'down') {
    t.borderLeft = `${base}px solid transparent`
    t.borderRight = `${base}px solid transparent`
    t.borderTop = `${height}px solid ${color}`
  } else if (dir === 'left') {
    t.borderTop = `${base}px solid transparent`
    t.borderBottom = `${base}px solid transparent`
    t.borderRight = `${height}px solid ${color}`
  } else {
    t.borderTop = `${base}px solid transparent`
    t.borderBottom = `${base}px solid transparent`
    t.borderLeft = `${height}px solid ${color}`
  }
  return t
}

export function HoldIcon({ badge, color, size }: { badge: string; color: string; size: number }) {
  const s = size

  switch (badge) {
    case 'Crimps':
      return (
        <Box style={wrap(s, { flexDirection: 'column', gap: 3 })}>
          <Box style={{ width: s * 0.82, height: s * 0.2, background: color, borderRadius: 3 }} />
          <Box style={{ width: s * 0.55, height: s * 0.13, background: color + 'aa', borderRadius: 2 }} />
        </Box>
      )
    case 'Slopers':
      return (
        <Box style={wrap(s)}>
          <Box
            style={{
              width: s * 0.82,
              height: s * 0.52,
              background: color,
              borderTopLeftRadius: s * 0.41,
              borderTopRightRadius: s * 0.41,
              borderBottomLeftRadius: s * 0.1,
              borderBottomRightRadius: s * 0.1,
            }}
          />
        </Box>
      )
    case 'Deadpoint':
      return (
        <Box style={wrap(s)}>
          <Box style={wrap(s * 0.68, { borderRadius: s * 0.34, border: `2.5px solid ${color}` })}>
            <Box style={{ width: s * 0.28, height: s * 0.28, borderRadius: s * 0.14, background: color }} />
          </Box>
        </Box>
      )
    case 'Dyno':
      return (
        <Box style={wrap(s, { flexDirection: 'column' })}>
          <Box style={triangle('up', s * 0.26, s * 0.38, color)} />
          <Box style={{ width: s * 0.2, height: s * 0.28, background: color, borderRadius: 2, marginTop: -1 }} />
        </Box>
      )
    case 'Double Dyno':
      return (
        <Box style={wrap(s, { gap: 5 })}>
          {[0, 1].map((i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Box style={triangle('up', s * 0.18, s * 0.28, color)} />
              <Box style={{ width: s * 0.14, height: s * 0.2, background: color, borderRadius: 1, marginTop: -1 }} />
            </div>
          ))}
        </Box>
      )
    case 'Slippery-feet':
      return (
        <Box style={wrap(s, { flexDirection: 'row', gap: 4 })}>
          <Box style={{ width: s * 0.24, height: s * 0.46, background: color, borderRadius: s * 0.12, transform: 'rotate(-22deg)' }} />
          <Box style={{ width: s * 0.24, height: s * 0.46, background: color, borderRadius: s * 0.12, transform: 'rotate(22deg)' }} />
        </Box>
      )
    case 'Pockets':
      return (
        <Box style={wrap(s)}>
          <Box style={{ width: s * 0.62, height: s * 0.62, borderRadius: s * 0.31, border: `${s * 0.1}px solid ${color}` }} />
        </Box>
      )
    case 'Contortionism':
      return (
        <Box style={wrap(s)}>
          <Box style={{ width: s * 0.42, height: s * 0.42, borderRadius: s * 0.21, border: '2.5px solid ' + color, position: 'absolute', top: s * 0.04 }} />
          <Box style={{ width: s * 0.42, height: s * 0.42, borderRadius: s * 0.21, border: '2.5px solid ' + color, position: 'absolute', bottom: s * 0.04 }} />
        </Box>
      )
    case 'Body Tension':
      return (
        <Box style={wrap(s, { flexDirection: 'column', gap: 4 })}>
          <Box style={{ width: s * 0.22, height: s * 0.22, borderRadius: s * 0.11, background: color }} />
          <Box style={{ width: s * 0.82, height: s * 0.16, background: color, borderRadius: 3 }} />
        </Box>
      )
    case 'Shouldery':
      return (
        <Box style={wrap(s)}>
          <Box
            style={{
              width: s * 0.8,
              height: s * 0.46,
              borderTopLeftRadius: s * 0.4,
              borderTopRightRadius: s * 0.4,
              borderLeft: `3px solid ${color}`,
              borderRight: `3px solid ${color}`,
              borderTop: `3px solid ${color}`,
              marginTop: s * 0.08,
            }}
          />
        </Box>
      )
    case 'Reachy':
      return (
        <Box style={wrap(s)}>
          <Box style={{ width: s * 0.65, height: 3, background: color, borderRadius: 2, transform: 'rotate(-45deg)' }} />
          <Box style={{ position: 'absolute', top: s * 0.1, right: s * 0.1, ...triangle('down', 7, 7, color), transform: 'rotate(45deg)' }} />
        </Box>
      )
    case 'Flexibility':
      return (
        <Box style={wrap(s)}>
          <Box style={{ width: s * 0.2, height: s * 0.2, borderRadius: s * 0.1, background: color, position: 'absolute', top: s * 0.04 }} />
          <Box style={{ width: s * 0.66, height: 3, background: color, borderRadius: 2, transform: 'rotate(40deg)', position: 'absolute', left: s * 0.02, top: s * 0.38 }} />
          <Box style={{ width: s * 0.66, height: 3, background: color, borderRadius: 2, transform: 'rotate(-40deg)', position: 'absolute', right: s * 0.02, top: s * 0.38 }} />
        </Box>
      )
    case 'Heel Hook':
      return (
        <Box style={wrap(s)}>
          <Box style={{ width: s * 0.68, height: s * 0.68, borderRadius: s * 0.34, border: `${s * 0.12}px solid ${color}`, borderRightColor: 'transparent' }} />
        </Box>
      )
    case 'Toe Hook':
      return (
        <Box style={wrap(s)}>
          <Box style={{ width: s * 0.46, height: s * 0.46, borderRadius: s * 0.23, border: `${s * 0.1}px solid ${color}`, borderTopColor: 'transparent', borderLeftColor: 'transparent' }} />
          <Box style={{ width: s * 0.1, height: s * 0.28, background: color, borderRadius: 2, position: 'absolute', top: s * 0.06, right: s * 0.26 }} />
        </Box>
      )
    case 'Bicycle':
      return (
        <Box style={wrap(s, { flexDirection: 'row', gap: s * 0.07 })}>
          <Box style={{ width: s * 0.36, height: s * 0.36, borderRadius: s * 0.18, border: `2.5px solid ${color}` }} />
          <Box style={{ width: s * 0.36, height: s * 0.36, borderRadius: s * 0.18, border: `2.5px solid ${color}` }} />
        </Box>
      )
    case 'Underclings':
      return (
        <Box style={wrap(s)}>
          <Box
            style={{
              width: s * 0.8,
              height: s * 0.44,
              borderBottomLeftRadius: s * 0.4,
              borderBottomRightRadius: s * 0.4,
              borderLeft: `3px solid ${color}`,
              borderRight: `3px solid ${color}`,
              borderBottom: `3px solid ${color}`,
              marginBottom: s * 0.06,
            }}
          />
        </Box>
      )
    case 'Jugs':
      return (
        <Box style={wrap(s)}>
          <Box style={{ width: s * 0.64, height: s * 0.64, borderRadius: s * 0.32, border: `${s * 0.12}px solid ${color}`, borderLeftColor: 'transparent' }} />
        </Box>
      )
    case 'Campus':
      return (
        <Box style={wrap(s, { flexDirection: 'column', gap: s * 0.08 })}>
          {[0, 1, 2].map((i) => (
            <Box key={i} style={{ width: s * 0.78, height: s * 0.14, background: color, borderRadius: 2 }} />
          ))}
        </Box>
      )
    case 'Pinches':
      return (
        <Box style={wrap(s, { flexDirection: 'row', gap: s * 0.2 })}>
          <Box style={{ width: s * 0.16, height: s * 0.62, background: color, borderRadius: 3 }} />
          <Box style={{ width: s * 0.16, height: s * 0.62, background: color, borderRadius: 3 }} />
        </Box>
      )
    case 'Outrageous':
      return (
        <Box style={wrap(s)}>
          <Box style={triangle('up', s * 0.3, s * 0.44, color)} />
        </Box>
      )
    case 'Bat Hang':
      return (
        <Box style={wrap(s)}>
          <Box style={{ width: s * 0.2, height: s * 0.2, borderRadius: s * 0.1, background: color, position: 'absolute', bottom: s * 0.06 }} />
          <Box style={{ width: s * 0.11, height: s * 0.46, background: color, borderRadius: 2, position: 'absolute', left: s * 0.2, bottom: s * 0.16, transform: 'rotate(-28deg)' }} />
          <Box style={{ width: s * 0.11, height: s * 0.46, background: color, borderRadius: 2, position: 'absolute', right: s * 0.2, bottom: s * 0.16, transform: 'rotate(28deg)' }} />
        </Box>
      )
    case 'Compression':
      return (
        <Box style={wrap(s, { flexDirection: 'row', gap: s * 0.06 })}>
          <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'row' }}>
            <Box style={triangle('right', s * 0.18, s * 0.28, color)} />
            <Box style={{ width: s * 0.14, height: s * 0.13, background: color, borderRadius: 1 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'row' }}>
            <Box style={{ width: s * 0.14, height: s * 0.13, background: color, borderRadius: 1 }} />
            <Box style={triangle('left', s * 0.18, s * 0.28, color)} />
          </div>
        </Box>
      )
    case 'Balancing':
      return (
        <Box style={wrap(s, { flexDirection: 'column' })}>
          <Box style={{ width: s * 0.88, height: s * 0.16, background: color, borderRadius: 3 }} />
          <Box style={triangle('up', s * 0.22, s * 0.32, color)} />
        </Box>
      )
    case 'Joke':
      return (
        <Box style={wrap(s)}>
          <Box style={wrap(s * 0.68, { flexDirection: 'column', borderRadius: s * 0.34, border: `2.5px solid ${color}` })}>
            <div style={{ display: 'flex', flexDirection: 'row', gap: s * 0.18, marginBottom: s * 0.05 }}>
              <Box style={{ width: 3, height: 3, borderRadius: 2, background: color }} />
              <Box style={{ width: 3, height: 3, borderRadius: 2, background: color }} />
            </div>
            <Box
              style={{
                width: s * 0.32,
                height: s * 0.16,
                borderBottom: `2.5px solid ${color}`,
                borderLeft: `2.5px solid ${color}`,
                borderRight: `2.5px solid ${color}`,
                borderRadius: s * 0.14,
              }}
            />
          </Box>
        </Box>
      )
    case 'Ego-Breaker':
      return (
        <Box style={wrap(s)}>
          <Box style={wrap(s * 0.64, { flexDirection: 'column', borderRadius: s * 0.32, border: `2.5px solid ${color}` })}>
            <Box style={{ width: s * 0.16, height: s * 0.22, background: color, borderRadius: 1, transform: 'rotate(-15deg)', marginBottom: -2 }} />
            <Box style={{ width: s * 0.16, height: s * 0.22, background: color, borderRadius: 1, transform: 'rotate(15deg)' }} />
          </Box>
        </Box>
      )
    case 'Pain':
      return (
        <Box style={wrap(s, { flexDirection: 'column', gap: s * 0.07 })}>
          <Box style={{ width: s * 0.17, height: s * 0.48, background: color, borderRadius: 3 }} />
          <Box style={{ width: s * 0.17, height: s * 0.17, borderRadius: s * 0.09, background: color }} />
        </Box>
      )
    case 'Cry':
      return (
        <Box style={wrap(s)}>
          <Box
            style={wrap(s * 0.62, {
              flexDirection: 'column',
              borderRadius: s * 0.31,
              border: `2.5px solid ${color}`,
              justifyContent: 'flex-end',
              paddingBottom: s * 0.08,
            })}
          >
            <Box
              style={{
                width: s * 0.3,
                height: s * 0.14,
                borderTop: `2.5px solid ${color}`,
                borderLeft: `2.5px solid ${color}`,
                borderRight: `2.5px solid ${color}`,
                borderRadius: s * 0.12,
              }}
            />
          </Box>
          <Box
            style={{
              width: s * 0.1,
              height: s * 0.16,
              background: color,
              borderBottomLeftRadius: s * 0.08,
              borderBottomRightRadius: s * 0.08,
              position: 'absolute',
              bottom: s * 0.06,
              left: s * 0.34,
            }}
          />
        </Box>
      )
    case 'Joy':
      return (
        <Box style={wrap(s)}>
          <Box style={wrap(s * 0.68, { flexDirection: 'column', borderRadius: s * 0.34, border: `2.5px solid ${color}` })}>
            <div style={{ display: 'flex', flexDirection: 'row', gap: s * 0.2, marginBottom: s * 0.04 }}>
              <Box style={{ width: s * 0.09, height: s * 0.09, borderRadius: s * 0.05, background: color }} />
              <Box style={{ width: s * 0.09, height: s * 0.09, borderRadius: s * 0.05, background: color }} />
            </div>
            <Box
              style={{
                width: s * 0.38,
                height: s * 0.2,
                borderBottom: `2.5px solid ${color}`,
                borderLeft: `2.5px solid ${color}`,
                borderRight: `2.5px solid ${color}`,
                borderRadius: s * 0.18,
              }}
            />
          </Box>
        </Box>
      )
    case 'Drop Knee':
      return (
        <Box style={wrap(s)}>
          <Box style={{ width: s * 0.12, height: s * 0.46, background: color, borderRadius: 3, position: 'absolute', left: s * 0.22, top: s * 0.08 }} />
          <Box style={{ width: s * 0.46, height: s * 0.12, background: color, borderRadius: 3, position: 'absolute', left: s * 0.22, top: s * 0.42 }} />
          <Box style={{ width: s * 0.18, height: s * 0.18, borderRadius: s * 0.09, background: color, position: 'absolute', right: s * 0.18, bottom: s * 0.08 }} />
        </Box>
      )
    case 'Flagging':
      return (
        <Box style={wrap(s)}>
          <Box style={{ width: s * 0.12, height: s * 0.52, background: color, borderRadius: 3, position: 'absolute', top: s * 0.04 }} />
          <Box style={{ width: s * 0.58, height: s * 0.1, background: color, borderRadius: 3, transform: 'rotate(35deg)', position: 'absolute', bottom: s * 0.08, right: s * 0.06 }} />
          <Box style={{ width: s * 0.2, height: s * 0.2, borderRadius: s * 0.1, background: color, position: 'absolute', top: s * 0.05, left: s * 0.4 }} />
        </Box>
      )
    case 'Anger':
      return (
        <Box style={wrap(s, { flexDirection: 'column', gap: s * 0.07 })}>
          {(['-18deg', '0deg', '18deg'] as const).map((rot, i) => (
            <Box key={i} style={{ width: s * 0.6, height: s * 0.14, background: color, borderRadius: 2, transform: `rotate(${rot})` }} />
          ))}
        </Box>
      )
    case 'Side Pulls':
      return (
        <Box style={wrap(s)}>
          <Box
            style={{
              width: s * 0.58,
              height: s * 0.58,
              borderRadius: s * 0.29,
              border: `${s * 0.1}px solid ${color}`,
              borderLeftColor: 'transparent',
              borderTopColor: 'transparent',
            }}
          />
        </Box>
      )
    case 'Gaston':
      return (
        <Box style={wrap(s, { flexDirection: 'row', gap: s * 0.06 })}>
          <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'row' }}>
            <Box style={{ width: s * 0.14, height: s * 0.13, background: color, borderRadius: 1 }} />
            <Box style={triangle('left', s * 0.18, s * 0.28, color)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'row' }}>
            <Box style={triangle('right', s * 0.18, s * 0.28, color)} />
            <Box style={{ width: s * 0.14, height: s * 0.13, background: color, borderRadius: 1 }} />
          </div>
        </Box>
      )
    case 'Small-feet':
      return (
        <Box style={wrap(s, { flexDirection: 'row', gap: s * 0.14 })}>
          <Box style={{ width: s * 0.18, height: s * 0.32, background: color, borderRadius: s * 0.09 }} />
          <Box style={{ width: s * 0.18, height: s * 0.32, background: color, borderRadius: s * 0.09 }} />
        </Box>
      )
    case 'Small-fit':
      return (
        <Box style={wrap(s, { flexDirection: 'row', gap: s * 0.08 })}>
          <Box style={{ width: s * 0.14, height: s * 0.64, background: color, borderRadius: 3 }} />
          <Box style={{ width: s * 0.14, height: s * 0.64, background: color, borderRadius: 3 }} />
        </Box>
      )
    case 'Peaceful':
      return (
        <Box style={wrap(s, { flexDirection: 'column', gap: s * 0.08 })}>
          {[s * 0.7, s * 0.54, s * 0.7].map((w, i) => (
            <Box key={i} style={{ width: w, height: s * 0.1, background: color, borderRadius: s * 0.05 }} />
          ))}
        </Box>
      )
    case 'Crack':
      return (
        <Box style={wrap(s)}>
          <Box style={{ width: s * 0.1, height: s * 0.46, background: color, borderRadius: 2, position: 'absolute', top: s * 0.04, transform: 'rotate(12deg)', marginLeft: -s * 0.06 }} />
          <Box style={{ width: s * 0.1, height: s * 0.46, background: color, borderRadius: 2, position: 'absolute', bottom: s * 0.04, transform: 'rotate(-12deg)', marginLeft: s * 0.06 }} />
        </Box>
      )
    case 'Hand-Jam':
      return (
        <Box style={wrap(s)}>
          <Box style={{ width: s * 0.11, height: s * 0.68, background: color, borderRadius: 2, position: 'absolute', left: s * 0.22 }} />
          <Box style={{ width: s * 0.11, height: s * 0.68, background: color, borderRadius: 2, position: 'absolute', right: s * 0.22 }} />
          <Box style={{ width: s * 0.44, height: s * 0.11, background: color, borderRadius: 2 }} />
        </Box>
      )
    case 'Finger-Jam':
      return (
        <Box style={wrap(s)}>
          <Box style={{ width: s * 0.09, height: s * 0.58, background: color, borderRadius: 2, position: 'absolute', left: s * 0.28 }} />
          <Box style={{ width: s * 0.09, height: s * 0.58, background: color, borderRadius: 2, position: 'absolute', right: s * 0.28 }} />
          <Box style={{ width: s * 0.32, height: s * 0.09, background: color, borderRadius: 2 }} />
        </Box>
      )
    case 'Foot-Jam':
      return (
        <Box style={wrap(s)}>
          <Box style={{ width: s * 0.62, height: s * 0.18, background: color, borderRadius: 4, position: 'absolute', bottom: s * 0.16 }} />
          <Box style={{ width: s * 0.14, height: s * 0.44, background: color, borderRadius: 3, position: 'absolute', bottom: s * 0.3 }} />
        </Box>
      )
    case 'Love it':
      return (
        <Box style={wrap(s)}>
          <Box style={{ position: 'absolute', width: s * 0.32, height: s * 0.32, borderRadius: s * 0.16, background: color, top: s * 0.14, left: s * 0.12 }} />
          <Box style={{ position: 'absolute', width: s * 0.32, height: s * 0.32, borderRadius: s * 0.16, background: color, top: s * 0.14, right: s * 0.12 }} />
          <Box style={{ position: 'absolute', bottom: s * 0.12, ...triangle('up', s * 0.26, s * 0.3, color) }} />
        </Box>
      )
    case 'Hate it':
      return (
        <Box style={wrap(s)}>
          <Box style={{ width: s * 0.62, height: s * 0.12, background: color, borderRadius: 2, transform: 'rotate(45deg)', position: 'absolute' }} />
          <Box style={{ width: s * 0.62, height: s * 0.12, background: color, borderRadius: 2, transform: 'rotate(-45deg)', position: 'absolute' }} />
        </Box>
      )
    case 'Suffer':
      return (
        <Box style={wrap(s, { flexDirection: 'column', gap: s * 0.1 })}>
          {[s * 0.58, s * 0.44, s * 0.32].map((w, i) => (
            <Box key={i} style={{ width: w, height: s * 0.1, background: color, borderRadius: 2, transform: 'rotate(-10deg)' }} />
          ))}
        </Box>
      )
    case 'OMG':
      return (
        <Box style={wrap(s, { flexDirection: 'row', gap: s * 0.12 })}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: s * 0.06 }}>
              <Box style={{ width: s * 0.12, height: s * 0.38, background: color, borderRadius: 2 }} />
              <Box style={{ width: s * 0.12, height: s * 0.12, borderRadius: s * 0.06, background: color }} />
            </div>
          ))}
        </Box>
      )
    default:
      return <Box style={{ width: s * 0.5, height: s * 0.5, borderRadius: s * 0.25, background: color }} />
  }
}

export function BadgeIcon({
  label,
  count,
  selected,
  onPress,
  size = 'md',
  compact = false,
}: {
  label: string
  count?: number
  selected?: boolean
  onPress?: () => void
  size?: 'xs' | 'sm' | 'md'
  compact?: boolean
}) {
  const color = BADGE_COLOR[label] ?? KBC.purple
  const dim = size === 'xs' ? 24 : size === 'sm' ? 36 : 44
  const iconSz = size === 'xs' ? 10 : size === 'sm' ? 15 : 19

  const disk = (
    <div
      style={{
        width: dim,
        height: dim,
        borderRadius: dim / 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        border: `2.5px solid ${color}`,
        background: selected ? color : '#fff',
        boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
      }}
    >
      <HoldIcon badge={label} color={selected ? '#fff' : color} size={iconSz} />
      {size !== 'xs' && count != null && count > 0 && (
        <span
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 2px',
            border: '1.5px solid #fff',
            background: selected ? '#fff' : color,
            color: selected ? color : '#fff',
            fontSize: 9,
            fontWeight: 900,
          }}
        >
          {count}
        </span>
      )}
    </div>
  )

  const labelEl = (lines: 1 | 2) => (
    <span
      style={{
        marginTop: 4,
        textAlign: 'center',
        color: selected ? color : '#333',
        fontWeight: selected ? 800 : 700,
        fontSize: 9,
        lineHeight: '12px',
        display: '-webkit-box',
        WebkitLineClamp: lines,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}
    >
      {label}
    </span>
  )

  const medal =
    size === 'xs' ? (
      <div style={{ opacity: selected ? 1 : 0.4 }}>{disk}</div>
    ) : compact ? (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0', opacity: selected ? 1 : 0.4 }}>
        {disk}
        {labelEl(1)}
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0', width: 64, opacity: selected ? 1 : 0.4 }}>
        {disk}
        {labelEl(2)}
      </div>
    )

  if (onPress) {
    return (
      <button type="button" onClick={onPress} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
        {medal}
      </button>
    )
  }
  return medal
}
