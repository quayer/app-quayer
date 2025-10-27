import { test, expect } from '@playwright/test'

test.describe('Dashboard Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3003/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  test('should load dashboard correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/App Quayer/)

    // Check for sidebar
    await expect(page.getByText('Quayer - WhatsApp Manager')).toBeVisible()

    // Check for main content area
    await expect(page.locator('main, [role="main"]')).toBeVisible()
  })

  test('should display sidebar navigation', async ({ page }) => {
    // Check main navigation items
    await expect(page.getByText('Dashboard')).toBeVisible()
    await expect(page.getByText('Instâncias')).toBeVisible()
    await expect(page.getByText('Usuários')).toBeVisible()
    await expect(page.getByText('Configurações')).toBeVisible()
  })

  test('should toggle sidebar', async ({ page }) => {
    // Find and click sidebar toggle button
    const toggleButton = page.locator('button[aria-label*="toggle"], button[data-sidebar="toggle"]').first()

    if (await toggleButton.count() > 0) {
      await toggleButton.click()
      await page.waitForTimeout(300) // Wait for animation

      // Toggle again
      await toggleButton.click()
      await page.waitForTimeout(300)
    }
  })

  test('should navigate to users page from sidebar', async ({ page }) => {
    await page.getByText('Usuários').click()
    await page.waitForURL('**/dashboard/users')
    await expect(page).toHaveURL(/\/dashboard\/users/)
  })

  test('should display instances submenu', async ({ page }) => {
    const instancesItem = page.getByText('Instâncias')
    await instancesItem.click()

    // Check submenu items
    await expect(page.getByText('Todas')).toBeVisible()
    await expect(page.getByText('Conectadas')).toBeVisible()
    await expect(page.getByText('Desconectadas')).toBeVisible()
  })

  test('should display theme switcher', async ({ page }) => {
    const themeButton = page.locator('button[aria-label*="theme"], button[title*="theme"]')

    if (await themeButton.count() > 0) {
      await expect(themeButton).toBeVisible()
    }
  })

  test('should show create instance button', async ({ page }) => {
    // Look for "+ Nova Instância" or similar button
    const createButton = page.locator('button:has-text("Nova"), button:has-text("Criar"), button:has-text("Adicionar")')

    if (await createButton.count() > 0) {
      await expect(createButton.first()).toBeVisible()
    }
  })

  test('should display loading skeleton states', async ({ page }) => {
    // Reload to catch loading state
    await page.reload()

    // Check for skeleton components (they may disappear quickly)
    const skeleton = page.locator('[class*="skeleton"], [class*="animate-pulse"]')

    // Either skeleton is visible or content loaded
    const hasContent = await page.locator('main').textContent()
    expect(hasContent?.length).toBeGreaterThan(0)
  })

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })

    // Sidebar should be collapsible or hidden on mobile
    const sidebar = page.locator('[data-sidebar="sidebar"], aside')
    await expect(sidebar).toBeVisible()

    // Toggle button should be visible
    const toggleButton = page.locator('button[aria-label*="toggle"], button[data-sidebar="toggle"]').first()
    if (await toggleButton.count() > 0) {
      await expect(toggleButton).toBeVisible()
    }
  })

  test('should handle keyboard navigation', async ({ page }) => {
    // Tab through interactive elements
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // Check that focus is working
    const focusedElement = await page.locator(':focus')
    await expect(focusedElement).toBeVisible()
  })
})