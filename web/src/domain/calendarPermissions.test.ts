import { describe, expect, it } from 'vitest'
import {
  canDeleteEvent,
  canEditEvent,
  canJoinEvent,
  defaultCreateKind,
  isOwnEvent,
  type CalendarActor,
} from './calendarPermissions'
import type { CalendarEvent } from '@/services/calendar'

const member: CalendarActor = { uid: 'u_member', name: 'Garry', privileged: false }
const other: CalendarActor = { uid: 'u_other', name: 'Andy', privileged: false }
const supervisor: CalendarActor = { uid: 'u_super', name: 'Artur', privileged: true }

function event(summary: string, priv: Record<string, string> = {}): CalendarEvent {
  return {
    id: summary,
    summary,
    start: { dateTime: '2026-06-15T18:00:00' },
    end: { dateTime: '2026-06-15T20:00:00' },
    ...(Object.keys(priv).length > 0 ? { extendedProperties: { private: priv } } : {}),
  }
}

const session = event('Artur (super)', { createdByUserId: 'u_super', createdByRole: 'supervisor' })
const ownRequest = event('Garry (requested)', { type: 'request', createdByUserId: 'u_member' })
const othersRequest = event('Andy (requested)', { type: 'request', createdByUserId: 'u_other' })
const special = event('Ladies Night', { type: 'specialEvent', createdByUserId: 'u_super' })

describe('canJoinEvent', () => {
  it('allows joining sessions and requests', () => {
    expect(canJoinEvent(session)).toBe(true)
    expect(canJoinEvent(ownRequest)).toBe(true)
  })

  it('refuses special events', () => {
    expect(canJoinEvent(special)).toBe(false)
  })
})

describe('canEditEvent / canDeleteEvent', () => {
  it('lets a supervisor change anything', () => {
    for (const e of [session, ownRequest, othersRequest, special]) {
      expect(canEditEvent(e, supervisor)).toBe(true)
      expect(canDeleteEvent(e, supervisor)).toBe(true)
    }
  })

  it('lets a member change their own request', () => {
    expect(canEditEvent(ownRequest, member)).toBe(true)
    expect(canDeleteEvent(ownRequest, member)).toBe(true)
  })

  it("refuses a member someone else's request", () => {
    expect(canEditEvent(othersRequest, member)).toBe(false)
    expect(canDeleteEvent(othersRequest, member)).toBe(false)
  })

  it('refuses a member a supervisor session or a special event', () => {
    expect(canEditEvent(session, member)).toBe(false)
    expect(canDeleteEvent(special, member)).toBe(false)
  })

  it('refuses a member a special event they somehow created', () => {
    const mine = event('Ladies Night', { type: 'specialEvent', createdByUserId: 'u_member' })
    expect(canEditEvent(mine, member)).toBe(false)
  })
})

describe('isOwnEvent', () => {
  it('matches on createdByUserId when the app wrote it', () => {
    expect(isOwnEvent(ownRequest, member)).toBe(true)
    expect(isOwnEvent(ownRequest, other)).toBe(false)
  })

  it('falls back to the title for legacy events with no extended properties', () => {
    const legacy = event('Garry (requested)')
    expect(isOwnEvent(legacy, member)).toBe(true)
    expect(isOwnEvent(legacy, other)).toBe(false)
  })

  it('ignores the title once createdByUserId is present', () => {
    // A supervisor opening a slot on a member's behalf: the name in the title
    // is the member's, but the event is the supervisor's to manage.
    const onBehalf = event('Garry (requested)', { createdByUserId: 'u_super' })
    expect(isOwnEvent(onBehalf, member)).toBe(false)
  })
})

describe('defaultCreateKind', () => {
  it('gives supervisors a session and everyone else a request', () => {
    expect(defaultCreateKind(supervisor)).toBe('session')
    expect(defaultCreateKind(member)).toBe('request')
  })
})
