// Ported verbatim from mobile/constants/waivers.ts — this is signed legal text,
// do not edit wording without updating both copies together.

export type SectionType = 'heading' | 'body' | 'warning' | 'consent'
export type WaiverSection = { type: SectionType; text: string }

// ─── Share Purchase for Lifetime Membership ───────────────────────────────────

export const MEMBERSHIP_SECTIONS: WaiverSection[] = [
  {
    type: 'body',
    text: 'Welcome to Kingston Bouldering Co-operative! Please review and complete the following two forms to enjoy a climbing session at our gym.\n\n1) Share Purchase for Lifetime Membership and Release of Liability\n2) Waiver of Claims, Assumption of Risk and Indemnity Agreement',
  },
  {
    type: 'heading',
    text: 'Share Purchase for Lifetime Membership',
  },
  {
    type: 'body',
    text: 'Welcome to the Kingston Bouldering Co-operative! You are joining an enthusiastic group of climbers dedicated to the pursuit of creating a positive climbing community!',
  },
  {
    type: 'body',
    text: 'Mission: The purpose of the KBC is to provide a high-quality indoor climbing experience and a co-operative climbing environment that fosters development in athletic excellence and contributes to the continued development of a cohesive and positive climbing community within Kingston.',
  },
  {
    type: 'body',
    text: 'Vision: The aim of the KBC is to contribute locally to building a global climbing community that promotes the pursuit of mental and physical excellence and a culture that nurtures respect for our natural world. The KBC also aims to play a leadership role in contributing to a climbing co-operative movement within Canada.',
  },
  {
    type: 'body',
    text: 'Values: Leadership - Democracy - Creativity - Quality - Safety',
  },
  {
    type: 'body',
    text: 'By signing the form below, I agree to:\n1. Subscribe for one (1) share in the Kingston Bouldering Co-operative (hereinafter referred to as "KBC") at the price of $10.00 CAD.\n2. To be bound by the terms and conditions of the KBC in relation to the use of services provided by the KBC.\n\nFull terms and conditions of membership can be found in the Constitution of the Kingston Bouldering Co-operative.',
  },
  {
    type: 'heading',
    text: 'Electronic Signature Consent to Lifetime Membership',
  },
  {
    type: 'body',
    text: 'By entering your name below, you are consenting to the use of your electronic signature in lieu of an original signature on paper. You have the right to request that you sign a paper copy instead. By checking here, you are waiving that right. After consent, you may, upon written request to us, obtain a paper copy of an electronic record. No fee will be charged for such copy and no special hardware or software is required to view it. Your agreement to use an electronic signature with us for any documents will continue until such time as you notify us in writing that you no longer wish to use an electronic signature. There is no penalty for withdrawing your consent. You should always make sure that we have a current email address in order to contact you regarding any changes, if necessary.',
  },
  {
    type: 'consent',
    text: 'I have read and agree to sign off on the Share Purchase for Lifetime Membership.',
  },
]

// ─── Release of Liability ─────────────────────────────────────────────────────

export const LIABILITY_SECTIONS: WaiverSection[] = [
  {
    type: 'warning',
    text: 'Please note that by signing this agreement, you give up the right to sue for any injury or damages, howsoever caused.',
  },
  {
    type: 'body',
    text: 'TO: Kingston Bouldering Co-operative ("the Company") and its directors, officers, employees, representatives and agents (collectively called "the Agents").',
  },
  {
    type: 'body',
    text: '1. I agree as a precondition to my participation in all events organized by "the Company" and/or "the Agents" including, but not limited to: Indoor Wall Climbing; Bouldering; Physical Training; Exercise; Facility Upkeep (collectively referred to as "the Activities") and in further consideration of "the Company" allowing me to do so, that I will be strictly bound by the terms of the Release of Liability, Waiver of Claims, Assumption of Risk and Indemnity Agreement ("the Agreement").',
  },
  {
    type: 'body',
    text: '2. I acknowledge that "the Activities" involve INHERENT RISK AND DANGERS THAT MAY CAUSE SERIOUS INJURY AND POSSIBLE DEATH TO PARTICIPANTS.',
  },
  {
    type: 'body',
    text: '3. I fully understand the risks and dangers associated with my participation in "the Activities" and ACCEPT SAME ENTIRELY AT MY OWN RISK.',
  },
  {
    type: 'body',
    text: '4. I hereby WAIVE ANY AND ALL CLAIMS which I may have against "the Company" and "the Agents" and release "the Company" and "the Agents" from ALL LIABILITY for injury, death, property damage or any other loss sustained by me as a result of my participation in "the Activities", DUE TO ANY CAUSE WHATSOEVER; INCLUDING NEGLIGENCE, BREACH OF CONTRACT, OR BREACH OF ANY STATUTORY OR OTHER DUTY OF CARE by "the Company" and/or "the Agents".',
  },
  {
    type: 'body',
    text: '5. I appreciate that "the Agreement" limits the liability of "the Agents" to be the same extent as it limits the liability of "the Company", even though "the Agents" are not formal parties to "the Agreement".',
  },
  {
    type: 'heading',
    text: 'Electronic Signature Consent to Waiver',
  },
  {
    type: 'body',
    text: 'By entering your name below, you are consenting to the use of your electronic signature in lieu of an original signature on paper. You have the right to request that you sign a paper copy instead. By checking here, you are waiving that right. After consent, you may, upon written request to us, obtain a paper copy of an electronic record. No fee will be charged for such copy and no special hardware or software is required to view it. Your agreement to use an electronic signature with us for any documents will continue until such time as you notify us in writing that you no longer wish to use an electronic signature. There is no penalty for withdrawing your consent. You should always make sure that we have a current email address in order to contact you regarding any changes, if necessary.',
  },
  {
    type: 'consent',
    text: 'I AM 16 YEARS OF AGE OR OLDER, AND I HAVE READ AND UNDERSTAND "THE AGREEMENT". I UNDERSTAND THAT THIS DOCUMENT CONTAINS A PROMISE NOT TO SUE "THE COMPANY" AND/OR "THE AGENTS" AND THAT IT CONSTITUTES A RELEASE OF LIABILITY AND AN INDEMNITY FOR ALL CLAIMS. IF I AM THE PARENT AND/OR GUARDIAN OF THE PARTICIPANT, I HAVE READ AND UNDERSTAND AND EXECUTE "THE AGREEMENT" ON BEHALF OF CHILD/WARD. I hereby sign this agreement on behalf of myself, my personal representatives, heirs and assigns.',
  },
]

export const WAIVER_META = {
  membership: {
    title: 'Share Purchase & Membership',
    fullTitle: 'Share Purchase for Lifetime Membership',
    profileKey: 'waiverMembership' as const,
    sections: MEMBERSHIP_SECTIONS,
  },
  liability: {
    title: 'Liability Waiver',
    fullTitle: 'Release of Liability, Waiver of Claims, Assumption of Risk and Indemnity Agreement',
    profileKey: 'waiverLiability' as const,
    sections: LIABILITY_SECTIONS,
  },
} as const

export type WaiverType = keyof typeof WAIVER_META
