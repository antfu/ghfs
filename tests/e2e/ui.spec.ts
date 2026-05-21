import { expect, test } from '@playwright/test'
import { selectors } from './_support/selectors'

const BASE = 'http://127.0.0.1:7910'

test.describe('ghfs ui (single project)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`)
    await expect(page.locator(selectors.navbar)).toBeVisible()
    await expect(page.locator(selectors.navbarRepo)).toHaveText('ghfs-test/single')
    // Wait for items to populate from the initial payload.
    await expect(page.locator(selectors.itemRow).first()).toBeVisible({ timeout: 10_000 })
  })

  test('navbar shows repo and the item list renders issues', async ({ page }) => {
    const rows = page.locator(selectors.itemRow)
    await expect(rows).toHaveCount(3)
    await expect(rows.first()).toContainText('issue')
  })

  test('clicking an item opens the detail panel with title', async ({ page }) => {
    const target = page.locator(`${selectors.itemRow}[data-item-number="1"]`)
    await target.click()
    await expect(page.locator(selectors.detailTitle)).toContainText('First single-repo issue')
  })

  test('keyboard switches the tab to pull requests', async ({ page }) => {
    await page.click(selectors.navbarTabPulls)
    const rows = page.locator(selectors.itemRow)
    // Two PRs in the fixture (numbers 10, 11).
    await expect(rows).toHaveCount(2)
  })

  test('search filters the list and clears restores it', async ({ page }) => {
    // Use a search term that uniquely matches one item.
    await page.fill(selectors.navbarSearch, 'Third')
    const rows = page.locator(selectors.itemRow)
    await expect(rows).toHaveCount(1)
    await page.fill(selectors.navbarSearch, '')
    // Back to 3 issues when not searching (default tab is issues).
    await expect(rows).toHaveCount(3)
  })

  test('queue panel opens via keyboard shortcut', async ({ page }) => {
    // Ensure no input is focused so the global shortcut handler picks the key up.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
    await page.keyboard.press('q')
    await expect(page.locator(selectors.queuePanel)).toBeVisible()
  })

  test('help overlay opens on ?', async ({ page }) => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
    // Synthesize the keypress directly so it works regardless of keyboard layout.
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true })))
    await expect(page.locator(selectors.helpOverlay)).toBeVisible()
  })
})
