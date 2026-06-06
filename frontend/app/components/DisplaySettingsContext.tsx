'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { settingsApi, type DisplaySettings } from '../lib/api'

interface DisplaySettingsContextValue {
  settings: DisplaySettings
  isLoading: boolean
  updateSettings: (settings: Partial<DisplaySettings>) => Promise<void>
}

const defaultSettings: DisplaySettings = {
  font_size: 'medium',
  card_density: 'normal',
  line_spacing: 'normal',
}

const DisplaySettingsContext = createContext<DisplaySettingsContextValue>({
  settings: defaultSettings,
  isLoading: true,
  updateSettings: async () => {},
})

export function DisplaySettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<DisplaySettings>(defaultSettings)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    settingsApi.getDisplaySettings().then((response) => {
      if (response.ok && response.settings) {
        setSettings(response.settings)
      }
      setIsLoading(false)
    }).catch(() => {
      setIsLoading(false)
    })
  }, [])

  const updateSettings = async (newSettings: Partial<DisplaySettings>) => {
    const updated = await settingsApi.updateDisplaySettings(newSettings)
    if (updated.ok && updated.settings) {
      setSettings(updated.settings)
    }
  }

  return (
    <DisplaySettingsContext.Provider value={{ settings, isLoading, updateSettings }}>
      {children}
    </DisplaySettingsContext.Provider>
  )
}

export function useDisplaySettings() {
  return useContext(DisplaySettingsContext)
}