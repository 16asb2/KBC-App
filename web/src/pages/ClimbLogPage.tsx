import { useEffect, useMemo, useState } from 'react'
import { ClimbFilterModal } from '@/components/ClimbFilterModal'
import { ClimbRow } from '@/components/ClimbRow'
import { LocationPickerSheet } from '@/components/LocationPickerSheet'
import { LogClimbModal } from '@/components/LogClimbModal'
import { NewLocationModal } from '@/components/NewLocationModal'
import { KBC } from '@/constants/theme'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { climbFilterCount, DEFAULT_CLIMB_FILTER, filterAndSortClimbs, groupClimbsByDate, type ClimbFilter, type ClimbSort } from '@/domain/climbLogFilter'
import { deleteClimb, getMyLocations, getMyLogs, type ClimbLocation, type PersonalClimb } from '@/services/climblog'

const SORT_OPTIONS: { key: ClimbSort; label: string }[] = [
  { key: 'newest', label: '↓ Date' },
  { key: 'oldest', label: '↑ Date' },
  { key: 'name-az', label: 'A – Z' },
  { key: 'name-za', label: 'Z – A' },
  { key: 'quality', label: '★ Stars' },
]

// Ported from mobile/app/(tabs)/climblog.tsx. Real content replacing the
// placeholder ClimbLogPage from Phase 2. The '/climb-summary' stats screen
// it links out to isn't built (out of scope here, same as boulder-summary).
export function ClimbLogPage() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const uid = user?.uid ?? ''
  const userName = profile?.preferredName || user?.displayName || ''

  const [locationId, setLocationId] = useState('all')
  const [locations, setLocations] = useState<ClimbLocation[]>([])
  const [climbs, setClimbs] = useState<PersonalClimb[]>([])
  const [loading, setLoading] = useState(true)
  const [showLocPick, setShowLocPick] = useState(false)
  const [showNewLoc, setShowNewLoc] = useState(false)
  const [showLogClimb, setShowLogClimb] = useState(false)
  const [editingClimb, setEditingClimb] = useState<PersonalClimb | null>(null)
  const [filter, setFilter] = useState<ClimbFilter>(DEFAULT_CLIMB_FILTER)
  const [showFilter, setShowFilter] = useState(false)

  const locationNames: Record<string, string> = {
    kbc: 'KBC Gym',
    ...Object.fromEntries(locations.map((l) => [l.id, l.name])),
  }

  async function loadAll() {
    if (!uid) return
    setLoading(true)
    try {
      const [locs, logs] = await Promise.all([getMyLocations(uid), getMyLogs(uid, locationId === 'all' ? undefined : locationId)])
      setLocations(locs)
      setClimbs(logs)
    } catch (e) {
      console.warn('Failed to load climb log:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, locationId])

  async function handleDelete(climb: PersonalClimb) {
    try {
      await deleteClimb(climb.id)
      setClimbs((prev) => prev.filter((c) => c.id !== climb.id))
    } catch (e) {
      console.warn('Failed to delete climb:', e)
    }
  }

  function handleSaved(climb: PersonalClimb, isEdit: boolean) {
    if (isEdit) setClimbs((prev) => prev.map((c) => (c.id === climb.id ? climb : c)))
    else setClimbs((prev) => [climb, ...prev])
  }

  function openEdit(climb: PersonalClimb) {
    setEditingClimb(climb)
    setShowLogClimb(true)
  }

  const activeLocLabel = locationId === 'all' ? 'All Locations' : locationId === 'kbc' ? 'KBC Gym' : (locations.find((l) => l.id === locationId)?.name ?? 'Unknown')

  const displayed = useMemo(() => filterAndSortClimbs(climbs, filter), [climbs, filter])
  const listItems = useMemo(() => groupClimbsByDate(displayed, filter.sort), [displayed, filter.sort])
  const fc = climbFilterCount(filter)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-neutral-50">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white p-3">
        <button type="button" onClick={() => setShowLocPick(true)} className="flex min-w-0 items-center gap-1 rounded-full border border-neutral-300 px-3 py-1.5 text-sm font-bold text-neutral-700">
          <span className="truncate">📍 {activeLocLabel}</span> <span className="shrink-0 text-xs">▾</span>
        </button>
        <button
          type="button"
          onClick={() => setShowFilter(true)}
          className="rounded-full border px-3 py-1.5 text-sm font-bold"
          style={fc > 0 ? { background: KBC.cyan, borderColor: KBC.cyan, color: '#fff' } : { borderColor: '#ddd', color: '#666' }}
        >
          ⚙{fc > 0 ? ` ${fc}` : ''}
        </button>
        <div className="flex-1" />
        <button type="button" onClick={() => setShowLogClimb(true)} className="rounded-full px-4 py-1.5 text-sm font-bold text-white" style={{ background: KBC.green }}>
          ＋ Log Climb
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto border-b border-neutral-100 bg-white px-3 py-2">
        {SORT_OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setFilter((f) => ({ ...f, sort: o.key }))}
            className="shrink-0 rounded-full border px-3 py-1 text-xs font-bold"
            style={filter.sort === o.key ? { background: KBC.black, borderColor: KBC.black, color: '#fff' } : { borderColor: '#ddd', color: '#666' }}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {listItems.length === 0 ? (
          <div className="pt-10 text-center">
            <p className="text-4xl">🧗</p>
            <p className="mt-2 font-bold text-neutral-600">No climbs logged yet</p>
            <p className="mt-1 text-sm text-neutral-400">Tap + to log your first climb</p>
          </div>
        ) : (
          <div className="space-y-2">
            {listItems.map((item) =>
              item.type === 'header' ? (
                <p key={item.key} className="pt-2 pb-1 text-xs font-bold tracking-wide text-neutral-400 uppercase first:pt-0">
                  {item.label}
                </p>
              ) : (
                <ClimbRow
                  key={item.key}
                  climb={item.climb}
                  locationName={locationNames[item.climb.locationId] ?? item.climb.locationId}
                  onPress={() => openEdit(item.climb)}
                  onDelete={() => void handleDelete(item.climb)}
                />
              ),
            )}
          </div>
        )}
      </div>

      {showLocPick && (
        <LocationPickerSheet
          onClose={() => setShowLocPick(false)}
          locationId={locationId}
          onSelect={setLocationId}
          locations={locations}
          onNewLocation={() => setShowNewLoc(true)}
        />
      )}

      {showNewLoc && (
        <NewLocationModal onClose={() => setShowNewLoc(false)} onCreated={(loc) => setLocations((prev) => [...prev, loc])} uid={uid} />
      )}

      {showLogClimb && (
        <LogClimbModal
          onClose={() => {
            setShowLogClimb(false)
            setEditingClimb(null)
          }}
          onSaved={handleSaved}
          uid={uid}
          userName={userName}
          locations={locations}
          initialLocationId={locationId}
          editingClimb={editingClimb}
        />
      )}

      {showFilter && <ClimbFilterModal onClose={() => setShowFilter(false)} filter={filter} onApply={setFilter} />}
    </div>
  )
}
