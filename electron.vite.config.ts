import { defineConfig } from 'electron-vite'
import { build, type Plugin } from 'vite'
import { resolve } from 'node:path'
import { copyFileSync, mkdirSync } from 'node:fs'

// Content viewers (src/viewers/<kind>.html|ts) → out/viewers, served by main under
// tie-content://<token>/_tie/. Classic IIFE scripts: opaque-origin frames can't load modules from
// tie-content (no CORS). Built with main, so `electron-vite dev` has them too.
const VIEWERS = ['probe']
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
