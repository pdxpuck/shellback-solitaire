import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // deckhand is a linked source package (link:../deckhand); its ESM dist
    // must not be pre-bundled, or rebuilds in ../deckhand wouldn't be
    // picked up cleanly by the dev server.
    exclude: ['deckhand'],
  },
})
