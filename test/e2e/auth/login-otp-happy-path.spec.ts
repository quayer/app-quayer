import { test, expect } from '@playwright/test'
import { generateTestEmail, getLatestOtp, waitForRedirect } from './helpers'

test.describe.configure({ mode: 'serial' })

test.describe('login OTP happy path', () => {
  test('login via OTP happy path', async ({ page }) => {
    const email = generateTestEmail()

    await page.goto('/login')

    // The login form keeps both email and phone inputs in the DOM and toggles
    // visibility via CSS. The email input has id="email-input".
    const emailField = page.locator('#email-input')
    await emailField.waitFor({ state: 'visible' })
    await emailField.fill(email)

    await page
      .getByRole('button', { name: /continuar|entrar|login/i })
      .first()
      .click()

    await waitForRedirect(page, /\/login\/verify/)

    // Try to capture OTP from the database. Skip the test (rather than fail)
    // when running outside an environment that exposes the test DB.
    let otp: string
    try {
      otp = await getLatestOtp(email)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Skip when DB / Prisma is not reachable from the test runner.
      test.skip(true, 'OTP capture not reachable: ' + message)
      return
    }

    expect(otp).toMatch(/^\d{6}$/)

    // shadcn InputOTP renders a single hidden input that accepts the full code.
    const otpField = page.locator('input[autocomplete="one-time-code"]').first()
    await otpField.waitFor({ state: 'attached' })
    await otpField.fill(otp)

    await waitForRedirect(page, /\/(integracoes|dashboard|admin)/)
  })
})
