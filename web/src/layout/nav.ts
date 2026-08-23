import type { NavIconName } from '@/components/NavIcon'
import { KBC } from '@/constants/theme'

export type NavItem = {
  path: string
  label: string
  color: string
  icon: NavIconName
  /** Only shown to admins/supervisors — mirrors the members/{uid} directory permission. */
  privilegedOnly?: boolean
}

// Tab order and per-tab colours carried over from the original app's TABS array:
// Home → Schedule → Calendar → Members → Boulders → Log Book
export const NAV_ITEMS: NavItem[] = [
  { path: '/home', label: 'Home', color: KBC.cyan, icon: 'home' },
  { path: '/schedule', label: 'Schedule', color: KBC.pink, icon: 'clock' },
  { path: '/calendar', label: 'Calendar', color: KBC.purple, icon: 'calendar' },
  { path: '/members', label: 'Members', color: KBC.orange, icon: 'people', privilegedOnly: true },
  { path: '/boulders', label: 'Climbs', color: KBC.lime, icon: 'climbing' },
  { path: '/climblog', label: 'Log Book', color: KBC.green, icon: 'book' },
]
