import { describe, expect, it } from 'vitest'
import { isProfileComplete, missingProfileFields, parseEmergencyContact } from './memberProfile'

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
