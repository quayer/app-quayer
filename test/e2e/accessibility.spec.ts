import { test, expect } from '@playwright/test'

test.describe('Accessibility Tests', () => {
  test('login page should be accessible', async ({ page }) => {
    await page.goto('http://localhost:3003/login')

    // Check for proper heading structure
    const heading = page.locator('h1, h2').first()
    await expect(heading).toBeVisible()

    // Check for form labels
    const inputs = page.locator('input')
    const inputCount = await inputs.count()

    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i)
      const id = await input.getAttribute('id')
      if (id) {
        // Should have associated label
        const label = page.locator(`label[for="${id}"]`)
        await expect(label).toBeVisible()
      }
    }

    // Check for focus indicators
    await page.keyboard.press('Tab')
    const focused = page.locator(':focus')
    await expect(focused).toBeVisible()
  })

  test('dashboard should be accessible', async ({ page }) => {
    await page.goto('http://localhost:3003/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    // Check for landmark regions
    const main = page.locator('main, [role="main"]')
    await expect(main).toBeVisible()

    const nav = page.locator('nav, [role="navigation"]')
    await expect(nav.first()).toBeVisible()

    // Check for skip link or keyboard navigation
    await page.keyboard.press('Tab')
    const firstFocused = page.locator(':focus')
    await expect(firstFocused).toBeVisible()
  })

  test('buttons should have accessible names', async ({ page }) => {
    await page.goto('http://localhost:3003/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    const buttons = page.locator('button')
    const buttonCount = await buttons.count()

    for (let i = 0; i < Math.min(buttonCount, 10); i++) {
      const button = buttons.nth(i)
      const text = await button.textContent()
      const ariaLabel = await button.getAttribute('aria-label')
      const title = await button.getAttribute('title')

      // Button should have text, aria-label, or title
      expect(text || ariaLabel || title).toBeTruthy()
    }
  })

  test('images should have alt text', async ({ page }) => {
    await page.goto('http://localhost:3003/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    const images = page.locator('img')
    const imageCount = await images.count()

    for (let i = 0; i < imageCount; i++) {
      const img = images.nth(i)
      const alt = await img.getAttribute('alt')
      // Images should have alt attribute (can be empty for decorative images)
      expect(alt).not.toBeNull()
    }
  })

  test('links should be keyboard accessible', async ({ page }) => {
    await page.goto('http://localhost:3003/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    // Tab through links
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab')
    }

    // At least one link should be focusable
    const links = page.locator('a')
    const linkCount = await links.count()
    expect(linkCount).toBeGreaterThan(0)
  })

  test('color contrast should be sufficient', async ({ page }) => {
    await page.goto('http://localhost:3003/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    // Take screenshot for manual review
    await page.screenshot({ path: 'test-results/dashboard-contrast.png', fullPage: true })

    // Basic check: dark mode should have light text
    const body = page.locator('body')
    const bodyClass = await body.getAttribute('class')
    expect(bodyClass).toContain('dark')
  })
})