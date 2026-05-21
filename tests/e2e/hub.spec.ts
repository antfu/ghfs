import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { dirname, resolve } from 'pathe'
import { selectors } from './_support/selectors'

const BASE = 'http://127.0.0.1:7911'

const fixturesRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const PRIMARY_HUB_ROOT = resolve(fixturesRoot, 'hub')
const ALT_HUB_ROOT = resolve(fixturesRoot, 'hub-alt')

test.describe('ghfs hub (multi project)', () => {
  test('hub home lists enabled projects', async ({ page }) => {
    await page.goto(`${BASE}/hub`)
    const cards = page.locator(selectors.hubProjectCard)
    await expect(cards).toHaveCount(2, { timeout: 15_000 })
    await expect(cards.filter({ hasText: 'project-a' })).toBeVisible()
    await expect(cards.filter({ hasText: 'project-b' })).toBeVisible()
  })

  test('projects are sorted by most-recent activity first', async ({ page }) => {
    await page.goto(`${BASE}/hub`)
    const cards = page.locator(selectors.hubProjectCard)
    await expect(cards).toHaveCount(2)
    // project-b has a 2026-04 timestamp while project-a has 2026-01.
    await expect(cards.nth(0)).toContainText('project-b')
    await expect(cards.nth(1)).toContainText('project-a')
  })

  test('dashboard summary aggregates open issues and pull requests', async ({ page }) => {
    await page.goto(`${BASE}/hub`)
    const summary = page.locator('[data-testid="hub-summary"]')
    await expect(summary).toBeVisible({ timeout: 10_000 })
    // project-a: 2 open issues + 1 PR.  project-b: 1 issue + 1 PR.
    await expect(summary).toContainText('Open issues')
    await expect(summary).toContainText('3')
    await expect(summary).toContainText('Open pull requests')
    await expect(summary).toContainText('2')
  })

  test('clicking a project routes to its single-project view', async ({ page }) => {
    await page.goto(`${BASE}/hub`)
    await page.locator(selectors.hubProjectCard).filter({ hasText: 'project-a' }).click()
    await expect(page).toHaveURL(/\/hub\/[a-z0-9-]+$/i)
    await expect(page.locator(selectors.navbarRepo)).toHaveText('ghfs-test/project-a')
    await expect(page.locator(selectors.itemRow).first()).toBeVisible()
  })

  test('keyboard ] switches to next project; [ goes back', async ({ page }) => {
    await page.goto(`${BASE}/hub`)
    await page.locator(selectors.hubProjectCard).filter({ hasText: 'project-a' }).click()
    await expect(page.locator(selectors.navbarRepo)).toHaveText('ghfs-test/project-a')
    await page.locator('body').click()
    await page.keyboard.press(']')
    await expect(page.locator(selectors.navbarRepo)).toHaveText('ghfs-test/project-b')
    await page.keyboard.press('[')
    await expect(page.locator(selectors.navbarRepo)).toHaveText('ghfs-test/project-a')
  })

  test('search filters within the current project only', async ({ page }) => {
    await page.goto(`${BASE}/hub`)
    await page.locator(selectors.hubProjectCard).filter({ hasText: 'project-a' }).click()
    await expect(page.locator(selectors.itemRow).first()).toBeVisible()
    await page.fill(selectors.navbarSearch, 'feature ask')
    await expect(page.locator(selectors.itemRow)).toHaveCount(1)
    await expect(page.locator(selectors.itemRow).first()).toContainText('feature ask')
  })

  test('b shortcut returns to hub home', async ({ page }) => {
    await page.goto(`${BASE}/hub`)
    await page.locator(selectors.hubProjectCard).filter({ hasText: 'project-b' }).click()
    await expect(page.locator(selectors.navbarRepo)).toHaveText('ghfs-test/project-b')
    await page.locator('body').click()
    await page.keyboard.press('b')
    await expect(page).toHaveURL(/\/hub$/)
    await expect(page.locator(selectors.hubProjectCard)).toHaveCount(2)
  })

  test('project picker opens via "Manage projects" button', async ({ page }) => {
    await page.goto(`${BASE}/hub`)
    await page.click('[data-testid="hub-open-picker"]')
    await expect(page.locator(selectors.hubProjectPicker)).toBeVisible()
    // Both projects scanned are enabled.
    await expect(page.locator('[data-testid="hub-picker-enabled"]')).toHaveCount(2, { timeout: 10_000 })
  })

  test('changing the hub root updates the dashboard', async ({ page }) => {
    await page.goto(`${BASE}/hub`)
    await expect(page.locator('[data-testid="hub-root-button"]')).toContainText(PRIMARY_HUB_ROOT, { timeout: 10_000 })

    // Open the change-root dialog.
    await page.click('[data-testid="hub-root-button"]')
    await expect(page.locator('[data-testid="hub-root-dialog"]')).toBeVisible()

    // Swap to the alt hub root.
    await page.fill('[data-testid="hub-root-input"]', ALT_HUB_ROOT)
    await page.click('[data-testid="hub-root-apply"]')

    // Dialog closes, dashboard now reflects the alt hub: only project-c.
    await expect(page.locator('[data-testid="hub-root-dialog"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="hub-root-button"]')).toContainText(ALT_HUB_ROOT)
    await expect(page.locator(selectors.hubProjectCard)).toHaveCount(1)
    await expect(page.locator(selectors.hubProjectCard).first()).toContainText('project-c')

    // Restore the primary root so later runs see consistent state.
    await page.click('[data-testid="hub-root-button"]')
    await page.fill('[data-testid="hub-root-input"]', PRIMARY_HUB_ROOT)
    await page.click('[data-testid="hub-root-apply"]')
    await expect(page.locator(selectors.hubProjectCard)).toHaveCount(2)
  })

  test('changing to an invalid path surfaces an error in the dialog', async ({ page }) => {
    await page.goto(`${BASE}/hub`)
    await page.click('[data-testid="hub-root-button"]')
    await page.fill('[data-testid="hub-root-input"]', '/definitely/not/a/real/directory/xyzzy')
    await page.click('[data-testid="hub-root-apply"]')
    await expect(page.locator('[data-testid="hub-root-dialog"]')).toContainText('does not exist')
  })

  test('"Sync all" button is enabled when projects exist and clickable', async ({ page }) => {
    await page.goto(`${BASE}/hub`)
    const btn = page.locator('[data-testid="hub-sync-all"]')
    await expect(btn).toBeVisible({ timeout: 10_000 })
    // Without a real token the sync RPC errors per project; the button should
    // still trigger and reset to its idle label.
    await btn.click()
    await expect(btn).toContainText(/Sync all|Syncing/i)
  })

  test('keyboard shortcuts work from hub home (j focuses first card, b is hub-only)', async ({ page }) => {
    await page.goto(`${BASE}/hub`)
    await expect(page.locator(selectors.hubProjectCard).first()).toBeVisible()
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
    await page.keyboard.press('j')
    // The first card should now be focused (active element).
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
    expect(focused).toBe('hub-project-card')
  })

  test('m shortcut opens the manage-projects picker', async ({ page }) => {
    await page.goto(`${BASE}/hub`)
    await expect(page.locator(selectors.hubProjectCard).first()).toBeVisible()
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
    await page.keyboard.press('m')
    await expect(page.locator(selectors.hubProjectPicker)).toBeVisible()
  })

  test('project switcher dropdown navigates to a different project', async ({ page }) => {
    await page.goto(`${BASE}/hub`)
    await page.locator(selectors.hubProjectCard).filter({ hasText: 'project-a' }).click()
    await expect(page.locator('[data-testid="navbar-repo"]')).toHaveText('ghfs-test/project-a')
    // Open the switcher dropdown from the navbar.
    await page.click('[data-testid="navbar-project-switcher"]')
    await expect(page.locator('[data-testid="navbar-project-switcher-menu"]')).toBeVisible()
    // Pick project-b.
    await page.locator('[data-testid="navbar-project-switcher-item"]').filter({ hasText: 'project-b' }).click()
    await expect(page.locator('[data-testid="navbar-repo"]')).toHaveText('ghfs-test/project-b')
  })

  test('project navigation is non-blocking (no full-screen loader on revisit)', async ({ page }) => {
    await page.goto(`${BASE}/hub`)
    // First visit hydrates project-a.
    await page.locator(selectors.hubProjectCard).filter({ hasText: 'project-a' }).click()
    await expect(page.locator(selectors.itemRow).first()).toBeVisible()
    // Go back to the hub and revisit project-a: the list should still be
    // populated immediately, with no full-screen "Loading…" overlay.
    await page.keyboard.press('b')
    await expect(page.locator(selectors.hubProjectCard).first()).toBeVisible()
    await page.locator(selectors.hubProjectCard).filter({ hasText: 'project-a' }).click()
    await expect(page.locator('[data-testid="project-loading"]')).toHaveCount(0)
    await expect(page.locator(selectors.itemRow).first()).toBeVisible()
  })
})
