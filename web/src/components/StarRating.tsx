// Ported from mobile@1cdfada/app/(tabs)/boulders.tsx's StarRating, then narrowed:
// it used to take a map of everyone's votes and draw the community average.
// A rating is now a private note in the climber's own logbook — one value,
// belonging to the person looking at it — so that is all this takes.
export function StarRating({
  value,
  onChange,
  compact = false,
  emptyHint = 'Tap to rate',
}: {
  /** 1–3 stars, or 0/null for unrated. */
  value: number | null
  /** Omit for a read-only display. Called with 0 to clear. */
  onChange?: (stars: number) => void
  compact?: boolean
  emptyHint?: string
}) {
  const rating = value ?? 0
  const starSize = compact ? 14 : 22
  const color = '#f5a623'

  return (
    <div className={`flex items-center ${compact ? 'gap-0.5' : 'gap-1'}`}>
      {[1, 2, 3].map((n) => {
        const filled = rating >= n
        return (
          <button
            key={n}
            type="button"
            // Pressing the star you are already on clears the rating — the only
            // way back to unrated, since there is no zeroth star to press.
            onClick={() => onChange?.(rating === n ? 0 : n)}
            disabled={!onChange}
            aria-label={`${n} star${n !== 1 ? 's' : ''}`}
            aria-pressed={filled}
            style={{ fontSize: starSize, color: filled ? color : '#ddd', lineHeight: 1 }}
          >
            {filled ? '★' : '☆'}
          </button>
        )
      })}
      {!compact && (
        <span className="ml-1 text-xs text-neutral-400">
          {rating === 0 ? emptyHint : 'Only you can see this'}
        </span>
      )}
    </div>
  )
}
