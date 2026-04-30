import { test, expect } from '@playwright/test'
import { generateTestEmail, getLatestOtp, waitForRedirect } from './helpers'

test.describe.configure({ mode: 'serial' })

test.describe('signup OTP happy path', () => {
  test('signup via OTP happy path', async ({ page }) => {
    const email = generateTestEmail()
    const name = 'Test User ' + Math.random().toString(36).slice(2, 6)

    await page.goto('/signup')

    const nameField = page.locator('#name')
    await nameField.waitFor({ state: 'visible' })
    await nameField.fill(name)

    const emailField = page.locator('#email-input, input[name="email"]').first()
    await emailField.waitFor({ state: 'visible' })
    await emailField.fill(email)

    await page
      .getByRole('button', { name: /continuar|criar|cadastrar|signup/i })
      .first()
      .click()

    await waitForRedirect(page, /\/(signup|login)\/verify/)

    let otp: string
    try {
      otp = await getLatestOtp(email)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      test.skip(true, 'OTP capture not reachable: ' + message)
      return
    }

    expect(otp).toMatch(/^\d{6}$/)

    const otpField = page.locator('input[autocomplete="one-time-code"]').first()
    await otpField.waitFor({ state: 'attached' })
    await otpField.fill(otp)

    await waitForRedirect(page, /\/(onboarding|integracoes|dashboard|admin)/)
  })
})
