import { useState } from 'react'
import { KBC } from '@/constants/theme'
import { Modal } from './Modal'

// Ported from mobile@1cdfada/components/dropdown-picker.tsx, reusing the shared
// Modal component (bottom sheet) already used across the web app instead of
// mobile's own inline Modal/FlatList, for visual consistency with the rest
// of the KBC web app's modals.

export type DropdownOption = { label: string; value: string }

export function DropdownPicker({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  accentColor = KBC.cyan,
}: {
  options: DropdownOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  accentColor?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex w-full items-center gap-2 rounded-[10px] border border-neutral-300 bg-neutral-50 p-3 text-left text-sm"
      >
        <span className={`flex-1 ${selected ? 'text-neutral-900' : 'text-neutral-400'}`}>
          {selected?.label ?? placeholder}
        </span>
        <span style={{ color: accentColor }}>▾</span>
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div className="max-h-[360px] overflow-y-auto">
            {options.map((opt) => {
              const sel = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-2 border-b border-neutral-100 py-3.5 text-left last:border-0"
                  style={sel ? { color: accentColor } : undefined}
                >
                  <span className={`flex-1 text-[15px] ${sel ? 'font-bold' : 'text-neutral-900'}`}>{opt.label}</span>
                  {sel && <span>✓</span>}
                </button>
              )
            })}
          </div>
        </Modal>
      )}
    </>
  )
}
