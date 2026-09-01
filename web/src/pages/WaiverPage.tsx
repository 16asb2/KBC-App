import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { OnboardingHeader } from '@/components/OnboardingHeader'
import { KBC } from '@/constants/theme'
import { WAIVER_META, type WaiverType } from '@/constants/waivers'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { updateProfile } from '@/services/profiles'
import type { WaiverRecord } from '@/types/member'
import { formatLongDateWithYear, formatTime } from '@/utils/datetime'

function formatSignedDate(iso: string) {
  return `${formatLongDateWithYear(iso)} at ${formatTime(iso)}`
}

// Ported from mobile@1cdfada/app/waiver/[type].tsx. Not yet ported: the Google Doc copy
// of the signed waiver (services/waiver-doc.ts — needs a Drive-scoped OAuth
// token we don't request yet, and mobile treats it as non-fatal/best-effort
// already).
export function WaiverPage() {
  const { type } = useParams<{ type: string }>()
  const config = WAIVER_META[type as WaiverType]
  const [searchParams] = useSearchParams()

  const { user } = useAuth()
  const { profile, reloadProfile } = useProfile()
  const navigate = useNavigate()

  // When a supervisor signs on behalf of a member they just created
  // (see components/NewMemberModal.tsx), the target's identity travels via
  // the URL — their profile isn't loaded into ProfileContext.
  const targetUid = searchParams.get('targetUid')
  const isForOther = !!targetUid
  const saveUid = isForOther ? targetUid : (user?.uid ?? '')
  const memberName = isForOther
    ? (searchParams.get('targetName') ?? 'Member')
    : profile?.legalName || user?.displayName || user?.email || 'Unknown'

  const [scrolledToEnd, setScrolledToEnd] = useState(false)
  const [isMinor, setIsMinor] = useState(false)
  const [signedBy, setSignedBy] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // "Has the member read to the bottom?" is detected with an IntersectionObserver
  // on a sentinel at the end of the waiver text, rather than by comparing scroll
  // offsets. Scroll math was the original approach (ported from the RN ScrollView)
  // and it silently never fired on web: the page scrolls at the *window* level, so
  // no onScroll ever reached the container, and the signature form stayed hidden
  // forever — nobody could complete onboarding. An observer doesn't care which
  // element scrolls, and it also fires immediately when the text is short enough
  // to fit on screen without scrolling, which the offset check could never
  // satisfy either.
  const observerRef = useRef<IntersectionObserver | null>(null)
  useEffect(() => () => observerRef.current?.disconnect(), [])

  const endSentinelRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setScrolledToEnd(true)
          observer.disconnect()
        }
      },
      { root: null, threshold: 0 },
    )
    observer.observe(node)
    observerRef.current = observer
  }, [])

  if (!config) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-neutral-500">Unknown waiver type.</p>
      </div>
    )
  }

  // Target profiles aren't loaded into context, so we can't show an
  // already-signed banner for them — matches mobile's behavior.
  const existing: WaiverRecord | null = isForOther
    ? null
    : (() => {
        try {
          return profile?.[config.profileKey] ? JSON.parse(profile[config.profileKey]!) : null
        } catch {
          return null
        }
      })()

  const nameMatches = signedBy.trim().toLowerCase() === memberName.toLowerCase()

  async function handleSign() {
    setError(null)
    const name = signedBy.trim()
    if (!name) return setError(`Please enter ${isForOther ? "the member's" : 'your'} full legal name.`)
    if (!nameMatches) return setError(`The name entered must exactly match the member's legal name: "${memberName}".`)
    if (isMinor && !guardianName.trim()) return setError("Please enter the guardian's full legal name.")
    if (!user) return

    setSaving(true)
    try {
      const record: WaiverRecord = {
        signedAt: new Date().toISOString(),
        signedBy: name,
        ...(isMinor ? { guardian: guardianName.trim() } : {}),
      }
      const savedBy = isForOther ? `supervisor:${user.email}` : (user.email ?? 'unknown')

      await updateProfile(saveUid, { [config!.profileKey]: JSON.stringify(record) }, savedBy)
      if (!isForOther) {
        await reloadProfile()
        // OnboardingGate re-evaluates the redirect chain (membership → liability → home).
        navigate('/', { replace: true })
      } else {
        navigate('/home', { replace: true })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-svh bg-[#f2f2f2]">
      {/* Only on a member's own waiver. A supervisor signing for somebody else
          came from inside the app and already has the Back button below; what
          they need is a way back to Home, not a way out of their session. */}
      {!isForOther && <OnboardingHeader />}
      <div className="mx-auto max-w-2xl space-y-5 px-5 py-6 pb-24">
        {isForOther && (
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="text-sm font-semibold"
            style={{ color: KBC.pink }}
          >
            Cancel
          </button>
        )}
        <h1 className="text-lg leading-tight font-extrabold text-black">{config.fullTitle}</h1>

        {existing && (
          <div className="flex items-start gap-3 rounded-2xl border p-4" style={{ backgroundColor: '#e8f8e8', borderColor: KBC.green }}>
            <span className="text-xl">✅</span>
            <div>
              <p className="font-bold text-black">
                Signed by {existing.guardian ? `${existing.guardian} (guardian)` : existing.signedBy}
              </p>
              {existing.guardian && <p className="text-sm text-neutral-600">On behalf of: {existing.signedBy}</p>}
              <p className="mt-1 text-xs text-neutral-500">{formatSignedDate(existing.signedAt)}</p>
            </div>
          </div>
        )}

        <div className="space-y-3.5 rounded-2xl bg-white p-5 shadow-sm">
          {config.sections.map((section, i) => {
            if (section.type === 'heading') {
              return (
                <p key={i} className="mt-1.5 text-[13px] font-extrabold tracking-wide text-black uppercase">
                  {section.text}
                </p>
              )
            }
            if (section.type === 'warning') {
              return (
                <p key={i} className="rounded-lg p-2.5 text-sm leading-6 font-bold text-amber-800" style={{ backgroundColor: '#fff8e1' }}>
                  {section.text}
                </p>
              )
            }
            if (section.type === 'consent') {
              return (
                <p key={i} className="border-t border-neutral-200 pt-3 text-sm leading-5 font-semibold text-neutral-700 italic">
                  {section.text}
                </p>
              )
            }
            return (
              <p key={i} className="text-sm leading-6 whitespace-pre-line text-neutral-800">
                {section.text}
              </p>
            )
          })}

          {/* Marks the end of the waiver text — see endSentinelRef above. */}
          <div ref={endSentinelRef} aria-hidden="true" />
        </div>

        {!existing && (
          <div className="space-y-3">
            {!scrolledToEnd && (
              <div className="rounded-lg border p-3.5 text-center" style={{ backgroundColor: '#fff3cd', borderColor: '#f0c040' }}>
                <p className="text-sm font-bold" style={{ color: '#7a5c00' }}>
                  ↓ Please read the full waiver before signing
                </p>
              </div>
            )}

            {scrolledToEnd && (
              <>
                <label className="flex items-center justify-between rounded-xl bg-white p-4">
                  <span className="mr-3 text-[15px] font-semibold text-black">
                    I am signing on behalf of a minor
                  </span>
                  <input
                    type="checkbox"
                    checked={isMinor}
                    onChange={(e) => setIsMinor(e.target.checked)}
                    className="size-5"
                    style={{ accentColor: KBC.pink }}
                  />
                </label>

                {isMinor ? (
                  <>
                    <Field label="Minor's full legal name">
                      <input
                        className="kbc-input"
                        value={signedBy}
                        onChange={(e) => setSignedBy(e.target.value)}
                        placeholder="Minor's full name"
                      />
                    </Field>
                    <Field label="Guardian's full legal name">
                      <input
                        className="kbc-input"
                        value={guardianName}
                        onChange={(e) => setGuardianName(e.target.value)}
                        placeholder="Guardian's full name"
                      />
                    </Field>
                    <p className="text-xs text-neutral-500 italic">
                      By signing, you confirm you are the legal guardian and accept these terms on behalf of the
                      minor.
                    </p>
                  </>
                ) : (
                  <Field label={isForOther ? `${memberName}'s full legal name` : 'Your full legal name'}>
                    <input
                      className="kbc-input"
                      value={signedBy}
                      onChange={(e) => setSignedBy(e.target.value)}
                      placeholder="Full legal name"
                    />
                    {isForOther && (
                      <p className="mt-1 text-xs text-neutral-500 italic">
                        Signing on behalf of {memberName}. Supervised by {user?.displayName ?? user?.email}.
                      </p>
                    )}
                  </Field>
                )}

                {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

                <button
                  type="button"
                  onClick={() => void handleSign()}
                  disabled={saving || !nameMatches}
                  className="mt-2 w-full rounded-2xl p-4 text-base font-extrabold text-white shadow-lg disabled:opacity-40"
                  style={{ backgroundColor: KBC.green }}
                >
                  {saving ? 'Saving…' : '✍️ I agree and sign this waiver'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-extrabold tracking-wide text-neutral-500 uppercase">{label}</label>
      {children}
    </div>
  )
}
