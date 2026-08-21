import { describe, expect, it } from 'vitest'
import { isAdminFor, isPrivileged } from './roles'

const SUPER_ADMIN = 'admin@kbc.example'

describe('isAdminFor', () => {
  it('grants admin to the super-admin email, case-insensitively', () => {
    expect(isAdminFor('Admin@KBC.example', false, SUPER_ADMIN)).toBe(true)
  })

  it('grants admin when the Firestore profile flag is true', () => {
    expect(isAdminFor('someone@example.com', true, SUPER_ADMIN)).toBe(true)
  })

  it('denies admin for a non-admin email with no profile flag', () => {
    expect(isAdminFor('someone@example.com', false, SUPER_ADMIN)).toBe(false)
    expect(isAdminFor('someone@example.com', undefined, SUPER_ADMIN)).toBe(false)
  })

  it('denies admin when superAdminEmail is unset, even for a matching-looking email', () => {
    expect(isAdminFor('admin@kbc.example', false, '')).toBe(false)
  })

  it('denies admin for a null/undefined email unless the profile flag is set', () => {
    expect(isAdminFor(null, false, SUPER_ADMIN)).toBe(false)
    expect(isAdminFor(undefined, true, SUPER_ADMIN)).toBe(true)
  })
})

describe('isPrivileged', () => {
  it('is true for admins (via the Firestore isAdmin flag)', () => {
    expect(isPrivileged('member@example.com', { isAdmin: true })).toBe(true)
  })

  it('is true for supervisors', () => {
    expect(isPrivileged('member@example.com', { isSupervisor: true })).toBe(true)
  })

  it('is false for a plain member', () => {
    expect(isPrivileged('member@example.com', { isAdmin: false, isSupervisor: false })).toBe(false)
  })

  it('is false when profile is null/undefined', () => {
    expect(isPrivileged('member@example.com', null)).toBe(false)
    expect(isPrivileged('member@example.com', undefined)).toBe(false)
  })
})
