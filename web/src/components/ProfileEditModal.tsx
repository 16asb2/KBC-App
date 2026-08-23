import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { KBC } from '@/constants/theme'
import type { EmergencyContact, UserProfile } from '@/types/member'

// Ported from mobile/components/profile-edit-modal.tsx.
//
// Keep JSON.stringify on emergencyContact and additionalEmails. They are stored
// as JSON *strings*, not native Firestore maps — admin-web/ parses them that way
// and every existing production document is already in that shape. See the
// data-format constraint in web/CLAUDE.md before changing it.

function parseEmergencyContact(raw: string | undefined): EmergencyContact {
  try {
    const ec = JSON.parse(raw || '{}') as Partial<EmergencyContact>
    return { name: ec.name ?? '', relationship: ec.relationship ?? '', phone: ec.phone ?? '' }
  } catch {
    return { name: '', relationship: '', phone: '' }
  }
}

function parseAdditionalEmails(raw: string | undefined): string[] {
  try {
    const list = JSON.parse(raw || '[]')
    return Array.isArray(list) ? list.filter((e): e is string => typeof e === 'string') : []
  } catch {
    return []
  }
}

export function ProfileEditModal({
  profile,
  canEditLegalName = false,
  onSave,
  onClose,
}: {
  profile: UserProfile
  /** Legal name is what waivers are signed against, so only admins may change it. */
  canEditLegalName?: boolean
  onSave: (updates: Partial<UserProfile>) => Promise<void>
  onClose: () => void
}) {
  const [legalName, setLegalName] = useState(profile.legalName ?? '')
  const [preferredName, setPreferredName] = useState(profile.preferredName ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [comments, setComments] = useState(profile.additionalComments ?? '')

  const initialEc = parseEmergencyContact(profile.emergencyContact)
  const [ecName, setEcName] = useState(initialEc.name)
  const [ecRelation, setEcRelation] = useState(initialEc.relationship)
  const [ecPhone, setEcPhone] = useState(initialEc.phone)

  const [additionalEmails, setAdditionalEmails] = useState(parseAdditionalEmails(profile.additionalEmails))
  const [preferredEmail, setPreferredEmail] = useState(profile.preferredEmail || profile.email)
  const [newEmail, setNewEmail] = useState('')

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function addEmail() {
    const e = newEmail.trim().toLowerCase()
    if (!e) return
    if (!e.includes('@')) return setErr('That does not look like an email address.')
    if (e === profile.email.toLowerCase()) return setErr('That is already the Google account email.')
    if (additionalEmails.some((x) => x.toLowerCase() === e)) return setErr('That email is already listed.')
    setAdditionalEmails((prev) => [...prev, e])
    setNewEmail('')
    setErr(null)
  }

  function removeEmail(email: string) {
    setAdditionalEmails((prev) => prev.filter((x) => x !== email))
    // Don't leave preferredEmail pointing at an address that no longer exists.
    if (preferredEmail === email) setPreferredEmail(profile.email)
  }

  async function save() {
    setSaving(true)
    setErr(null)
    try {
      const ecFilled = ecName.trim() || ecRelation.trim() || ecPhone.trim()
      const updates: Partial<UserProfile> = {
        preferredName: preferredName.trim(),
        phone: phone.trim(),
        additionalComments: comments.trim(),
        additionalEmails: additionalEmails.length > 0 ? JSON.stringify(additionalEmails) : '',
        // Empty means "same as the Google account", so it isn't stored.
        preferredEmail: preferredEmail !== profile.email ? preferredEmail : '',
        emergencyContact: ecFilled
          ? JSON.stringify({
              name: ecName.trim(),
              relationship: ecRelation.trim(),
              phone: ecPhone.trim(),
            })
          : '',
      }
      if (canEditLegalName) updates.legalName = legalName.trim()
      await onSave(updates)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save your profile.')
      setSaving(false)
    }
  }

  const emailChoices = [profile.email, ...additionalEmails]

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-black text-neutral-900">Edit profile</h2>
      <p className="mt-0.5 text-sm text-neutral-500">{profile.name}</p>

      <SectionHeading>Names</SectionHeading>
      {canEditLegalName ? (
        <Field label="Full legal name">
          <input
            className="kbc-input"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder={profile.name}
          />
        </Field>
      ) : (
        <Locked label="Full legal name" value={profile.legalName || profile.name} hint="Admins only" />
      )}
      <Locked label="Google account name" value={profile.name} />
      <Field label="Preferred name (shown in the app)">
        <input
          className="kbc-input"
          value={preferredName}
          onChange={(e) => setPreferredName(e.target.value)}
          placeholder={profile.name}
        />
      </Field>

      <SectionHeading>Contact</SectionHeading>
      <Locked label="Google account email" value={profile.email} />
      <Field label="Additional emails">
        {additionalEmails.length > 0 && (
          <ul className="mb-2 space-y-1">
            {additionalEmails.map((e) => (
              <li key={e} className="flex items-center justify-between gap-2 rounded-lg bg-neutral-100 px-3 py-2">
                <span className="min-w-0 truncate text-sm text-neutral-700">{e}</span>
                <button
                  type="button"
                  onClick={() => removeEmail(e)}
                  aria-label={`Remove ${e}`}
                  className="shrink-0 text-sm font-bold"
                  style={{ color: KBC.pink }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            className="kbc-input flex-1"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addEmail()
              }
            }}
            placeholder="Add an email address…"
            type="email"
          />
          <button
            type="button"
            onClick={addEmail}
            className="shrink-0 rounded-[10px] px-4 text-sm font-bold text-black"
            style={{ backgroundColor: KBC.cyan }}
          >
            Add
          </button>
        </div>
      </Field>
      {emailChoices.length > 1 && (
        <Field label="Preferred contact email">
          <select
            className="kbc-input"
            value={preferredEmail}
            onChange={(e) => setPreferredEmail(e.target.value)}
          >
            {emailChoices.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Phone number">
        <input
          className="kbc-input"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 613 555 0123"
        />
      </Field>

      <SectionHeading>Emergency contact</SectionHeading>
      <Field label="Full name">
        <input className="kbc-input" value={ecName} onChange={(e) => setEcName(e.target.value)} placeholder="Jane Doe" />
      </Field>
      <Field label="Relationship">
        <input
          className="kbc-input"
          value={ecRelation}
          onChange={(e) => setEcRelation(e.target.value)}
          placeholder="e.g. Partner, Parent, Friend"
        />
      </Field>
      <Field label="Phone number">
        <input
          className="kbc-input"
          type="tel"
          value={ecPhone}
          onChange={(e) => setEcPhone(e.target.value)}
          placeholder="+1 613 555 0123"
        />
      </Field>

      <SectionHeading>Notes for KBC staff</SectionHeading>
      <Field label="Additional comments">
        <textarea
          className="kbc-input min-h-20"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="Any additional information…"
        />
      </Field>

      {err && <p className="mt-4 text-sm font-semibold text-red-600">{err}</p>}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-neutral-300 p-3 text-sm font-bold text-neutral-600"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex-1 rounded-xl p-3 text-sm font-extrabold text-black disabled:opacity-60"
          style={{ backgroundColor: KBC.cyan }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mt-5 mb-1 border-b border-neutral-200 pb-1.5 text-xs font-extrabold tracking-wide uppercase"
      style={{ color: KBC.pink }}
    >
      {children}
    </h3>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2.5">
      <label className="mb-1 block text-[11px] font-bold tracking-wide text-neutral-500 uppercase">{label}</label>
      {children}
    </div>
  )
}

function Locked({ label, value, hint }: { label: string; value?: string | null; hint?: string }) {
  return (
    <div className="mt-2.5">
      <label className="mb-1 block text-[11px] font-bold tracking-wide text-neutral-500 uppercase">
        {label}
        {hint && <span className="ml-1 normal-case opacity-70">({hint})</span>}
      </label>
      <div className="rounded-[10px] border border-neutral-200 bg-neutral-100 p-3 text-[15px] text-neutral-500">
        {value || '—'}
      </div>
    </div>
  )
}
