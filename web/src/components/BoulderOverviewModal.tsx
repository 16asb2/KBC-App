import { useEffect, useMemo, useRef, useState } from 'react'
import { BadgeIcon } from '@/components/BadgeIcon'
import { GradeBar } from '@/components/GradeBar'
import { GymMap } from '@/components/GymMap'
import { StarRating } from '@/components/StarRating'
import { KBC } from '@/constants/theme'
import { addComment, avgQuality, deleteComment, getComments, type Boulder, type BoulderComment } from '@/services/boulders'
import type { PersonalClimb } from '@/services/climblog'
import { formatMonthDay, formatShortDate } from '@/utils/datetime'

// Ported from mobile@1cdfada/app/(tabs)/boulders.tsx's BoulderOverviewModal, rendered
// full-screen instead of as a bottom sheet (there's more content here than
// fits a sheet comfortably). Not ported: the pinch-zoom full-screen photo
// viewer (plain click-to-enlarge instead) and the interactive GymMap for
// the read-only Location display (shown as a plain chip list — it wasn't
// interactive in mobile's overview either, just a visual).
export function BoulderOverviewModal({
  boulder,
  logs,
  uid,
  userName,
  canEdit,
  onEdit,
  onClose,
  canRemove,
  likeCount,
  isLiked,
  onToggleLike,
  isProject,
  onToggleProject,
  onLog,
  onVoteGrade,
  onVoteQuality,
}: {
  boulder: Boulder
  logs: PersonalClimb[]
  uid: string
  userName: string
  canEdit: boolean
  onEdit: () => void
  onClose: () => void
  canRemove: boolean
  likeCount: number
  isLiked: boolean
  onToggleLike: () => void
  isProject: boolean
  onToggleProject: () => void
  onLog: () => void
  onVoteGrade: (grade: number) => void
  onVoteQuality?: (stars: number) => void
}) {
  const [localGradeVotes, setLocalGradeVotes] = useState<Record<string, number>>({})
  const [localQualityVotes, setLocalQualityVotes] = useState<Record<string, number>>({})
  const voteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const qualityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const merged: Record<string, number> = { ...boulder.gradeVotes }
    if (boulder.setterGradeVote !== null && boulder.setterGradeVote !== undefined) {
      merged['__setter'] = boulder.setterGradeVote
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalGradeVotes(merged)
    setLocalQualityVotes(boulder.qualityVotes ?? {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boulder.id])

  function handleGradeVote(g: number) {
    setLocalGradeVotes((prev) => {
      const next = { ...prev }
      if (g < 0) delete next[uid]
      else next[uid] = g
      return next
    })
    if (voteTimerRef.current) clearTimeout(voteTimerRef.current)
    voteTimerRef.current = setTimeout(() => onVoteGrade(g), 500)
  }

  function handleQualityVote(stars: number) {
    setLocalQualityVotes((prev) => {
      const next = { ...prev }
      if (stars <= 0) delete next[uid]
      else next[uid] = stars
      return next
    })
    if (qualityTimerRef.current) clearTimeout(qualityTimerRef.current)
    qualityTimerRef.current = setTimeout(() => onVoteQuality?.(stars), 500)
  }

  const badgeCounts = useMemo(() => {
    const bc: Record<string, number> = {}
    for (const log of logs) for (const b of log.badges ?? []) bc[b] = (bc[b] ?? 0) + 1
    for (const b of boulder.setterBadges ?? []) bc[b] = (bc[b] ?? 0) + 1
    return bc
  }, [logs, boulder.setterBadges])

  const sortedBadges = useMemo(
    () => Object.entries(badgeCounts).sort(([, a], [, b]) => b - a).map(([badge, count]) => ({ badge, count })),
    [badgeCounts],
  )

  const myLogs = useMemo(() => logs.filter((l) => l.uid === uid), [logs, uid])
  const myStats = useMemo(
    () => ({ sents: myLogs.filter((l) => l.type === 'ascent').length, attempts: myLogs.filter((l) => l.type === 'attempt').length }),
    [myLogs],
  )
  const totalStats = useMemo(
    () => ({ sents: logs.filter((l) => l.type === 'ascent').length, attempts: logs.filter((l) => l.type === 'attempt').length }),
    [logs],
  )
  const myPersonalComments = useMemo(
    () => myLogs.filter((l) => l.comment?.trim()).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [myLogs],
  )

  const [comments, setComments] = useState<BoulderComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [loadingComments, setLoadingComments] = useState(true)
  const [postingComment, setPostingComment] = useState(false)
  const [showFullPhoto, setShowFullPhoto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingComments(true)
    getComments(boulder.id)
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoadingComments(false))
  }, [boulder.id])

  async function handlePostComment() {
    const text = commentText.trim()
    if (!text) return
    setPostingComment(true)
    try {
      const c = await addComment(boulder.id, { uid, name: userName, text, createdAt: new Date().toISOString() })
      setComments((prev) => [...prev, c])
      setCommentText('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setPostingComment(false)
    }
  }

  async function handleDeleteComment(c: BoulderComment) {
    if (!window.confirm(`Delete comment: "${c.text.slice(0, 60)}"?`)) return
    try {
      await deleteComment(boulder.id, c.id)
      setComments((prev) => prev.filter((x) => x.id !== c.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  const qualityVoteCount = Object.keys(localQualityVotes).length
  const avgQ = avgQuality(localQualityVotes)

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
      <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
        <button type="button" onClick={onClose} className="text-xl text-neutral-500">
          ✕
        </button>
        <div className="flex-1" />
        {canEdit && (
          <button type="button" onClick={onEdit} className="rounded-lg border px-3 py-1.5 text-sm font-bold" style={{ borderColor: KBC.lime, color: KBC.lime }}>
            ✎ Edit
          </button>
        )}
      </div>

      {boulder.photo && (
        <button type="button" onClick={() => setShowFullPhoto(true)} className="block w-full">
          <img src={boulder.photo} alt="" className="max-h-80 w-full object-cover" />
        </button>
      )}

      <div className="mx-auto max-w-2xl space-y-4 p-5 pb-16">
        <div className="flex items-start gap-2.5">
          <span className="shrink-0 rounded-lg bg-neutral-100 px-2 py-1 text-xs font-extrabold text-neutral-600">#{boulder.number}</span>
          <h1 className="text-lg leading-tight font-extrabold text-black">
            {[boulder.name || null, boulder.locations.slice(0, 2).join(', ') || null, boulder.tapeColor || null].filter(Boolean).join('  |  ') ||
              `Boulder #${boulder.number}`}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
          {qualityVoteCount > 0 && (
            <>
              <StarRating votes={localQualityVotes} compact />
              <span>
                {avgQ?.toFixed(1)}★ · {qualityVoteCount} vote{qualityVoteCount !== 1 ? 's' : ''}
              </span>
              <span>·</span>
            </>
          )}
          {likeCount > 0 && (
            <>
              <span className="font-bold text-[#e91e63]">♥ {likeCount}</span>
              <span>·</span>
            </>
          )}
          <span className={boulder.setter ? '' : 'text-neutral-300'}>by {boulder.setter || 'Unknown setter'}</span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onToggleProject}
            className="rounded-full border px-3 py-1.5 text-sm font-bold"
            style={isProject ? { background: KBC.purple, borderColor: KBC.purple, color: '#fff' } : { borderColor: '#ddd', color: '#666' }}
          >
            {isProject ? '− Project' : '+ Project'}
          </button>
          <button
            type="button"
            onClick={onToggleLike}
            className="rounded-full border px-3 py-1.5 text-sm font-bold"
            style={isLiked ? { background: '#e91e63', borderColor: '#e91e63', color: '#fff' } : { borderColor: '#ddd', color: '#666' }}
          >
            {isLiked ? '♥  Liked' : '♡  Like'}
            {likeCount > 0 ? `  (${likeCount})` : ''}
          </button>
          <button type="button" onClick={onLog} className="rounded-full px-3 py-1.5 text-sm font-bold text-white" style={{ background: KBC.cyan }}>
            + Log
          </button>
        </div>

        {(myStats.sents > 0 || myStats.attempts > 0 || totalStats.sents > 0 || totalStats.attempts > 0) && (
          <div className="flex overflow-hidden rounded-xl border border-neutral-200">
            <StatsBox label="My" sents={myStats.sents} attempts={myStats.attempts} />
            <div className="w-px bg-neutral-200" />
            <StatsBox label="Total" sents={totalStats.sents} attempts={totalStats.attempts} />
          </div>
        )}

        <Section label="Quality">
          <StarRating votes={localQualityVotes} userUid={uid} onVote={handleQualityVote} />
        </Section>

        {sortedBadges.length > 0 && (
          <Section label="Community Badges">
            <div className="flex flex-wrap gap-1">
              {sortedBadges.map(({ badge, count }) => (
                <BadgeIcon key={badge} label={badge} count={count} selected size="sm" />
              ))}
            </div>
          </Section>
        )}

        <Section label="Location">
          {/* The floor plan used to appear only when adding or editing a
              boulder, which is the one time you already know where it is. */}
          {boulder.locations.length > 0 && <GymMap selected={boulder.locations} />}
          <div className="flex flex-wrap gap-1.5">
            {boulder.locations.length === 0 ? (
              <span className="text-sm text-neutral-400">—</span>
            ) : (
              boulder.locations.map((loc) => (
                <span key={loc} className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `${KBC.cyan}18`, color: KBC.cyan }}>
                  {loc}
                </span>
              ))
            )}
          </div>
        </Section>

        <Section label="Community Grade">
          <GradeBar votes={localGradeVotes} userUid={uid} onVote={handleGradeVote} interactive />
        </Section>

        <Section label="Discussion">
          {loadingComments ? (
            <p className="py-3 text-sm text-neutral-400">Loading…</p>
          ) : comments.length === 0 ? (
            <p className="py-3 text-sm text-neutral-300">No comments yet — be the first!</p>
          ) : (
            <div className="space-y-2">
              {comments.map((c) => {
                const mine = c.uid === uid
                const canDel = mine || canRemove
                const time = formatMonthDay(c.createdAt)
                return (
                  <div key={c.id} className={`flex items-start gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                    <div className="max-w-[85%] rounded-xl bg-neutral-100 px-3 py-2">
                      <p className="text-xs font-bold text-neutral-700">
                        {c.name} <span className="font-normal text-neutral-400">{time}</span>
                      </p>
                      <p className="text-sm text-neutral-800">{c.text}</p>
                    </div>
                    {canDel && (
                      <button type="button" onClick={() => void handleDeleteComment(c)} className="text-sm text-neutral-400">
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}

          <div className="mt-2 flex items-end gap-2">
            <textarea
              className="kbc-input flex-1"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment…"
              rows={2}
            />
            <button
              type="button"
              onClick={() => void handlePostComment()}
              disabled={!commentText.trim() || postingComment}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
              style={{ background: KBC.cyan }}
            >
              ↑
            </button>
          </div>
        </Section>

        {myLogs.length > 0 && (
          <Section label="Personal Climb Log">
            <div className="overflow-hidden rounded-lg border border-neutral-100">
              {[...myLogs]
                .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
                .map((l, i) => {
                  const date = formatShortDate(l.timestamp)
                  return (
                    <div key={l.id} className={`flex items-center gap-2 px-3 py-1.5 ${i % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}`}>
                      <span className="truncate text-sm text-neutral-700">{userName}</span>
                      <span className="text-xs font-bold" style={{ color: l.type === 'ascent' ? KBC.green : KBC.orange }}>
                        {l.type === 'ascent' ? '✓ Sent' : '△ Tried'}
                      </span>
                      {l.attempts > 1 && <span className="text-xs text-neutral-400">×{l.attempts}</span>}
                      <span className="ml-auto text-xs text-neutral-400">{date}</span>
                    </div>
                  )
                })}
            </div>
          </Section>
        )}

        {myPersonalComments.length > 0 && (
          <Section label="Personal Comments">
            <div className="space-y-2">
              {myPersonalComments.map((l) => (
                <div key={l.id} className="rounded-xl bg-neutral-50 p-3">
                  <p className="text-xs text-neutral-400">
                    {formatShortDate(l.timestamp)} ·{' '}
                    {l.type === 'ascent' ? '✓ Sent' : '△ Tried'}
                  </p>
                  <p className="mt-1 text-sm text-neutral-800">{l.comment}</p>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>

      {boulder.photo && showFullPhoto && (
        <button
          type="button"
          onClick={() => setShowFullPhoto(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
        >
          <img src={boulder.photo} alt="" className="max-h-full max-w-full object-contain" />
        </button>
      )}
    </div>
  )
}

function StatsBox({ label, sents, attempts }: { label: string; sents: number; attempts: number }) {
  const text =
    sents === 0 && attempts === 0
      ? '—'
      : [sents > 0 ? `✓ ${sents} sent` : null, attempts > 0 ? `△ ${attempts} tried` : null].filter(Boolean).join('  ')
  return (
    <div className="flex-1 p-3 text-center">
      <p className="text-[11px] font-bold text-neutral-400 uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-neutral-800">{text}</p>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold tracking-wide text-neutral-400 uppercase">{label}</p>
      {children}
    </div>
  )
}
