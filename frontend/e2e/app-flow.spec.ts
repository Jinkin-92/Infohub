import { expect, test } from '@playwright/test'

type SourceRecord = {
  id: number
  name: string
  input_url: string
  enabled: boolean | number
  is_public?: boolean | number
  last_fetched_at?: string | null
}

type PlatformRecord = {
  platform: string
}

const backendUrl = (process.env.INFOHUB_BACKEND_URL || 'http://localhost:3002').replace(/\/$/, '')

async function readJson(path: string) {
  const response = await fetch(`${backendUrl}${path}`)
  expect(response.ok).toBeTruthy()
  return response.json()
}

async function sendDelete(path: string) {
  const response = await fetch(`${backendUrl}${path}`, { method: 'DELETE' })
  expect(response.ok).toBeTruthy()
}

async function getSources(): Promise<SourceRecord[]> {
  const payload = await readJson('/api/sources')
  return payload.sources as SourceRecord[]
}

async function getPlatforms(): Promise<PlatformRecord[]> {
  const payload = await readJson('/api/auth/platforms')
  return payload.platforms as PlatformRecord[]
}

async function deleteSource(sourceId: number) {
  await sendDelete(`/api/sources/${sourceId}`)
}

test('covers add source, manual collect, settings panels and public source entry points', async ({
  page,
}) => {
  test.setTimeout(180_000)

  const seed = Date.now()
  const testSourceUrl = `https://hnrss.org/frontpage?infohub_e2e=${seed}`
  let createdSourceId: number | null = null

  try {
    await page.goto('/')
    await expect(page.getByTestId('home-root')).toBeVisible()

    await page.getByTestId('open-add-source-modal').click()
    await expect(page.getByTestId('add-source-modal')).toBeVisible()
    await page.getByTestId('add-source-url-input').fill(testSourceUrl)
    await page.getByTestId('submit-add-source').click()
    await expect(page.getByTestId('add-source-modal')).toBeHidden({ timeout: 30_000 })

    await expect
      .poll(async () => {
        const sources = await getSources()
        const created = sources.find((source) => source.input_url === testSourceUrl)
        createdSourceId = created?.id ?? null
        return createdSourceId
      })
      .toBeTruthy()

    await page.getByTestId('open-settings-modal').click()
    await expect(page.getByTestId('settings-modal')).toBeVisible()
    await expect(page.getByTestId('settings-sources-tab')).toBeVisible()
    await expect(page.getByTestId(`source-item-${createdSourceId}`)).toBeVisible()

    const collectResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url() === `${backendUrl}/api/sources/${createdSourceId}/collect`
    )
    await page.getByTestId(`collect-source-${createdSourceId}`).click()
    const collectResponse = await collectResponsePromise
    expect(collectResponse.ok()).toBeTruthy()
    const collectPayload = await collectResponse.json()
    expect(collectPayload.result).toBeTruthy()
    expect(collectPayload.result.sourceId).toBe(createdSourceId)
    expect(typeof collectPayload.result.success).toBe('boolean')

    await page.getByTestId('settings-tab-general').click()
    await expect(page.getByTestId('settings-general-tab')).toBeVisible()
    await expect(page.getByTestId('save-rsshub-settings')).toBeVisible()

    await page.getByTestId('settings-tab-connections').click()
    await expect(page.getByTestId('platform-connections-panel')).toBeVisible()
    const platforms = await getPlatforms()
    for (const platform of platforms) {
      await expect(page.getByTestId(`platform-card-${platform.platform}`)).toBeVisible()
      await expect(page.getByTestId(`test-platform-${platform.platform}`)).toBeVisible()
    }

    await page.getByTestId('close-settings-modal').click()
    await expect(page.getByTestId('settings-modal')).toBeHidden()

    await page.getByTestId('tab-public-sources').click()
    await page.getByTestId('public-category-all').click()
    await page.getByTestId('open-public-sources-panel').click()
    await expect(page.getByTestId('public-sources-panel')).toBeVisible()
    await page.getByTestId('close-public-sources-panel').click()
    await expect(page.getByTestId('public-sources-panel')).toBeHidden()
  } finally {
    if (createdSourceId) {
      await deleteSource(createdSourceId)
    }
  }
})
