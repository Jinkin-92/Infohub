'use client'

import { createContext, useContext, useState, useCallback } from 'react'

interface TranslationContextValue {
  isTranslatingAll: boolean
  translateAll: () => void
  translationTrigger: number
}

const TranslationContext = createContext<TranslationContextValue>({
  isTranslatingAll: false,
  translateAll: () => {},
  translationTrigger: 0,
})

export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const [isTranslatingAll, setIsTranslatingAll] = useState(false)
  const [translationTrigger, setTranslationTrigger] = useState(0)

  const translateAll = useCallback(() => {
    setIsTranslatingAll(true)
    setTranslationTrigger(prev => prev + 1)
    // Reset after a delay to allow items to react
    setTimeout(() => setIsTranslatingAll(false), 1000)
  }, [])

  return (
    <TranslationContext.Provider value={{ isTranslatingAll, translateAll, translationTrigger }}>
      {children}
    </TranslationContext.Provider>
  )
}

export function useTranslation() {
  return useContext(TranslationContext)
}