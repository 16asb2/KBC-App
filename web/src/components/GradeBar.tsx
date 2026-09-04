import { useRef } from 'react'
import { KBC } from '@/constants/theme'
import {
  averageVotePosition,
  fractionForVote,
  gradeIndexFromPosition,
  voteFromFraction,
} from '@/domain/gradeVote'
import { GRADES, GRADE_COLORS } from '@/services/boulders'

// Ported from mobile@1cdfada/components/grade-bar.tsx. RN's PanResponder + .measure()
// becomes pointer events + getBoundingClientRect() — same value-mapping math.

export type GradeBarProps = {
  votes: Record<string, number>
  userUid?: string
  onVote?: (grade: number) => void // pass -1 to remove vote
  interactive?: boolean
  compact?: boolean
}

/**
 * A mark standing exactly where `value` sits on the bar.
 *
 * The bar is analog, so the mark is too — a vote of 3.28 is drawn at 82%, just
 * inside Black, and not at the middle of some step. The band it visually sits
 * in is the grade `gradeIndexFromPosition` reports, which is what keeps the
 * picture and the count telling the same story.
 */
function Marker({ value, color }: { value: number; color: string }) {
  const at = fractionForVote(value)
  return (
    <div className="pointer-events-none absolute inset-0 flex" style={{ top: -2, bottom: -2 }}>
      <div style={{ flex: Math.max(at, 0) }} />
      <div style={{ width: 4, background: color, borderRadius: 2 }} />
      <div style={{ flex: Math.max(1 - at, 0) }} />
    </div>
  )
}

export function GradeBar({
  votes,
  userUid,
  onVote,
  interactive = false,
  compact = false,
}: GradeBarProps) {
  const barRef = useRef<HTMLDivElement>(null)

  // Two readings of the same votes, and they are not the same thing. The marker
  // wants the analog average — where the opinions actually sit. The label wants
  // the grade, which is the band that position falls in.
  const avgPosition = averageVotePosition(Object.values(votes))
  const avgGradeIndex = avgPosition === null ? null : gradeIndexFromPosition(avgPosition)

  const userVote = userUid !== undefined && userUid in votes ? votes[userUid] : null

  const voteCount = Object.keys(votes).length

  /** Where on the bar the press landed — analog, kept as pressed. */
  function gradeFromClientX(clientX: number): number {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return voteFromFraction((clientX - rect.left) / rect.width)
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!interactive) return
    e.currentTarget.setPointerCapture(e.pointerId)
    onVote?.(gradeFromClientX(e.clientX))
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!interactive || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    onVote?.(gradeFromClientX(e.clientX))
  }

  return (
    <div>
      <div className="relative">
        <div
          ref={barRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          className={`flex overflow-hidden rounded-full ${interactive ? 'cursor-pointer touch-none' : ''}`}
          style={{ height: compact ? 18 : 28 }}
        >
          {GRADE_COLORS.map((color, i) => (
            <div key={i} className="flex-1" style={{ background: color }} />
          ))}
        </div>

        {/* Solid yellow — community average */}
        {avgPosition !== null && <Marker value={avgPosition} color="#FFE600" />}
        {/* Teal green — this user's vote */}
        {userVote !== null && <Marker value={userVote} color="#00e676" />}
      </div>

      {!compact && (
        <>
          <div className="mt-1.5 flex">
            {GRADES.map((g, i) => (
              <span
                key={i}
                className="flex-1 text-center text-[10px] font-semibold text-neutral-400"
              >
                {g}
              </span>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {voteCount > 0 && (
              <span className="text-[11px] text-neutral-400">
                {voteCount} vote{voteCount !== 1 ? 's' : ''}
                {avgGradeIndex !== null ? ` · avg: ${GRADES[avgGradeIndex]}` : ''}
              </span>
            )}
            {userVote !== null && (
              <span className="text-[11px] text-neutral-400">
                {'  '}
                <span className="font-bold" style={{ color: KBC.live }}>
                  ● {GRADES[gradeIndexFromPosition(userVote)]}
                </span>
                {'  '}
                <button
                  type="button"
                  onClick={() => onVote?.(-1)}
                  className="font-semibold text-[#FF453A]"
                >
                  Remove
                </button>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
