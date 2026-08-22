import { KBC } from '@/constants/theme'

export type NavItem = {
  path: string
  label: string
  color: string
  /** Only shown to admins/supervisors — mirrors the members/{uid} directory permission. */
  privilegedOnly?: boolean
}

// Mirrors mobile/'s TABS swipe order: Home → Schedule → Calendar → Members → Boulders → Log Book
export const NAV_ITEMS: NavItem[] = [
  { path: '/home', label: 'Home', color: KBC.cyan },
  { path: '/schedule', label: 'Schedule', color: KBC.pink },
  { path: '/calendar', label: 'Calendar', color: KBC.purple },
  { path: '/members', label: 'Members', color: KBC.orange, privilegedOnly: true },
  { path: '/boulders', label: 'Climbs', color: KBC.lime },
  { path: '/climblog', label: 'Log Book', color: KBC.green },
]
