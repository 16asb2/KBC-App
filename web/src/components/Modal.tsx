import type { MouseEvent, ReactNode } from 'react'

export function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  function stop(e: MouseEvent) {
    e.stopPropagation()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85svh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl"
        onClick={stop}
      >
        {children}
      </div>
    </div>
  )
}
