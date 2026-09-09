// Web equivalent of mobile's expo-image-picker + expo-image-manipulator
// pipeline (resize to width 1080, compress 0.7 JPEG, base64 data URI —
// same target format stored directly in the Boulder.photo /
// PersonalClimb.photo Firestore fields). A plain file input covers both
// picking from the library and, with `capture`, taking a photo — no
// getUserMedia needed.

/**
 * Decode a picked file to something drawable.
 *
 * `createImageBitmap` is the fast path, and it is what every desktop browser
 * and Android Chrome takes. iOS Safari is the reason for the fallback: photos
 * straight off an iPhone camera roll are HEIC, and Safari's
 * `createImageBitmap` rejects a HEIC blob outright even though the same file
 * loads fine through an `<img>` element (WebKit decodes HEIC in the image
 * pipeline but not in the bitmap one). Without this fallback, "add a photo"
 * simply failed on iPhone and succeeded everywhere else.
 */
async function decodeImage(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(file)
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.decoding = 'async'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Could not decode image'))
        img.src = url
      })
      // Safari resolves onload before the bitmap is necessarily ready to
      // draw; decode() settles that, and is a no-op where it already is.
      await img.decode().catch(() => {})
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

function releaseSource(src: CanvasImageSource) {
  if (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) src.close()
}

export async function resizeImageFileToDataUrl(file: File, maxWidth = 1080, quality = 0.7): Promise<string> {
  const source = await decodeImage(file)
  try {
    const scale = Math.min(1, maxWidth / source.width)
    const width = Math.round(source.width * scale)
    const height = Math.round(source.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.drawImage(source, 0, 0, width, height)

    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    releaseSource(source)
  }
}

/**
 * A square, low-resolution crop of the same picture, for the round icon on the
 * boulder card.
 *
 * Deliberately tiny. It is stored on the boulder document as a data URI and so
 * travels with every read of the `boulders` collection — at 96px/q0.6 that is
 * a couple of kB, against a couple of hundred for `photo`. The card renders
 * *only* this, which is what keeps a season of boulders from putting a
 * megabyte of full-size JPEG on screen at once.
 *
 * The crop is centred and covers the square (the shorter side wins), matching
 * how the icon is displayed — an `object-cover` circle — so nothing is
 * squashed and nothing is re-cropped at paint time.
 */
export async function resizeImageFileToIconDataUrl(file: File, size = 96, quality = 0.6): Promise<string> {
  const source = await decodeImage(file)
  try {
    const side = Math.min(source.width, source.height)
    const sx = (source.width - side) / 2
    const sy = (source.height - side) / 2

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size)

    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    releaseSource(source)
  }
}
