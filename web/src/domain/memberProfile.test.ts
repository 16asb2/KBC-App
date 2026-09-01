import { describe, expect, it } from 'vitest'
import {
  findExistingRecord,
  findProfileByEmailIn,
  isProfileComplete,
  mergeAdditionalEmails,
  missingProfileFields,
  needsProfileReview,
  normaliseEmail,
  normaliseLegalName,
  parseEmergencyContact,
} from './memberProfile'

const FULL_EC = JSON.stringify({
  name: 'John Smith',
  relationship: 'Partner',
  phone: '+16135550123',
})

describe('parseEmergencyContact', () => {
  it('reads the JSON string the record actually stores', () => {
    expect(parseEmergencyContact(FULL_EC)).toEqual({
      name: 'John Smith',
      relationship: 'Partner',
      phone: '+16135550123',
    })
  })

  it('treats absent, empty and unparseable alike, rather than throwing', () => {
    // A half-written record is the case this module exists to catch, so it must
    // never be the thing that crashes the screen reporting it.
    expect(parseEmergencyContact(undefined)).toBeNull()
    expect(parseEmergencyContact('')).toBeNull()
    expect(parseEmergencyContact('{ not json')).toBeNull()
    expect(parseEmergencyContact('null')).toBeNull()
  })

  it('fills absent keys with empty strings so callers need not guard each one', () => {
    expect(parseEmergencyContact('{"name":"Jo"}')).toEqual({
      name: 'Jo',
      relationship: '',
      phone: '',
    })
  })

  it('trims, so whitespace does not pass for a value', () => {
    expect(parseEmergencyContact('{"name":"  ","relationship":" x ","phone":""}')).toEqual({
      name: '',
      relationship: 'x',
      phone: '',
    })
  })
})

describe('missingProfileFields', () => {
  it('is empty for a finished profile', () => {
    expect(missingProfileFields({ legalName: 'Jane Smith', emergencyContact: FULL_EC })).toEqual([])
    expect(isProfileComplete({ legalName: 'Jane Smith', emergencyContact: FULL_EC })).toBe(true)
  })

  it('names every missing piece of the emergency contact separately', () => {
    const missing = missingProfileFields({
      legalName: 'Jane Smith',
      emergencyContact: JSON.stringify({ name: 'John', relationship: '', phone: '' }),
    })
    expect(missing.map((m) => m.key)).toEqual([
      'emergencyContactRelationship',
      'emergencyContactPhone',
    ])
  })

  it('reports a record imported with nothing but a name and email', () => {
    const missing = missingProfileFields({ legalName: '', emergencyContact: undefined })
    expect(missing.map((m) => m.key)).toEqual([
      'legalName',
      'emergencyContactName',
      'emergencyContactRelationship',
      'emergencyContactPhone',
    ])
    expect(isProfileComplete({ legalName: '', emergencyContact: undefined })).toBe(false)
  })

  it('does not accept whitespace as a legal name', () => {
    expect(missingProfileFields({ legalName: '   ', emergencyContact: FULL_EC })[0].key).toBe(
      'legalName',
    )
  })

  it('says nothing is missing from a profile that does not exist yet', () => {
    // A brand-new signed-in user has no record at all; that is the setup flow's
    // business, not an incomplete-import prompt.
    expect(missingProfileFields(null)).toEqual([])
    expect(isProfileComplete(null)).toBe(false)
  })

  it('carries a label fit to show the member', () => {
    const missing = missingProfileFields({ legalName: '', emergencyContact: FULL_EC })
    expect(missing[0].label).toBe('Legal name')
  })
})

