import { expect, test } from '@playwright/test'

// Intentionally minimal — see tests/e2e/TODO.md for the assertions we want to
// restore once the UI surface stops moving every other day.

const BASE = 'http://127.0.0.1:7910'

function captureErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  return errors
}

test.describe('ui mode smoke', () => {
  test('GET / renders the project view', async ({ page }) => {
    const errors = captureErrors(page)
    await page.goto(`${BASE}/`)
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="item-row"]').first()).toBeVisible({ timeout: 10_000 })
    expect(errors).toEqual([])
  })

  test('GET /1 deep-links to a selected item', async ({ page }) => {
    const errors = captureErrors(page)
    await page.goto(`${BASE}/1`)
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="item-row"][data-item-number="1"]')).toBeVisible({ timeout: 10_000 })
    expect(errors).toEqual([])
  })

  test('Cmd+K opens the command palette and filters by query', async ({ page }) => {
    const errors = captureErrors(page)
    await page.goto(`${BASE}/`)
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible({ timeout: 10_000 })

    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.locator('[data-testid="command-palette"]')).toBeVisible()
    await expect(page.locator('[data-testid="command-palette-input"]')).toBeFocused()

    // Typing narrows the visible rows; "sync" should match action.sync.
    await page.locator('[data-testid="command-palette-input"]').fill('sync')
    await expect(page.locator('[data-testid="command-palette-row-action.sync"]')).toBeVisible()

    // Escape closes the palette.
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="command-palette"]')).toBeHidden()

    expect(errors).toEqual([])
  })

  test('Cmd+Shift+P opens the command palette as an alias', async ({ page }) => {
    const errors = captureErrors(page)
    await page.goto(`${BASE}/`)
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible({ timeout: 10_000 })

    await page.keyboard.press('ControlOrMeta+Shift+p')
    await expect(page.locator('[data-testid="command-palette"]')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('? opens the help overlay with grouped categories', async ({ page }) => {
    const errors = captureErrors(page)
    await page.goto(`${BASE}/`)
    await expect(page.locator('[data-testid="navbar"]')).toBeVisible({ timeout: 10_000 })

    await page.keyboard.press('?')
    await expect(page.locator('[data-testid="help-overlay"]')).toBeVisible()
    await expect(page.locator('[data-testid="help-overlay"]').getByText('Navigate', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })
})
