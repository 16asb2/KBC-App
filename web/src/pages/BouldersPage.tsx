import { useEffect, useMemo, useState } from 'react'
import { BoulderCard } from '@/components/BoulderCard'
import { BoulderFilterModal } from '@/components/BoulderFilterModal'
import { BoulderFormModal, type BoulderFormMode } from '@/components/BoulderFormModal'
import { BoulderLogModal } from '@/components/BoulderLogModal'
import { BoulderOverviewModal } from '@/components/BoulderOverviewModal'
import { SeasonPickerModal } from '@/components/SeasonPickerModal'
import { KBC } from '@/constants/theme'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { computeAggregates } from '@/domain/climbAggregates'
import { boulderFilterCount, DEFAULT_BOULDER_FILTER, loadSavedBoulderFilters, saveBoulderFilters, type BoulderFilterState, type SortDir, type SortKey } from '@/domain/boulderFilters'
import { isAdmin, isPrivileged } from '@/domain/roles'
import {
  getBoulderProjects,
  getBouldersForSeason,
  getNextBoulderNumber,
  getSeasons,
  getTapeColorPool,
  saveTapeColorPool,
  setBoulderProject,
  setQualityVote,
  toggleLike,
  updateBoulder,
  type Boulder,
  type BoulderSeason,
} from '@/services/boulders'
import { getKBCLogs, type PersonalClimb } from '@/services/climblog'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'number', label: 'Number' },
  { key: 'name', label: 'Name' },
  { key: 'grade', label: 'Grade' },
  { key: 'setter', label: 'Setter' },
  { key: 'updatedAt', label: 'Modified' },
]

