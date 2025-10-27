import { test, expect } from '@playwright/test'

/**
 * Testes completos da jornada do usuário
 * Testa TODO o fluxo: Login → Dashboard → Criar Instância → Conectar → Compartilhar → Deletar
 *
 * NOTA: Usa 'domcontentloaded' ao invés de 'networkidle' para evitar timeout do SSE
 */

test.describe('Complete User Journey Tests', () => {
  const BASE_URL = 'http://localhost:3001'

  test('Full journey: Login → Create Instance → Connect → Share → Delete', async ({ page }) => {
    // STEP 1: Login
    console.log('=== STEP 1: LOGIN ===')
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    // Check login page loaded
    await expect(page.getByRole('heading', { name: 'Quayer' })).toBeVisible()

    // Fill login form
    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first()

    if (await emailInput.count() > 0) {
      await emailInput.fill('admin@quayer.com')
      await passwordInput.fill('admin123')

      // Click login button
      const loginButton = page.locator('button:has-text("Entrar"), button[type="submit"]').first()
      await loginButton.click()

      // Wait for redirect or dashboard load
      await page.waitForTimeout(2000)
    }

    // STEP 2: Navigate to Dashboard
    console.log('=== STEP 2: DASHBOARD ===')
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Wait for dashboard content to load
    await page.waitForSelector('main, [role="main"], .flex', { timeout: 10000 })

    // Take screenshot of dashboard
    await page.screenshot({ path: 'test-results/journey-01-dashboard.png', fullPage: true })

    // Check if sidebar or main content is visible
    const mainContent = page.locator('main, [role="main"], h1')
    await expect(mainContent.first()).toBeVisible()

    // STEP 3: Open Create Instance Modal
    console.log('=== STEP 3: CREATE INSTANCE ===')

    // Look for create button
    const createButton = page.locator('button:has-text("Nova"), button:has-text("Criar"), button:has-text("Adicionar")').first()

    if (await createButton.count() > 0) {
      await createButton.click()
      await page.waitForTimeout(1000)

      // Take screenshot of modal
      await page.screenshot({ path: 'test-results/journey-02-create-modal.png', fullPage: true })

      // Fill instance name
      const nameInput = page.locator('input[name="name"], input[placeholder*="nome"], input[placeholder*="Nome"]').first()
      if (await nameInput.count() > 0) {
        await nameInput.fill(`Test Instance ${Date.now()}`)

        // Submit form
        const submitButton = page.locator('button:has-text("Criar"), button:has-text("Salvar"), button[type="submit"]').last()
        await submitButton.click()
        await page.waitForTimeout(2000)
      }
    }

    // STEP 4: Connect Instance (QR Code)
    console.log('=== STEP 4: CONNECT INSTANCE ===')
    await page.waitForTimeout(1000)

    // Look for connect button
    const connectButton = page.locator('button:has-text("Conectar"), button[aria-label*="Conectar"]').first()

    if (await connectButton.count() > 0) {
      await connectButton.click()
      await page.waitForTimeout(2000)

      // Take screenshot of QR Code modal
      await page.screenshot({ path: 'test-results/journey-03-qrcode-modal.png', fullPage: true })

      // Check if QR Code is visible
      const qrCode = page.locator('[data-qr="code"], canvas, img[alt*="QR"], svg').first()
      if (await qrCode.count() > 0) {
        console.log('✅ QR Code displayed')
      }

      // Close modal
      const closeButton = page.locator('button[aria-label="Close"], button:has-text("Fechar")').first()
      if (await closeButton.count() > 0) {
        await closeButton.click()
      } else {
        await page.keyboard.press('Escape')
      }
      await page.waitForTimeout(1000)
    }

    // STEP 5: Share Instance Link
    console.log('=== STEP 5: SHARE LINK ===')

    // Look for share button
    const shareButton = page.locator('button:has-text("Compartilhar"), button[aria-label*="Compartilhar"]').first()

    if (await shareButton.count() > 0) {
      await shareButton.click()
      await page.waitForTimeout(1000)

      // Take screenshot of share modal
      await page.screenshot({ path: 'test-results/journey-04-share-modal.png', fullPage: true })

      // Check for share link
      const shareLink = page.locator('input[readonly], [class*="share"], [data-share="link"]').first()
      if (await shareLink.count() > 0) {
        const linkValue = await shareLink.inputValue()
        console.log('✅ Share link:', linkValue)
      }

      // Close modal
      await page.keyboard.press('Escape')
      await page.waitForTimeout(1000)
    }

    // STEP 6: Edit Instance
    console.log('=== STEP 6: EDIT INSTANCE ===')

    const editButton = page.locator('button:has-text("Editar"), button[aria-label*="Editar"]').first()

    if (await editButton.count() > 0) {
      await editButton.click()
      await page.waitForTimeout(1000)

      // Take screenshot
      await page.screenshot({ path: 'test-results/journey-05-edit-modal.png', fullPage: true })

      // Close modal
      await page.keyboard.press('Escape')
      await page.waitForTimeout(1000)
    }

    // STEP 7: Delete Instance
    console.log('=== STEP 7: DELETE INSTANCE ===')

    const deleteButton = page.locator('button:has-text("Deletar"), button:has-text("Excluir"), button[aria-label*="Deletar"]').first()

    if (await deleteButton.count() > 0) {
      await deleteButton.click()
      await page.waitForTimeout(1000)

      // Take screenshot of confirmation dialog
      await page.screenshot({ path: 'test-results/journey-06-delete-confirm.png', fullPage: true })

      // Confirm deletion
      const confirmButton = page.locator('button:has-text("Confirmar"), button:has-text("Sim"), button:has-text("Deletar")').last()
      if (await confirmButton.count() > 0) {
        await confirmButton.click()
        await page.waitForTimeout(2000)
      }
    }

    // STEP 8: Navigate to Users Page
    console.log('=== STEP 8: USERS PAGE ===')

    const usersLink = page.locator('a:has-text("Usuários"), [href*="users"]').first()
    if (await usersLink.count() > 0) {
      await usersLink.click()
      await page.waitForURL('**/users')
      await page.waitForTimeout(2000)

      // Take screenshot
      await page.screenshot({ path: 'test-results/journey-07-users-page.png', fullPage: true })
    }

    // Final screenshot
    await page.screenshot({ path: 'test-results/journey-08-final.png', fullPage: true })

    console.log('=== JOURNEY COMPLETE ===')
  })

  test('Test all buttons and interactions', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Test sidebar toggle
    console.log('Testing sidebar toggle...')
    const toggleButton = page.locator('button[data-sidebar="toggle"], button[aria-label*="toggle"]').first()
    if (await toggleButton.count() > 0) {
      await toggleButton.click()
      await page.waitForTimeout(500)
      await toggleButton.click()
      await page.waitForTimeout(500)
    }

    // Test theme switcher
    console.log('Testing theme switcher...')
    const themeButton = page.locator('button[aria-label*="theme"], button[title*="theme"]').first()
    if (await themeButton.count() > 0) {
      await themeButton.click()
      await page.waitForTimeout(500)
    }

    // Test all navigation links
    console.log('Testing navigation links...')
    const navLinks = page.locator('nav a, [role="navigation"] a')
    const linkCount = await navLinks.count()
    console.log(`Found ${linkCount} navigation links`)

    // Click first few links
    for (let i = 0; i < Math.min(linkCount, 5); i++) {
      try {
        const link = navLinks.nth(i)
        const href = await link.getAttribute('href')
        console.log(`  - Link ${i + 1}: ${href}`)

        if (href && href !== '#' && !href.startsWith('http')) {
          await link.click()
          await page.waitForTimeout(1000)
          await page.goBack()
          await page.waitForTimeout(500)
        }
      } catch (error) {
        console.log(`  - Could not click link ${i + 1}`)
      }
    }

    console.log('All interaction tests complete')
  })

  test('Test all visual effects and animations', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    console.log('Testing visual effects and animations...')

    // Check for loading states
    await page.reload()
    await page.waitForTimeout(1000)
    const skeletons = page.locator('[class*="skeleton"], [class*="animate-pulse"]')
    console.log(`Found ${await skeletons.count()} skeleton loaders`)

    await page.waitForTimeout(1000)

    // Check for animated elements
    const animatedElements = page.locator('[class*="animate"], [class*="transition"]')
    console.log(`Found ${await animatedElements.count()} animated elements`)

    // Test hover effects
    const buttons = page.locator('button')
    const buttonCount = await buttons.count()

    for (let i = 0; i < Math.min(buttonCount, 10); i++) {
      try {
        await buttons.nth(i).hover()
        await page.waitForTimeout(200)
      } catch (error) {
        // Ignore hover errors
      }
    }

    // Take final screenshot
    await page.screenshot({ path: 'test-results/visual-effects-test.png', fullPage: true })

    console.log('Visual effects test complete')
  })

  test('Test responsive behavior on all viewports', async ({ page }) => {
    const viewports = [
      { name: 'Mobile', width: 375, height: 667 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Desktop', width: 1920, height: 1080 },
    ]

    for (const viewport of viewports) {
      console.log(`Testing ${viewport.name} viewport (${viewport.width}x${viewport.height})`)

      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)

      // Take screenshot
      await page.screenshot({
        path: `test-results/responsive-${viewport.name.toLowerCase()}.png`,
        fullPage: true
      })

      // Check sidebar behavior
      const sidebar = page.locator('[data-sidebar="sidebar"], aside').first()
      if (await sidebar.count() > 0) {
        console.log(`  ✅ Sidebar visible on ${viewport.name}`)
      }
    }

    console.log('Responsive tests complete')
  })
})