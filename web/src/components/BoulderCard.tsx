import { useMemo } from 'react'
import { KBC } from '@/constants/theme'
import { BadgeIcon } from '@/components/BadgeIcon'
import { GradeBar } from '@/components/GradeBar'
import { StarRating } from '@/components/StarRating'
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

  const myStats = useMemo(() => {
    const mine = logs.filter((l) => l.uid === uid)
    return {
      sents: mine.filter((l) => l.type === 'ascent').length,
      attempts: mine.filter((l) => l.type === 'attempt').length,
    }
  }, [logs, uid])

  const { gradeVotesMap, qualityVotesMap, badgeCounts } = useMemo(() => {
    const gv: Record<string, number> = { ...boulder.gradeVotes }
    if (boulder.setterGradeVote !== null && boulder.setterGradeVote !== undefined) {
      gv['__setter'] = boulder.setterGradeVote
    }
    const qv: Record<string, number> = { ...(boulder.qualityVotes ?? {}) }
    const bc: Record<string, number> = {}
    for (const log of logs) {
      for (const b of log.badges ?? []) bc[b] = (bc[b] ?? 0) + 1
    }
    for (const b of boulder.setterBadges ?? []) bc[b] = (bc[b] ?? 0) + 1
    return { gradeVotesMap: gv, qualityVotesMap: qv, badgeCounts: bc }
  }, [
    logs,
    boulder.gradeVotes,
    boulder.setterGradeVote,
    boulder.setterBadges,
    boulder.qualityVotes,
  ])

  function stop(e: React.MouseEvent) {
    e.stopPropagation()
  }

  return (
    <button
      type="button"
      onClick={onPress}
      className="w-full rounded-2xl bg-white p-4 text-left shadow-sm"
    >
      {/* Row 1 */}
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
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {myLog && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white"
              style={{ background: myLog.type === 'ascent' ? KBC.green : KBC.orange }}
            >
              {myLog.type === 'ascent' ? '✓ Sent' : '△ Tried'}
            </span>
          )}
          {(myStats.sents > 0 || myStats.attempts > 0) && (
            <span className="text-[11px] font-semibold text-neutral-500">
              {[
                myStats.sents > 0 ? `✓${myStats.sents}` : null,
                myStats.attempts > 0 ? `△${myStats.attempts}` : null,
              ]
                .filter(Boolean)
                .join('  ')}
            </span>
          )}
          <div className="flex items-center gap-1">
            {boulder.photo ? <span className="text-xs">📷</span> : null}
            {Object.keys(qualityVotesMap).length > 0 && (
              <StarRating votes={qualityVotesMap} compact />
            )}
            {likeCount > 0 && (
              <span className="text-xs font-bold text-[#e91e63]">♥{likeCount}</span>
            )}
            {agg.sendCount > 0 && (
              <span className="text-xs font-bold" style={{ color: KBC.green }}>
                ✓{agg.sendCount}
              </span>
            )}
            {agg.attemptCount > 0 && (
              <span className="text-xs font-bold" style={{ color: KBC.orange }}>
                △{agg.attemptCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: top badges */}
      {agg.topBadges.length > 0 && (
        <div className="mt-1.5 flex flex-nowrap gap-0.5">
          {agg.topBadges.map((b) => (
            <BadgeIcon key={b} label={b} count={badgeCounts[b] ?? 0} selected size="sm" compact />
          ))}
        </div>
      )}

      {/* Row 3: grade bar */}
      <div className="mt-0.5">
        <GradeBar votes={gradeVotesMap} compact />
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
