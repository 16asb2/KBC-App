import type { AccessPassId } from '@/types/member'
import { membershipGrantsEntry } from './membershipPass'

// Smart Sort — the order every member list opens on.
//
// Three screens ask the same question and used to answer it three different
// ways: the picker behind **Sign In Another Climber**, the **Members** tab here,
// and the members directory in `admin-web/`. Alphabetical is the order that
// needs no thought and helps least — the person standing at the desk is almost
// never near the top of the alphabet, so finding them meant typing their name
// every single time, in all three places.
//
// Who is most likely to be the one you are looking for? Two things say so, and
// they are the two the gym already records:
//
//   1. **When they were last in.** A regular is far more likely to be at the
//      desk than somebody on an imported roster who has never opened the app.
//   2. **Whether anything on their record admits them.** A confirmed pass or a
//      punch in hand. Somebody with neither cannot be signed in without buying
//      something first, so they are rarely the answer.
//
// Recency is the first criterion and access the second, which is the ordering
// the gym asked for — but stated that literally, the second criterion would
// never once run: last sign-in is a millisecond timestamp, so no two members
// ever tie on it and the pass would never get to break anything. So recency is
// compared as a **bucket** and not as an instant. Within a bucket the two
// members are "about as recent as each other" and access decides; the exact
// timestamp is still there, one step further down, to order what is left.

/**
 * The fields Smart Sort reads. A narrow shape rather than `UserProfile`, so the
 * rule can be tested against a two-field object and — more to the point — so
 * the mirrored copy in `admin-web/index.html` has something to be a copy *of*.
 */
export type SortableMember = {
  membershipAccessPass: AccessPassId
  membershipConfirmed: boolean
  punchPassRemaining?: number
  lastSignInAt?: string
  name?: string
  preferredName?: string
}

/**
 * The bucket edges, in days since the member was last seen: this week, this
 * month, this quarter, this half-year, longer ago than that.
 *
 * 183 is the last edge because that is already the line `admin-web/` draws
 * between an active member and an inactive one, and having Smart Sort disagree
 * with the badge in the next column would be its own small lie.
 */
export const RECENCY_BUCKET_EDGES = [7, 30, 90, 183] as const

/** Sorts below every bucket above: the gym has no record of this person visiting. */
export const NEVER_SEEN_BUCKET = RECENCY_BUCKET_EDGES.length + 1

/** The line between a member who has been in lately and one who has not. */
export const INACTIVE_AFTER_DAYS = 183

/**
 * Whole days since the member last signed in — `null` if the record has never
 * seen them, or carries something that is not a date.
 *
 * An unreadable timestamp is `null` rather than an exception or a 0: a single
 * hand-written document must not be able to take out the sort for the whole
 * directory, and that is not hypothetical here — `getAllProfiles` already
 * guards its own sort against exactly this.
 */
export function daysSinceLastSignIn(
  member: Pick<SortableMember, 'lastSignInAt'>,
  now: Date = new Date(),
): number | null {
  if (!member.lastSignInAt) return null
  const last = new Date(member.lastSignInAt).getTime()
  if (Number.isNaN(last)) return null
  return (now.getTime() - last) / 86_400_000
}

/**
 * Which recency bucket the member falls in — lower is more recent.
 *
 * A timestamp in the future is a clock or an import fault rather than a visit
 * that has not happened yet, and it still describes the most recent thing on
 * the record, so it sorts as recent instead of being thrown away. (The
 * Active/Inactive badge takes the opposite view of the same fault, deliberately
 * — see `isActiveMember`.)
 */
export function recencyBucket(
  member: Pick<SortableMember, 'lastSignInAt'>,
  now: Date = new Date(),
): number {
  const days = daysSinceLastSignIn(member, now)
  if (days === null) return NEVER_SEEN_BUCKET
  const edge = RECENCY_BUCKET_EDGES.findIndex((limit) => days <= limit)
  return edge === -1 ? RECENCY_BUCKET_EDGES.length : edge
}

/** Something on this record admits them through the door right now. */
export function holdsUsableAccess(member: SortableMember): boolean {
  return membershipGrantsEntry(member) || (member.punchPassRemaining ?? 0) > 0
}

/**
 * They hold *something* — it just does not let them in unaided: a pass they
 * recorded that no admin has confirmed yet, or a drop-in.
 *
 * Between a member with a pass awaiting confirmation and one with nothing at
 * all, the first is the likelier person to be at the desk — that is usually why
 * they are there.
 */
