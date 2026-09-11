import { useMemo, useState } from 'react'
import { KBC } from '@/constants/theme'
import { BADGE_COLOR, BadgeIcon, baseHoldBadge } from '@/components/BadgeIcon'
import { GradeBar } from '@/components/GradeBar'
import { computeAggregates, getPersonalStatus } from '@/domain/climbAggregates'
import type { Boulder } from '@/services/boulders'
import type { PersonalClimb } from '@/services/climblog'

/**
 * How many badges the card shows.
 *
 * `computeAggregates` ranks five; the card has room for four. An 80px icon and
 * four 36px discs fit the narrowest phone still in use (320px, which is 296px
 * of card once the list's padding is off it) with room to spare; the fifth
 * pushed the leftmost disc under the icon. The overview lists every badge, so
 * nothing is only visible here.
 */
const CARD_BADGES = 4

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
  const shownBadges = agg.topBadges.slice(0, CARD_BADGES)

  const gradeVotesMap = useMemo(() => {
    const gv: Record<string, number> = { ...boulder.gradeVotes }
    if (boulder.setterGradeVote !== null && boulder.setterGradeVote !== undefined) {
      gv['__setter'] = boulder.setterGradeVote
    }
    return gv
  }, [boulder.gradeVotes, boulder.setterGradeVote])

  // The card draws `thumb` and never `photo`. A season's worth of full-size
  // base64 JPEGs on one scrolling list is what made this screen crawl on
  // iPhone — see DESIGN.md. Older boulders have no thumb; they get the
  // placeholder rather than the 200 kB original.
  const icon = boulder.thumb

  // Which badge has been tapped to show its name, if any. The names are off the
  // card by default — see BadgeIcon's `bare`.
  const [namedBadge, setNamedBadge] = useState<string | null>(null)

  // A named problem puts its name on the first line and everything else
  // underneath. Unnamed, there is nothing to give the first line but the
  // wall and the tape, so they move up into it.
  const whereAndTape = [
    boulder.locations.slice(0, 2).join(', ') || null,
    boulder.tapeColor ? `${boulder.tapeColor} Tape` : null,
  ]
    .filter(Boolean)
    .join('  |  ')
  const title = boulder.name || whereAndTape || `Boulder #${boulder.number}`
  const subtitle = boulder.name ? whereAndTape : ''

  function stop(e: React.MouseEvent) {
    e.stopPropagation()
  }

  return (
    // A div rather than a <button>, because the card contains buttons — the
    // badges, Project, Like, Log — and a button inside a button is invalid
    // HTML that browsers resolve however they like. role/tabIndex/onKeyDown
    // keep it reachable and operable from the keyboard.
    <div
      role="button"
      tabIndex={0}
      onClick={onPress}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return // a nested control has it
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onPress()
        }
      }}
      className="w-full cursor-pointer rounded-2xl bg-white p-4 text-left shadow-sm"
    >
      {/* Row 1: identity on the left, the numbers on one line at top right */}
      <div className="flex items-start gap-2.5">
        <span className="shrink-0 rounded-lg bg-neutral-100 px-2 py-1 text-xs font-extrabold text-neutral-600">
          #{boulder.number}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-neutral-900">{title}</p>
          {subtitle && <p className="truncate text-xs text-neutral-600">{subtitle}</p>}
          {boulder.setter && (
            <p className="truncate text-xs text-neutral-400">by {boulder.setter}</p>
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

      {/* The icon stands beside both the badges and the grade bar rather than
          above one of them: at this size it is as tall as the two together, and
          stacking it would leave a column of empty space next to a thin bar.
          Its width is what squeezes the bar, which is the trade being made —
          the picture identifies the problem faster than the bar does. */}
      <div className="mt-2 flex items-center gap-3">
        <BoulderIcon src={icon} number={boulder.number} />
        <div className="min-w-0 flex-1 space-y-1">
          {shownBadges.length > 0 && (
            <>
              {/* The row swallows its own clicks: naming a badge is not
                  opening the boulder, and BadgeIcon's onPress takes no event
                  to stop the bubble with. Four 36px discs and an 80px icon
                  fit the narrowest
                  phone — see CARD_BADGES. `overflow-hidden` is the belt and
                  braces: a future badge count that does not fit clips rather
                  than breaking the card open. */}
              <div className="flex justify-end overflow-hidden" onClick={stop}>
                <div className="flex shrink-0 flex-nowrap gap-1">
                  {shownBadges.map((b) => (
                    <BadgeIcon
                      key={b}
                      label={b}
                      selected
                      size="sm"
                      bare
                      onPress={() => setNamedBadge((prev) => (prev === b ? null : b))}
                    />
                  ))}
                </div>
              </div>
              {/* Its own line, and one that is always present. Inline beside
                  the discs there is only ~40px left for it, which is four
                  characters of "Large Crimps". Reserving the line costs no
                  height either — the 80px icon already sets this row's height,
                  and badges plus name plus bar come to exactly that — so
                  naming a badge shifts nothing. */}
              <p
                className="h-[14px] truncate text-right text-[11px] font-bold"
                style={{ color: namedBadge ? (BADGE_COLOR[baseHoldBadge(namedBadge)] ?? '#666') : undefined }}
              >
                {namedBadge ?? ' '}
              </p>
            </>
          )}
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
    </div>
  )
}

/**
 * The boulder's picture as a small round icon, or a numbered placeholder when
 * there is no picture yet.
 *
 * Fixed size in both cases, so a list of cards has one column of icons whether
 * or not every problem has been photographed.
 *
 * 80px — twice what it was. `CircleCropModal` stores the crop at 192px, so
 * this is still oversampled on a high-density screen. Icons cropped before
 * that change are 96px and will look a little soft here until re-cropped.
 */
function BoulderIcon({ src, number }: { src: string; number: number }) {
  if (!src) {
    return (
      <div
        aria-hidden
        className="flex size-20 shrink-0 items-center justify-center rounded-full border border-dashed border-neutral-200 bg-neutral-50 text-lg font-extrabold text-neutral-300"
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
      className="size-20 shrink-0 rounded-full border border-neutral-200 object-cover"
    />
  )
}
