'use client'

import { useState, useCallback, useEffect } from 'react'
import useSWR from 'swr'
import { TabBar } from './components/TabBar'
import { FeedList } from './components/FeedList'
import { SearchBar } from './components/SearchBar'
import { AddSourceModal } from './components/AddSourceModal'
import { SettingsModal } from './components/SettingsModal'
import { TagFilter } from './components/TagFilter'
import { feedApi, tagsApi } from './lib/api'
import { Tag } from './types'

export default function Home() {
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [tabVersion, setTabVersion] = useState(0)

  const { data: unreadData, mutate: mutateUnread } = useSWR(
    ['unread-breakdown', refreshTrigger],
    () => feedApi.getUnreadCount(),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  )

  useEffect(() => {
    tagsApi.getAll().then((response) => {
      if (response.ok) {
        setAvailableTags(response.tags)
      }
    })
  }, [])

  const platformFilter = activeTab === 'all' ? undefined : activeTab

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    setSelectedTagId(null)
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  const handleTagSelect = useCallback((tagId: number | null) => {
    setSelectedTagId(tagId)
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  const handleRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1)
    void mutateUnread()
  }, [mutateUnread])

  return (
    <main className="min-h-screen bg-bg-primary">
      <TabBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab)
          setSelectedTagId(null)
          setTabVersion((v) => v + 1)
        }}
        onAddClick={() => setIsAddModalOpen(true)}
        onSettingsClick={() => setIsSettingsOpen(true)}
        unreadCounts={{
          all: unreadData?.count ?? 0,
          ...(unreadData?.by_platform ?? {}),
        }}
      />

      <div className="mx-auto max-w-content px-4 pb-2 pt-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchBar
            value={searchQuery}
            onSearch={handleSearch}
            placeholder="搜索标题、摘要、作者..."
            className="flex-1"
          />
          <TagFilter
            tags={availableTags}
            selectedTagId={selectedTagId}
            onSelectTag={handleTagSelect}
          />
        </div>
      </div>

      <div className="mx-auto max-w-content px-4 py-4 sm:px-6 lg:px-8">
        <FeedList
          key={`${platformFilter ?? 'all'}-${tabVersion}`}
          platform={platformFilter}
          searchQuery={searchQuery}
          tagId={selectedTagId}
          refreshTrigger={refreshTrigger}
          tabVersion={tabVersion}
          sourceUnreadCounts={unreadData?.by_source}
          onCountsChange={() => {
            void mutateUnread()
          }}
        />
      </div>

      <AddSourceModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleRefresh}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </main>
  )
}
