import { useMemo } from 'react'
import { KBC } from '@/constants/theme'
import { BadgeIcon } from '@/components/BadgeIcon'
import { GradeBar } from '@/components/GradeBar'
import { computeAggregates, getPersonalStatus } from '@/domain/climbAggregates'
import type { Boulder } from '@/services/boulders'
import type { PersonalClimb } from '@/services/climblog'

// Ported from mobile@1cdfada/app/(tabs)/boulders.tsx's ClimbCard.
export function BoulderCard({
  boulder,
  logs,
  uid,
  onPress,
  onLog,
  isProject,
  onToggleProject,
  likeCount,
  isLiked,
  onToggleLike,
}: {
  boulder: Boulder
  logs: PersonalClimb[]
  uid: string
  onPress: () => void
  onLog: () => void
  isProject: boolean
  onToggleProject: () => void
  likeCount: number
  isLiked: boolean
  onToggleLike: () => void
}) {
  const agg = useMemo(
    () => computeAggregates(logs, boulder.setterGradeVote, boulder.setterBadges),
    [logs, boulder.setterGradeVote, boulder.setterBadges],
  )
  const myLog = useMemo(() => getPersonalStatus(logs, uid), [logs, uid])

  const { gradeVotesMap, badgeCounts } = useMemo(() => {
    const gv: Record<string, number> = { ...boulder.gradeVotes }
    if (boulder.setterGradeVote !== null && boulder.setterGradeVote !== undefined) {
      gv['__setter'] = boulder.setterGradeVote
    }
    const bc: Record<string, number> = {}
    for (const log of logs) {
      for (const b of log.badges ?? []) bc[b] = (bc[b] ?? 0) + 1
    }
    for (const b of boulder.setterBadges ?? []) bc[b] = (bc[b] ?? 0) + 1
    return { gradeVotesMap: gv, badgeCounts: bc }
  }, [logs, boulder.gradeVotes, boulder.setterGradeVote, boulder.setterBadges])

  // The card draws `thumb` and never `photo`. A season's worth of full-size
  // base64 JPEGs on one scrolling list is what made this screen crawl on
  // iPhone — see DESIGN.md. Older boulders have no thumb; they get the
  // placeholder rather than the 200 kB original.
  const icon = boulder.thumb

  function stop(e: React.MouseEvent) {
    e.stopPropagation()
  }

  return (
    <button
      type="button"
      onClick={onPress}
      className="w-full rounded-2xl bg-white p-4 text-left shadow-sm"
    >
      {/* Row 1: identity on the left, the numbers on one line at top right */}
      <div className="flex items-start gap-2.5">
        <span className="shrink-0 rounded-lg bg-neutral-100 px-2 py-1 text-xs font-extrabold text-neutral-600">
          #{boulder.number}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-neutral-900">
            {[
              boulder.name || null,
              boulder.locations.slice(0, 2).join(', ') || null,
              boulder.tapeColor ? `${boulder.tapeColor} Tape` : null,
            ]
              .filter(Boolean)
              .join('  |  ') || `Boulder #${boulder.number}`}
          </p>
          {boulder.setter && (
            <p className="truncate text-xs text-neutral-500">by {boulder.setter}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {likeCount > 0 && (
            <span className="text-xs font-bold text-[#e91e63]" title={`${likeCount} like${likeCount !== 1 ? 's' : ''}`}>
              ♥ {likeCount}
            </span>
          )}
          {agg.climbedCount > 0 && (
            <span
              className="text-xs font-bold"
              style={{ color: KBC.cyan }}
              title={`Climbed ${agg.climbedCount} time${agg.climbedCount !== 1 ? 's' : ''}`}
            >
              ✓ {agg.climbedCount}
            </span>
          )}
          {myLog && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white"
              style={{ background: myLog.type === 'ascent' ? KBC.green : KBC.orange }}
            >
              {myLog.type === 'ascent' ? '✓ Sent' : '△ Tried'}
            </span>
          )}
        </div>
      </div>

      {/* Row 2: top badges, right-aligned to sit under the counts above */}
      {agg.topBadges.length > 0 && (
        <div className="mt-1.5 flex flex-nowrap justify-end gap-0.5">
          {agg.topBadges.map((b) => (
            <BadgeIcon key={b} label={b} count={badgeCounts[b] ?? 0} selected size="sm" compact />
          ))}
        </div>
      )}

      {/* Row 3: the round photo icon, then the grade bar in what's left */}
      <div className="mt-0.5 flex items-center gap-2.5">
        <BoulderIcon src={icon} number={boulder.number} />
        <div className="min-w-0 flex-1">
          <GradeBar votes={gradeVotesMap} compact />
        </div>
      </div>

      {/* Row 4: actions */}
      <div className="mt-1 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            stop(e)
            onToggleProject()
          }}
          className="rounded-full border px-2.5 py-1 text-xs font-bold"
          style={
            isProject
              ? { background: KBC.purple, borderColor: KBC.purple, color: KBC.white }
              : { borderColor: '#ddd', color: '#666' }
          }
        >
          {isProject ? '− Project' : '+ Project'}
        </button>
        <button
          type="button"
          onClick={(e) => {
            stop(e)
            onToggleLike()
          }}
          className="rounded-full border px-2.5 py-1 text-xs font-bold"
          style={
            isLiked
              ? { background: '#e91e63', borderColor: '#e91e63', color: '#fff' }
              : { borderColor: '#ddd', color: '#666' }
          }
        >
          {isLiked ? '♥' : '♡'} Like
        </button>
        <button
          type="button"
          onClick={(e) => {
            stop(e)
            onLog()
          }}
          className="rounded-full px-2.5 py-1 text-xs font-bold text-white"
          style={{ background: KBC.cyan }}
        >
          + Log
        </button>
      </div>
    </button>
  )
}

/**
 * The boulder's picture as a small round icon, or a numbered placeholder when
 * there is no picture yet.
 *
 * Fixed size in both cases, so a list of cards has one column of icons whether
 * or not every problem has been photographed.
 */
function BoulderIcon({ src, number }: { src: string; number: number }) {
  if (!src) {
    return (
      <div
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed border-neutral-200 bg-neutral-50 text-[11px] font-extrabold text-neutral-300"
      >
        {number}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className="size-10 shrink-0 rounded-full border border-neutral-200 object-cover"
    />
  )
}
