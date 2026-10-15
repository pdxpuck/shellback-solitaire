import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setThemeBase } from 'deckhand/renderer'
import './index.css'
import App from './App.tsx'

// GitHub Pages hosts the app under /shellback-solitaire/ — deckhand's theme
// art URLs are root-absolute and must ride the deployment base path.
setThemeBase(import.meta.env.BASE_URL)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker scope = the base path (BASE_URL), so it controls only this
// app's pages; registration failure is silently non-fatal (progressive enhancement).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
}
