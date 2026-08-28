import { KBC } from '@/constants/theme'

/**
 * The app's short-lived messages — the confirmation after a sign-in, the reason
 * one was refused, the error when a write failed.
 *
 * Centred rather than tucked under the header: these appear in response to
 * something you just tapped, and at the top of a phone screen they landed above
 * where you were looking and were easy to miss entirely.
 */
export type ToastKind =
  /** It worked. */
  | 'success'
  /** It failed — something went wrong that the member could not have avoided. */
  | 'error'
  /** It didn't happen, and that's expected: already signed in, no punches left. */
  | 'info'

/**
 * Text colour is picked per background rather than fixed at white.
 *
 * KBC green and orange are light enough that white on them is 2.4:1 and 3.1:1 —
 * both under WCAG AA for text this size — while black clears 6.8:1 on either.
 * Pink is dark enough to take white at 7:1.
 */
const STYLES: Record<ToastKind, { background: string; color: string }> = {
  success: { background: KBC.green, color: '#000' },
  error: { background: KBC.pink, color: '#fff' },
  info: { background: KBC.orange, color: '#000' },
}

export function Toast({
  message,
  kind = 'success',
  onDismiss,
}: {
  message: string
  kind?: ToastKind
  /** Tapping the message dismisses it rather than waiting the timeout out. */
  onDismiss?: () => void
}) {
  return (
    // The backdrop takes no pointer events, so a toast never blocks the button
    // underneath it; only the message itself is tappable.
    <div
      className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-6"
      // 'alert' is assertive and interrupts; the other two wait their turn.
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
    >
      <button
        type="button"
        onClick={onDismiss}
        className="pointer-events-auto max-w-sm cursor-default rounded-2xl px-6 py-5 text-center text-base font-bold shadow-2xl"
        style={STYLES[kind]}
      >
        {message}
      </button>
    </div>
  )
}
