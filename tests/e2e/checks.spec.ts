import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

test('PR checks show saved results and links, support keyboard navigation and survive reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:7914/')
  await selectPull(page, 10)
  await page.getByTestId('pr-checks-tab').click()
  const checks = page.getByTestId('pr-checks')
  await expect(checks.getByTestId('pr-check-row')).toHaveCount(5)
  await expect(checks).toContainText('success')
  await expect(checks).toContainText('failure')
  await expect(checks).toContainText('in progress')
  await expect(checks).toContainText('neutral')
  await expect(checks).toContainText('pending')
  await expect(checks).toContainText('Waiting for deployment')
  await expect(checks.getByTestId('pr-checks-sha')).toHaveText('abc1234')
  await expect(checks.getByRole('link', { name: 'Unit tests: open details' })).toHaveAttribute('href', 'https://example.com/ci/tests')
  await expect(checks.getByRole('link', { name: 'deploy/preview: open details' })).toHaveAttribute('href', 'https://example.com/preview')
  await checks.getByRole('link', { name: 'Unit tests: open details' }).focus()
  await expect(checks.getByRole('link', { name: 'Unit tests: open details' })).toBeFocused()
  await page.context().route('https://example.com/ci/tests', route => route.fulfill({ body: 'CI details' }))
  const popupPromise = page.waitForEvent('popup')
  await checks.getByRole('link', { name: 'Unit tests: open details' }).press('Enter')
  const popup = await popupPromise
  await expect(popup).toHaveURL('https://example.com/ci/tests')
  await popup.close()
  await page.getByRole('tab', { name: /Conversation/ }).click()
  await page.keyboard.press('h')
  await expect(page.getByTestId('pr-checks-tab')).toHaveAttribute('data-state', 'active')
  await expect.poll(async () => {
    const { readFile } = await import('node:fs/promises')
    const saved = await readFile('tests/e2e/fixtures/checks/.ghfs/.ui.json', 'utf8').catch(() => '{}')
    return JSON.parse(saved).lastPrTab
  }).toBe('checks')
  await page.reload()
  await selectPull(page, 10)
  await expect(checks.getByTestId('pr-check-row')).toHaveCount(5)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(checks.getByRole('link', { name: 'Unit tests: open details' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('PR checks distinguish an empty snapshot from checks that have not synced', async ({ page }) => {
  await page.goto('http://127.0.0.1:7914/')
  await selectPull(page, 11)
  await page.getByTestId('pr-checks-tab').click()
  await expect(page.getByTestId('pr-checks-empty')).toBeVisible()
  await expect(page.getByTestId('pr-checks-unsynced')).toHaveCount(0)
  await selectPull(page, 12)
  await page.getByTestId('pr-checks-tab').click()
  await expect(page.getByTestId('pr-checks-unsynced')).toBeVisible()
  await expect(page.getByTestId('pr-checks-empty')).toHaveCount(0)
  await page.getByRole('button', { name: /^Issues/ }).click()
  await page.locator('[data-testid="item-row"][data-item-number="1"]').click()
  await expect(page.getByTestId('pr-checks-tab')).toHaveCount(0)
})

async function selectPull(page: Page, number: number) {
  await page.getByRole('button', { name: /^Pulls/ }).click()
  await page.locator(`[data-testid="item-row"][data-item-number="${number}"]`).click()
}
