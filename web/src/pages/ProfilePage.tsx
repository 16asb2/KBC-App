import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MemberHistoryModal, type HistoryKind } from '@/components/MemberHistoryModal'
import { PassBadge } from '@/components/PassBadge'
import { ProfileEditModal } from '@/components/ProfileEditModal'
import { WAIVER_META, type WaiverType } from '@/constants/waivers'
import { KBC, tint } from '@/constants/theme'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import {
  daysUntil,
  parsePendingMembership,
  parseWaiver,
  passState,
  type PassState,
} from '@/domain/memberAccess'
import { parseAdditionalEmails, parseEmergencyContact } from '@/domain/memberProfile'
import { accessPassLabel, isDatedPass, passFromDates } from '@/domain/membershipPass'
import { isAdmin } from '@/domain/roles'
import { updateProfile } from '@/services/profiles'
import type { UserProfile } from '@/types/member'
import { formatRelativeDateTime, formatShortDate } from '@/utils/datetime'
import { initials } from '@/utils/name'

// A member's own record, on a route of its own.
//
// It used to be a card at the top of the members screen — which is gated on
// isPrivileged, so the only people who could see their own profile were the
// ones who could already see everybody's. An ordinary member had no way to read
// what the gym holds about them, correct a phone number, or check how many
// punches they had left. That card is gone: the directory is now the directory,
// and this is the profile.
//
// Everything here is the member's own document, so `firestore.rules` permits
// the reads and the edits without any role at all: users/{uid} is readable by
// any signed-in member and updatable by its owner, as long as the write keeps
// off the privileged fields (roles, passes, punches, confirmations). The edit
// modal only ever writes names, contact details, emergency contact and notes,
// so it stays inside that. Nothing on this screen changes a pass — buying one
// goes through the sign-in flow on Home, where an admin still confirms it.

export function ProfilePage() {
  const { user } = useAuth()
  const { profile, reloadProfile } = useProfile()
  const [editing, setEditing] = useState(false)
  const [history, setHistory] = useState<HistoryKind | null>(null)

  if (!profile || !user) return null

  const viewerIsAdmin = isAdmin(user.email, profile.isAdmin)
  const displayName = profile.preferredName || profile.name
  const emergency = parseEmergencyContact(profile.emergencyContact)
  const otherEmails = parseAdditionalEmails(profile.additionalEmails)

  async function handleSave(updates: Partial<UserProfile>) {
    if (!profile || !user) return
    await updateProfile(profile.uid, updates, user.email ?? 'unknown')
    // The header, and every other screen reading useProfile(), are showing the
    // old values until this lands.
    await reloadProfile()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6 pb-16">
      <IdentityCard profile={profile} onEdit={() => setEditing(true)} />

      <AccessCard profile={profile} onViewHistory={setHistory} />

      <Card
        title="Personal information"
        action={
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border px-3 py-1.5 text-[13px] font-bold"
            style={{ borderColor: KBC.cyan, color: KBC.cyan }}
          >
            Edit
          </button>
        }
      >
        <dl className="divide-y divide-neutral-100">
          <Row label="Full legal name" hint="ask a supervisor to change this">
            {profile.legalName || profile.name}
          </Row>
          <Row label="Google account name">{profile.name}</Row>
          <Row label="Preferred name">{profile.preferredName || '—'}</Row>
          <Row label="Google account email">{profile.email}</Row>
          {profile.preferredEmail && profile.preferredEmail !== profile.email && (
            <Row label="Preferred contact email">{profile.preferredEmail}</Row>
          )}
          {otherEmails.length > 0 && <Row label="Additional emails">{otherEmails.join(', ')}</Row>}
          <Row label="Phone">{profile.phone || '—'}</Row>
          <Row label="Emergency contact">
            {emergency?.name ? (
              <>
                {emergency.name}
                {emergency.relationship && (
                  <span className="text-neutral-500"> · {emergency.relationship}</span>
                )}
                {emergency.phone && <div className="text-neutral-500">{emergency.phone}</div>}
              </>
            ) : (
              <span className="font-semibold" style={{ color: KBC.orange }}>
                Not on file — please add one
              </span>
            )}
          </Row>
          {profile.additionalComments && (
            <Row label="Notes for KBC staff">{profile.additionalComments}</Row>
          )}
        </dl>
      </Card>

      <WaiversCard profile={profile} />

      {editing && (
        <ProfileEditModal
          profile={profile}
          // Legal name is what the waivers were signed against, so only admins
          // may change it — including on their own record.
          canEditLegalName={viewerIsAdmin}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      )}

      {history && (
        <MemberHistoryModal
          uid={profile.uid}
          memberName={displayName}
          kind={history}
          onClose={() => setHistory(null)}
        />
      )}
    </div>
  )
}

