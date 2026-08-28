import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Card, GradeBarChart, SendsLegend, StatTile } from '@/components/SummaryParts'
import { KBC } from '@/constants/theme'
import { climbSections, climbStats } from '@/domain/summaries'
import {
  getMyLocations,
  getMyLogs,
  gradesForSystem,
  type ClimbLocation,
  type PersonalClimb,
} from '@/services/climblog'

// Ported from mobile@1cdfada/app/climb-summary.tsx, which was a route reached
// from the climb log; a modal here, like the rest of mobile's routes.

const ALL = 'all'

export function ClimbSummaryModal({ uid, onClose }: { uid: string; onClose: () => void }) {
  const [locationId, setLocationId] = useState(ALL)
  const [locations, setLocations] = useState<ClimbLocation[]>([])
  const [climbs, setClimbs] = useState<PersonalClimb[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // Deliberate: changing the location filter has to put the panel back into
    // loading, or the old location's numbers sit there looking like the new
    // one's until the fetch lands.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    Promise.all([getMyLocations(uid), getMyLogs(uid, locationId === ALL ? undefined : locationId)])
      .then(([locs, logs]) => {
        if (cancelled) return
        setLocations(locs)
        setClimbs(logs)
      })
      .catch(
        (e) =>
          !cancelled && setError(e instanceof Error ? e.message : 'Could not load the summary.'),
      )
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [uid, locationId])

  const stats = useMemo(() => climbStats(climbs), [climbs])
  const sections = useMemo(
    () => climbSections(climbs, locations, gradesForSystem),
    [climbs, locations],
  )

  const filters = [
    { id: ALL, label: 'All' },
    { id: 'kbc', label: 'KBC' },
    ...locations.map((l) => ({ id: l.id, label: l.name })),
  ]

  const round1 = (n: number | null) => (n === null ? '—' : n.toFixed(1))

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-start justify-between gap-3 pb-1">
        <h2 className="text-base font-bold text-black">Climb Summary</h2>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-sm font-semibold"
          style={{ color: KBC.pink }}
        >
          Close
        </button>
      </div>

      {/* Filters in one row above the charts, as a chart filter should be. */}
      <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {filters.map((f) => {
          const on = f.id === locationId
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setLocationId(f.id)}
              aria-pressed={on}
              className="shrink-0 rounded-full border px-3 py-1 text-xs font-bold"
              style={
                on
                  ? { backgroundColor: KBC.cyan, borderColor: KBC.cyan, color: '#fff' }
                  : { borderColor: '#ddd', color: '#666' }
              }
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-neutral-400">Loading…</p>
      ) : error ? (
        <p className="py-12 text-center text-sm font-semibold text-red-600">{error}</p>
      ) : climbs.length === 0 ? (
        <p className="py-12 text-center text-sm text-neutral-400">
          Nothing logged here yet. Log a climb and it will show up.
        </p>
      ) : (
        <>
          <div className="mt-2 flex gap-2">
            <StatTile label="Sends" value={String(stats.sends)} accent={KBC.green} />
            <StatTile label="Attempts" value={String(stats.attempts)} accent={KBC.orange} />
            <StatTile label="Projects" value={String(stats.projects)} accent={KBC.purple} />
          </div>
          <div className="mt-2 flex gap-2">
            <StatTile label="Sessions" value={String(stats.sessions)} accent={KBC.cyan} />
            <StatTile label="Climbs / session" value={round1(stats.perSession)} accent={KBC.pink} />
            <StatTile label="Climbs / month" value={round1(stats.perMonth)} accent="#9e9e9e" />
          </div>

          {sections.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-400">
              No graded climbs here yet — add a grade when logging and they will chart.
            </p>
          ) : (
            sections.map((s) => (
              // One chart per grade scale: V4 and Font 6C are not the same
              // column, so they never share an axis.
              <Card key={s.system} title={s.title}>
                <SendsLegend />
                <GradeBarChart bars={s.bars} />
              </Card>
            ))
          )}
        </>
      )}
    </Modal>
  )
}
