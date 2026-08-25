import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { KBC } from '@/constants/theme'
import { DEFAULT_CLIMB_FILTER, type ClimbFilter } from '@/domain/climbLogFilter'

// Ported from mobile@1cdfada/app/(tabs)/climblog.tsx's ClimbFilterModal.
export function ClimbFilterModal({ onClose, filter, onApply }: { onClose: () => void; filter: ClimbFilter; onApply: (f: ClimbFilter) => void }) {
  const [draft, setDraft] = useState<ClimbFilter>(filter)

  function apply() {
    onApply(draft)
    onClose()
  }
  function reset() {
    setDraft((d) => ({ ...DEFAULT_CLIMB_FILTER, sort: d.sort }))
  }

  return (
    <Modal onClose={onClose}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-black">Filter Climbs</h2>
        <button type="button" onClick={onClose} className="text-lg text-neutral-400">
          ✕
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-[11px] font-bold tracking-wide text-neutral-400 uppercase">Climb Type</p>
          <div className="flex gap-2">
            {([
              ['all', 'All'],
              ['sent', '✓ Sent'],
              ['attempted', '△ Attempted'],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, type: val }))}
                className="rounded-full border px-3 py-1.5 text-xs font-bold"
                style={draft.type === val ? { background: KBC.cyan, borderColor: KBC.cyan, color: '#fff' } : { borderColor: '#ddd', color: '#666' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={draft.projectsOnly}
            onChange={(e) => setDraft((d) => ({ ...d, projectsOnly: e.target.checked }))}
            className="mt-0.5 size-5"
            style={{ accentColor: KBC.pink }}
          />
          <span>
            <span className="block text-sm font-bold text-black">Projects only</span>
            <span className="block text-xs text-neutral-500">Show only climbs marked as projects</span>
          </span>
        </label>

        <div className="flex gap-2.5 pt-2">
          <button type="button" onClick={reset} className="flex-1 rounded-xl bg-neutral-100 p-3 text-sm font-bold text-neutral-600">
            Reset
          </button>
          <button type="button" onClick={apply} className="flex-[2] rounded-xl p-3 text-sm font-bold text-white" style={{ background: KBC.black }}>
            Apply
          </button>
        </div>
      </div>
    </Modal>
  )
}
