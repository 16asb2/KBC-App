import { OnboardingHeader } from '@/components/OnboardingHeader'
import { KBC } from '@/constants/theme'

/**
 * Shown when the profile lookup threw, rather than coming back empty.
 *
 * The alternative — and what the app did until this existed — is to treat a
 * failed lookup as "no record found" and send the member to the setup form.
 * That is wrong twice over: it tells someone with fifteen years of membership
 * that the gym has never heard of them, and if they believe it and fill the
 * form in, the record that failed to load is overwritten with what they typed.
 *
 * So this stops instead, and says which account it was trying to load, since
 * the usual cause is being signed in as somebody the gym does not hold a record
 * for. Retry is the honest first move for a dropped connection; Sign Out in the
 * header above is the fix for the wrong account.
 */
export function ProfileLoadError({
  error,
  onRetry,
  retrying,
}: {
  error: Error
  onRetry: () => void
  retrying: boolean
}) {
  return (
    <div className="min-h-svh bg-[#f2f2f2]">
      <OnboardingHeader />
      <div className="mx-auto max-w-xl px-6 py-8">
        <div className="rounded-[20px] p-6" style={{ backgroundColor: KBC.black }}>
          <h1 className="text-2xl font-black text-white">We couldn&rsquo;t load your membership</h1>
          <p className="mt-2 text-sm leading-5 text-neutral-400">
            Something went wrong reading your record — so rather than treat you as a new member and
            risk writing over it, we stopped here. Your membership has not been changed.
          </p>
        </div>

        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-6 w-full rounded-2xl p-4 text-base font-extrabold text-black shadow-lg disabled:opacity-60"
          style={{ backgroundColor: KBC.cyan }}
        >
          {retrying ? 'Trying again…' : 'Try Again'}
        </button>

        <p className="mt-4 text-center text-[13px] leading-5 text-neutral-500">
          If this keeps happening, sign out and check you are using the Google account the gym has
          on file for you — or send this to KBC:
        </p>
        <p className="mt-2 rounded-[10px] border border-neutral-200 bg-white p-3 font-mono text-[12px] break-words text-neutral-600">
          {error.message}
        </p>
      </div>
    </div>
  )
}
