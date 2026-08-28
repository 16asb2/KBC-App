import type { MouseEvent, ReactNode } from 'react'

export function Modal({
  onClose,
  size = 'md',
  children,
}: {
  onClose: () => void
  /** 'lg' for content that needs the room — a chart or a wide table. */
  size?: 'md' | 'lg'
  children: ReactNode
}) {
  function stop(e: MouseEvent) {
    e.stopPropagation()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className={`max-h-[85svh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl ${
          size === 'lg' ? 'max-w-2xl' : 'max-w-md'
        }`}
        onClick={stop}
      >
        {children}
      </div>
    </div>
  )
}
