'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '../lib/utils'
import { PLATFORM_CONFIG, PUBLIC_CATEGORY_CONFIG } from '../types'
import type { TabState, SourceType, CustomPlatform, PublicCategory } from '../page'
import { SourceChip } from './SourceChip'

interface TabBarProps {
  activeTab: TabState
  onTabChange: (tab: TabState) => void
  onSettingsClick?: () => void
  unreadCounts?: Record<string, number>
}

// 定制订阅源的子标签
const customPlatforms: { id: CustomPlatform; name: string; color?: string }[] = [
  { id: 'all', name: '全部' },
  { id: 'zhihu', name: PLATFORM_CONFIG.zhihu.name, color: PLATFORM_CONFIG.zhihu.color },
  { id: 'x', name: PLATFORM_CONFIG.x.name, color: PLATFORM_CONFIG.x.color },
  { id: 'wechat', name: PLATFORM_CONFIG.wechat.name, color: PLATFORM_CONFIG.wechat.color },
  { id: 'weibo', name: PLATFORM_CONFIG.weibo.name, color: PLATFORM_CONFIG.weibo.color },
  { id: 'bilibili', name: PLATFORM_CONFIG.bilibili.name, color: PLATFORM_CONFIG.bilibili.color },
  { id: 'youtube', name: PLATFORM_CONFIG.youtube.name, color: PLATFORM_CONFIG.youtube.color },
]

// 公开订阅源的子标签
const publicCategories: { id: PublicCategory; name: string }[] = [
  { id: 'all', name: '全部' },
  { id: 'tech', name: '科技' },
  { id: 'news', name: '新闻' },
  { id: 'finance', name: '财经' },
  { id: 'life', name: '生活' },
  { id: 'design', name: '设计' },
  { id: 'video', name: '视频' },
  { id: 'aggregator', name: '聚合' },
]

// 平台颜色
const platformColors: Record<string, string> = {
  zhihu: PLATFORM_CONFIG.zhihu.color,
  x: PLATFORM_CONFIG.x.color,
  wechat: PLATFORM_CONFIG.wechat.color,
  weibo: PLATFORM_CONFIG.weibo.color,
  bilibili: PLATFORM_CONFIG.bilibili.color,
  youtube: PLATFORM_CONFIG.youtube.color,
}

export function TabBar({
  activeTab,
  onTabChange,
  onSettingsClick,
  unreadCounts = {},
}: TabBarProps) {
  const [openDropdown, setOpenDropdown] = useState<SourceType | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSourceTypeSelect = (sourceType: SourceType) => {
    if (sourceType === 'custom') {
      onTabChange({ sourceType: 'custom', platform: 'all' })
    } else {
      onTabChange({ sourceType: 'public', category: 'all' })
    }
    setOpenDropdown(null)
  }

  const handleCustomPlatformSelect = (platform: CustomPlatform) => {
    onTabChange({ sourceType: 'custom', platform })
    setOpenDropdown(null)
  }

  const handlePublicCategorySelect = (category: PublicCategory) => {
    onTabChange({ sourceType: 'public', category })
    setOpenDropdown(null)
  }

  const isCustomActive = activeTab.sourceType === 'custom'
  const isPublicActive = activeTab.sourceType === 'public'

  // 计算未读数显示
  const getUnreadCount = () => {
    if (activeTab.sourceType === 'public') {
      // 公开订阅源的未读数暂不显示
      return 0
    }
    const key = activeTab.platform || 'all'
    return unreadCounts[key] || 0
  }

  const unreadCount = getUnreadCount()

  return (
    <div className="sticky top-0 z-40 border-b border-border-color bg-bg-secondary shadow-sm">
      <div className="mx-auto max-w-content px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center gap-1">
          {/* Logo */}
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

          {/* 两级下拉导航 */}
          <div className="relative flex flex-1 items-center gap-1" ref={dropdownRef}>
            {/* 定制订阅源 下拉按钮 */}
            <div className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'custom' ? null : 'custom')}
                data-testid="tab-custom-sources"
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                  isCustomActive ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                )}
              >
                <span>定制订阅源</span>
                <svg
                  className={cn('h-4 w-4 transition-transform', openDropdown === 'custom' && 'rotate-180')}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* 定制订阅源下拉面板 */}
              {openDropdown === 'custom' && (
                <div className="absolute left-0 top-full mt-1 w-48 rounded-xl border border-border-color bg-bg-secondary shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="p-1">
                    {customPlatforms.map((platform) => {
                      const isActive = isCustomActive && activeTab.platform === platform.id
                      const color = platform.id !== 'all' ? platformColors[platform.id] : '#4CA6E1'
                      return (
                        <SourceChip
                          key={platform.id}
                          onClick={() => handleCustomPlatformSelect(platform.id)}
                          data-testid={`custom-platform-${platform.id}`}
                          selected={isActive}
                          accentColor={platform.id !== 'all' ? color : undefined}
                          className="w-full justify-start rounded-lg px-3 py-2 text-sm"
                          dot={
                            platform.id !== 'all' ? (
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: isActive ? '#FFFFFF' : color }} />
                            ) : undefined
                          }
                        >
                          {platform.name}
                          {isActive && (
                            <svg className="ml-auto h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </SourceChip>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 公开订阅源 下拉按钮 */}
            <div className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'public' ? null : 'public')}
                data-testid="tab-public-sources"
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                  isPublicActive ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                )}
              >
                <span>公开订阅源</span>
                <svg
                  className={cn('h-4 w-4 transition-transform', openDropdown === 'public' && 'rotate-180')}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* 公开订阅源下拉面板 */}
              {openDropdown === 'public' && (
                <div className="absolute left-0 top-full mt-1 w-40 rounded-xl border border-border-color bg-bg-secondary shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="p-1">
                    {publicCategories.map((category) => {
                      const isActive = isPublicActive && activeTab.category === category.id
                      const config = PUBLIC_CATEGORY_CONFIG[category.id]
                      return (
                        <SourceChip
                          key={category.id}
                          onClick={() => handlePublicCategorySelect(category.id)}
                          data-testid={`public-category-${category.id}`}
                          selected={isActive}
                          accentColor={category.id !== 'all' ? config?.color : undefined}
                          className="w-full justify-start rounded-lg px-3 py-2 text-sm"
                          dot={
                            category.id !== 'all' && config ? (
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: isActive ? '#FFFFFF' : config.color }} />
                            ) : undefined
                          }
                        >
                          {category.name}
                          {isActive && (
                            <svg className="ml-auto h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </SourceChip>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 当前选中状态的标签（移动端） */}
            <div className="ml-2 flex items-center gap-2 border-l border-border-color pl-2">
              <span className="text-sm text-text-secondary">
                {isCustomActive
                  ? customPlatforms.find((p) => p.id === activeTab.platform)?.name
                  : publicCategories.find((c) => c.id === activeTab.category)?.name}
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-unread px-1.5 py-0.5 text-xs font-semibold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
          </div>

          {/* 右侧设置按钮 */}
          <div className="ml-2 flex items-center gap-1 border-l border-border-color pl-2">
            <button
              onClick={onSettingsClick}
              data-testid="open-settings-modal"
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