function IdentityCard({ profile, onEdit }: { profile: UserProfile; onEdit: () => void }) {
  const displayName = profile.preferredName || profile.name

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: KBC.black }}>
      <div className="flex items-center gap-4">
        {profile.photo ? (
          <img
            src={profile.photo}
            alt=""
            className="size-16 shrink-0 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="flex size-16 shrink-0 items-center justify-center rounded-full text-lg font-extrabold text-white"
            style={{ backgroundColor: KBC.pink }}
          >
            {initials(displayName)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-extrabold text-white">{displayName}</p>
          {profile.preferredName && (
            <p className="truncate text-xs text-neutral-400">{profile.name}</p>
          )}
          <p className="truncate text-sm text-neutral-400">
            {profile.preferredEmail || profile.email}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.isAdmin && <Tag color={KBC.purple}>ADMIN</Tag>}
            {profile.isSupervisor && <Tag color={KBC.pink}>SUPERVISOR</Tag>}
            <Tag color={KBC.darkGrey}>MEMBER SINCE {formatShortDate(profile.memberSince)}</Tag>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="mt-4 w-full rounded-xl p-3 text-sm font-extrabold text-white"
        style={{ backgroundColor: KBC.cyan }}
      >
        Edit my information
      </button>
    </div>
  )
}

/**
 * What the member holds, and what it is worth right now.
 *
 * A dated pass that lapsed has already been cleared to 'none' by
 * `checkAndClearLapsedPass` before this renders, so "no pass" is the usual way
 * an expiry shows up here. The dates stay on the record, which is enough to say
 * *which* pass ran out and when, rather than leaving the member looking at a
 * blank and wondering where their membership went.
 */
