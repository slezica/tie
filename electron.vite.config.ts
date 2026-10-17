import { defineConfig } from 'electron-vite'
import { build, type Plugin } from 'vite'
import { resolve } from 'node:path'
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

// Content viewers (src/viewers/<kind>.html|ts) → out/viewers, served by main under
// tie-content://<token>/_tie/. Classic IIFE scripts: opaque-origin frames can't load modules from
// tie-content (no CORS). Built with main, so `electron-vite dev` has them too.
const VIEWERS = ['markdown', 'probe']
// Prebuilt viewer assets, copied as-is (served only to their kind: viewerFile in core/content.ts).
// Mermaid: the "tiny" IIFE (no mindmap, architecture, KaTeX), pinned in package.json.
const require = createRequire(import.meta.url)
const ASSETS = { 'markdown-mermaid.js': require.resolve('@mermaid-js/tiny') }
function viewers(): Plugin {
  return {
    name: 'tie-viewers',
    async closeBundle() {
      mkdirSync('out/viewers', { recursive: true })
      for (const kind of VIEWERS) {
        await build({
          configFile: false,
          logLevel: 'warn',
          build: {
            outDir: 'out/viewers',
            emptyOutDir: false,
            lib: { entry: resolve(`src/viewers/${kind}.ts`), formats: ['iife'], name: 'viewer', fileName: () => `${kind}.js` },
          },
        })
        copyFileSync(`src/viewers/${kind}.html`, `out/viewers/${kind}.html`)
      }
      for (const [name, from] of Object.entries(ASSETS)) copyFileSync(from, `out/viewers/${name}`)
    },
  }
}

export default defineConfig({
  main: {
    resolve: { alias: { '@core': resolve('src/core') } },
    plugins: [viewers()],
  },
  preload: {
    build: {
      rollupOptions: {
        // Sandboxed preloads must be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    resolve: { alias: { '@core': resolve('src/core') } },
  },
})
