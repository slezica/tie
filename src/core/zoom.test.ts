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
  // In range (ZOOM_STEPS[0]..last): every preset steps to its neighbor; between two presets, the
  // neighbor in that direction. Out of range: next test (unreachable today: factors only come from
  // here; zoomStep(6, ±1) gave 0.25 before the clamp).
  it('in range: presets step to their neighbors, clamped at the ends', () => {
    ZOOM_STEPS.forEach((s, i) => {
      expect(zoomStep(s, 1)).toBe(ZOOM_STEPS[Math.min(i + 1, ZOOM_STEPS.length - 1)])
      expect(zoomStep(s, -1)).toBe(ZOOM_STEPS[Math.max(i - 1, 0)])
      expect(zoomStep(s, 0)).toBe(1)
    })
    // Float noise around a preset counts as the preset.
    expect(zoomStep(1.1 + 1e-9, 1)).toBe(1.25)
    expect(zoomStep(0.67 - 1e-9, -1)).toBe(0.5)
    // Between presets, near both ends too.
    for (let i = 0; i < ZOOM_STEPS.length - 1; i++) {
      const mid = (ZOOM_STEPS[i] + ZOOM_STEPS[i + 1]) / 2
      expect(zoomStep(mid, 1)).toBe(ZOOM_STEPS[i + 1])
      expect(zoomStep(mid, -1)).toBe(ZOOM_STEPS[i])
    }
  })
  it('out of range: clamped to the nearest end', () => {
    const max = ZOOM_STEPS[ZOOM_STEPS.length - 1]
    const min = ZOOM_STEPS[0]
    expect(zoomStep(6, 1)).toBe(max)
    expect(zoomStep(6, -1)).toBe(max) // the largest preset below it
    expect(zoomStep(100, -1)).toBe(max)
    expect(zoomStep(0.1, -1)).toBe(min)
    expect(zoomStep(0.1, 1)).toBe(min) // the smallest preset above it
    expect(zoomStep(0, 1)).toBe(min)
    expect(zoomStep(6, 0)).toBe(1)
  })
  it('labels: percent, none at 100%', () => {
    expect(zoomLabel(1)).toBe('')
    expect(zoomLabel(1.25)).toBe('125%')
    expect(zoomLabel(0.67)).toBe('67%')
  })
})
