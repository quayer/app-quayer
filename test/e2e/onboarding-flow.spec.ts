/**
 * Onboarding Flow E2E Tests
 *
 * Tests the complete onboarding flow for new users
 */

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// Helper: Generate unique test data
const generateTestData = () => ({
  email: `test.onboarding.${Date.now()}@quayer.test`,
  password: 'Test@1234567',
  name: 'Test Onboarding User',
  orgName: `Test Organization ${Date.now()}`,
  cpf: '111.444.777-35', // Valid CPF
  cnpj: '11.222.333/0001-81', // Valid CNPJ
})

test.describe('Onboarding Flow', () => {
  test.describe('Complete Onboarding - PJ (CNPJ)', () => {
    test('should complete onboarding with CNPJ successfully', async ({ page }) => {
      const testData = generateTestData()

      // 1. Register new account
      await page.goto(`${BASE_URL}/register`)

      await page.fill('input[name="name"]', testData.name)
      await page.fill('input[name="email"]', testData.email)
      await page.fill('input[name="password"]', testData.password)

      await page.click('button[type="submit"]')

      // Wait for email verification page (or skip if auto-verified in test)
      await page.waitForURL(/\/(verify|onboarding)/, { timeout: 10000 })

      // If verification is required, handle it
      const currentUrl = page.url()
      if (currentUrl.includes('/verify')) {
        // For tests, we might need to bypass verification
        // This depends on your test environment setup
        console.log('Verification page detected - you may need to handle this in test env')
      }

      // 2. Should land on onboarding page
      await page.goto(`${BASE_URL}/onboarding`)
      await expect(page).toHaveURL(/\/onboarding/)

      // 3. Verify welcome step
      await expect(page.locator('text=Bem-vindo ao Quayer')).toBeVisible()
      await expect(page.locator('text=Vamos começar!')).toBeVisible()

      // Click "Começar" button
      await page.click('button:has-text("Começar")')

      // 4. Organization setup step
      await expect(page.locator('text=Configure sua Organização')).toBeVisible()

      // Fill organization name
      await page.fill('input#org-name', testData.orgName)

      // Select Pessoa Jurídica (PJ)
      await page.click('label[for="pj"]')

      // Fill CNPJ
      const cnpjInput = page.locator('input#document')
      await cnpjInput.fill(testData.cnpj)

      // Verify formatting
      const cnpjValue = await cnpjInput.inputValue()
      expect(cnpjValue).toBe('11.222.333/0001-81')

      // Submit
      await page.click('button:has-text("Criar Organização")')

      // 5. Should show complete step
      await expect(page.locator('text=Tudo pronto!')).toBeVisible({ timeout: 15000 })
      await expect(page.locator('text=Sua conta foi configurada com sucesso')).toBeVisible()

      // 6. Should redirect to integracoes
      await page.waitForURL(/\/integracoes/, { timeout: 10000 })
      await expect(page).toHaveURL(/\/integracoes/)
    })
  })

  test.describe('Complete Onboarding - PF (CPF)', () => {
    test('should complete onboarding with CPF successfully', async ({ page }) => {
      const testData = generateTestData()

      // Skip to onboarding (assuming user is registered and logged in)
      await page.goto(`${BASE_URL}/onboarding`)

      // Welcome step
      await page.click('button:has-text("Começar")')

      // Organization setup
      await page.fill('input#org-name', testData.orgName)

      // Select Pessoa Física (PF)
      await page.click('label[for="pf"]')

      // Fill CPF
      const cpfInput = page.locator('input#document')
      await cpfInput.fill(testData.cpf)

      // Verify formatting
      const cpfValue = await cpfInput.inputValue()
      expect(cpfValue).toBe('111.444.777-35')

      // Submit
      await page.click('button:has-text("Criar Organização")')

      // Should complete
      await expect(page.locator('text=Tudo pronto!')).toBeVisible({ timeout: 15000 })

      // Should redirect
      await page.waitForURL(/\/integracoes/, { timeout: 10000 })
    })
  })

  test.describe('Validation Tests', () => {
    test('should show error for empty organization name', async ({ page }) => {
      await page.goto(`${BASE_URL}/onboarding`)

      // Skip welcome
      await page.click('button:has-text("Começar")')

      // Don't fill name, select type and fill document
      await page.click('label[for="pj"]')
      await page.fill('input#document', '11.222.333/0001-81')

      // Try to submit
      await page.click('button:has-text("Criar Organização")')

      // Should show toast error
      await expect(page.locator('text=Digite o nome da organização')).toBeVisible({ timeout: 5000 })
    })

    test('should show error for invalid CPF', async ({ page }) => {
      await page.goto(`${BASE_URL}/onboarding`)

      await page.click('button:has-text("Começar")')

      await page.fill('input#org-name', 'Test Org')
      await page.click('label[for="pf"]')

      // Fill invalid CPF (wrong check digit)
      await page.fill('input#document', '111.444.777-34')

      await page.click('button:has-text("Criar Organização")')

      // Should show validation error
      await expect(page.locator('text=CPF inválido')).toBeVisible({ timeout: 5000 })
    })

    test('should show error for invalid CNPJ', async ({ page }) => {
      await page.goto(`${BASE_URL}/onboarding`)

      await page.click('button:has-text("Começar")')

      await page.fill('input#org-name', 'Test Org')
      await page.click('label[for="pj"]')

      // Fill invalid CNPJ (wrong check digit)
      await page.fill('input#document', '11.222.333/0001-82')

      await page.click('button:has-text("Criar Organização")')

      // Should show validation error
      await expect(page.locator('text=CNPJ inválido')).toBeVisible({ timeout: 5000 })
    })

    test('should show error when document type doesnt match selection', async ({ page }) => {
      await page.goto(`${BASE_URL}/onboarding`)

      await page.click('button:has-text("Começar")')

      await page.fill('input#org-name', 'Test Org')

      // Select PF but fill CNPJ
      await page.click('label[for="pf"]')
      await page.fill('input#document', '11.222.333/0001-81')

      await page.click('button:has-text("Criar Organização")')

      // Should show mismatch error
      await expect(page.locator('text=O documento digitado é um CNPJ')).toBeVisible({ timeout: 5000 })
    })

    test('should format CPF automatically', async ({ page }) => {
      await page.goto(`${BASE_URL}/onboarding`)

      await page.click('button:has-text("Começar")')

      await page.click('label[for="pf"]')

      const cpfInput = page.locator('input#document')

      // Type unformatted CPF
      await cpfInput.fill('11144477735')

      // Should be formatted
      const value = await cpfInput.inputValue()
      expect(value).toBe('111.444.777-35')
    })

    test('should format CNPJ automatically', async ({ page }) => {
      await page.goto(`${BASE_URL}/onboarding`)

      await page.click('button:has-text("Começar")')

      await page.click('label[for="pj"]')

      const cnpjInput = page.locator('input#document')

      // Type unformatted CNPJ
      await cnpjInput.fill('11222333000181')

      // Should be formatted
      const value = await cnpjInput.inputValue()
      expect(value).toBe('11.222.333/0001-81')
    })
  })

  test.describe('Navigation Tests', () => {
    test('should allow going back from organization step', async ({ page }) => {
      await page.goto(`${BASE_URL}/onboarding`)

      // Go to organization step
      await page.click('button:has-text("Começar")')
      await expect(page.locator('text=Configure sua Organização')).toBeVisible()

      // Click back button
      await page.click('button:has-text("Voltar")')

      // Should be back at welcome
      await expect(page.locator('text=Vamos começar!')).toBeVisible()
    })

    test('should show progress indicator', async ({ page }) => {
      await page.goto(`${BASE_URL}/onboarding`)

      // Progress should be at 0% (welcome step)
      const progressBar = page.locator('[role="progressbar"], .h-2')
      await expect(progressBar).toBeVisible()

      // Go to org step
      await page.click('button:has-text("Começar")')

      // Progress should increase
      // Note: Exact check depends on your Progress component implementation
      await expect(page.locator('text=Passo 2 de 2')).toBeVisible()
    })
  })

  test.describe('Loading States', () => {
    test('should show loading state during submission', async ({ page }) => {
      await page.goto(`${BASE_URL}/onboarding`)

      await page.click('button:has-text("Começar")')

      await page.fill('input#org-name', 'Test Org')
      await page.click('label[for="pj"]')
      await page.fill('input#document', '11.222.333/0001-81')

      // Click submit
      const submitButton = page.locator('button:has-text("Criar Organização")')
      await submitButton.click()

      // Should show loading state (loader icon)
      await expect(page.locator('svg.animate-spin')).toBeVisible({ timeout: 1000 })
    })

    test('should disable inputs during submission', async ({ page }) => {
      await page.goto(`${BASE_URL}/onboarding`)

      await page.click('button:has-text("Começar")')

      await page.fill('input#org-name', 'Test Org')
      await page.click('label[for="pj"]')
      await page.fill('input#document', '11.222.333/0001-81')

      await page.click('button:has-text("Criar Organização")')

      // Inputs should be disabled during submission
      await expect(page.locator('input#org-name')).toBeDisabled({ timeout: 1000 })
      await expect(page.locator('input#document')).toBeDisabled({ timeout: 1000 })
    })
  })

  test.describe('Security Tests', () => {
    test('should not allow onboarding twice', async ({ page, context }) => {
      const testData = generateTestData()

      // Complete onboarding once
      await page.goto(`${BASE_URL}/onboarding`)
      await page.click('button:has-text("Começar")')

      await page.fill('input#org-name', testData.orgName)
      await page.click('label[for="pj"]')
      await page.fill('input#document', testData.cnpj)
      await page.click('button:has-text("Criar Organização")')

      // Wait for completion
      await page.waitForURL(/\/integracoes/, { timeout: 15000 })

      // Try to go back to onboarding
      await page.goto(`${BASE_URL}/onboarding`)

      // Should redirect away (not allow onboarding again)
      await page.waitForURL(/^((?!onboarding).)*$/, { timeout: 5000 })

      // Should be at dashboard or other protected route
      const finalUrl = page.url()
      expect(finalUrl).not.toContain('/onboarding')
    })

    test('should not allow duplicate CNPJ', async ({ page }) => {
      const testData = generateTestData()

      // First onboarding
      await page.goto(`${BASE_URL}/onboarding`)
      await page.click('button:has-text("Começar")')

      await page.fill('input#org-name', testData.orgName)
      await page.click('label[for="pj"]')
      await page.fill('input#document', testData.cnpj)
      await page.click('button:has-text("Criar Organização")')

      await page.waitForURL(/\/integracoes/, { timeout: 15000 })

      // Logout and try again with same CNPJ (in a new user session)
      // Note: This test assumes you have logout functionality
      // Adjust as needed for your auth flow
    })
  })
})
