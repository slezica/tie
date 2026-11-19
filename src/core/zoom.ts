// Page zoom for html and browser tiles (cmd+= / cmd+- / cmd+0): Chrome's preset factors. Pure,
// unit-tested. docs/INPUT.md.

export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]

// The next factor from `factor` in direction `dir` (1 in, -1 out, 0 reset to 1); clamped at the ends.
// Outside the presets: above the max, in stays at the max, out goes to the max; below the min, mirrored.
export function zoomStep(factor: number, dir: 1 | -1 | 0): number {
  if (dir === 0) return 1
  const i = ZOOM_STEPS.findIndex((s) => Math.abs(s - factor) < 1e-6)
  const above = ZOOM_STEPS.findIndex((s) => s > factor) // first preset above; none (past the max): the end
  const from = i >= 0 ? i : (above < 0 ? ZOOM_STEPS.length : above) - (dir > 0 ? 1 : 0) // between steps: the neighbor in that direction
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, from + dir))]
}

export const zoomLabel = (factor: number) => (Math.abs(factor - 1) < 1e-6 ? '' : `${Math.round(factor * 100)}%`)
