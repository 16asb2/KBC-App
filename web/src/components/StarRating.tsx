import { avgQuality } from '@/services/boulders'

// Ported from mobile/app/(tabs)/boulders.tsx's StarRating.
export function StarRating({
  votes,
  userUid,
  onVote,
  compact = false,
}: {
  votes: Record<string, number>
  userUid?: string
  onVote?: (stars: number) => void
  compact?: boolean
}) {
  const avg = avgQuality(votes)
  const userVote = userUid !== undefined && userUid in votes ? votes[userUid] : null
  const voteCount = Object.keys(votes).length
  const display = userVote ?? avg ?? 0

  const starSize = compact ? 14 : 22
  const color = '#f5a623'

  return (
    <div className={`flex items-center ${compact ? 'gap-0.5' : 'gap-1'}`}>
      {[1, 2, 3].map((n) => {
        const filled = display >= n - 0.25
        const half = !filled && display >= n - 0.75
        return (
          <button
            key={n}
            type="button"
            onClick={() => onVote?.(userVote === n ? 0 : n)}
            disabled={!onVote}
            style={{ fontSize: starSize, color: filled || half ? color : '#ddd', lineHeight: 1 }}
          >
            {filled ? '★' : half ? '⯨' : '☆'}
          </button>
        )
      })}
      {!compact && (
        <span className="text-xs text-neutral-400">
          {voteCount === 0
            ? 'Tap to rate quality'
            : `${voteCount} vote${voteCount !== 1 ? 's' : ''}${avg !== null ? ` · ${avg.toFixed(1)}★` : ''}`}
          {userVote ? ' · ' : ''}
          {userVote ? <span style={{ color }}>yours: {'★'.repeat(userVote)}</span> : null}
        </span>
      )}
    </div>
  )
}
