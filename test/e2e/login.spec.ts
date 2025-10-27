import { test, expect } from '@playwright/test'

test.describe('Login Page Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3003/login')
  })

  test('should load login page correctly', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/App Quayer/)

    // Check Quayer branding
    await expect(page.getByText('Quayer')).toBeVisible()

    // Check login form elements
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password|senha/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /entrar|login/i })).toBeVisible()
  })

  test('should show validation errors for empty form', async ({ page }) => {
    // Click login button without filling fields
    await page.getByRole('button', { name: /entrar|login/i }).click()

    // Wait for validation messages
    await page.waitForTimeout(500)

    // Check for error states (form should prevent submission)
    const emailInput = page.getByLabel(/email/i)
    await expect(emailInput).toHaveAttribute('aria-invalid', 'true')
  })

  test('should allow typing in email and password fields', async ({ page }) => {
    const emailInput = page.getByLabel(/email/i)
    const passwordInput = page.getByLabel(/password|senha/i)

    await emailInput.fill('test@example.com')
    await passwordInput.fill('password123')

    await expect(emailInput).toHaveValue('test@example.com')
    await expect(passwordInput).toHaveValue('password123')
  })

  test('should show/hide password toggle', async ({ page }) => {
    const passwordInput = page.getByLabel(/password|senha/i)
    await passwordInput.fill('secret123')

    // Initially password should be hidden
    await expect(passwordInput).toHaveAttribute('type', 'password')

    // Click toggle button if it exists
    const toggleButton = page.locator('button[aria-label*="show"], button[aria-label*="toggle"]')
    if (await toggleButton.count() > 0) {
      await toggleButton.click()
      await expect(passwordInput).toHaveAttribute('type', 'text')
    }
  })

  test('should display brand message on desktop', async ({ page }) => {
    // Brand message column
    await expect(page.getByText(/Gerencie múltiplas instâncias/i)).toBeVisible()
    await expect(page.getByText(/99.9% Uptime/i)).toBeVisible()
    await expect(page.getByText(/24\/7/i)).toBeVisible()
  })

  test('should be responsive', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await expect(page.getByLabel(/email/i)).toBeVisible()

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 })
    await expect(page.getByLabel(/email/i)).toBeVisible()

    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 })
    await expect(page.getByLabel(/email/i)).toBeVisible()
  })
})