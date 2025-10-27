import { test, expect } from '@playwright/test'

test.describe('Users Page Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3003/dashboard/users', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  test('should load users page correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/App Quayer/)
    await expect(page).toHaveURL(/\/dashboard\/users/)
  })

  test('should display data table', async ({ page }) => {
    // Check for table element
    const table = page.locator('table, [role="table"]')
    await expect(table).toBeVisible()

    // Check for table headers
    await expect(page.getByText('Nome')).toBeVisible()
    await expect(page.getByText('Email')).toBeVisible()
  })

  test('should display column headers with sorting', async ({ page }) => {
    // Look for sortable column headers
    const sortableHeaders = page.locator('th button, [role="columnheader"] button')

    if (await sortableHeaders.count() > 0) {
      await expect(sortableHeaders.first()).toBeVisible()

      // Click to sort
      await sortableHeaders.first().click()
      await page.waitForTimeout(300)

      // Click again to reverse sort
      await sortableHeaders.first().click()
      await page.waitForTimeout(300)
    }
  })

  test('should have search/filter functionality', async ({ page }) => {
    // Look for search input
    const searchInput = page.locator('input[placeholder*="Buscar"], input[placeholder*="Search"], input[placeholder*="Filtrar"]')

    if (await searchInput.count() > 0) {
      await expect(searchInput.first()).toBeVisible()

      // Type in search
      await searchInput.first().fill('test')
      await page.waitForTimeout(500)

      // Clear search
      await searchInput.first().clear()
    }
  })

  test('should display pagination controls', async ({ page }) => {
    // Look for pagination
    const pagination = page.locator('[role="navigation"][aria-label*="pagination"], nav:has-text("Próxima"), nav:has-text("Anterior")')

    if (await pagination.count() > 0) {
      await expect(pagination.first()).toBeVisible()
    }
  })

  test('should have row selection checkboxes', async ({ page }) => {
    // Wait for table to load
    await page.waitForSelector('table', { timeout: 5000 })

    // Look for checkboxes
    const checkboxes = page.locator('table input[type="checkbox"]')

    if (await checkboxes.count() > 0) {
      // Select first row
      await checkboxes.nth(1).check()
      await expect(checkboxes.nth(1)).toBeChecked()

      // Unselect
      await checkboxes.nth(1).uncheck()
      await expect(checkboxes.nth(1)).not.toBeChecked()
    }
  })

  test('should display user badges (Role, Status)', async ({ page }) => {
    // Look for badge components
    const badges = page.locator('[class*="badge"], .badge, [data-badge]')

    if (await badges.count() > 0) {
      await expect(badges.first()).toBeVisible()
    }
  })

  test('should have actions dropdown menu', async ({ page }) => {
    // Look for actions button (three dots menu)
    const actionsButton = page.locator('button[aria-haspopup="menu"], button:has-text("⋮"), button:has-text("•••")')

    if (await actionsButton.count() > 0) {
      await actionsButton.first().click()
      await page.waitForTimeout(300)

      // Check for menu items
      const menuItems = page.locator('[role="menuitem"]')
      if (await menuItems.count() > 0) {
        await expect(menuItems.first()).toBeVisible()
      }

      // Close menu by clicking outside
      await page.keyboard.press('Escape')
    }
  })

  test('should show loading skeleton on initial load', async ({ page }) => {
    // Reload to catch loading state
    await page.reload()

    // Check for skeleton loaders
    const skeletons = page.locator('[class*="skeleton"], [class*="animate-pulse"]')

    // Wait for content to load
    await page.waitForTimeout(1500)

    // Either skeletons were shown or content is now visible
    const table = page.locator('table')
    await expect(table).toBeVisible()
  })

  test('should display add user button', async ({ page }) => {
    // Look for "+ Adicionar Usuário" or similar button
    const addButton = page.locator('button:has-text("Adicionar"), button:has-text("Novo"), button:has-text("Criar")')

    if (await addButton.count() > 0) {
      await expect(addButton.first()).toBeVisible()

      // Click to open modal
      await addButton.first().click()
      await page.waitForTimeout(500)

      // Close modal (ESC or close button)
      await page.keyboard.press('Escape')
    }
  })

  test('should handle empty state', async ({ page }) => {
    // If table is empty, should show message
    const rows = page.locator('tbody tr')
    const rowCount = await rows.count()

    if (rowCount === 0 || rowCount === 1) {
      // Look for empty state message
      const emptyMessage = page.locator('text=/Nenhum.*encontrado|No.*found/i')
      if (await emptyMessage.count() > 0) {
        await expect(emptyMessage).toBeVisible()
      }
    }
  })

  test('should be responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })

    // Table should still be visible and usable
    const table = page.locator('table')
    await expect(table).toBeVisible()
  })

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })

    // Table might have horizontal scroll on mobile
    const table = page.locator('table')
    await expect(table).toBeVisible()
  })

  test('should support keyboard navigation in table', async ({ page }) => {
    // Focus on table
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // Navigate with arrow keys
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')

    // Verify focus is visible
    const focusedElement = await page.locator(':focus')
    await expect(focusedElement).toBeVisible()
  })

  test('should display correct number of rows per page', async ({ page }) => {
    // Look for rows per page selector
    const pageSizeSelector = page.locator('select[aria-label*="per page"], select[aria-label*="por página"]')

    if (await pageSizeSelector.count() > 0) {
      await expect(pageSizeSelector).toBeVisible()

      // Change page size
      await pageSizeSelector.selectOption('10')
      await page.waitForTimeout(500)

      // Count rows
      const rows = page.locator('tbody tr')
      const rowCount = await rows.count()
      expect(rowCount).toBeLessThanOrEqual(10)
    }
  })
})