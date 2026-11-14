import { describe, expect, it } from 'vitest'
import { ZOOM_STEPS, zoomLabel, zoomStep } from './zoom'

describe('zoom', () => {
  it('steps through the presets, clamped', () => {
    expect(zoomStep(1, 1)).toBe(1.1)
    expect(zoomStep(1.1, 1)).toBe(1.25)
    expect(zoomStep(1, -1)).toBe(0.9)
    expect(zoomStep(5, 1)).toBe(5)
    expect(zoomStep(0.25, -1)).toBe(0.25)
    expect(zoomStep(3, 0)).toBe(1)
    expect(zoomStep(1.3, 1)).toBe(1.5) // between steps
    expect(zoomStep(1.3, -1)).toBe(1.25)
    expect(ZOOM_STEPS).toContain(1)
  })
  it('labels: percent, none at 100%', () => {
    expect(zoomLabel(1)).toBe('')
    expect(zoomLabel(1.25)).toBe('125%')
    expect(zoomLabel(0.67)).toBe('67%')
  })
})