// Ported from mobile/app/(tabs)/boulders.tsx — KBC mode only. Personal mode
// (personal problems/locations, an entirely separate self-contained data
// model with no cross-dependency on this screen) is deferred to a follow-up.
export function BouldersPage() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const privileged = isPrivileged(user?.email ?? null, profile)
  const adminUser = isAdmin(user?.email, profile?.isAdmin)
  const userUid = user?.uid ?? ''
  const defaultSetter = profile?.preferredName || user?.displayName || ''

  const [seasons, setSeasons] = useState<BoulderSeason[]>([])
  const [selectedSeason, setSelectedSeason] = useState<BoulderSeason | null>(null)
  const [boulders, setBoulders] = useState<Boulder[]>([])
  const [logsByProblem, setLogsByProblem] = useState<Record<string, PersonalClimb[]>>({})
  const [loading, setLoading] = useState(true)
  const [showSeasonPicker, setShowSeasonPicker] = useState(false)
  const [formMode, setFormMode] = useState<BoulderFormMode | null>(null)
  const [showFilter, setShowFilter] = useState(false)
  const [filters, setFilters] = useState<BoulderFilterState>(DEFAULT_BOULDER_FILTER)
  const [sortKey, setSortKey] = useState<SortKey>('number')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [logBoulder, setLogBoulder] = useState<Boulder | null>(null)
  const [tapeColorPool, setTapeColorPool] = useState<string[]>([])
  const [viewBoulder, setViewBoulder] = useState<Boulder | null>(null)
  const [myProjects, setMyProjects] = useState<Set<string>>(new Set())

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilters(loadSavedBoulderFilters())
    getTapeColorPool().then(setTapeColorPool)
    if (userUid) getBoulderProjects(userUid).then((ids) => setMyProjects(new Set(ids)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    saveBoulderFilters(filters)
  }, [filters])

  async function loadData(forceSeason?: BoulderSeason) {
    setLoading(true)
    try {
      const [s, kbcLogs] = await Promise.all([getSeasons(), getKBCLogs()])
      setSeasons(s)

      const map: Record<string, PersonalClimb[]> = {}
      for (const log of kbcLogs) {
        if (!log.problemInternalId) continue
        ;(map[log.problemInternalId] ??= []).push(log)
      }
      setLogsByProblem(map)

      const target = forceSeason ?? selectedSeason ?? (s.length ? s[s.length - 1] : null)
      if (target) {
        setSelectedSeason(target)
        setBoulders(await getBouldersForSeason(target.id))
      }
    } catch (e) {
      console.warn('Failed to load boulders:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSelectSeason(season: BoulderSeason) {
    setSelectedSeason(season)
    setLoading(true)
    try {
      const [b, kbcLogs] = await Promise.all([getBouldersForSeason(season.id), getKBCLogs()])
      setBoulders(b)
      const map: Record<string, PersonalClimb[]> = {}
      for (const log of kbcLogs) {
        if (!log.problemInternalId) continue
        ;(map[log.problemInternalId] ??= []).push(log)
      }
      setLogsByProblem(map)
    } catch (e) {
      console.warn('Failed to load season:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddTapeColor(color: string) {
    const trimmed = color.trim()
    if (!trimmed || tapeColorPool.includes(trimmed)) return
    const newPool = [...tapeColorPool, trimmed].sort((a, b) => a.localeCompare(b))
    setTapeColorPool(newPool)
    try {
      await saveTapeColorPool(newPool)
    } catch {
      // non-fatal — local list stays updated even if the shared pool write fails
    }
  }

  async function handleToggleProject(boulder: Boulder) {
    const wasProject = myProjects.has(boulder.internalId)
    const newSet = new Set(myProjects)
    if (wasProject) newSet.delete(boulder.internalId)
    else newSet.add(boulder.internalId)
    setMyProjects(newSet)
    try {
      await setBoulderProject(userUid, boulder.internalId, !wasProject)
    } catch {
      setMyProjects(myProjects)
    }
  }

  function handleToggleLike(boulder: Boulder) {
    const wasLiked = boulder.likes.includes(userUid)
    const newLikes = wasLiked ? boulder.likes.filter((u) => u !== userUid) : [...boulder.likes, userUid]
    setBoulders((prev) => prev.map((b) => (b.id === boulder.id ? { ...b, likes: newLikes } : b)))
    setViewBoulder((prev) => (prev?.id === boulder.id ? { ...prev, likes: newLikes } : prev))
    toggleLike(boulder.id, userUid, wasLiked).catch(() => {
      setBoulders((prev) => prev.map((b) => (b.id === boulder.id ? { ...b, likes: boulder.likes } : b)))
      setViewBoulder((prev) => (prev?.id === boulder.id ? { ...prev, likes: boulder.likes } : prev))
    })
  }

  async function handleVoteGrade(boulder: Boulder, grade: number) {
    const oldVotes = boulder.gradeVotes ?? {}
    const updated: Record<string, number> = { ...oldVotes }
    if (grade < 0) delete updated[userUid]
    else updated[userUid] = grade
    setBoulders((prev) => prev.map((b) => (b.id === boulder.id ? { ...b, gradeVotes: updated } : b)))
    setViewBoulder((prev) => (prev?.id === boulder.id ? { ...prev, gradeVotes: updated } : prev))
    try {
      await updateBoulder(boulder.id, { gradeVotes: updated })
    } catch {
      setBoulders((prev) => prev.map((b) => (b.id === boulder.id ? { ...b, gradeVotes: oldVotes } : b)))
      setViewBoulder((prev) => (prev?.id === boulder.id ? { ...prev, gradeVotes: oldVotes } : prev))
    }
  }

  async function handleVoteQuality(boulder: Boulder, stars: number) {
    const oldVotes = boulder.qualityVotes ?? {}
    const updated: Record<string, number> = { ...oldVotes }
    if (stars <= 0) delete updated[userUid]
    else updated[userUid] = stars
    setBoulders((prev) => prev.map((b) => (b.id === boulder.id ? { ...b, qualityVotes: updated } : b)))
    setViewBoulder((prev) => (prev?.id === boulder.id ? { ...prev, qualityVotes: updated } : prev))
    try {
      await setQualityVote(boulder.id, userUid, stars, oldVotes)
    } catch {
      setBoulders((prev) => prev.map((b) => (b.id === boulder.id ? { ...b, qualityVotes: oldVotes } : b)))
      setViewBoulder((prev) => (prev?.id === boulder.id ? { ...prev, qualityVotes: oldVotes } : prev))
    }
  }

  async function openAddForm() {
    if (!selectedSeason) return
    const n = await getNextBoulderNumber(selectedSeason.id)
    setFormMode({ type: 'add', seasonId: selectedSeason.id, nextNumber: n })
  }

  function handleSortPress(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'number' || key === 'updatedAt' ? 'desc' : 'asc')
    }
  }

  const boulderAggregates = useMemo(() => {
    const map: Record<string, ReturnType<typeof computeAggregates>> = {}
    for (const b of boulders) map[b.internalId] = computeAggregates(logsByProblem[b.internalId] ?? [], b.setterGradeVote, b.setterBadges)
    return map
  }, [boulders, logsByProblem])

  const setterOptions = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const b of boulders) {
      const s = b.setter || 'Unknown setter'
      counts[s] = (counts[s] ?? 0) + 1
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ label: `${name} (${count})`, value: name }))
  }, [boulders])

  const displayed = useMemo(() => {
    let list = [...boulders]

    if (filters.locations.length) list = list.filter((b) => b.locations.some((l) => filters.locations.includes(l)))
    if (filters.grades.length) {
      list = list.filter((b) => {
        const avg = boulderAggregates[b.internalId]?.avgGrade
        return avg !== null && avg !== undefined && filters.grades.includes(Math.round(avg))
      })
    }
    if (filters.badges.length) {
      list = list.filter((b) => {
        const logs = logsByProblem[b.internalId] ?? []
        const inLogs = filters.badges.some((ba) => logs.some((log) => (log.badges ?? []).includes(ba)))
        const inSetter = filters.badges.some((ba) => (b.setterBadges ?? []).includes(ba))
        return inLogs || inSetter
      })
    }
    if (filters.setter) list = list.filter((b) => (b.setter || 'Unknown setter') === filters.setter)
    if (filters.projectsOnly) list = list.filter((b) => myProjects.has(b.internalId))
    if (filters.likedOnly) list = list.filter((b) => b.likes.includes(userUid))
    if (filters.unsentOnly) {
      list = list.filter((b) => {
        const bLogs = logsByProblem[b.internalId] ?? []
        return !bLogs.some((l) => l.uid === userUid && l.type === 'ascent')
      })
    }

    const dir = sortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      switch (sortKey) {
        case 'number':
          return dir * (a.number - b.number)
        case 'name':
          return dir * (a.name || `#${a.number}`).localeCompare(b.name || `#${b.number}`)
        case 'grade': {
          const ag = boulderAggregates[a.internalId]?.avgGrade ?? -1
          const bg = boulderAggregates[b.internalId]?.avgGrade ?? -1
          return dir * (ag - bg)
        }
        case 'setter':
          return dir * a.setter.localeCompare(b.setter)
        case 'updatedAt':
          return dir * a.updatedAt.localeCompare(b.updatedAt)
      }
    })
    return list
  }, [boulders, filters, sortKey, sortDir, boulderAggregates, logsByProblem, myProjects, userUid])

  const fc = boulderFilterCount(filters)

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white p-3">
        <button
          type="button"
          onClick={() => setShowSeasonPicker(true)}
          className="flex items-center gap-1 rounded-full border border-neutral-300 px-3 py-1.5 text-sm font-bold text-neutral-700"
        >
          {selectedSeason ? selectedSeason.name : 'Select Season'} <span className="text-xs">▾</span>
        </button>
        <button
          type="button"
          onClick={() => setShowFilter(true)}
          className="rounded-full border px-3 py-1.5 text-sm font-bold"
          style={fc > 0 ? { background: KBC.lime, borderColor: KBC.lime, color: '#fff' } : { borderColor: '#ddd', color: '#666' }}
        >
          Filter{fc > 0 ? ` (${fc})` : ''}
        </button>
        <div className="flex-1" />
      </div>

      {/* Sort bar */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-neutral-100 bg-neutral-50 px-3 py-2">
        {SORT_OPTIONS.map((opt) => {
          const active = sortKey === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => handleSortPress(opt.key)}
              className="shrink-0 rounded-full border px-3 py-1 text-xs font-bold"
              style={active ? { background: KBC.black, borderColor: KBC.black, color: '#fff' } : { borderColor: '#ddd', color: '#666' }}
            >
              {opt.label}
              {active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 p-3">
        {loading && boulders.length === 0 ? (
          <p className="pt-8 text-center text-sm text-neutral-400">Loading…</p>
        ) : seasons.length === 0 ? (
          <div className="pt-8 text-center">
            <p className="font-bold text-neutral-600">No seasons yet</p>
            {privileged ? (
              <button type="button" onClick={() => setShowSeasonPicker(true)} className="mt-3 rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: KBC.black }}>
                Create First Season
              </button>
            ) : (
              <p className="mt-1 text-sm text-neutral-400">Ask an admin to set up the first season.</p>
            )}
          </div>
        ) : displayed.length === 0 ? (
          <div className="pt-8 text-center">
            <p className="font-bold text-neutral-600">{boulders.length === 0 ? 'No boulders this season' : 'No results'}</p>
            <p className="mt-1 text-sm text-neutral-400">{boulders.length === 0 ? 'Add the first problem!' : 'Try adjusting your filters.'}</p>
            {fc > 0 && (
              <button type="button" onClick={() => setFilters(DEFAULT_BOULDER_FILTER)} className="mt-3 rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: KBC.black }}>
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {displayed.map((item) => (
              <BoulderCard
                key={item.id}
                boulder={item}
                logs={logsByProblem[item.internalId] ?? []}
                uid={userUid}
                onPress={() => setViewBoulder(item)}
                onLog={() => setLogBoulder(item)}
                isProject={myProjects.has(item.internalId)}
                onToggleProject={() => void handleToggleProject(item)}
                likeCount={item.likes.length}
                isLiked={item.likes.includes(userUid)}
                onToggleLike={() => handleToggleLike(item)}
              />
            ))}
          </div>
        )}
      </div>

      {privileged && seasons.length > 0 && (
        <div className="border-t border-neutral-200 bg-white p-3">
          <button type="button" onClick={() => void openAddForm()} className="w-full rounded-xl p-3 text-sm font-bold text-white" style={{ background: KBC.lime }}>
            + Add Boulder
          </button>
        </div>
      )}

      {showSeasonPicker && (
        <SeasonPickerModal
          seasons={seasons}
          selectedId={selectedSeason?.id ?? null}
          canCreate={adminUser}
          onSelect={(s) => {
            void handleSelectSeason(s)
          }}
          onClose={() => setShowSeasonPicker(false)}
        />
      )}

      {showFilter && (
        <BoulderFilterModal filters={filters} onChange={setFilters} onClose={() => setShowFilter(false)} setterOptions={setterOptions} />
      )}

      {formMode && (
        <BoulderFormModal
          mode={formMode}
          userUid={userUid}
          defaultSetter={defaultSetter}
          canRemove={adminUser}
          tapeColorPool={tapeColorPool}
          onAddTapeColor={(c) => void handleAddTapeColor(c)}
          existingNumbers={boulders.map((b) => b.number)}
          onClose={() => setFormMode(null)}
          onSaved={(updated) => {
            setFormMode(null)
            if (updated) {
              setBoulders((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
              setViewBoulder((prev) => (prev?.id === updated.id ? updated : prev))
            } else if (selectedSeason) {
              void handleSelectSeason(selectedSeason)
            }
          }}
        />
      )}

      {logBoulder && (
        <BoulderLogModal
          boulder={logBoulder}
          userUid={userUid}
          userName={profile?.preferredName || user?.displayName || user?.email || 'Unknown'}
          onClose={() => setLogBoulder(null)}
          onSaved={(entry) => {
            setLogsByProblem((prev) => ({ ...prev, [logBoulder.internalId]: [...(prev[logBoulder.internalId] ?? []), entry] }))
          }}
        />
      )}

      {viewBoulder && (
        <BoulderOverviewModal
          boulder={viewBoulder}
          logs={logsByProblem[viewBoulder.internalId] ?? []}
          uid={userUid}
          userName={profile?.preferredName || user?.displayName || user?.email || 'Unknown'}
          canEdit={privileged || viewBoulder.createdByUid === userUid}
          canRemove={adminUser}
          onEdit={() => setFormMode({ type: 'edit', boulder: viewBoulder })}
          onClose={() => setViewBoulder(null)}
          likeCount={viewBoulder.likes.length}
          isLiked={viewBoulder.likes.includes(userUid)}
          onToggleLike={() => handleToggleLike(viewBoulder)}
          isProject={myProjects.has(viewBoulder.internalId)}
          onToggleProject={() => void handleToggleProject(viewBoulder)}
          onLog={() => setLogBoulder(viewBoulder)}
          onVoteGrade={(g) => void handleVoteGrade(viewBoulder, g)}
          onVoteQuality={(s) => void handleVoteQuality(viewBoulder, s)}
        />
      )}
    </div>
  )
}
