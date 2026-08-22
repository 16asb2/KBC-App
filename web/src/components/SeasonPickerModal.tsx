import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { KBC } from '@/constants/theme'
import { createSeason, type BoulderSeason } from '@/services/boulders'

// Ported from mobile/app/(tabs)/boulders.tsx's SeasonPickerModal.
export function SeasonPickerModal({
  seasons,
  selectedId,
  canCreate,
  onSelect,
  onClose,
}: {
  seasons: BoulderSeason[]
  selectedId: string | null
  canCreate: boolean
  onSelect: (season: BoulderSeason) => void
  onClose: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    const n = newName.trim()
    if (!n) return setError('Name required')
    setError(null)
    setSaving(true)
    try {
      const season = await createSeason(n)
      setCreating(false)
      setNewName('')
      onSelect(season)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-bold text-black">Select Season</h2>
        <button type="button" onClick={onClose} className="text-lg text-neutral-400">
          ✕
        </button>
      </div>

      <div className="max-h-[360px] overflow-y-auto">
        {seasons.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onSelect(s)
              onClose()
            }}
            className="flex w-full items-center gap-2 border-b border-neutral-100 py-3.5 text-left last:border-0"
          >
            <span className={`flex-1 text-[15px] ${s.id === selectedId ? 'font-bold' : 'text-neutral-900'}`} style={s.id === selectedId ? { color: KBC.lime } : undefined}>
              {s.name}
            </span>
            {s.id === selectedId && <span style={{ color: KBC.lime }}>✓</span>}
          </button>
        ))}
      </div>

      {canCreate && !creating && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-3 w-full rounded-xl border p-3 text-sm font-bold"
          style={{ borderColor: KBC.lime, color: KBC.lime }}
        >
          + New Season
        </button>
      )}

      {creating && (
        <div className="mt-3 space-y-3">
          <input
            className="kbc-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Summer 2026"
            autoFocus
          />
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={saving}
              className="flex-1 rounded-xl p-2.5 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: KBC.black }}
            >
              {saving ? 'Saving…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false)
                setNewName('')
              }}
              className="flex-1 rounded-xl border border-neutral-300 p-2.5 text-sm font-bold text-neutral-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