export function holdsPendingAccess(member: SortableMember): boolean {
  return member.membershipAccessPass !== 'none' && !holdsUsableAccess(member)
}

/** 0 = can walk in, 1 = holds something unconfirmed, 2 = nothing on the record. */
export function accessRank(member: SortableMember): 0 | 1 | 2 {
  if (holdsUsableAccess(member)) return 0
  if (holdsPendingAccess(member)) return 1
  return 2
}

/** The name a list shows them under, for the last tie-break. */
function displayName(member: SortableMember): string {
  return (member.preferredName || member.name) ?? ''
}

/**
 * Smart Sort itself, as a comparator: recency bucket, then access, then the
 * exact last sign-in, then the name.
 *
 * The name is on the end so the order is **total**. Without it two members who
 * have never signed in and hold nothing — most of a freshly imported roster —
 * compare equal, and equal elements land wherever the engine's sort happens to
 * put them: the list would quietly reshuffle itself between renders.
 */
export function compareMembersSmart(
  a: SortableMember,
  b: SortableMember,
  now: Date = new Date(),
): number {
  const bucket = recencyBucket(a, now) - recencyBucket(b, now)
  if (bucket !== 0) return bucket

  const access = accessRank(a) - accessRank(b)
  if (access !== 0) return access

  // Most recent first. A member never seen has nothing to compare, and sits
  // behind anyone who has — within this bucket that only ever pits two
  // never-seen members against each other, and they fall through to the name.
  const seenA = daysSinceLastSignIn(a, now)
  const seenB = daysSinceLastSignIn(b, now)
  if (seenA !== seenB) {
    if (seenA === null) return 1
    if (seenB === null) return -1
    return seenA - seenB
  }

  return displayName(a).localeCompare(displayName(b))
}

/** The list in Smart Sort order. Copied, never sorted in place. */
export function smartSortMembers<T extends SortableMember>(
  members: readonly T[],
  now: Date = new Date(),
): T[] {
  return [...members].sort((a, b) => compareMembersSmart(a, b, now))
}

/** Alphabetical, on the name the list shows. */
export function compareMembersByName(a: SortableMember, b: SortableMember): number {
  return displayName(a).localeCompare(displayName(b))
}

/**
 * Most recently seen first, and only that — the raw timestamp, no buckets and
 * no pass.
 *
 * This is the sort Smart Sort is *not*, and it is offered next to it for that
 * reason: "who was in last" is a real question, and answering it with something
 * that quietly reorders people by what they bought would be the wrong answer.
 */
export function compareMembersByLastSignIn(
  a: SortableMember,
  b: SortableMember,
  now: Date = new Date(),
): number {
  const seenA = daysSinceLastSignIn(a, now)
  const seenB = daysSinceLastSignIn(b, now)
  if (seenA === null && seenB === null) return compareMembersByName(a, b)
  if (seenA === null) return 1
  if (seenB === null) return -1
  return seenA - seenB || compareMembersByName(a, b)
}

/** The sort methods a member list offers, in the order they are offered. */
export const MEMBER_SORTS = [
  { id: 'smart', label: 'Smart' },
  { id: 'name', label: 'Name' },
  { id: 'recent', label: 'Last in' },
] as const

export type MemberSortId = (typeof MEMBER_SORTS)[number]['id']

/** One entry point for the screens: pick a method, get a new sorted array. */
export function sortMembers<T extends SortableMember>(
  members: readonly T[],
  sort: MemberSortId = 'smart',
  now: Date = new Date(),
): T[] {
  if (sort === 'name') return [...members].sort(compareMembersByName)
  if (sort === 'recent') return [...members].sort((a, b) => compareMembersByLastSignIn(a, b, now))
  return smartSortMembers(members, now)
}

/**
 * Whether the directory should call this member active.
 *
 * It used to be last-sign-in and nothing else, which called a member who bought
 * an annual pass this morning **inactive** — they had not been in yet, so on
 * the only evidence being read they looked like a name on an old roster. A
 * pass or a punch in hand is the gym's other record of a live member, and it
 * counts here now.
 *
 * A *future* timestamp still does not, which is the one place this disagrees
 * with `recencyBucket` on purpose: sorting has to put such a record somewhere
 * and recent is the least wrong place, whereas a badge asserting the member is
 * active on the strength of a visit that has not happened is simply false.
 */
export function isActiveMember(member: SortableMember, now: Date = new Date()): boolean {
  if (holdsUsableAccess(member)) return true
  const days = daysSinceLastSignIn(member, now)
  return days !== null && days >= 0 && days <= INACTIVE_AFTER_DAYS
}
