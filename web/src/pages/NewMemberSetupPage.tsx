import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { KBC } from '@/constants/theme'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { createSelfRegisteredProfile } from '@/services/profiles'
import type { EmergencyContact } from '@/types/member'

// Ported from mobile@1cdfada/app/new-member-setup.tsx.
export function NewMemberSetupPage() {
  const { user } = useAuth()
  const { reloadProfile } = useProfile()
  const navigate = useNavigate()

  const [legalName, setLegalName] = useState('')
  const [preferredName, setPreferredName] = useState('')
  const [memberPhone, setMemberPhone] = useState('')
  const [ecName, setEcName] = useState('')
  const [ecRelation, setEcRelation] = useState('')
  const [ecPhone, setEcPhone] = useState('')
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

      await createSelfRegisteredProfile(
        user.uid,
        user.displayName ?? user.email ?? '',
        user.email ?? '',
        user.photoURL,
        ln,
        ec,
        pn,
        phone,
      )
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
      <form onSubmit={handleSave} className="mx-auto max-w-xl px-6 py-8">
        <div className="mb-6 rounded-[20px] p-6" style={{ backgroundColor: KBC.black }}>
          <h1 className="text-2xl font-black text-white">Welcome to KBC!</h1>
          <p className="mt-2 text-sm leading-5 text-neutral-400">
            Before you get started, please complete your member profile. This information is kept
            on file for your membership.
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
