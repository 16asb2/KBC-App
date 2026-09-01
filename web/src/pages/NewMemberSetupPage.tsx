import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { OnboardingHeader } from '@/components/OnboardingHeader'
import { KBC } from '@/constants/theme'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { parseEmergencyContact } from '@/domain/memberProfile'
import { completeMemberProfile, registerOrClaimProfile } from '@/services/profiles'
import type { EmergencyContact } from '@/types/member'

// Ported from mobile@1cdfada/app/new-member-setup.tsx.
//
// Three arrivals now, not one:
//
//   'new'    — no record at all. Fills this in from scratch. Saving may still
//              find them on the pre-registered list under another address, by
//              the legal name they type here (registerOrClaimProfile).
//   'gaps'   — imported from a CSV, or added at the desk, and something the app
//              insists on is missing.
//   'review' — the same, but nothing is missing. They see it anyway, once:
//              whatever the spreadsheet said about their emergency contact has
//              never been checked by the person it belongs to, and the waiver
//              on the next screen is signed against it.
//
// Both stored cases prefill from what is on file and *update* the record rather
// than replacing it — writing a fresh document over an imported member would
// reset the membership and punches the import had set.
export function NewMemberSetupPage() {
  const { user } = useAuth()
  const { profile, reloadProfile } = useProfile()
  const navigate = useNavigate()

  const existingEc = parseEmergencyContact(profile?.emergencyContact)
  // Whether a record was found decides which service call saves this form, and
  // nothing else. It used to drive three sets of headings, a list of
  // missing-field chips and a note about being signed in under the wrong
  // address — the app explaining its own machinery to somebody who only wants
  // to fill in a form. A field that arrives already filled says "we have you on
  // file" without being told to.
  const isTopUp = !!profile

  const [legalName, setLegalName] = useState(profile?.legalName ?? '')
  const [preferredName, setPreferredName] = useState(profile?.preferredName ?? '')
  const [memberPhone, setMemberPhone] = useState(profile?.phone ?? '')
  const [ecName, setEcName] = useState(existingEc?.name ?? '')
  const [ecRelation, setEcRelation] = useState(existingEc?.relationship ?? '')
  const [ecPhone, setEcPhone] = useState(existingEc?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          },
          user.email ?? 'unknown',
        )
      } else {
        await registerOrClaimProfile(
          user.uid,
          user.displayName ?? user.email ?? '',
          user.email ?? '',
          user.photoURL,
          ln,
          ec,
          pn,
          phone,
        )
      }
      await reloadProfile()
      navigate('/waiver/membership', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-svh bg-[#f2f2f2]">
      <OnboardingHeader />
      <form onSubmit={handleSave} className="mx-auto max-w-xl px-6 py-8">
        <div className="mb-6 rounded-[20px] p-6" style={{ backgroundColor: KBC.black }}>
          <h1 className="text-2xl font-black text-white">Welcome to KBC!</h1>
          <p className="mt-2 text-sm leading-5 text-neutral-400">
            Before you get started, please complete your member profile. This information is kept on
            file for your membership.
          </p>
        </div>

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

        <Field label="Email Address">
          <div className="rounded-[10px] border border-neutral-200 bg-neutral-100 p-3 text-[15px] text-neutral-500">
            {user?.email ?? ''}
          </div>
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

        <button
          type="submit"
          disabled={saving}
          className="mt-7 w-full rounded-2xl p-4 text-base font-extrabold text-black shadow-lg disabled:opacity-60"
          style={{ backgroundColor: KBC.cyan }}
        >
          {saving ? 'Saving…' : 'Continue to Membership Forms'}
        </button>
      </form>
    </div>
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
