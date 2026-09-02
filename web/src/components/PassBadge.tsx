import { KBC } from '@/constants/theme'
import { accessPassLabel } from '@/domain/membershipPass'
import type { AccessPassId } from '@/types/member'

// The badge names the pass. Colour carries the confirmation state instead, so
// the two things the old membershipStatus conflated stay visibly separate.
const PASS_COLORS: Record<AccessPassId, string> = {
  annual: KBC.green,
  '8month': KBC.green,
  '4month': KBC.green,
  '1month': KBC.green,
  punch: KBC.cyan,
  dropin: KBC.cyan,
  none: '#aaa',
}

/**
 * One pass, named and coloured — on the member directory, and on the member's
 * own profile. Shared so a supervisor and the member reading their own record
 * are never looking at two different accounts of the same pass.
 */
export function PassBadge({ pass, confirmed }: { pass: AccessPassId; confirmed: boolean }) {
  // An unconfirmed pass is shown as what was bought, marked pending — not as a
  // pass they hold, and not as the bare word "pending" either.
  const color = pass === 'none' || confirmed ? PASS_COLORS[pass] : KBC.orange
  return (
    <span
      className="shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold tracking-wide text-white"
      style={{ backgroundColor: color }}
    >
      {accessPassLabel(pass).toUpperCase()}
      {pass !== 'none' && !confirmed && ' · PENDING'}
    </span>
  )
}
