import { describe, it, expect } from 'vitest'
import {
  downscaleForVision,
  bytesToBase64,
  MAX_VISION_EDGE,
} from '../../../src/ui/ai/downscale'

describe('downscaleForVision', () => {
  it('exports MAX_VISION_EDGE = 1024 for the spec contract', () => {
    expect(MAX_VISION_EDGE).toBe(1024)
  })

  it('returns input unchanged when OffscreenCanvas is unavailable', async () => {
    // happy-dom doesn't ship OffscreenCanvas; downscale must degrade gracefully.
    const original = (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas
    ;(globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = undefined
    try {
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
      const out = await downscaleForVision(bytes)
      expect(out).toBe(bytes)
    } finally {
      ;(globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = original
    }
  })
})

describe('bytesToBase64', () => {
  it('round-trips a small byte array via atob', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255])
    const b64 = bytesToBase64(bytes)
    const decoded = atob(b64)
    const back = new Uint8Array(decoded.length)
    for (let i = 0; i < decoded.length; i++) back[i] = decoded.charCodeAt(i)
    expect(Array.from(back)).toEqual([0, 1, 2, 250, 255])
  })

  it('produces valid base64 for an empty array', () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe('')
  })
})
