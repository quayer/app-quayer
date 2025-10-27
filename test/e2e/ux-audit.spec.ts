import { test, expect } from '@playwright/test'

/**
 * UX/Design Audit Test Suite
 * Tests all routes and captures screenshots for design review
 */

test.describe('UX/Design Audit - Route Testing', () => {
  test('should load root page', async ({ page }) => {
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'test-results/screenshots/root-page.png', fullPage: true })

    // Check if page loaded successfully
    expect(await page.title()).toBeTruthy()
  })

  test('should load dashboard page', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'test-results/screenshots/dashboard-page.png', fullPage: true })

    // Check for sidebar presence
    const sidebar = page.locator('[data-sidebar="sidebar"]')
    await expect(sidebar).toBeVisible()
  })

  test('should load login page', async ({ page }) => {
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'test-results/screenshots/login-page.png', fullPage: true })

    // Check for login form
    expect(await page.locator('form').count()).toBeGreaterThan(0)
  })

  test('should load auth/login page', async ({ page }) => {
    await page.goto('http://localhost:3000/auth/login', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'test-results/screenshots/auth-login-page.png', fullPage: true })
  })

  test('should load auth/register page', async ({ page }) => {
    await page.goto('http://localhost:3000/auth/register', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'test-results/screenshots/auth-register-page.png', fullPage: true })
  })

  test('should load dashboard/users page', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard/users', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'test-results/screenshots/dashboard-users-page.png', fullPage: true })
  })
})

test.describe('UX/Design Audit - Sidebar Component', () => {
  test('should display app-sidebar with all navigation items', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    // Check sidebar is visible
    const sidebar = page.locator('[data-sidebar="sidebar"]')
    await expect(sidebar).toBeVisible()

    // Check sidebar header
    const header = sidebar.locator('[data-sidebar="header"]')
    await expect(header).toBeVisible()

    // Check sidebar content
    const content = sidebar.locator('[data-sidebar="content"]')
    await expect(content).toBeVisible()

    // Check sidebar footer
    const footer = sidebar.locator('[data-sidebar="footer"]')
    await expect(footer).toBeVisible()

    await page.screenshot({ path: 'test-results/screenshots/sidebar-expanded.png', fullPage: true })
  })

  test('should toggle sidebar collapse/expand', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    // Find and click sidebar trigger
    const trigger = page.locator('[data-sidebar="trigger"]')
    await expect(trigger).toBeVisible()

    // Capture expanded state
    await page.screenshot({ path: 'test-results/screenshots/sidebar-before-toggle.png', fullPage: true })

    // Click to toggle
    await trigger.click()
    await page.waitForTimeout(300) // Wait for animation

    // Capture collapsed state
    await page.screenshot({ path: 'test-results/screenshots/sidebar-after-toggle.png', fullPage: true })
  })
})

test.describe('UX/Design Audit - Third-party Libraries', () => {
  test('should identify framer-motion usage on dashboard', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    // Check for motion elements (framer-motion adds motion divs)
    const motionElements = await page.locator('[style*="transform"]').count()
    console.log(`Found ${motionElements} elements with transform styles (possible framer-motion)`)
  })

  test('should check for any magic-ui or aceternity components', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    // Check for specific class patterns that might indicate third-party UI libraries
    const magicClasses = await page.locator('[class*="magic"]').count()
    const aceternityClasses = await page.locator('[class*="aceternity"]').count()

    console.log(`Magic UI elements: ${magicClasses}`)
    console.log(`Aceternity elements: ${aceternityClasses}`)
  })
})

test.describe('UX/Design Audit - Design System Consistency', () => {
  test('should verify shadcn/ui components are used', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    // Check for button components
    const buttons = await page.locator('button').count()
    console.log(`Found ${buttons} button elements`)

    // Check for card components
    const cards = await page.locator('[class*="card"]').count()
    console.log(`Found ${cards} card elements`)
  })

  test('should verify theme consistency', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    // Check for CSS variables (indicates proper theme setup)
    const rootStyles = await page.evaluate(() => {
      const root = document.documentElement
      return {
        background: getComputedStyle(root).getPropertyValue('--background'),
        foreground: getComputedStyle(root).getPropertyValue('--foreground'),
        primary: getComputedStyle(root).getPropertyValue('--primary'),
      }
    })

    console.log('Theme variables:', rootStyles)
    expect(rootStyles.background).toBeTruthy()
  })

  test('should check responsive behavior', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    // Desktop view
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.screenshot({ path: 'test-results/screenshots/responsive-desktop.png', fullPage: true })

    // Tablet view
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.screenshot({ path: 'test-results/screenshots/responsive-tablet.png', fullPage: true })

    // Mobile view
    await page.setViewportSize({ width: 375, height: 667 })
    await page.screenshot({ path: 'test-results/screenshots/responsive-mobile.png', fullPage: true })
  })
})