import { useState } from 'react'
import { KBC } from '@/constants/theme'
import { createNewMemberProfile, updateProfile } from '@/services/profiles'
import type { EmergencyContact, UserProfile } from '@/types/member'
import { Modal } from './Modal'

// Ported from mobile/app/(tabs)/home.tsx's NewMemberModal.
export function NewMemberModal({
  createdByEmail,
  onCreated,
  onClose,
}: {
  createdByEmail: string
  onCreated: (member: UserProfile) => void
  onClose: () => void
}) {
  const [legalName, setLegalName] = useState('')
  const [preferredName, setPreferredName] = useState('')
  const [memberPhone, setMemberPhone] = useState('')
  const [email, setEmail] = useState('')
  const [ecName, setEcName] = useState('')
  const [ecRelation, setEcRelation] = useState('')
  const [ecPhone, setEcPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdName, setCreatedName] = useState<string | null>(null)

  async function handleCreate() {
    setError(null)
    const ln = legalName.trim()
    const em = email.trim().toLowerCase()
    const en = ecName.trim()
    const er = ecRelation.trim()
    const ep = ecPhone.trim()

    if (!ln) return setError("Please enter the member's legal name.")
    if (!em || !em.includes('@')) return setError('Please enter a valid email address.')
    if (!en) return setError('Please enter the emergency contact name.')
    if (!er) return setError('Please enter the emergency contact relationship.')
    if (!ep) return setError('Please enter the emergency contact phone number.')

    setSaving(true)
    try {
      const ec: EmergencyContact = { name: en, relationship: er, phone: ep }
      const newMember = await createNewMemberProfile(ln, em, ec, createdByEmail)
      const extras: Partial<UserProfile> = {}
      const pn = preferredName.trim()
      const mp = memberPhone.trim()
      if (pn) extras.preferredName = pn
      if (mp && mp !== '1') extras.phone = mp.startsWith('+') ? mp : `+${mp}`
      if (Object.keys(extras).length) await updateProfile(newMember.uid, extras, createdByEmail)

      const displayName = pn || ln
      setCreatedName(displayName)
      onCreated({ ...newMember, ...extras })
      setTimeout(onClose, 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between pb-3">
        <h2 className="text-base font-bold text-black">Add New Member</h2>
        <button type="button" onClick={onClose} className="text-sm font-semibold" style={{ color: KBC.pink }}>
          Cancel
        </button>
      </div>

      {createdName ? (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="text-5xl">✅</span>
          <p className="text-lg font-extrabold text-black">{createdName} added!</p>
          <p className="text-sm text-neutral-500">Member profile created successfully.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <SectionLabel>Member Info</SectionLabel>
          <Field label="Full Legal Name *">
            <input className="kbc-input" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="e.g. Jane Smith" />
          </Field>
          <Field label="Preferred Name (shown in app)">
            <input className="kbc-input" value={preferredName} onChange={(e) => setPreferredName(e.target.value)} placeholder="e.g. Jane" />
          </Field>
          <Field label="Phone Number">
            <input className="kbc-input" type="tel" value={memberPhone} onChange={(e) => setMemberPhone(e.target.value)} placeholder="+1 613 555 0123" />
          </Field>
          <Field label="Email Address *">
            <input className="kbc-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="member@example.com" />
          </Field>

          <SectionLabel>Emergency Contact</SectionLabel>
          <Field label="Full Name *">
            <input className="kbc-input" value={ecName} onChange={(e) => setEcName(e.target.value)} placeholder="e.g. John Smith" />
          </Field>
          <Field label="Relationship *">
            <input className="kbc-input" value={ecRelation} onChange={(e) => setEcRelation(e.target.value)} placeholder="e.g. Partner, Parent, Friend" />
          </Field>
          <Field label="Phone Number *">
            <input className="kbc-input" type="tel" value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} placeholder="+1 613 555 0123" />
          </Field>

          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={saving}
            className="mt-2 w-full rounded-xl p-3 font-bold text-white disabled:opacity-60"
            style={{ backgroundColor: KBC.green }}
          >
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </div>
      )}
    </Modal>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="pt-1 text-xs font-extrabold tracking-wide text-neutral-500 uppercase" style={{ color: KBC.pink }}>
      {children}
    </h3>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-bold tracking-wide text-neutral-500 uppercase">{label}</label>
      {children}
    </div>
  )
}
