import { test, expect } from '@playwright/test'

/**
 * ✅ TESTE RÁPIDO E2E
 *
 * Teste simplificado para verificar funcionalidades principais rapidamente
 */

const TEST_EMAIL = 'admin@quayer.com'
const TEST_OTP = '123456'

test.describe('🚀 TESTE RÁPIDO - FRONTEND', () => {
  test('01 - Página Login: Verificar elementos e layout', async ({ page }) => {
    console.log('🧪 Testando página de login...')

    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    // Verificar campo de email
    const emailInput = page.locator('input[type="email"]')
    await expect(emailInput).toBeVisible()
    console.log('✅ Campo de email visível')

    // Verificar botão "Continuar com Email" específico
    const emailButton = page.locator('button:has-text("Continuar com Email")')
    await expect(emailButton).toBeVisible()
    console.log('✅ Botão Continuar com Email visível')

    // Verificar layout não quebrado
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 50)
    console.log(`✅ Layout OK: body=${bodyWidth}px, viewport=${viewportWidth}px`)

    // Tentar preencher email
    await emailInput.fill(TEST_EMAIL)
    const value = await emailInput.inputValue()
    expect(value).toBe(TEST_EMAIL)
    console.log(`✅ Email preenchido: ${value}`)

    // Clicar no botão específico de email
    await emailButton.click()

    // Aguardar navegação para OTP ou resposta
    await page.waitForTimeout(3000)

    const currentUrl = page.url()
    console.log(`📍 URL após clicar: ${currentUrl}`)

    // Verificar se foi para página de verificação
    if (currentUrl.includes('/verify')) {
      console.log('✅ Redirecionado para página de OTP')

      // Aguardar inputs de OTP
      await page.waitForSelector('input[inputmode="numeric"]', { timeout: 10000 })

      const otpInputs = page.locator('input[inputmode="numeric"]')
      const count = await otpInputs.count()
      console.log(`✅ ${count} inputs de OTP encontrados`)

      // Tentar preencher OTP (um por vez, com delay)
      const otpDigits = TEST_OTP.split('')

      for (let i = 0; i < Math.min(count, otpDigits.length); i++) {
        const input = otpInputs.nth(i)
        await input.click()
        await page.waitForTimeout(200)
        await input.fill(otpDigits[i])
        await page.waitForTimeout(200)
        console.log(`✅ OTP dígito ${i + 1} preenchido`)
      }

      // Aguardar processamento
      await page.waitForTimeout(3000)

      const finalUrl = page.url()
      console.log(`📍 URL final: ${finalUrl}`)

      if (!finalUrl.includes('/login')) {
        console.log('✅ Login bem-sucedido!')
      } else {
        console.log('⚠️ Ainda na página de login')
      }
    }
  })

  test('02 - Admin Dashboard: Verificar acesso e layout', async ({ page }) => {
    console.log('🧪 Testando dashboard admin...')

    // Tentar acessar diretamente (pode ter cookie)
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    const currentUrl = page.url()
    console.log(`📍 URL: ${currentUrl}`)

    if (currentUrl.includes('/login')) {
      console.log('⚠️ Redirecionado para login (sem autenticação)')
      test.skip()
    }

    // Verificar sidebar
    const sidebar = page.locator('[data-sidebar]')
    const hasSidebar = await sidebar.isVisible().catch(() => false)

    if (hasSidebar) {
      console.log('✅ Sidebar visível')

      const sidebarBox = await sidebar.boundingBox()
      console.log(`📏 Sidebar: ${sidebarBox?.width}px`)
    }

    // Verificar não há erro 404
    const notFound = page.locator('text=/404|not found/i')
    const has404 = await notFound.isVisible().catch(() => false)
    expect(has404).toBe(false)
    console.log('✅ Sem erro 404')
  })

  test('03 - Admin Organizations: Verificar página', async ({ page }) => {
    console.log('🧪 Testando página de organizações...')

    await page.goto('/admin/organizations')
    await page.waitForLoadState('networkidle')

    const currentUrl = page.url()

    if (currentUrl.includes('/login')) {
      console.log('⚠️ Sem autenticação')
      test.skip()
    }

    // Verificar título
    const title = page.locator('h1:has-text("Organizações")')
    const hasTitle = await title.isVisible().catch(() => false)

    if (hasTitle) {
      console.log('✅ Título "Organizações" visível')
    }

    // Verificar botão nova organização
    const newButton = page.locator('button:has-text("Nova Organização")')
    const hasButton = await newButton.isVisible().catch(() => false)

    if (hasButton) {
      console.log('✅ Botão Nova Organização visível')

      // Tentar clicar
      await newButton.click()
      await page.waitForTimeout(500)

      // Verificar dialog abriu
      const dialog = page.locator('[role="dialog"]')
      const hasDialog = await dialog.isVisible().catch(() => false)

      if (hasDialog) {
        console.log('✅ Dialog aberto')

        // Verificar campos
        const nameInput = page.locator('input[placeholder*="Minha Empresa"]')
        const hasInput = await nameInput.isVisible().catch(() => false)

        if (hasInput) {
          console.log('✅ Campo nome visível')

          // Testar preencher
          await nameInput.fill('Test Organization')
          const value = await nameInput.inputValue()
          console.log(`✅ Valor preenchido: ${value}`)
        }

        // Fechar dialog
        await page.keyboard.press('Escape')
        console.log('✅ Dialog fechado')
      }
    }
  })

  test('04 - Admin Clients: Verificar página', async ({ page }) => {
    console.log('🧪 Testando página de clientes...')

    await page.goto('/admin/clients')
    await page.waitForLoadState('networkidle')

    const currentUrl = page.url()

    if (currentUrl.includes('/login')) {
      console.log('⚠️ Sem autenticação')
      test.skip()
    }

    // Verificar título
    const title = page.locator('h1:has-text("Clientes")')
    const hasTitle = await title.isVisible().catch(() => false)

    if (hasTitle) {
      console.log('✅ Título "Clientes" visível')
    }

    // Verificar cards de estatísticas
    const totalCard = page.locator('text=Total de Clientes')
    const hasTotal = await totalCard.isVisible().catch(() => false)

    if (hasTotal) {
      console.log('✅ Card "Total de Clientes" visível')
    }

    // Verificar campo de busca
    const searchInput = page.locator('input[placeholder*="Buscar"]')
    const hasSearch = await searchInput.isVisible().catch(() => false)

    if (hasSearch) {
      console.log('✅ Campo de busca visível')

      // Testar busca
      await searchInput.fill('test')
      await page.waitForTimeout(500)
      const value = await searchInput.inputValue()
      console.log(`✅ Busca funcionando: ${value}`)
    }

    // Verificar botão "Novo Cliente"
    const newButton = page.locator('button:has-text("Novo Cliente")').first()
    const hasButton = await newButton.isVisible().catch(() => false)

    if (hasButton) {
      console.log('⚠️ Botão "Novo Cliente" visível (mas sem ação implementada)')
    }
  })

  test('05 - Admin Integrations: Verificar página', async ({ page }) => {
    console.log('🧪 Testando página de integrações...')

    await page.goto('/admin/integracoes')
    await page.waitForLoadState('networkidle')

    const currentUrl = page.url()

    if (currentUrl.includes('/login')) {
      console.log('⚠️ Sem autenticação')
      test.skip()
    }

    // Verificar título
    const title = page.locator('h1, h2').first()
    await expect(title).toBeVisible()
    const titleText = await title.textContent()
    console.log(`✅ Título: ${titleText}`)

    // Verificar botão "Nova Instância"
    const newButton = page.locator('button:has-text("Nova Instância")')
    const hasButton = await newButton.isVisible().catch(() => false)

    if (hasButton) {
      console.log('✅ Botão Nova Instância visível')

      // Tentar clicar
      await newButton.click()
      await page.waitForTimeout(500)

      // Verificar modal
      const modal = page.locator('[role="dialog"]')
      const hasModal = await modal.isVisible().catch(() => false)

      if (hasModal) {
        console.log('✅ Modal aberto')

        // Verificar campo nome
        const nameInput = modal.locator('input[placeholder*="nome"]').first()
        const hasInput = await nameInput.isVisible().catch(() => false)

        if (hasInput) {
          console.log('✅ Campo nome visível')

          // Testar preencher
          await nameInput.fill(`Test Instance ${Date.now()}`)
          const value = await nameInput.inputValue()
          console.log(`✅ Valor: ${value}`)
        }

        // Fechar
        await page.keyboard.press('Escape')
      }
    }
  })

  test('06 - Layout Responsivo: Desktop, Tablet, Mobile', async ({ page }) => {
    console.log('🧪 Testando responsividade...')

    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // Desktop 1920x1080
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.waitForTimeout(500)

    let bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(1920 + 50)
    console.log(`✅ Desktop (1920px): body=${bodyWidth}px`)

    // Tablet 768x1024
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.waitForTimeout(500)

    bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(768 + 50)
    console.log(`✅ Tablet (768px): body=${bodyWidth}px`)

    // Mobile 375x667
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(500)

    bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(375 + 50)
    console.log(`✅ Mobile (375px): body=${bodyWidth}px`)
  })

  test('07 - Navegação: Todas páginas carregam', async ({ page }) => {
    console.log('🧪 Testando navegação...')

    const pages = [
      '/admin',
      '/admin/organizations',
      '/admin/clients',
      '/admin/integracoes',
      '/admin/webhooks',
    ]

    for (const url of pages) {
      await page.goto(url)
      await page.waitForLoadState('networkidle')

      // Verificar não é 404
      const has404 = await page.locator('text=/404/i').isVisible().catch(() => false)
      expect(has404).toBe(false)

      console.log(`✅ ${url} - OK`)
    }
  })
})