describe('needsProfileReview', () => {
  const COMPLETE = { legalName: 'Jane Smith', emergencyContact: FULL_EC }

  it('sends a member with nothing on file to the form', () => {
    expect(needsProfileReview(null)).toBe(true)
    expect(needsProfileReview(undefined)).toBe(true)
  })

  it('sends an incomplete record to the form', () => {
    expect(needsProfileReview({ legalName: 'Jane Smith' })).toBe(true)
  })

  it('shows a complete but unreviewed record to its owner once', () => {
    // The imported case: everything the app asks for is there, but the member
    // has never seen it, and the waiver after this is signed against it.
    expect(needsProfileReview(COMPLETE)).toBe(true)
  })

  it('stops asking once the member has confirmed it', () => {
    expect(needsProfileReview({ ...COMPLETE, profileReviewedAt: '2026-08-31T12:00:00.000Z' })).toBe(
      false,
    )
  })

  it('leaves members who onboarded before the field existed alone', () => {
    // A signed membership waiver can only have come from this app's own
    // onboarding, which is behind this very form. Without this, every existing
    // member would be marched back through setup on their next visit.
    expect(needsProfileReview({ ...COMPLETE, waiverMembership: '{"signedAt":"2026-01-01"}' })).toBe(
      false,
    )
  })

  it('still asks an old member for a gap, waiver or no waiver', () => {
    expect(
      needsProfileReview({ legalName: 'Jane Smith', waiverMembership: '{"signedAt":"x"}' }),
    ).toBe(true)
  })
})

describe('normaliseLegalName', () => {
  it('ignores case, accents and repeated whitespace', () => {
    expect(normaliseLegalName('  JANE   Smith ')).toBe('jane smith')
    expect(normaliseLegalName('José Núñez')).toBe(normaliseLegalName('jose nunez'))
  })

  it('keeps punctuation, which distinguishes real names', () => {
    expect(normaliseLegalName("Jane O'Neill")).toBe("jane o'neill")
    expect(normaliseLegalName("Jane O'Neill")).not.toBe(normaliseLegalName('Jane ONeill'))
  })

  it('treats absent as empty', () => {
    expect(normaliseLegalName(undefined)).toBe('')
    expect(normaliseLegalName('   ')).toBe('')
  })
})

describe('findExistingRecord', () => {
  const row = (over = {}) => ({
    uid: 'imported_1',
    email: 'onfile@example.com',
    legalName: 'Jane Smith',
    ...over,
  })

  it('prefers the email, which is the thing the account actually proves', () => {
    const rows = [
      row({ uid: 'by_name', email: 'stale@example.com' }),
      row({ uid: 'by_email', legalName: 'Someone Else' }),
    ]
    expect(findExistingRecord(rows, 'onfile@example.com', ['Jane Smith'], 'uid-new')?.uid).toBe(
      'by_email',
    )
  })

  it('falls back to the legal name when no record carries the address', () => {
    // The case that cost a real membership: the gym holds the member under an
    // address they no longer use, so an email match finds nobody and the app
    // greeted a member of years' standing as a stranger.
    expect(findExistingRecord([row()], 'new@gmail.com', ['Jane Smith'], 'uid-new')?.uid).toBe(
      'imported_1',
    )
  })

  it('tries the names in the order given', () => {
    // The typed legal name first, then whatever Google calls the account.
    const rows = [row({ uid: 'typed' }), row({ uid: 'google', legalName: 'Janey Smith' })]
    expect(findExistingRecord(rows, 'new@x.com', ['Jane Smith', 'Janey Smith'], 'u')?.uid).toBe(
      'typed',
    )
    expect(findExistingRecord(rows, 'new@x.com', [undefined, 'Janey Smith'], 'u')?.uid).toBe(
      'google',
    )
  })

  it('matches a name whatever its case, accents or spacing', () => {
    expect(findExistingRecord([row()], 'new@x.com', ['  jane   SMITH '], 'u')?.uid).toBe(
      'imported_1',
    )
  })

  it('finds records a member has really used, which is the point', () => {
    // The narrower version this replaced skipped anything bearing a waiver, a
    // sign-in or a confirmation — so the records most worth finding, belonging
    // to real members with real history, were the ones it would not find.
    const used = row({
      waiverMembership: '{"signedAt":"x"}',
      lastSignInAt: '2026-08-30T18:00:00.000Z',
      profileReviewedAt: '2026-08-30T18:00:00.000Z',
    })
    expect(findExistingRecord([used], 'new@gmail.com', ['Jane Smith'], 'uid-new')?.uid).toBe(
      'imported_1',
    )
  })

  it('refuses to guess between two people of the same name', () => {
    const rows = [row(), row({ uid: 'imported_2' })]
    expect(findExistingRecord(rows, 'new@x.com', ['Jane Smith'], 'uid-new')).toBeNull()
  })

  it('still matches by email when the name is ambiguous', () => {
    const rows = [row({ email: 'a@x.com' }), row({ uid: 'imported_2', email: 'b@x.com' })]
    expect(findExistingRecord(rows, 'b@x.com', ['Jane Smith'], 'uid-new')?.uid).toBe('imported_2')
  })

  it('never matches the caller against their own record', () => {
    expect(
      findExistingRecord([row({ uid: 'uid-new' })], 'onfile@example.com', ['Jane Smith'], 'uid-new'),
    ).toBeNull()
  })

  it('ignores empty names rather than matching every record without one', () => {
    const rows = [row({ legalName: '' }), row({ uid: 'imported_2', legalName: undefined })]
    expect(findExistingRecord(rows, 'new@x.com', ['', '   ', undefined], 'uid-new')).toBeNull()
  })
})

