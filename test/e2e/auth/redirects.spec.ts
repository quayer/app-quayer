import { test, expect } from '@playwright/test'
import { waitForRedirect } from './helpers'

test.describe('unauth redirects', () => {
  test('unauth /integracoes redirects to /login', async ({ page }) => {
    await page.goto('/integracoes')
    await waitForRedirect(page, /\/login/)
    expect(page.url()).toMatch(/\/login/)
  })

  test('unauth /admin redirects to /login', async ({ page }) => {
    await page.goto('/admin')
    await waitForRedirect(page, /\/login/)
    expect(page.url()).toMatch(/\/login/)
  })
})
