import type { PersonalClimb } from '@/services/climblog'

// Ported from mobile/app/(tabs)/climblog.tsx's filter/sort/grouping logic.

export type ClimbSort = 'newest' | 'oldest' | 'name-az' | 'name-za' | 'quality'
export type ClimbFilter = {
  type: 'all' | 'sent' | 'attempted'
  projectsOnly: boolean
  sort: ClimbSort
}

export const DEFAULT_CLIMB_FILTER: ClimbFilter = { type: 'all', projectsOnly: false, sort: 'newest' }

export function climbFilterCount(f: ClimbFilter): number {
  return (f.type !== 'all' ? 1 : 0) + (f.projectsOnly ? 1 : 0)
}

export function filterAndSortClimbs(climbs: PersonalClimb[], filter: ClimbFilter): PersonalClimb[] {
  let list = [...climbs]
  if (filter.type !== 'all') list = list.filter((c) => c.type === (filter.type === 'sent' ? 'ascent' : 'attempt'))
  if (filter.projectsOnly) list = list.filter((c) => c.project)
  list.sort((a, b) => {
    switch (filter.sort) {
      case 'oldest':
        return a.timestamp.localeCompare(b.timestamp)
      case 'name-az':
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      case 'name-za':
        return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' })
      case 'quality':
        return (b.quality || 0) - (a.quality || 0) || b.timestamp.localeCompare(a.timestamp)
      default:
        return b.timestamp.localeCompare(a.timestamp)
    }
  })
  return list
}

export function formatTimestamp(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `Today ${time}`
  if (isYesterday) return `Yesterday ${time}`
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} ${time}`
}

export function dateSectionLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export type ClimbListItem = { type: 'header'; key: string; label: string } | { type: 'climb'; key: string; climb: PersonalClimb }

/** Groups a (pre-sorted) climb list into date-section headers + rows — only when sorted by date. */
export function groupClimbsByDate(displayed: PersonalClimb[], sort: ClimbSort): ClimbListItem[] {
  const byDate = sort === 'newest' || sort === 'oldest'
  if (!byDate) return displayed.map((c) => ({ type: 'climb', key: c.id, climb: c }))
  const items: ClimbListItem[] = []
  let lastDateKey = ''
  for (const climb of displayed) {
    const dateKey = climb.timestamp.slice(0, 10)
    if (dateKey !== lastDateKey) {
      items.push({ type: 'header', key: `h-${dateKey}`, label: dateSectionLabel(climb.timestamp) })
      lastDateKey = dateKey
    }
    items.push({ type: 'climb', key: climb.id, climb })
  }
  return items
}
