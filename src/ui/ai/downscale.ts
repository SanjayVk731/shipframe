export const MAX_VISION_EDGE = 1024

// Base64-encodes raw bytes. Chunked to avoid call-stack overflow on large PNGs
// when spreading into String.fromCharCode. Runs in the UI iframe where btoa is
// available.
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let s = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(s)
}

// Downscales a PNG so its longest edge is at most MAX_VISION_EDGE pixels, using
// OffscreenCanvas (available in the Figma UI iframe). Returns the input
// unchanged if OffscreenCanvas/createImageBitmap are unavailable (e.g. in unit
// tests) or if the image is already within bounds.
export async function downscaleForVision(bytes: Uint8Array): Promise<Uint8Array> {
  const OC = (globalThis as { OffscreenCanvas?: typeof OffscreenCanvas })
    .OffscreenCanvas
  if (typeof OC === 'undefined') return bytes
  if (typeof createImageBitmap === 'undefined') return bytes

  const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
  const bitmap = await createImageBitmap(blob)
  try {
    const longest = Math.max(bitmap.width, bitmap.height)
    if (longest <= MAX_VISION_EDGE) return bytes
    const scale = MAX_VISION_EDGE / longest
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = new OC(w, h)
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null
    if (!ctx) return bytes
    ctx.drawImage(bitmap, 0, 0, w, h)
    const outBlob = await canvas.convertToBlob({ type: 'image/png' })
    const buf = await outBlob.arrayBuffer()
    return new Uint8Array(buf)
  } finally {
    bitmap.close()
  }
}
