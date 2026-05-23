import { expect, test } from '@playwright/test'

// Intentionally minimal — see tests/e2e/TODO.md for the assertions we want to
// restore once the hub surface stops moving every other day.

const BASE = 'http://127.0.0.1:7911'

function captureErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  return errors
}

test.describe('hub smoke', () => {
  test('GET / renders project cards', async ({ page }) => {
    const errors = captureErrors(page)
    await page.goto(`${BASE}/`)
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="hub-project-card"]').first()).toBeVisible({ timeout: 15_000 })
    expect(errors).toEqual([])
  })

  test('GET /recent renders', async ({ page }) => {
    const errors = captureErrors(page)
    await page.goto(`${BASE}/recent`)
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="hub-recent-page"]')).toBeVisible({ timeout: 10_000 })
    expect(errors).toEqual([])
  })

  test('clicking a card opens /{owner}/{repo}', async ({ page }) => {
    const errors = captureErrors(page)
    await page.goto(`${BASE}/`)
    const card = page.locator('[data-testid="hub-project-card"]').first()
    const repo = await card.getAttribute('data-project-repo')
    expect(repo).toBeTruthy()
    await card.click()
    await expect(page).toHaveURL(`${BASE}/${repo}`)
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="item-row"]').first()).toBeVisible({ timeout: 10_000 })
    expect(errors).toEqual([])
  })

  test('deep link to /{owner}/{repo}/{number} renders with selection', async ({ page }) => {
    const errors = captureErrors(page)
    // Discover a real project repo by visiting hub home first.
    await page.goto(`${BASE}/`)
    const repo = await page.locator('[data-testid="hub-project-card"]').first().getAttribute('data-project-repo')
    expect(repo).toBeTruthy()
    await page.goto(`${BASE}/${repo}/1`)
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="item-row"][data-item-number="1"]')).toBeVisible({ timeout: 10_000 })
    expect(errors).toEqual([])
  })

  test('legacy /hub* URLs redirect to new paths', async ({ page }) => {
    const errors = captureErrors(page)
    await page.goto(`${BASE}/hub`)
    await expect(page).toHaveURL(`${BASE}/`)
    await expect(page.locator('[data-testid="hub-project-card"]').first()).toBeVisible({ timeout: 15_000 })

    await page.goto(`${BASE}/hub/recent`)
    await expect(page).toHaveURL(`${BASE}/recent`)
    await expect(page.locator('[data-testid="hub-recent-page"]')).toBeVisible({ timeout: 10_000 })

    expect(errors).toEqual([])
  })

  test('GitHub-shaped /{owner}/{repo}/{issues|pull|pulls}/{n} URLs redirect', async ({ page }) => {
    const errors = captureErrors(page)
    await page.goto(`${BASE}/`)
    const repo = await page.locator('[data-testid="hub-project-card"]').first().getAttribute('data-project-repo')
    expect(repo).toBeTruthy()

    await page.goto(`${BASE}/${repo}/issues/1`)
    await expect(page).toHaveURL(`${BASE}/${repo}/1`)
    await expect(page.locator('[data-testid="item-row"][data-item-number="1"]')).toBeVisible({ timeout: 10_000 })

    await page.goto(`${BASE}/${repo}/pull/1`)
    await expect(page).toHaveURL(`${BASE}/${repo}/1`)

    await page.goto(`${BASE}/${repo}/pulls/1`)
    await expect(page).toHaveURL(`${BASE}/${repo}/1`)

    expect(errors).toEqual([])
  })
})
