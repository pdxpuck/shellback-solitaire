/**
 * App — view switching (no router; simple view state) + settings/theme
 * ownership. Theme changes persist via ../settings and flow to every
 * CardView usage through the active view. Settings is reachable from Home
 * or the game; its Back returns to the view it was opened from.
 */
import { useState } from 'react'
import type { CardTheme } from 'deckhand/renderer'
import { getTheme } from 'deckhand/renderer'
import { gameViewConfig } from './games/gameViews'
import { getGame } from './games/registry'
import { loadSettings, saveSettings } from './settings'
import type { AppSettings } from './settings'
import HomeView from './views/HomeView'
import SettingsView from './views/SettingsView'
import GameView from './views/GameView'

type View = { kind: 'home' } | { kind: 'settings' } | { kind: 'game'; gameId: string }

function App() {
  const [view, setView] = useState<View>({ kind: 'home' })
  /** Where Settings' Back goes: the view it was opened from (home or game). */
  const [settingsReturn, setSettingsReturn] = useState<View>({ kind: 'home' })
  const [settings, setSettings] = useState<AppSettings>(loadSettings)

  const theme: CardTheme = getTheme(settings.themeId)

  const handleSettingsChange = (next: AppSettings) => {
    setSettings(next)
    saveSettings(next)
  }

  /** Open Settings from the current view; Back returns there. */
  const openSettings = () => {
    setSettingsReturn(view)
    setView({ kind: 'settings' })
  }

  return (
    <main className="shell">
      {view.kind === 'home' && (
        <HomeView
          onOpenSettings={openSettings}
          onPlay={(gameId) => setView({ kind: 'game', gameId })}
        />
      )}
      {view.kind === 'settings' && (
        <SettingsView
          settings={settings}
          onChange={handleSettingsChange}
          onBack={() => setView(settingsReturn)}
        />
      )}
      {view.kind === 'game' && (
        <GameView
          config={gameViewConfig(view.gameId)}
          meta={getGame(view.gameId)}
          theme={theme}
          autoFly={settings.autoFly}
          flightSpeed={settings.flightSpeed}
          singleTapMove={settings.singleTapMove}
          onBack={() => setView({ kind: 'home' })}
          onOpenSettings={openSettings}
        />
      )}
    </main>
  )
}

export default App
