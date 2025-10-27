import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  const baseURL = 'http://localhost:3000'

  test('should load login page', async ({ page }) => {
    await page.goto(`${baseURL}/login`)
    await expect(page).toHaveTitle(/Quayer/)
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('should redirect to login from root when not authenticated', async ({ page }) => {
    await page.goto(`${baseURL}/`)
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login')
  })

  test('should redirect to login from /integracoes when not authenticated', async ({ page }) => {
    await page.goto(`${baseURL}/integracoes`)
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('/login?redirect=%2Fintegracoes')
  })

  test('should register and login successfully', async ({ page }) => {
    // Generate unique email for this test
    const testEmail = `test-${Date.now()}@test.com`
    const testPassword = 'test123456'
    const testName = 'Test User'

    // Go to register page
    await page.goto(`${baseURL}/register`)
    await expect(page.locator('input[type="email"]')).toBeVisible()

    // Fill registration form
    await page.fill('input[name="name"]', testName)
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)

    // Submit registration
    await page.click('button[type="submit"]')

    // Should redirect to /integracoes
    await page.waitForURL(/\/integracoes/, { timeout: 10000 })
    expect(page.url()).toContain('/integracoes')

    // Verify we can see the dashboard
    await expect(page.locator('text=Integrações')).toBeVisible({ timeout: 5000 })
  })

  test('should login with existing user and redirect', async ({ page }) => {
    const testEmail = 'testuser@test.com'
    const testPassword = 'test123456'

    // Go to login page
    await page.goto(`${baseURL}/login`)

    // Fill login form
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)

    // Measure time to redirect
    const startTime = Date.now()

    // Submit login
    await page.click('button[type="submit"]')

    // Wait for redirect to /integracoes
    await page.waitForURL(/\/integracoes/, { timeout: 10000 })

    const redirectTime = Date.now() - startTime

    console.log(`Redirect took ${redirectTime}ms`)

    // Should redirect within reasonable time (< 3 seconds)
    expect(redirectTime).toBeLessThan(3000)

    // Verify we're on integracoes page
    expect(page.url()).toContain('/integracoes')
  })

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto(`${baseURL}/login`)

    await page.fill('input[type="email"]', 'invalid@test.com')
    await page.fill('input[type="password"]', 'wrongpassword')

    await page.click('button[type="submit"]')

    // Should show error message
    await expect(page.locator('text=/erro|inválid/i')).toBeVisible({ timeout: 5000 })
  })
})
