import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import adminHtml from '../../../admin-web/index.html?raw'
import { isActiveMember, smartSortMembers, type SortableMember } from './memberSort'

// Smart Sort exists twice: here, and hand-copied into `admin-web/index.html`,
// which is one static file with no bundler and no test run of its own. A
// comment saying "keep these in step" is not a mechanism, and the two drifting
// apart is not a cosmetic problem — the directory and the app would rank the
// same member differently and quietly disagree about who is active.
//
// So this lifts the copy straight out of the panel and runs it. Reading
// `admin-web/` from web/'s test suite crosses a boundary this repo otherwise
// keeps, and it earns that by being the only thing holding the copy honest.
//
// If it fails with "could not find …", the panel has been reorganised rather
// than broken: re-point the markers below at wherever the block lives now.

/** The panel's whole inline script — the same block CI parses before deploying. */
function inlineScript(): string {
  const match = adminHtml.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('could not find an inline script in admin-web/index.html')
  return match[1]
}

/** One top-level `function name(…) { … }`, brace-matched out of the source. */
function liftFunction(script: string, name: string): string {
  const start = script.indexOf(`\nfunction ${name}(`)
  if (start === -1) throw new Error(`could not find function ${name}() in admin-web/index.html`)
  let depth = 0
  for (let i = script.indexOf('{', start); i < script.length; i++) {
    if (script[i] === '{') depth++
    else if (script[i] === '}' && --depth === 0) return script.slice(start, i + 1)
  }
  throw new Error(`unbalanced braces reading ${name}() out of admin-web/index.html`)
}

type AdminApi = {
  compareSmart: (a: SortableMember, b: SortableMember, now: number) => number
  isActiveMember: (m: SortableMember) => boolean
  recomputeSmartRanks: () => void
  smartRankOf: (m: SortableMember) => number
  smartReason: (m: SortableMember) => string
  setMemberList: (rows: readonly SortableMember[]) => void
}

/**
 * The panel's Smart Sort block, evaluated on its own.
 *
 * Only the block and the handful of one-liners it leans on: the rest of that
 * file wants a browser, a Firebase SDK and a signed-in admin, none of which
 * this has anything to say about.
 */
function loadAdminSmartSort(): AdminApi {
  const script = inlineScript()
  const from = script.indexOf('// ── SMART SORT')
  if (from === -1) throw new Error('could not find the SMART SORT block in admin-web/index.html')
  const activeFn = liftFunction(script, 'isActiveMember')
  const block = script.slice(from, script.indexOf(activeFn) + activeFn.length)

  const source = [
    'let memberList = []',
    "const PASS_OPTIONS = [{id:'annual'},{id:'8month'},{id:'4month'},{id:'1month'}]",
    liftFunction(script, 'isDatedPass'),
    liftFunction(script, 'passOf'),
    liftFunction(script, 'isConfirmed'),
    // Only ever concatenated into the tooltip string, so its exact wording is
    // not what this is holding to anything.
    'function accessPassName(m){ return passOf(m) }',
    block,
    'return { compareSmart, isActiveMember, recomputeSmartRanks, smartRankOf, smartReason,',
    '         setMemberList(rows) { memberList = rows } }',
  ].join('\n')

  return new Function(source)() as AdminApi
}

const NOW = new Date('2026-09-03T12:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

function member(over: Partial<SortableMember> & { name: string }): SortableMember & { uid: string } {
  return {
    uid: over.name,
    membershipAccessPass: 'none',
    membershipConfirmed: true,
    punchPassRemaining: 0,
    ...over,
  }
}

// One of each shape the two rules have an opinion about, including what a real
// directory is actually full of: half-written rows and imported names.
const FIXTURES = [
  member({ name: 'RegularWithPass', lastSignInAt: daysAgo(2), membershipAccessPass: 'annual' }),
  member({ name: 'RegularNoPass', lastSignInAt: daysAgo(3) }),
  member({ name: 'SameWeekWithPass', lastSignInAt: daysAgo(6), membershipAccessPass: 'annual' }),
  member({ name: 'PunchHolder', lastSignInAt: daysAgo(40), punchPassRemaining: 5 }),
  member({
    name: 'Unconfirmed',
    lastSignInAt: daysAgo(40),
    membershipAccessPass: 'annual',
    membershipConfirmed: false,
  }),
  member({ name: 'StaleWithPass', lastSignInAt: daysAgo(200), membershipAccessPass: 'annual' }),
  member({ name: 'BoughtTodayNeverIn', membershipAccessPass: 'annual' }),
  member({ name: 'Imported' }),
  member({ name: 'AlsoImported' }),
  member({ name: 'BrokenTimestamp', lastSignInAt: 'not a date' }),
  member({ name: 'FutureStamp', lastSignInAt: daysAgo(-3) }),
]

describe('admin-web mirrors the Smart Sort rule', () => {
  const admin = loadAdminSmartSort()

  // The panel's copy reads the wall clock — it has no `now` to be handed, being
  // called straight out of a render. Pinning it is what stops a fixture sitting
  // near a bucket edge from deciding this on the day it is run.
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  it('ranks a directory in exactly the same order', () => {
    const mirrored = [...FIXTURES]
      .sort((a, b) => admin.compareSmart(a, b, NOW.getTime()))
      .map((m) => m.name)
    expect(mirrored).toEqual(smartSortMembers(FIXTURES, NOW).map((m) => m.name))
  })

  it('agrees on who is an active member, record by record', () => {
    for (const m of FIXTURES) {
      expect({ name: m.name, active: admin.isActiveMember(m) }).toEqual({
        name: m.name,
        active: isActiveMember(m, NOW),
      })
    }
  })

  it('numbers the directory from the top and explains every rank', () => {
    admin.setMemberList(FIXTURES)
    admin.recomputeSmartRanks()
    const ranked = smartSortMembers(FIXTURES, NOW)
    expect(admin.smartRankOf(ranked[0])).toBe(1)
    expect(admin.smartRankOf(ranked[ranked.length - 1])).toBe(FIXTURES.length)
    for (const m of FIXTURES) expect(admin.smartReason(m)).toMatch(/^Smart Sort #\d+ — /)
  })
})
