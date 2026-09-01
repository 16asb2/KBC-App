import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { OnboardingHeader } from '@/components/OnboardingHeader'
import { KBC, tint } from '@/constants/theme'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { isSelfClaimable, maskEmail, parseEmergencyContact } from '@/domain/memberProfile'
import {
  completeMemberProfile,
  findRecordsForLegalName,
  saveSetupProfile,
} from '@/services/profiles'
import type { EmergencyContact, UserProfile } from '@/types/member'

// Ported from mobile@1cdfada/app/new-member-setup.tsx, and since rebuilt around
// the question that actually matters here: *which member is this?*
//
// The legal name is the identity the gym keeps its records under. An address is
// not — members change them, and the sheet has whichever one they used years
// ago — so a first sign-in asks for the name before anything else, looks for it
// on file, and shows what it found. Everything downstream depends on that
// answer, and the only person who knows it is the one typing.
//
// Three steps, two of which most people see:
//
//   'name'    — the legal name alone, then the lookup.
//   'confirm' — the records filed under that name. "Is one of these you?"
//               Skipped entirely when nothing matched.
//   'details' — the rest of the form, prefilled from whichever record they
//               claimed, or blank if they are genuinely new.
//
// A member who already has a profile — an incomplete import matched by email at
// sign-in — starts at 'details'. Their identity is settled, and asking them to
// re-type the name their own record carries would be theatre.
type Step = 'name' | 'confirm' | 'details'

