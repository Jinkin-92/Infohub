'use client'

import { cn } from '../lib/utils'
import { PLATFORM_CONFIG } from '../types'

interface TabBarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  onAddClick?: () => void
  onSettingsClick?: () => void
  unreadCounts?: Record<string, number>
}

export function TabBar({
  activeTab,
  onTabChange,
  onAddClick,
  onSettingsClick,
  unreadCounts = {},
}: TabBarProps) {
  const tabs = [
    { id: 'all', name: '全部', color: '#4CA6E1' },
    PLATFORM_CONFIG.zhihu,
    PLATFORM_CONFIG.x,
    PLATFORM_CONFIG.bilibili,
    PLATFORM_CONFIG.youtube,
    PLATFORM_CONFIG.news,
    PLATFORM_CONFIG.custom,
  ]

  return (
    <div className="sticky top-0 z-40 border-b border-border-color bg-bg-secondary shadow-sm">
      <div className="mx-auto max-w-content px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center gap-1">
          <div className="mr-4 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
              <svg
                className="h-4 w-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <span className="hidden font-semibold text-text-primary sm:block">信息中枢</span>
          </div>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              const unreadCount = unreadCounts[tab.id] || 0

              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    'relative whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                    'hover:bg-bg-tertiary',
                    isActive ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {tab.id !== 'all' && (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: tab.color }}
                      />
                    )}
                    <span>{tab.name}</span>
                    {unreadCount > 0 && (
                      <span className="ml-1 rounded-full bg-unread px-1.5 py-0.5 text-xs font-semibold text-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>

                  {isActive && (
                    <div className="absolute bottom-0 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-accent" />
                  )}
                </button>
              )
            })}
          </nav>

          <div className="ml-2 flex items-center gap-1 border-l border-border-color pl-2">
            <button
              onClick={onAddClick}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover hover:shadow"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">添加源</span>
            </button>

            <button
              onClick={onSettingsClick}
              className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              aria-label="设置"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
