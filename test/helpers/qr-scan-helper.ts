/**
 * QR Scan Helper
 *
 * Handles manual QR code scanning during E2E tests
 * - Pauses test execution
 * - Displays instructions to user
 * - Polls for connection status
 * - Resumes test automatically when connected
 *
 * Usage:
 * ```typescript
 * import { waitForQRScan } from './helpers/qr-scan-helper'
 *
 * test('Complete integration flow', async ({ page }) => {
 *   // ... create integration ...
 *
 *   // Pause for manual QR scan
 *   await waitForQRScan(page, {
 *     timeout: 120000, // 2 minutes
 *     qrCodeSelector: '[data-testid="qr-code"]',
 *     statusSelector: '[data-connection-status]',
 *   })
 *
 *   // Test continues after connection
 *   await expect(page.locator('[data-testid="status"]')).toContainText('Conectado')
 * })
 * ```
 */

import { Page, expect } from '@playwright/test'

export interface QRScanOptions {
  /**
   * Maximum time to wait for QR scan (milliseconds)
   * Default: 120000 (2 minutes)
   */
  timeout?: number

  /**
   * CSS selector for QR code element
   * Default: '[data-testid="qr-code"]'
   */
  qrCodeSelector?: string

  /**
   * CSS selector for connection status element
   * Default: '[data-connection-status]'
   */
  statusSelector?: string

  /**
   * Polling interval to check connection status (milliseconds)
   * Default: 3000 (3 seconds)
   */
  pollingInterval?: number

  /**
   * Expected status text when connected
   * Default: 'Conectado'
   */
  connectedText?: string

  /**
   * Take screenshot of QR code
   * Default: true
   */
  takeScreenshot?: boolean
}

const DEFAULT_OPTIONS: Required<QRScanOptions> = {
  timeout: 120000, // 2 minutes
  qrCodeSelector: '[data-testid="qr-code"]',
  statusSelector: '[data-connection-status]',
  pollingInterval: 3000, // 3 seconds
  connectedText: 'Conectado',
  takeScreenshot: true,
}

/**
 * Wait for manual QR code scan
 *
 * This function pauses test execution and displays instructions
 * for the user to scan the QR code with their WhatsApp.
 *
 * It then polls the connection status until WhatsApp is connected
 * or the timeout is reached.
 */
export async function waitForQRScan(
  page: Page,
  options: QRScanOptions = {}
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  console.log('\n' + '='.repeat(80))
  console.log('🔶 MANUAL ACTION REQUIRED - QR CODE SCAN')
  console.log('='.repeat(80))
  console.log('')
  console.log('📱 Please follow these steps:')
  console.log('')
  console.log('1. Open WhatsApp on your phone')
  console.log('2. Go to Settings > Linked Devices')
  console.log('3. Tap "Link a Device"')
  console.log('4. Scan the QR code displayed on the screen')
  console.log('')
  console.log(`⏱️  Timeout: ${opts.timeout / 1000} seconds`)
  console.log('⏸️  Test execution is paused...')
  console.log('')
  console.log('='.repeat(80) + '\n')

  // Wait for QR code to be visible
  const qrCodeElement = page.locator(opts.qrCodeSelector)
  await expect(qrCodeElement).toBeVisible({ timeout: 10000 })

  console.log('✅ QR code is visible on screen')

  // Take screenshot of QR code if enabled
  if (opts.takeScreenshot) {
    const screenshotPath = `test-screenshots/qr-code-${Date.now()}.png`
    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
    })
    console.log(`📸 QR code screenshot saved: ${screenshotPath}`)
  }

  // Start polling for connection status
  const startTime = Date.now()
  let connected = false
  let lastStatus = ''

  console.log('\n🔄 Polling connection status...\n')

  while (!connected && Date.now() - startTime < opts.timeout) {
    try {
      // Check status element
      const statusElement = page.locator(opts.statusSelector)
      const isVisible = await statusElement.isVisible()

      if (isVisible) {
        const statusText = await statusElement.textContent()

        // Log status change
        if (statusText !== lastStatus) {
          console.log(`📊 Status update: "${statusText}"`)
          lastStatus = statusText || ''
        }

        // Check if connected
        if (statusText?.includes(opts.connectedText)) {
          connected = true
          break
        }
      }
    } catch (error) {
      // Ignore errors during polling
      console.log('⚠️  Status check failed, retrying...')
    }

    // Wait before next poll
    await page.waitForTimeout(opts.pollingInterval)

    // Show progress
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    const remaining = Math.floor((opts.timeout - (Date.now() - startTime)) / 1000)
    process.stdout.write(`\r⏱️  Elapsed: ${elapsed}s | Remaining: ${remaining}s`)
  }

  console.log('\n') // New line after progress

  if (!connected) {
    throw new Error(
      `QR scan timeout after ${opts.timeout / 1000} seconds. WhatsApp was not connected.`
    )
  }

  console.log('\n' + '='.repeat(80))
  console.log('✅ QR CODE SCANNED SUCCESSFULLY')
  console.log('='.repeat(80))
  console.log(`⏱️  Connection time: ${Math.floor((Date.now() - startTime) / 1000)} seconds`)
  console.log('▶️  Test execution resumed...')
  console.log('='.repeat(80) + '\n')

  // Wait a bit for UI to update
  await page.waitForTimeout(2000)
}

/**
 * Check if QR code is expired
 */
export async function isQRCodeExpired(
  page: Page,
  errorSelector: string = '[data-testid="qr-error"]'
): Promise<boolean> {
  const errorElement = page.locator(errorSelector)
  const isVisible = await errorElement.isVisible().catch(() => false)

  if (isVisible) {
    const errorText = await errorElement.textContent()
    return errorText?.toLowerCase().includes('expirado') || false
  }

  return false
}

/**
 * Wait for QR code to be generated
 */
export async function waitForQRCodeGeneration(
  page: Page,
  qrCodeSelector: string = '[data-testid="qr-code"]',
  timeout: number = 30000
): Promise<void> {
  console.log('⏳ Waiting for QR code generation...')

  const qrCodeElement = page.locator(qrCodeSelector)
  await expect(qrCodeElement).toBeVisible({ timeout })

  console.log('✅ QR code generated successfully')
}

/**
 * Refresh QR code if expired
 */
export async function refreshQRCodeIfExpired(
  page: Page,
  refreshButtonSelector: string = '[data-testid="refresh-qr"]'
): Promise<boolean> {
  const isExpired = await isQRCodeExpired(page)

  if (isExpired) {
    console.log('⚠️  QR code expired, refreshing...')

    const refreshButton = page.locator(refreshButtonSelector)
    await refreshButton.click()

    await waitForQRCodeGeneration(page)

    console.log('✅ QR code refreshed')
    return true
  }

  return false
}
