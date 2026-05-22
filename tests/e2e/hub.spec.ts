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
  test('GET /hub renders project cards', async ({ page }) => {
    const errors = captureErrors(page)
    await page.goto(`${BASE}/hub`)
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="hub-project-card"]').first()).toBeVisible({ timeout: 15_000 })
    expect(errors).toEqual([])
  })

  test('GET /hub/recent renders', async ({ page }) => {
    const errors = captureErrors(page)
    await page.goto(`${BASE}/hub/recent`)
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="hub-recent-page"]')).toBeVisible({ timeout: 10_000 })
    expect(errors).toEqual([])
  })

  test('GET /hub/queue renders', async ({ page }) => {
    const errors = captureErrors(page)
    await page.goto(`${BASE}/hub/queue`)
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="hub-queue-page"]')).toBeVisible({ timeout: 10_000 })
    expect(errors).toEqual([])
  })

  test('clicking a card opens /hub/{projectId}', async ({ page }) => {
    const errors = captureErrors(page)
    await page.goto(`${BASE}/hub`)
    await page.locator('[data-testid="hub-project-card"]').first().click()
    await expect(page).toHaveURL(/\/hub\/[a-z0-9-]+$/i)
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="item-row"]').first()).toBeVisible({ timeout: 10_000 })
    expect(errors).toEqual([])
  })

  test('deep link to /hub/{projectId}/{number} renders with selection', async ({ page }) => {
    const errors = captureErrors(page)
    // Discover a real project id by visiting hub home first.
    await page.goto(`${BASE}/hub`)
    const projectId = await page.locator('[data-testid="hub-project-card"]').first().getAttribute('data-project-id')
    expect(projectId).toBeTruthy()
    await page.goto(`${BASE}/hub/${projectId}/1`)
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="item-row"][data-item-number="1"]')).toBeVisible({ timeout: 10_000 })
    expect(errors).toEqual([])
  })
})
