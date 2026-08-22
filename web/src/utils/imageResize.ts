// Web equivalent of mobile's expo-image-picker + expo-image-manipulator
// pipeline (resize to width 1080, compress 0.7 JPEG, base64 data URI —
// same target format stored directly in the Boulder.photo /
// PersonalClimb.photo Firestore fields). Neither mobile screen does camera
// capture, only gallery/library picking, so a plain file input is enough
// here too — no getUserMedia needed.

export async function resizeImageFileToDataUrl(file: File, maxWidth = 1080, quality = 0.7): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(bitmap, 0, 0, width, height)

  return canvas.toDataURL('image/jpeg', quality)
}
