import { describe, expect, it } from 'vitest'
import { initials } from './name'

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Jane Smith')).toBe('JS')
    expect(initials('Ada Byron Lovelace')).toBe('AB')
  })

  it('upper-cases and handles a single name', () => {
    expect(initials('jane')).toBe('J')
  })

  it('ignores stray whitespace', () => {
    expect(initials('  Jane   Smith ')).toBe('JS')
  })

  it('answers empty for a record with no name on it', () => {
    expect(initials(undefined)).toBe('')
    expect(initials(null)).toBe('')
    expect(initials('   ')).toBe('')
  })
})
