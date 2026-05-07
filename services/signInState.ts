/**
 * Tiny shared flag that lets the waiver screen tell home.tsx
 * "the supervisor cancelled — don't resume the sign-in chain."
 */
let _cancelPending = false;

export function cancelPendingSignIn() { _cancelPending = true; }

/** Returns true once (resets the flag) */
export function consumeCancelSignIn(): boolean {
  const v = _cancelPending;
  _cancelPending = false;
  return v;
}
