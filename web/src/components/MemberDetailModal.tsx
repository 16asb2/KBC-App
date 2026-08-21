import { useState } from 'react'
import { KBC } from '@/constants/theme'
import { PASS_OPTIONS, addMonths, getPassId, getPassLabel, type PassId } from '@/domain/membershipPass'
import type { MembershipStatus, UserProfile } from '@/types/member'
import { Modal } from './Modal'

const STATUS_COLORS: Record<MembershipStatus, string> = {
  active: KBC.green,
  pending: KBC.orange,
  inactive: '#aaa',
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function toDateInputValue(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

type PendingMembership = { label: string; price: string; start: string; expiry: string }

// Ported from mobile/app/(tabs)/members.tsx's EditModal, scoped down: the
// "Documents" (waiver viewing), "Personal Information" (full profile edit),
// and sign-in History sections aren't ported yet — those need
// services/waiver-doc.ts / a ProfileEditModal port / services/logbook.ts's
// getUserLogs, each substantial enough to land as its own follow-up.
export function MemberDetailModal({
  member,
  canEditMembership,
  canDirectActivate,
  canEditSupervisor,
  onSave,
  onClose,
}: {
  member: UserProfile
  canEditMembership: boolean
  canDirectActivate: boolean
  canEditSupervisor: boolean
  onSave: (updates: Partial<UserProfile>) => Promise<void>
  onClose: () => void
}) {
  const [showEdit, setShowEdit] = useState(false)
  const [selectedPass, setSelectedPass] = useState<PassId>(
    member.membershipStatus === 'inactive' ? 'inactive' : getPassId(member.membershipStart, member.membershipExpiry),
  )
  const [isSupervisor, setIsSupervisor] = useState(member.isSupervisor)
  const [punches, setPunches] = useState(member.punchPassRemaining)
  const [startDate, setStartDate] = useState(
    toDateInputValue(member.membershipStart ?? new Date().toISOString()),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pendingMembership: PendingMembership | null = (() => {
    try {
      return member.pendingMembership ? JSON.parse(member.pendingMembership) : null
    } catch {
      return null
    }
  })()
  const pendingPunches = member.pendingPunches ?? 0

  const displayName = member.preferredName || member.name
  const passOption = PASS_OPTIONS.find((p) => p.id === selectedPass) ?? null
  const endDate = passOption ? addMonths(new Date(startDate), passOption.months) : null

  async function handleSaveMembership() {
    setError(null)
    setSaving(true)
    try {
      const updates: Partial<UserProfile> = {}
      if (canEditMembership) {
        if (selectedPass === 'inactive') {
          updates.membershipStatus = 'inactive'
          updates.membershipStart = null
          updates.membershipExpiry = null
          updates.pendingMembership = null
        } else {
          const pass = PASS_OPTIONS.find((p) => p.id === selectedPass)!
          const start = new Date(startDate)
          const expiry = addMonths(start, pass.months)
          if (canDirectActivate) {
            updates.membershipStatus = 'active'
            updates.membershipStart = start.toISOString()
            updates.membershipExpiry = expiry.toISOString()
            updates.pendingMembership = null
          } else {
            // Supervisor → pending, admin must confirm
            updates.membershipStatus = 'pending'
            updates.membershipStart = start.toISOString()
            updates.membershipExpiry = expiry.toISOString()
            updates.pendingMembership = JSON.stringify({
              label: pass.label,
              price: '',
              start: start.toISOString(),
              expiry: expiry.toISOString(),
            })
          }
        }
        updates.punchPassRemaining = punches
      }
      if (canEditSupervisor) updates.isSupervisor = isSupervisor
      await onSave(updates)
      setShowEdit(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-black">{displayName}</h2>
            {member.isSupervisor && <Tag color={KBC.pink}>SUPER</Tag>}
          </div>
          {member.legalName && member.legalName !== member.name && (
            <p className="mt-0.5 text-xs text-neutral-500">Legal: {member.legalName}</p>
          )}
        </div>
        <button type="button" onClick={onClose} className="text-lg text-neutral-400">
          ✕
        </button>
      </div>

      {/* Access Pass Status */}
      <div className="flex items-start justify-between gap-3 border-t border-neutral-100 py-3">
        <div>
          <p className="text-[11px] font-bold tracking-wide text-neutral-400 uppercase">Access Pass Status</p>
          {pendingMembership ? (
            <>
              <p className="mt-0.5 text-sm font-bold" style={{ color: KBC.orange }}>
                {pendingMembership.label} (pending)
              </p>
              {pendingMembership.start && pendingMembership.expiry && (
                <p className="text-xs text-neutral-500">
                  {formatDate(pendingMembership.start)} → {formatDate(pendingMembership.expiry)}
                </p>
              )}
            </>
          ) : member.membershipStatus === 'active' && member.membershipStart ? (
            <>
              <p className="mt-0.5 text-sm font-bold" style={{ color: KBC.green }}>
                {getPassLabel(member.membershipStart, member.membershipExpiry)}
              </p>
              <p className="text-xs text-neutral-500">
                {formatDate(member.membershipStart)} → {formatDate(member.membershipExpiry)}
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-sm font-bold" style={{ color: STATUS_COLORS[member.membershipStatus] }}>
              Inactive
            </p>
          )}
        </div>
        {canEditMembership && (
          <button
            type="button"
            onClick={() => setShowEdit((v) => !v)}
            className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold"
            style={
              showEdit
                ? { backgroundColor: KBC.black, borderColor: KBC.black, color: '#fff' }
                : { borderColor: '#ddd', color: '#555' }
            }
          >
            {showEdit ? '✕ Close' : '✏️ Edit'}
          </button>
        )}
      </div>

      {/* Pending membership confirmation */}
      {pendingMembership && (
        <PendingRow label={`${pendingMembership.label} (pending)`} detail={`${formatDate(pendingMembership.start)} → ${formatDate(pendingMembership.expiry)}`}>
          {canEditMembership && canDirectActivate && (
            <PendingActions
              onCancel={() =>
                void onSave({ membershipStatus: 'inactive', pendingMembership: null, membershipStart: null, membershipExpiry: null })
              }
              onConfirm={() => void onSave({ membershipStatus: 'active', pendingMembership: null })}
            />
          )}
        </PendingRow>
      )}

      {/* Punch passes */}
      {member.punchPassRemaining > 0 && (
        <p className="border-t border-neutral-100 py-3 text-sm font-semibold text-neutral-700">
          🎟 {member.punchPassRemaining} punch{member.punchPassRemaining !== 1 ? 'es' : ''} remaining
        </p>
      )}

      {/* Pending punch confirmation */}
      {pendingPunches > 0 && (
        <PendingRow label="Punch passes pending confirmation" detail={`${pendingPunches} punches purchased`}>
          {canEditMembership && (
            <PendingActions
              onCancel={() =>
                void onSave({
                  pendingPunches: null,
                  punchPassRemaining: Math.max(0, member.punchPassRemaining - (pendingPunches - 1)),
                })
              }
              onConfirm={() => void onSave({ pendingPunches: null })}
            />
          )}
        </PendingRow>
      )}

      {/* Inline edit panel */}
      {showEdit && canEditMembership && (
        <div className="mt-2 space-y-3 rounded-xl bg-neutral-50 p-4">
          <FieldLabel>Access Pass Status</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {PASS_OPTIONS.map((p) => (
              <PassButton key={p.id} active={selectedPass === p.id} onClick={() => setSelectedPass(p.id)}>
                {p.label}
              </PassButton>
            ))}
            <PassButton active={selectedPass === 'inactive'} onClick={() => setSelectedPass('inactive')} tone="inactive">
              Inactive
            </PassButton>
          </div>

          {selectedPass !== 'inactive' && (
            <>
              <FieldLabel>Start Date</FieldLabel>
              <input
                type="date"
                className="kbc-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <FieldLabel>End Date</FieldLabel>
              <div className="rounded-[10px] border border-neutral-200 bg-neutral-100 p-3 text-[15px] text-neutral-500">
                {endDate ? formatDate(endDate.toISOString()) : '—'}
              </div>
            </>
          )}

          <FieldLabel>Punch Passes Remaining</FieldLabel>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setPunches((p) => Math.max(0, p - 1))}
              className="flex size-9 items-center justify-center rounded-full bg-white text-lg font-bold text-neutral-700 shadow-sm"
            >
              −
            </button>
            <span className="w-6 text-center text-base font-bold text-black">{punches}</span>
            <button
              type="button"
              onClick={() => setPunches((p) => p + 1)}
              className="flex size-9 items-center justify-center rounded-full bg-white text-lg font-bold text-neutral-700 shadow-sm"
            >
              +
            </button>
          </div>

          {canEditSupervisor && (
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={isSupervisor}
                onChange={(e) => setIsSupervisor(e.target.checked)}
                className="size-5"
                style={{ accentColor: KBC.pink }}
              />
              <span className="text-sm font-semibold text-black">Supervisor</span>
            </label>
          )}

          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setShowEdit(false)}
              className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-bold text-neutral-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSaveMembership()}
              disabled={saving}
              className="flex-1 rounded-xl p-2.5 text-sm font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: KBC.black }}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white" style={{ backgroundColor: color }}>
      {children}
    </span>
  )
}

function PendingRow({ label, detail, children }: { label: string; detail: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-t border-neutral-100 py-3">
      <span className="text-lg">🟡</span>
      <div className="flex-1">
        <p className="text-sm font-bold text-black">{label}</p>
        <p className="text-xs text-neutral-500">{detail}</p>
      </div>
      {children}
    </div>
  )
}

function PendingActions({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="flex shrink-0 gap-1.5">
      <button type="button" onClick={onCancel} className="rounded-lg bg-neutral-200 px-2.5 py-1.5 text-xs font-bold text-neutral-600">
        ✕
      </button>
      <button type="button" onClick={onConfirm} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-white" style={{ backgroundColor: KBC.green }}>
        Confirm ✓
      </button>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold tracking-wide text-neutral-400 uppercase">{children}</p>
}

function PassButton({
  active,
  tone = 'default',
  onClick,
  children,
}: {
  active: boolean
  tone?: 'default' | 'inactive'
  onClick: () => void
  children: React.ReactNode
}) {
  const activeStyle =
    tone === 'inactive' ? { backgroundColor: '#e5e5e5', borderColor: '#999', color: '#333' } : { backgroundColor: KBC.black, borderColor: KBC.black, color: '#fff' }
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-xs font-bold"
      style={active ? activeStyle : { borderColor: '#ddd', color: '#555' }}
    >
      {children}
    </button>
  )
}
