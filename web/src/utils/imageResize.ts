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
 * Cut a square region out of an already-decoded data URI.
 *
 * The region is given in the source image's own pixels, which is what
 * `CircleCropModal` works in: it positions a circular viewport over the picture
 * and hands back the square that circle inscribes. The output stays square and
 * is drawn round by the card — a JPEG with no alpha channel is a good deal
 * smaller than a PNG with a transparent corner, and the corners are never seen.
 *
 * Deliberately small. The result is stored on the boulder document and so
 * travels with every read of the collection: at 192px/q0.65 that is under
 * 10 kB, against a couple of hundred for the full picture, which is what keeps
 * a season of boulders off the phone's memory budget.
 *
 * 192 rather than 96 because the card draws the icon at 80 CSS px, and a
 * phone screen is two or three device pixels to each of those. At 96 the icon
 * was sharp when it was 40px on the card and soft as soon as it grew.
 */
export async function cropSquareToDataUrl(
  src: string,
  region: { x: number; y: number; size: number },
  out = 192,
  quality = 0.65,
): Promise<string> {
  const img = new Image()
  img.decoding = 'async'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Could not decode image'))
    img.src = src
  })
  await img.decode().catch(() => {})

  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(img, region.x, region.y, region.size, region.size, 0, 0, out, out)

  return canvas.toDataURL('image/jpeg', quality)
}
