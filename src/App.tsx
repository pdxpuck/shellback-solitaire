/**
 * App — view switching (no router; simple view state) + settings/theme
 * ownership. Theme changes persist via ../settings and flow to every
 * CardView usage through the active view.
 */
import { useState } from 'react'
import type { CardTheme } from 'deckhand/renderer'
import { getTheme } from 'deckhand/renderer'
import { getGame } from './games/registry'
import { loadSettings, saveSettings } from './settings'
import type { AppSettings } from './settings'
import HomeView from './views/HomeView'
import SettingsView from './views/SettingsView'
import GameView from './views/GameView'

type View = { kind: 'home' } | { kind: 'settings' } | { kind: 'game'; gameId: string }

function App() {
  const [view, setView] = useState<View>({ kind: 'home' })
  const [settings, setSettings] = useState<AppSettings>(loadSettings)

  const theme: CardTheme = getTheme(settings.themeId)

  const handleSettingsChange = (next: AppSettings) => {
    setSettings(next)
    saveSettings(next)
  }

  return (
    <main className="shell">
      {view.kind === 'home' && (
        <HomeView
          onOpenSettings={() => setView({ kind: 'settings' })}
          onPlay={(gameId) => setView({ kind: 'game', gameId })}
        />
      )}
      {view.kind === 'settings' && (
        <SettingsView
          settings={settings}
          onChange={handleSettingsChange}
          onBack={() => setView({ kind: 'home' })}
        />
      )}
      {view.kind === 'game' && (
        <GameView
          meta={getGame(view.gameId)}
          theme={theme}
          autoFly={settings.autoFly}
          onBack={() => setView({ kind: 'home' })}
        />
      )}
    </main>
  )
}

export default App
