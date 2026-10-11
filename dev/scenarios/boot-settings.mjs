// Saved settings apply at startup (regression: settings silently reset to defaults).
export const settings = { theme: 'nord', fontFamily: 'Menlo', fontSize: 14, lineHeight: 1.2, cellWidth: 95, shell: '', borderless: true }

export default async (ctx, h) => {
  const cssVar = (n) => ctx.page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), n)
  h.assert((await cssVar('--bg')) === '#2e3440', 'theme applied at boot')
  h.assert((await cssVar('--tile-font-size')) === '14px', 'font size applied at boot')
  const font = await ctx.page.evaluate(() => getComputedStyle(document.querySelector('.xterm-rows')).fontFamily)
  h.assert(font.startsWith('Menlo'), `font applied at boot (${font})`)
  // Borderless at boot: frameless window (square corners); tab bar at the left edge.
  h.assert(await ctx.page.evaluate(() => document.documentElement.classList.contains('borderless')), 'borderless at boot')
}
