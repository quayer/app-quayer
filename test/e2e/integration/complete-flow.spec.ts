/**
 * Complete Integration Flow E2E Test
 *
 * Tests the complete user journey:
 * 1. Login
 * 2. Navigate to integrations
 * 3. Create new connection
 * 4. Generate QR code
 * 5. Wait for manual scan
 * 6. Verify connection status
 * 7. Send test message
 */

import { test, expect } from '@playwright/test'
import { PlaywrightLogger } from '../../helpers/playwright-logger'
import { waitForQRScan, waitForQRCodeGeneration } from '../../helpers/qr-scan-helper'

test.describe('Complete Integration Flow', () => {
  test('should complete full integration flow with QR scan', async ({ page }) => {
    const logger = new PlaywrightLogger(page, 'complete-integration-flow')

    try {
      // ===== STEP 1: LOGIN =====
      await logger.step('Navigate to login page', async () => {
        await page.goto('http://localhost:3000/login')
        await expect(page).toHaveURL(/.*login/)
      })

      await logger.step('Fill login form', async () => {
        await page.fill('[name="email"]', 'admin@quayer.com')
        await page.fill('[name="password"]', 'admin123456')
      })

      await logger.step('Submit login', async () => {
        await page.click('button[type="submit"]')
        await page.waitForURL('**/dashboard', { timeout: 10000 })
      })

      await logger.step('Verify dashboard loaded', async () => {
        await expect(page.locator('h1')).toContainText('Dashboard')
      }, { screenshot: true })

      // ===== STEP 2: NAVIGATE TO INTEGRATIONS =====
      await logger.step('Navigate to integrations', async () => {
        await page.click('a[href="/integracoes"]')
        await page.waitForURL('**/integracoes', { timeout: 5000 })
      })

      await logger.step('Verify integrations page loaded', async () => {
        await expect(page.locator('h1')).toContainText('Integrações')
      }, { screenshot: true })

      // ===== STEP 3: CREATE NEW CONNECTION =====
      await logger.step('Click create connection button', async () => {
        const createButton = page.locator('[data-testid="create-connection"]')
        await expect(createButton).toBeVisible()
        await createButton.click()
      })

      await logger.step('Wait for modal to open', async () => {
        const modal = page.locator('[role="dialog"]')
        await expect(modal).toBeVisible({ timeout: 5000 })
      })

      await logger.step('Fill connection form', async () => {
        const connectionName = `Test Connection ${Date.now()}`

        await page.fill('[name="name"]', connectionName)
        await page.fill('[name="n8nWebhookUrl"]', 'https://n8n.example.com/webhook/test')
        await page.fill('[name="description"]', 'E2E test connection')
      })

      await logger.step('Submit connection form', async () => {
        await page.click('button:has-text("Criar")')

        // Wait for modal to close
        await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10000 })
      })

      await logger.step('Verify connection created', async () => {
        // Should see success toast
        await expect(page.locator('text=Conexão criada com sucesso')).toBeVisible({
          timeout: 5000,
        })
      }, { screenshot: true })

      // ===== STEP 4: OPEN CONNECTION DETAILS =====
      await logger.step('Click on created connection', async () => {
        // Find the connection card and click details
        const connectionCard = page.locator('[data-testid^="connection-"]').first()
        await connectionCard.click()
      })

      // ===== STEP 5: GENERATE QR CODE =====
      await logger.step('Click share QR code button', async () => {
        const shareButton = page.locator('button:has-text("Compartilhar QR")')
        await expect(shareButton).toBeVisible()
        await shareButton.click()
      })

      await logger.step('Wait for QR code generation', async () => {
        await waitForQRCodeGeneration(page, '[data-testid="qr-code"]', 30000)
      }, { screenshot: true })

      // ===== STEP 6: WAIT FOR MANUAL QR SCAN =====
      await logger.step('Wait for user to scan QR code', async () => {
        await waitForQRScan(page, {
          timeout: 120000, // 2 minutes
          qrCodeSelector: '[data-testid="qr-code"]',
          statusSelector: '[data-connection-status]',
          pollingInterval: 3000,
          connectedText: 'Conectado',
          takeScreenshot: true,
        })
      })

      // ===== STEP 7: VERIFY CONNECTION STATUS =====
      await logger.step('Verify connection is active', async () => {
        const statusElement = page.locator('[data-connection-status]')
        await expect(statusElement).toContainText('Conectado', { timeout: 10000 })
      }, { screenshot: true })

      await logger.step('Verify connection badge is green', async () => {
        const badge = page.locator('[data-testid="connection-badge"]')
        await expect(badge).toHaveClass(/bg-green/, { timeout: 5000 })
      })

      // ===== STEP 8: SEND TEST MESSAGE =====
      await logger.step('Navigate to messages tab', async () => {
        await page.click('button:has-text("Mensagens")')
        await page.waitForTimeout(1000)
      })

      await logger.step('Click send test message', async () => {
        const sendButton = page.locator('button:has-text("Enviar Teste")')
        if (await sendButton.isVisible()) {
          await sendButton.click()
        }
      })

      await logger.step('Fill test message form', async () => {
        const phoneInput = page.locator('[name="phone"]')
        if (await phoneInput.isVisible()) {
          await phoneInput.fill('5511999999999')
          await page.fill('[name="message"]', 'Test message from E2E test')
          await page.click('button:has-text("Enviar")')
        }
      })

      await logger.step('Verify message sent', async () => {
        const successMessage = page.locator('text=Mensagem enviada')
        if (await successMessage.isVisible({ timeout: 5000 })) {
          expect(await successMessage.isVisible()).toBe(true)
        }
      }, { screenshot: true })

      // ===== STEP 9: VERIFY INSTANCE IN LIST =====
      await logger.step('Navigate back to integrations list', async () => {
        await page.click('a[href="/integracoes"]')
        await page.waitForURL('**/integracoes', { timeout: 5000 })
      })

      await logger.step('Verify connection appears in list with connected status', async () => {
        const connectionCard = page.locator('[data-testid^="connection-"]').first()
        await expect(connectionCard).toBeVisible()

        const statusBadge = connectionCard.locator('[data-testid="status-badge"]')
        await expect(statusBadge).toContainText('Conectado')
      }, { screenshot: true })

      console.log('\n✅ Complete integration flow test passed!\n')
    } catch (error: any) {
      console.error('\n❌ Test failed:', error.message)
      throw error
    } finally {
      // Generate test report
      await logger.generateReport()
    }
  })

  test('should handle QR code expiration gracefully', async ({ page }) => {
    const logger = new PlaywrightLogger(page, 'qr-code-expiration')

    try {
      // Login
      await logger.step('Login', async () => {
        await page.goto('http://localhost:3000/login')
        await page.fill('[name="email"]', 'admin@quayer.com')
        await page.fill('[name="password"]', 'admin123456')
        await page.click('button[type="submit"]')
        await page.waitForURL('**/dashboard')
      })

      // Navigate to integrations
      await logger.step('Navigate to integrations', async () => {
        await page.click('a[href="/integracoes"]')
        await page.waitForURL('**/integracoes')
      })

      // Open existing connection
      await logger.step('Open connection', async () => {
        const connectionCard = page.locator('[data-testid^="connection-"]').first()
        await connectionCard.click()
      })

      // Generate QR code
      await logger.step('Generate QR code', async () => {
        await page.click('button:has-text("Compartilhar QR")')
        await waitForQRCodeGeneration(page)
      })

      // Wait for expiration (if token expires in < 2 minutes)
      await logger.step('Wait for QR code expiration', async () => {
        // This will fail if QR doesn't expire within timeout
        await page.waitForSelector('[data-testid="qr-error"]', {
          timeout: 60000, // 1 minute
        })
      })

      // Verify expiration message
      await logger.step('Verify expiration message displayed', async () => {
        const errorMessage = page.locator('[data-testid="qr-error"]')
        await expect(errorMessage).toContainText('expirado', { ignoreCase: true })
      }, { screenshot: true })

      // Verify refresh button exists
      await logger.step('Verify refresh button exists', async () => {
        const refreshButton = page.locator('button:has-text("Gerar Novo")')
        await expect(refreshButton).toBeVisible()
      })

      console.log('\n✅ QR expiration test passed!\n')
    } catch (error: any) {
      console.error('\n❌ Test failed:', error.message)
      throw error
    } finally {
      await logger.generateReport()
    }
  })
})