function AccessCard({
  profile,
  onViewHistory,
}: {
  profile: UserProfile
  onViewHistory: (kind: HistoryKind) => void
}) {
  const state: PassState = passState(profile)
  const daysLeft = isDatedPass(profile.membershipAccessPass)
    ? daysUntil(profile.membershipExpiry)
    : null
  const pendingMembership = parsePendingMembership(profile.pendingMembership)
  const pendingPunches = profile.pendingPunches ?? 0
  const lapsedDays = state === 'none' ? daysUntil(profile.membershipExpiry) : null
  const lapsed =
    lapsedDays !== null && lapsedDays < 0
      ? passFromDates(profile.membershipStart, profile.membershipExpiry)
      : 'none'

  return (
    <Card title="My passes">
      <div className="flex flex-wrap items-center gap-2">
        <PassBadge pass={profile.membershipAccessPass} confirmed={profile.membershipConfirmed} />
        {state === 'pending' && (
          <span className="text-sm font-semibold" style={{ color: KBC.orange }}>
            Waiting for a KBC admin to confirm your payment
          </span>
        )}
        {state === 'expired' && (
          <span className="text-sm font-semibold" style={{ color: KBC.orange }}>
            Expired
          </span>
        )}
      </div>

      {isDatedPass(profile.membershipAccessPass) && profile.membershipStart && (
        <p className="mt-2 text-sm text-neutral-600">
          {formatShortDate(profile.membershipStart)} →{' '}
          {profile.membershipExpiry ? formatShortDate(profile.membershipExpiry) : '—'}
          {daysLeft !== null && (
            <span className="text-neutral-400"> · {daysLeftLabel(daysLeft)}</span>
          )}
        </p>
      )}

      {lapsed !== 'none' && profile.membershipExpiry && (
        <p className="mt-2 text-sm text-neutral-600">
          Your {accessPassLabel(lapsed).toLowerCase()} ran out on{' '}
          {formatShortDate(profile.membershipExpiry)}.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Stat
          label={`Punch${profile.punchPassRemaining === 1 ? '' : 'es'} remaining`}
          value={String(profile.punchPassRemaining)}
          color={profile.punchPassRemaining > 0 ? KBC.cyan : '#9ca3af'}
        />
        <Stat
          label="Last signed in"
          value={
            profile.lastSignInAt ? formatRelativeDateTime(profile.lastSignInAt) : 'No visits yet'
          }
          color={KBC.green}
        />
      </div>

      {(pendingMembership || pendingPunches > 0) && (
        <p
          className="mt-3 rounded-xl p-3 text-sm font-semibold"
          style={{ backgroundColor: tint(KBC.orange), color: KBC.orange }}
        >
          Awaiting confirmation:{' '}
          {pendingMembership
            ? `${pendingMembership.label}${pendingMembership.price ? ` (${pendingMembership.price})` : ''}`
            : `${pendingPunches} punch${pendingPunches === 1 ? '' : 'es'}`}
          . A KBC admin will confirm it once your payment is in — you can still climb in the
          meantime.
        </p>
      )}

      {state === 'none' && profile.punchPassRemaining === 0 && (
        <p className="mt-3 text-sm text-neutral-500">
          You have no access pass right now.{' '}
          <Link to="/home" className="font-bold" style={{ color: KBC.cyan }}>
            Buy one when you sign in to a session →
          </Link>
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <HistoryButton onClick={() => onViewHistory('purchases')}>Access pass history</HistoryButton>
        <HistoryButton onClick={() => onViewHistory('signins')}>My visits</HistoryButton>
      </div>
    </Card>
  )
}

/** "45 days left" / "ends today" / "ended 3 days ago" — whichever applies. */
function daysLeftLabel(days: number): string {
  if (days > 1) return `${days} days left`
  if (days === 1) return 'last day tomorrow'
  if (days === 0) return 'ends today'
  return `ended ${-days} day${days === -1 ? '' : 's'} ago`
}

function WaiversCard({ profile }: { profile: UserProfile }) {
  const types = Object.keys(WAIVER_META) as WaiverType[]
  return (
    <Card title="Waivers">
      <dl className="divide-y divide-neutral-100">
        {types.map((type) => {
          const meta = WAIVER_META[type]
          const signed = parseWaiver(profile[meta.profileKey])
          return (
            <Row key={type} label={meta.title}>
              {signed ? (
                <>
                  <span className="font-semibold" style={{ color: KBC.green }}>
                    Signed {formatShortDate(signed.signedAt)}
                  </span>
                  <div className="text-neutral-500">
                    by {signed.signedBy}
                    {signed.guardian && ` (guardian: ${signed.guardian})`}
                  </div>
                  {signed.docUrl && (
                    <a
                      href={signed.docUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold"
                      style={{ color: KBC.cyan }}
                    >
                      View signed copy →
                    </a>
                  )}
                </>
              ) : (
                <Link to={`/waiver/${type}`} className="font-bold" style={{ color: KBC.orange }}>
                  Not signed — sign it now →
                </Link>
              )}
            </Row>
          )
        })}
      </dl>
    </Card>
  )
}

function Card({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-extrabold tracking-wide text-neutral-400 uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-[11px] font-bold tracking-wide text-neutral-500 uppercase sm:pt-1">
        {label}
        {hint && <span className="block normal-case opacity-70">({hint})</span>}
      </dt>
      <dd className="text-[15px] break-words text-neutral-900">{children}</dd>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="min-w-32 flex-1 rounded-xl p-3" style={{ backgroundColor: tint(color) }}>
      <p className="text-[11px] font-bold tracking-wide text-neutral-500 uppercase">{label}</p>
      <p className="text-[15px] font-extrabold" style={{ color }}>
        {value}
      </p>
    </div>
  )
}

function HistoryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-xl border p-2.5 text-sm font-bold"
      style={{ borderColor: KBC.cyan, color: KBC.cyan }}
    >
      {children}
    </button>
  )
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white"
      style={{ backgroundColor: color }}
    >
      {children}
    </span>
  )
}
