// Ported from mobile@1cdfada/app/(tabs)/boulders.tsx's filter state. Persistence uses
// localStorage instead of expo-file-system.

export type SortKey = 'number' | 'name' | 'grade' | 'popular' | 'setter' | 'updatedAt'

/**
 * How popular a boulder is: everyone who liked it, plus every time anyone
 * climbed on it (sends and attempts alike — see `ClimbAggregates.climbedCount`).
 *
 * A plain sum, deliberately. Weighting one input over the other would be a
 * guess, and the two already measure different things — a like is an opinion,
 * a climb is traffic — so a problem needs both to top the list.
 */
export function popularityScore(likeCount: number, climbedCount: number): number {
  return likeCount + climbedCount
}

export type SortDir = 'asc' | 'desc'

export type BoulderFilterState = {
  locations: string[]
  grades: number[] // grade indices 0-4; empty = all
  badges: string[] // badge names; empty = all
  setter: string
  projectsOnly: boolean
  likedOnly: boolean
  unsentOnly: boolean
}

export const DEFAULT_BOULDER_FILTER: BoulderFilterState = {
  locations: [],
  grades: [],
  badges: [],
  setter: '',
  projectsOnly: false,
  likedOnly: false,
  unsentOnly: false,
}

const STORAGE_KEY = 'kbc-boulder-filters'

export function loadSavedBoulderFilters(): BoulderFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_BOULDER_FILTER
    return { ...DEFAULT_BOULDER_FILTER, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_BOULDER_FILTER
  }
}

export function saveBoulderFilters(f: BoulderFilterState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(f))
  } catch {
    // ignore — filters just won't persist across reloads
  }
}

export function boulderFilterCount(f: BoulderFilterState): number {
  return (
    f.locations.length +
    f.grades.length +
    f.badges.length +
    (f.setter ? 1 : 0) +
    (f.projectsOnly ? 1 : 0) +
    (f.likedOnly ? 1 : 0) +
    (f.unsentOnly ? 1 : 0)
  )
}
