import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Card, SetterBars, StatTile } from '@/components/SummaryParts'
import { cellFill } from '@/constants/chart'
import { KBC } from '@/constants/theme'
import {
  UNASSIGNED_WALL,
  boulderCell,
  gradeLocationMatrix,
  gradeRows,
  qualityBuckets,
  setterTallies,
} from '@/domain/summaries'
import {
  GRADE_COLORS,
  GRADE_TEXT,
  GRADES,
  LOCATIONS,
  getBouldersForSeason,
  type Boulder,
} from '@/services/boulders'
import { getKBCLogs, type PersonalClimb } from '@/services/climblog'

// Ported from mobile@1cdfada/app/boulder-summary.tsx, which was a route; a modal
// here, like every other screen mobile reached by navigating.

/** Wall names are long and the table is six columns wide. */
const SHORT_WALL: Record<string, string> = {
  'Cave Right': 'Cave R.',
  'Cave Middle': 'Cave M.',
  'Cave Left': 'Cave L.',
  'Green Wall': 'Green',
  'Blue Wall': 'Blue',
  'Yellow Wall': 'Yellow',
}

const UNGRADED_CHIP = { background: '#d9d9d9', color: '#555' }

export function BoulderSummaryModal({
  seasonId,
  seasonName,
  onClose,
}: {
  seasonId: string
  seasonName: string
  onClose: () => void
}) {
  const [boulders, setBoulders] = useState<Boulder[]>([])
  const [kbcLogs, setKbcLogs] = useState<PersonalClimb[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getBouldersForSeason(seasonId), getKBCLogs()])
      .then(([bs, logs]) => {
        if (cancelled) return
        setBoulders(bs)
        setKbcLogs(logs)
      })
      .catch(
        (e) =>
          !cancelled && setError(e instanceof Error ? e.message : 'Could not load the summary.'),
      )
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [seasonId])

  const matrix = useMemo(() => gradeLocationMatrix(boulders, GRADES, LOCATIONS), [boulders])

  // Which cell the reader has opened up. A count you cannot look inside has to
  // be taken on trust, and that is how a correct count gets mistaken for a
  // broken one — "there is a black boulder on the yellow wall and this says
  // zero" is answerable in one tap once the cell will say what it is holding.
  const [focus, setFocus] = useState<{ row: string; wall: string | null } | null>(null)

  const focused = useMemo(() => {
    if (!focus) return []
    return boulders
      .map((b) => ({ b, cell: boulderCell(b, GRADES, LOCATIONS) }))
      .filter(
        ({ cell }) =>
          cell.row === focus.row && (focus.wall === null || cell.walls.includes(focus.wall)),
      )
      .sort((x, y) => x.b.number - y.b.number)
  }, [boulders, focus])
  const quality = useMemo(() => qualityBuckets(boulders), [boulders])
  const setters = useMemo(() => setterTallies(boulders), [boulders])

  // Climb logs are gym-wide, so they are narrowed to this season's boulders.
  const seasonLogs = useMemo(() => {
    const internalIds = new Set(boulders.map((b) => b.internalId))
    const docIds = new Set(boulders.map((b) => b.id))
    return kbcLogs.filter(
      (l) =>
        (l.problemInternalId && internalIds.has(l.problemInternalId)) ||
        (l.boulderId && docIds.has(l.boulderId)),
    )
  }, [kbcLogs, boulders])

  const sends = seasonLogs.filter((l) => l.type === 'ascent').length
  const attempts = seasonLogs.filter((l) => l.type === 'attempt').length
  const likes = boulders.reduce((s, b) => s + b.likes.length, 0)

  const rows = gradeRows(GRADES)
  const chipStyle = (row: string) => {
    const i = GRADES.indexOf(row as (typeof GRADES)[number])
    return i === -1 ? UNGRADED_CHIP : { background: GRADE_COLORS[i], color: GRADE_TEXT[i] }
  }

  return (
    <Modal onClose={onClose} size="lg">
      <div className="flex items-start justify-between gap-3 pb-1">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-black">Boulder Summary</h2>
          {seasonName && <p className="truncate text-xs text-neutral-500">{seasonName}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-sm font-semibold"
          style={{ color: KBC.pink }}
        >
          Close
        </button>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-neutral-400">Loading…</p>
      ) : error ? (
        <p className="py-12 text-center text-sm font-semibold text-red-600">{error}</p>
      ) : boulders.length === 0 ? (
        <p className="py-12 text-center text-sm text-neutral-400">
          No boulders in this season yet.
        </p>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            <StatTile label="Boulders" value={String(matrix.total)} accent={KBC.lime} />
            <StatTile label="Sends" value={String(sends)} accent={KBC.green} />
            <StatTile label="Attempts" value={String(attempts)} accent={KBC.orange} />
            <StatTile label="Likes" value={String(likes)} accent={KBC.pink} />
          </div>

          <Card
            title="Boulders by grade and wall"
            note={
              'A boulder set across two walls counts once per wall, so the column totals add up to more than the boulder count.' +
              (matrix.unassigned > 0
                ? ` ${matrix.unassigned} boulder${matrix.unassigned === 1 ? ' has' : 's have'} no wall on record${
                    matrix.unrecognisedWalls.length > 0
                      ? ` or name one this app does not know (${matrix.unrecognisedWalls.join(', ')})`
                      : ''
                  } — ${matrix.unassigned === 1 ? 'it is' : 'they are'} under “${UNASSIGNED_WALL}”. Open the boulder and pick its wall to move ${matrix.unassigned === 1 ? 'it' : 'them'} across.`
                : '')
            }
          >
            {/* Darker cell = more boulders. One hue, so the shading reads as
                "how many" rather than as six unrelated categories. */}
            <div className="mt-3 -mx-1 overflow-x-auto">
              <table className="w-full min-w-[420px] border-separate border-spacing-0 px-1 text-center">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white pb-1.5 text-left text-[10px] font-bold text-neutral-500">
                      Grade
                    </th>
                    {matrix.columns.map((loc) => (
                      <th key={loc} className="pb-1.5 text-[10px] font-bold text-neutral-500">
                        {SHORT_WALL[loc] ?? loc}
                      </th>
                    ))}
                    <th className="pb-1.5 text-[10px] font-bold text-neutral-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row}>
                      <th scope="row" className="sticky left-0 z-10 bg-white py-0.5 pr-2 text-left">
                        <span
                          className="inline-block w-full rounded px-2 py-1 text-[11px] font-bold"
                          style={chipStyle(row)}
                        >
                          {row}
                        </span>
                      </th>
                      {matrix.columns.map((loc) => {
                        const n = matrix.counts[row][loc] ?? 0
                        const open = focus?.row === row && focus.wall === loc
                        return (
                          <td key={loc} className="p-0.5">
                            <button
                              type="button"
                              disabled={n === 0}
                              onClick={() => setFocus(open ? null : { row, wall: loc })}
                              aria-expanded={open}
                              className="block w-full rounded py-1.5 text-[13px] font-semibold tabular-nums disabled:cursor-default"
                              style={{
                                ...cellFill(n, matrix.busiestCell),
                                outline: open ? `2px solid ${KBC.pink}` : undefined,
                              }}
                              title={`${row} · ${loc}: ${n} boulder${n === 1 ? '' : 's'}`}
                            >
                              {n || '·'}
                            </button>
                          </td>
                        )
                      })}
                      <td className="p-0.5">
                        <button
                          type="button"
                          disabled={matrix.rowTotals[row] === 0}
                          onClick={() =>
                            setFocus(
                              focus?.row === row && focus.wall === null
                                ? null
                                : { row, wall: null },
                            )
                          }
                          aria-expanded={focus?.row === row && focus.wall === null}
                          className="block w-full rounded bg-neutral-100 py-1.5 text-[13px] font-bold text-neutral-700 tabular-nums disabled:cursor-default"
                          style={{
                            outline:
                              focus?.row === row && focus.wall === null
                                ? `2px solid ${KBC.pink}`
                                : undefined,
                          }}
                          title={`Every ${row} boulder and the wall it is on`}
                        >
                          {matrix.rowTotals[row] || '·'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="sticky left-0 z-10 bg-white py-0.5 pr-2 text-left">
                      <span className="inline-block w-full rounded bg-neutral-200 px-2 py-1 text-[11px] font-bold text-neutral-700">
                        Total
                      </span>
                    </th>
                    {matrix.columns.map((loc) => (
                      <td key={loc} className="p-0.5">
                        <span className="block rounded bg-neutral-100 py-1.5 text-[13px] font-bold text-neutral-700 tabular-nums">
                          {matrix.colTotals[loc] || '·'}
                        </span>
                      </td>
                    ))}
                    <td className="p-0.5">
                      <span className="block rounded bg-neutral-200 py-1.5 text-[13px] font-extrabold text-neutral-900 tabular-nums">
                        {matrix.total}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* What the tapped cell is actually holding. The wall column is the
                point of it: a boulder somebody expected in one cell and finds
                in another is a record to correct, not a count to distrust, and
                this is the difference between knowing that and guessing. */}
            {focus && (
              <div className="mt-3 rounded-xl bg-neutral-50 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-bold text-neutral-700">
                    {focus.wall === null
                      ? `Every ${focus.row} boulder`
                      : `${focus.row} · ${focus.wall}`}
                    <span className="ml-1.5 font-normal text-neutral-500">
                      ({focused.length})
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setFocus(null)}
                    className="text-xs font-semibold"
                    style={{ color: KBC.pink }}
                  >
                    Hide
                  </button>
                </div>
                <ul className="mt-2 space-y-1">
                  {focused.map(({ b, cell }) => (
                    <li key={b.id} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate font-semibold text-neutral-800">
                        #{b.number}
                        {b.name ? ` ${b.name}` : ''}
                      </span>
                      <span
                        className="shrink-0"
                        style={{
                          color: cell.walls[0] === UNASSIGNED_WALL ? KBC.orange : '#737373',
                        }}
                      >
                        {cell.walls.join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card
            title="Quality ratings"
            note="From members' star votes; a boulder with no votes is unrated."
          >
            <div className="mt-3 flex gap-2">
              <StatTile label="★★★" value={String(quality.threeStar)} accent={KBC.orange} />
              <StatTile label="★★" value={String(quality.twoStar)} accent={KBC.orange} />
              <StatTile label="★" value={String(quality.oneStar)} accent={KBC.orange} />
              <StatTile label="Unrated" value={String(quality.unrated)} accent="#9e9e9e" />
            </div>
          </Card>

          {setters.length > 0 && (
            <Card title="Setter contributions">
              <SetterBars rows={setters} />
            </Card>
          )}
        </>
      )}
    </Modal>
  )
}
