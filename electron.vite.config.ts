import { defineConfig } from 'electron-vite'
import { type Plugin } from 'vite'
import { resolve } from 'node:path'
import { viewerKinds } from './src/core/policy'
import { buildViewers } from './dev/viewers.mjs'

// Content viewers (src/viewers/<kind>.html|ts) → out/viewers (dev/viewers.mjs), served by main under
// tie-content://<token>/_tie/. Built with main, so `electron-vite dev` has them too (and
// `tie-dev run --hot` rebuilds them on change). Which: the policy table's viewer kinds (dev-only
// ones too; main serves those in dev builds only).
function viewers(): Plugin {
  return {
    name: 'tie-viewers',
    closeBundle: () => buildViewers(viewerKinds(true)),
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
