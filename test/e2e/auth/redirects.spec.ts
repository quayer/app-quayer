import { test, expect } from '@playwright/test'
import { waitForRedirect } from './helpers'

test.describe('unauth redirects', () => {
  // @smoke — deterministic, no DB dependency, fastest possible signal.
  // /projetos é a única rota efetivamente protegida pelo middleware atual
  // (ver src/middleware.ts:31 — PROTECTED_PATHS = ['/projetos','/conta','/user']).
  test('unauth /projetos redirects to /login @smoke', async ({ page }) => {
    await page.goto('/projetos')
    await waitForRedirect(page, /\/login/)
    expect(page.url()).toMatch(/\/login/)
  })

  test('unauth /conta redirects to /login @smoke', async ({ page }) => {
    await page.goto('/conta')
    await waitForRedirect(page, /\/login/)
    expect(page.url()).toMatch(/\/login/)
  })
})
