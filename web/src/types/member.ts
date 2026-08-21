// 'inactive' = registered but no current access (new sign-ups, lapsed memberships)
// 'pending'  = purchased access, awaiting admin confirmation
// 'active'   = has a valid current membership
export type MembershipStatus = 'active' | 'pending' | 'inactive'

export type WaiverRecord = {
  signedAt: string // ISO timestamp
  signedBy: string // full legal name
  guardian?: string // guardian name if signed on behalf of a minor
  docUrl?: string // Google Docs webViewLink (created after signing)
}

export type EmergencyContact = {
  name: string
  relationship: string
  phone: string
}

export type UserProfile = {
  uid: string
  name: string // Google account name (locked)
  legalName?: string // legal name — admin-only editable; auto-set for manually created members
  email: string // Google account email (locked)
  photo: string | null
  membershipStatus: MembershipStatus
  isAdmin: boolean // dynamically managed via Firestore — except SUPER_ADMIN_EMAIL which is hardcoded
  isSupervisor: boolean
  punchPassRemaining: number
  memberSince: string // first registration date (ISO)
  membershipStart: string | null // start of current paid period (ISO)
  membershipExpiry: string | null // end of current paid period (ISO)
  // Waivers — stored as JSON strings in Firestore (signed during onboarding)
  waiverMembership?: string // JSON WaiverRecord — Share Purchase for Lifetime Membership
  waiverLiability?: string // JSON WaiverRecord — Release of Liability
  // User-editable profile fields
  preferredName?: string // display name override
  additionalEmails?: string // JSON string[]
  preferredEmail?: string // selected contact email
  phone?: string // international format
  emergencyContact?: string // JSON EmergencyContact
  additionalComments?: string // free text for KBC staff
  pendingPunches?: number | null // total punch passes in purchase awaiting admin confirmation
  pendingMembership?: string | null // JSON { label, price, start, expiry } awaiting admin confirmation
  lastSignInAt?: string // ISO — last completed session sign-in (enforces 24h rule)
  lastUpdatedBy?: string
  lastUpdatedAt?: string
}
