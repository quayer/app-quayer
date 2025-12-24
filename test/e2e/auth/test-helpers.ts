import { Page, expect } from '@playwright/test'

/**
 * Test Helpers for Auth E2E Tests
 * Provides utility functions for common auth operations
 */

export interface TestUser {
  name: string
  email: string
  password?: string
  type: 'pf' | 'pj'
  document: string
  orgName: string
}

/**
 * Generate unique test user data
 */
export function generateTestUser(type: 'pf' | 'pj' = 'pf'): TestUser {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(7)

  return {
    name: `Teste ${type.toUpperCase()} ${random}`,
    email: `teste.${timestamp}@quayer.test`,
    password: 'Teste123!',
    type,
    document: type === 'pf' ? '12345678901' : '12345678000195',
    orgName: `Org ${type.toUpperCase()} ${random}`,
  }
}

/**
 * Wait for page to be fully loaded
 */
export async function waitForPageLoad(page: Page, timeout = 10000) {
  await page.waitForLoadState('domcontentloaded', { timeout })
  // Wait for any loading spinners to disappear
  const spinner = page.locator('[class*="animate-spin"], [class*="loading"]').first()
  if (await spinner.isVisible({ timeout: 1000 }).catch(() => false)) {
    await spinner.waitFor({ state: 'hidden', timeout })
  }
}

/**
 * Take screenshot with descriptive name
 */
export async function screenshot(page: Page, name: string, step: number) {
  const fileName = `${step.toString().padStart(2, '0')}-${name}`
  await page.screenshot({
    path: `test-results/screenshots/${fileName}.png`,
    fullPage: true
  })
  console.log(`📸 Screenshot: ${fileName}`)
}

/**
 * Fill OTP input (6 digits)
 */
export async function fillOTP(page: Page, code: string) {
  // Try different OTP input patterns
  const otpInputs = page.locator('input[type="text"], input[inputmode="numeric"]')
  const count = await otpInputs.count()

  if (count >= 6) {
    // Individual digit inputs
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill(code[i])
    }
  } else {
    // Single input field
    const singleInput = page.locator('input').first()
    await singleInput.fill(code)
  }
}

/**
 * Check if element exists and is visible
 */
export async function elementExists(page: Page, selector: string): Promise<boolean> {
  return await page.locator(selector).isVisible({ timeout: 3000 }).catch(() => false)
}

/**
 * Wait for toast notification
 */
export async function waitForToast(page: Page, type: 'success' | 'error' | 'any' = 'any') {
  const toastSelectors = {
    success: '[data-sonner-toast][data-type="success"], [class*="toast"][class*="success"]',
    error: '[data-sonner-toast][data-type="error"], [class*="toast"][class*="error"]',
    any: '[data-sonner-toast], [class*="toast"]'
  }

  await page.locator(toastSelectors[type]).first().waitFor({
    state: 'visible',
    timeout: 5000
  }).catch(() => {
    console.log(`⚠️ Toast not found: ${type}`)
  })
}

/**
 * Get current URL path
 */
export function getCurrentPath(page: Page): string {
  const url = new URL(page.url())
  return url.pathname
}

/**
 * Assert URL contains path
 */
export async function assertUrlContains(page: Page, path: string, timeout = 10000) {
  await expect(page).toHaveURL(new RegExp(path), { timeout })
}

/**
 * Log test step
 */
export function logStep(step: number, description: string) {
  console.log(`\n📋 STEP ${step}: ${description}`)
  console.log('─'.repeat(50))
}

/**
 * Log bug found
 */
export function logBug(severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW', description: string, details?: string) {
  console.log(`\n🐛 BUG [${severity}]: ${description}`)
  if (details) {
    console.log(`   Details: ${details}`)
  }
}

/**
 * Log success
 */
export function logSuccess(description: string) {
  console.log(`✅ ${description}`)
}

/**
 * Log warning
 */
export function logWarning(description: string) {
  console.log(`⚠️ WARNING: ${description}`)
}
