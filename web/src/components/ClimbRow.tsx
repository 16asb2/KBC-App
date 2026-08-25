import { BadgeIcon } from '@/components/BadgeIcon'
import { KBC } from '@/constants/theme'
import { effortLabel } from '@/components/EffortBar'
import { formatTimestamp } from '@/domain/climbLogFilter'
import type { PersonalClimb } from '@/services/climblog'

// Ported from mobile@1cdfada/app/(tabs)/climblog.tsx's ClimbRow. Long-press-to-delete
// becomes a small delete button (no long-press affordance on web/desktop).
export function ClimbRow({
  climb,
  locationName,
  onPress,
  onDelete,
}: {
  climb: PersonalClimb
  locationName: string
  onPress: () => void
  onDelete: () => void
}) {
  const isSent = climb.type === 'ascent'

  return (
    <div className="relative rounded-xl bg-white p-3 shadow-sm">
      <button type="button" onClick={onPress} className="block w-full text-left">
        <div className="flex items-center justify-between gap-2 pr-6">
          <span className="truncate text-xs font-semibold text-neutral-500">
            {locationName}
            {climb.sectorId ? ` · ${climb.sectorId}` : ''}
          </span>
          <span className="shrink-0 text-xs text-neutral-400">
            {formatTimestamp(climb.timestamp)}
          </span>
        </div>

        <p className="mt-0.5 truncate font-bold text-neutral-900">{climb.name}</p>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white"
            style={{ background: isSent ? KBC.green : KBC.orange }}
          >
            {isSent ? '✓ Sent' : '△ Tried'}
          </span>
          {climb.personalGrade && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
              {climb.personalGrade}
            </span>
          )}
          {climb.quality > 0 && (
            <span className="text-xs text-[#fbbf24]">{'★'.repeat(climb.quality)}</span>
          )}
          {climb.effort !== '' && climb.effort !== null && climb.effort !== undefined && (
            <span className="rounded-full bg-neutral-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {effortLabel(climb.effort)}
            </span>
          )}
          {climb.project && (
            <span className="text-xs font-bold" style={{ color: KBC.purple }}>
              🏔 Project
            </span>
          )}
        </div>

        {climb.badges && climb.badges.length > 0 && (
          <div className="mt-1 flex flex-nowrap gap-1">
            {climb.badges.slice(0, 5).map((b) => (
              <BadgeIcon key={b} label={b} selected size="sm" compact />
            ))}
          </div>
        )}

        {climb.comment && (
          <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{climb.comment}</p>
        )}
      </button>

      <button
        type="button"
        onClick={() => {
          if (window.confirm('Remove this climb from your logbook?')) onDelete()
        }}
        className="absolute top-3 right-3 text-sm text-neutral-300 hover:text-red-500"
      >
        ✕
      </button>
    </div>
  )
}