describe('mergeAdditionalEmails', () => {
  it('keeps the address the gym had on file when it is replaced', () => {
    expect(mergeAdditionalEmails(undefined, 'old@example.com', 'new@example.com')).toEqual([
      'old@example.com',
    ])
  })

  it('appends rather than replacing what is already listed', () => {
    expect(
      mergeAdditionalEmails('["other@example.com"]', 'old@example.com', 'new@example.com'),
    ).toEqual(['other@example.com', 'old@example.com'])
  })

  it('does not list an address twice, whatever its case', () => {
    expect(mergeAdditionalEmails('["OLD@example.com"]', 'old@example.com', 'new@x.com')).toEqual([
      'OLD@example.com',
    ])
    expect(mergeAdditionalEmails('[]', 'Same@example.com', 'same@example.com')).toEqual([])
  })

  it('survives an unparseable stored value', () => {
    expect(mergeAdditionalEmails('{ not json', 'old@example.com', 'new@x.com')).toEqual([
      'old@example.com',
    ])
  })
})

describe('findProfileByEmailIn', () => {
  it('matches however the address happens to be stored', () => {
    // The whole join hangs on this. An indexed equality filter only ever
    // matches a record already saved lower case, and a list loaded outside
    // admin-web/ need not be — the member then registers from scratch beside
    // the membership they paid for.
    const rows = [{ uid: 'imported_1', email: 'Jane@Example.COM' }]
    expect(findProfileByEmailIn(rows, 'jane@example.com')?.uid).toBe('imported_1')
    expect(findProfileByEmailIn(rows, '  JANE@example.com  ')?.uid).toBe('imported_1')
  })

  it('finds nothing for an address nobody holds', () => {
    expect(findProfileByEmailIn([{ uid: 'a', email: 'jane@example.com' }], 'sam@x.com')).toBeNull()
  })

  it('refuses an empty address rather than matching a record with none', () => {
    expect(findProfileByEmailIn([{ uid: 'a', email: '' }], '  ')).toBeNull()
    expect(findProfileByEmailIn([{ uid: 'a', email: undefined as unknown as string }], '')).toBeNull()
  })

  it('takes the first of a duplicated address, as the query it backs up would', () => {
    const rows = [
      { uid: 'first', email: 'jane@example.com' },
      { uid: 'second', email: 'JANE@example.com' },
    ]
    expect(findProfileByEmailIn(rows, 'jane@example.com')?.uid).toBe('first')
  })

  it('normalises the same way on both sides', () => {
    expect(normaliseEmail('  Jane@Example.com ')).toBe('jane@example.com')
    expect(normaliseEmail(undefined)).toBe('')
  })
})