export function NewMemberSetupPage() {
  const { user } = useAuth()
  const { profile, reloadProfile } = useProfile()
  const navigate = useNavigate()

  const existingEc = parseEmergencyContact(profile?.emergencyContact)
  const isTopUp = !!profile

  const [step, setStep] = useState<Step>(isTopUp ? 'details' : 'name')
  const [legalName, setLegalName] = useState(profile?.legalName ?? user?.displayName ?? '')
  const [candidates, setCandidates] = useState<UserProfile[]>([])
  const [chosen, setChosen] = useState<UserProfile | null>(null)
  const [looking, setLooking] = useState(false)

  const [preferredName, setPreferredName] = useState(profile?.preferredName ?? '')
  const [memberPhone, setMemberPhone] = useState(profile?.phone ?? '')
  const [contactEmail, setContactEmail] = useState(profile?.preferredEmail ?? user?.email ?? '')
  const [ecName, setEcName] = useState(existingEc?.name ?? '')
  const [ecRelation, setEcRelation] = useState(existingEc?.relationship ?? '')
  const [ecPhone, setEcPhone] = useState(existingEc?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Step 1 — look the name up, and go wherever the answer points. */
  async function handleLookup(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const ln = legalName.trim()
    if (!ln) return setError('Please enter your full legal name.')
    if (!user) return

    setLooking(true)
    try {
      const found = await findRecordsForLegalName(user.uid, ln)
      setCandidates(found)
      setStep(found.length ? 'confirm' : 'details')
    } catch (err) {
      // Not fatal, and not silent either. They can still sign up, but they are
      // told the check did not happen, because carrying on regardless is how a
      // second record ends up beside the one holding their membership.
      console.warn('[Setup] Could not search for existing records:', err)
      setError(
        'We could not check whether KBC already has you on file. You can continue, but if you are an existing member, please tell staff so your records can be joined up.',
      )
      setCandidates([])
      setStep('details')
    } finally {
      setLooking(false)
    }
  }

  /** Step 2 — adopt a record, prefilling everything it already knows. */
  function claim(record: UserProfile) {
    const ec = parseEmergencyContact(record.emergencyContact)
    setChosen(record)
    setLegalName(record.legalName || legalName)
    setPreferredName(record.preferredName ?? '')
    setMemberPhone(record.phone ?? '')
    setContactEmail(record.preferredEmail || record.email || user?.email || '')
    setEcName(ec?.name ?? '')
    setEcRelation(ec?.relationship ?? '')
    setEcPhone(ec?.phone ?? '')
    setStep('details')
  }

  function declineAll() {
    setChosen(null)
    setContactEmail(user?.email ?? '')
    setStep('details')
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const ln = legalName.trim()
    const en = ecName.trim()
    const er = ecRelation.trim()
    const ep = ecPhone.trim()

    if (!ln) return setError('Please enter your legal name.')
    if (!en) return setError('Please enter an emergency contact name.')
    if (!er) return setError('Please enter the emergency contact relationship.')
    if (!ep) return setError('Please enter the emergency contact phone number.')
    if (!user) return

    setSaving(true)
    try {
      const ec: EmergencyContact = { name: en, relationship: er, phone: ep }
      const pn = preferredName.trim() || undefined
      const mp = memberPhone.trim()
      const phone = mp ? (mp.startsWith('+') ? mp : `+${mp}`) : undefined
      const preferredEmail = contactEmail.trim() || undefined

      if (isTopUp) {
        await completeMemberProfile(
          user.uid,
          {
            name: user.displayName ?? user.email ?? '',
            photo: user.photoURL,
            legalName: ln,
            emergencyContact: ec,
            preferredName: pn,
            phone,
            preferredEmail,
          },
          user.email ?? 'unknown',
        )
      } else {
        await saveSetupProfile(
          user.uid,
          {
            name: user.displayName ?? user.email ?? '',
            email: user.email ?? '',
            photo: user.photoURL,
          },
          { legalName: ln, emergencyContact: ec, preferredName: pn, phone, preferredEmail },
          chosen,
        )
      }
      await reloadProfile()
      navigate('/waiver/membership', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-svh bg-[#f2f2f2]">
      <OnboardingHeader />
      <div className="mx-auto max-w-xl px-6 py-8">
        <div className="mb-6 rounded-[20px] p-6" style={{ backgroundColor: KBC.black }}>
          <h1 className="text-2xl font-black text-white">Welcome to KBC!</h1>
          <p className="mt-2 text-sm leading-5 text-neutral-400">
            {step === 'name'
              ? 'Let’s start with your full legal name, so we can find you if KBC already has you on file.'
              : 'Before you get started, please complete your member profile. This information is kept on file for your membership.'}
          </p>
        </div>

        {step === 'name' && (
          <form onSubmit={handleLookup}>
            <Field label="Full Legal Name *">
              <input
                className="kbc-input"
                autoFocus
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="e.g. Jane Smith"
              />
            </Field>
            {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
            <Primary disabled={looking}>{looking ? 'Checking…' : 'Continue'}</Primary>
          </form>
        )}

        {step === 'confirm' && (
          <div>
            <p className="text-sm leading-5 text-neutral-700">
              {candidates.length === 1
                ? 'We already have a member on file under that name. Is this you?'
                : `We have ${candidates.length} members on file under that name. Which one is you?`}
            </p>
            {/* Masked, never the address itself. Whoever is reading this has
                proved only that they can type a name — and a name is public
                knowledge around a gym — so a full address would turn this
                screen into a way of looking up any member's email. */}
            <ul className="mt-4 space-y-3">
              {candidates.map((c) => {
                const claimable = isSelfClaimable(c)
                return (
                  <li key={c.uid}>
                    <button
                      type="button"
                      disabled={!claimable}
                      onClick={() => claim(c)}
                      className="w-full rounded-2xl border-2 border-transparent bg-white p-4 text-left shadow-sm enabled:hover:border-neutral-300 disabled:opacity-70"
                    >
                      <p className="text-[15px] font-bold text-black">{c.legalName}</p>
                      <p className="mt-0.5 text-[13px] text-neutral-500">{maskEmail(c.email)}</p>
                      {c.memberSince && (
                        <p className="mt-1 text-[12px] text-neutral-400">
                          Member since {new Date(c.memberSince).getFullYear()}
                        </p>
                      )}
                      {/* A staff record cannot be joined this way at all — see
                          isSelfClaimable. Shown rather than hidden, so somebody
                          who is that member knows they were found and why
                          nothing happened when they tapped. */}
                      {claimable ? (
                        <span
                          className="mt-2 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold"
                          style={{ backgroundColor: tint(KBC.cyan), color: KBC.cyan }}
                        >
                          This is me
                        </span>
                      ) : (
                        <span className="mt-2 block text-[12px] leading-4 text-neutral-500">
                          This record has staff permissions, so it can’t be joined from here. Sign in
                          with the email address already on it, or ask a KBC admin to link it.
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
            <button
              type="button"
              onClick={declineAll}
              className="mt-5 w-full rounded-2xl border-2 border-neutral-300 p-4 text-[15px] font-bold text-neutral-600"
            >
              None of these — I’m new here
            </button>
            <button
              type="button"
              onClick={() => setStep('name')}
              className="mt-3 w-full p-2 text-[13px] font-semibold text-neutral-500 underline"
            >
              Back to the name
            </button>
          </div>
        )}

        {step === 'details' && (
          <form onSubmit={handleSave}>
            {chosen && (
              <div
                className="mb-5 rounded-[14px] p-4 text-[13px] leading-5"
                style={{ backgroundColor: tint(KBC.cyan), color: '#0b4b57' }}
              >
                <strong>Welcome back, {chosen.legalName}.</strong> We’ve filled in what we hold for
                you — check it over and add anything missing. Your membership, passes and history
                stay exactly as they are.
              </div>
            )}

            <SectionHeader>Member Info</SectionHeader>

            <Field label="Full Legal Name *">
              <input
                className="kbc-input"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="e.g. Jane Smith"
              />
            </Field>

            <Field label="Preferred Name (shown in app)">
              <input
                className="kbc-input"
                value={preferredName}
                onChange={(e) => setPreferredName(e.target.value)}
                placeholder="e.g. Jane"
              />
            </Field>

            <Field label="Phone Number">
              <input
                className="kbc-input"
                type="tel"
                value={memberPhone}
                onChange={(e) => setMemberPhone(e.target.value)}
                placeholder="+1 613 555 0123"
              />
            </Field>

            <Field label="Signed in as">
              <div className="rounded-[10px] border border-neutral-200 bg-neutral-100 p-3 text-[15px] text-neutral-500">
                {user?.email ?? ''}
              </div>
            </Field>

            {/* The address KBC writes to, which need not be the Google account
                used to sign in. Members join with whichever account is on the
                phone in their hand and are reached somewhere else entirely. */}
            <Field label="Preferred Contact Email">
              <input
                className="kbc-input"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>

            <SectionHeader>Emergency Contact</SectionHeader>

            <Field label="Full Name *">
              <input
                className="kbc-input"
                value={ecName}
                onChange={(e) => setEcName(e.target.value)}
                placeholder="e.g. John Smith"
              />
            </Field>

            <Field label="Relationship *">
              <input
                className="kbc-input"
                value={ecRelation}
                onChange={(e) => setEcRelation(e.target.value)}
                placeholder="e.g. Partner, Parent, Friend"
              />
            </Field>

            <Field label="Phone Number *">
              <input
                className="kbc-input"
                type="tel"
                value={ecPhone}
                onChange={(e) => setEcPhone(e.target.value)}
                placeholder="+1 613 555 0123"
              />
            </Field>

            {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}

            <Primary disabled={saving}>
              {saving ? 'Saving…' : 'Continue to Membership Forms'}
            </Primary>
          </form>
        )}
      </div>
    </div>
  )
}

function Primary({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-7 w-full rounded-2xl p-4 text-base font-extrabold text-black shadow-lg disabled:opacity-60"
      style={{ backgroundColor: KBC.cyan }}
    >
      {children}
    </button>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mt-4 mb-1 border-b border-neutral-200 pb-1.5 text-xs font-extrabold tracking-wide uppercase"
      style={{ color: KBC.pink }}
    >
      {children}
    </h2>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2.5">
      <label className="mb-1 block text-[11px] font-bold tracking-wide text-neutral-500 uppercase">
        {label}
      </label>
      {children}
    </div>
  )
}
