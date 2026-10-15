import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Vite config runs in node, so the filesystem is available. The version is
// injected as the __APP_VERSION__ constant (see src/vite-env.d.ts) so the
// app can display it (Settings + home footer) without a runtime fetch.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages project path. Overridable for a future custom domain
  // (BASE_PATH=/ with solitaire.shellbackstudio.xyz).
  base: process.env.BASE_PATH ?? '/shellback-solitaire/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  optimizeDeps: {
    // deckhand is a linked source package (link:../deckhand); its ESM dist
    // must not be pre-bundled, or rebuilds in ../deckhand wouldn't be
    // picked up cleanly by the dev server.
    exclude: ['deckhand'],
  },
})
