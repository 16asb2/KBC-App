import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { KBC } from '@/constants/theme'
import { cropSquareToDataUrl } from '@/utils/imageResize'

/** Side of the square preview, in CSS pixels. The circle inscribes it. */
const VIEWPORT = 260

/**
 * Pick the circular area of a picture that becomes a boulder's icon.
 *
 * Drag to move the picture under the circle, and zoom with the slider. What the
 * circle shows is exactly what gets saved — the crop is computed from the same
 * transform the preview is drawn with, so there is no second interpretation of
 * "the middle" to disagree with.
 *
 * The icon deliberately has its own picture rather than being cut out of the
 * boulder photo automatically. A wide shot of a problem centres on the wall,
 * and the automatic square out of the middle of one is almost never the hold,
 * the move or the start that would actually identify it in a list.
 */
export function CircleCropModal({
  src,
  onCancel,
  onDone,
}: {
  /** The picture to crop, as a data URI. */
  src: string
  onCancel: () => void
  onDone: (iconDataUrl: string) => void
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  // `baseScale` is the cover fit: the smaller side of the picture exactly fills
  // the viewport at zoom 1, so there is never a gap inside the circle.
  const baseScale = natural ? Math.max(VIEWPORT / natural.w, VIEWPORT / natural.h) : 1
  const drawn = natural
    ? { w: natural.w * baseScale * zoom, h: natural.h * baseScale * zoom }
    : { w: VIEWPORT, h: VIEWPORT }

  /** Keep the picture covering the viewport — no dragging the edge into view. */
  function clamp(o: { x: number; y: number }) {
    return {
      x: Math.min(0, Math.max(VIEWPORT - drawn.w, o.x)),
      y: Math.min(0, Math.max(VIEWPORT - drawn.h, o.y)),
    }
  }

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      const scale = Math.max(VIEWPORT / w, VIEWPORT / h)
      // Open centred, which is the right guess often enough to be worth making.
      setNatural({ w, h })
      setOffset({ x: (VIEWPORT - w * scale) / 2, y: (VIEWPORT - h * scale) / 2 })
    }
    img.onerror = () => setError('That image could not be opened.')
    img.src = src
  }, [src])

  // Zoom about the centre of the circle rather than the picture's top-left,
  // so the thing you are looking at stays where it is.
  function handleZoom(next: number) {
    if (!natural) return
    const prevW = natural.w * baseScale * zoom
    const prevH = natural.h * baseScale * zoom
    const nextW = natural.w * baseScale * next
    const nextH = natural.h * baseScale * next
    const cx = (VIEWPORT / 2 - offset.x) / prevW
    const cy = (VIEWPORT / 2 - offset.y) / prevH
    setZoom(next)
    setOffset({
      x: Math.min(0, Math.max(VIEWPORT - nextW, VIEWPORT / 2 - cx * nextW)),
      y: Math.min(0, Math.max(VIEWPORT - nextH, VIEWPORT / 2 - cy * nextH)),
    })
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d) return
    setOffset(clamp({ x: d.ox + (e.clientX - d.px), y: d.oy + (e.clientY - d.py) }))
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragRef.current = null
  }

  async function handleSave() {
    if (!natural) return
    setSaving(true)
    setError(null)
    try {
      // Back from screen pixels to the picture's own, which is what the crop
      // helper takes. The same numbers that positioned the preview.
      const factor = baseScale * zoom
      onDone(
        await cropSquareToDataUrl(src, {
          x: -offset.x / factor,
          y: -offset.y / factor,
          size: VIEWPORT / factor,
        }),
      )
    } catch {
      setError('Could not create the icon. Please try a different picture.')
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onCancel}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-black">Choose the icon</h2>
          <p className="mt-0.5 text-xs text-neutral-400">Drag to position, slide to zoom</p>
        </div>
        <button type="button" onClick={onCancel} className="text-lg text-neutral-400">
          ✕
        </button>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative touch-none overflow-hidden rounded-xl bg-neutral-900 select-none"
          style={{ width: VIEWPORT, height: VIEWPORT, cursor: 'grab' }}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            className="absolute origin-top-left max-w-none"
            style={{ width: drawn.w, height: drawn.h, left: offset.x, top: offset.y }}
          />
          {/* Everything outside the circle is dimmed by a ring drawn with one
              enormous box-shadow — a real hole in an overlay, so the picture
              underneath stays fully visible and still draggable through it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/80"
            style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
          />
        </div>

        <label className="flex w-full max-w-[260px] items-center gap-2">
          <span className="text-xs text-neutral-400">−</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoom(Number(e.target.value))}
            className="flex-1"
            style={{ accentColor: KBC.cyan }}
            aria-label="Zoom"
          />
          <span className="text-xs text-neutral-400">+</span>
        </label>

        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

        <div className="flex w-full gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-neutral-300 p-3 text-sm font-bold text-neutral-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!natural || saving}
            className="flex-1 rounded-xl p-3 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: KBC.cyan }}
          >
            {saving ? 'Saving…' : 'Use this'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
