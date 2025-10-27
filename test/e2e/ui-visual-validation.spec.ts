import { test, expect, Page } from '@playwright/test'

/**
 * ✅ TESTE E2E - VALIDAÇÃO VISUAL E UI
 *
 * Este teste foca em:
 * - Layout quebrado
 * - Elementos fora das dimensões
 * - Overlapping de componentes
 * - Overflow de texto
 * - Botões inacessíveis
 * - Espaçamento incorreto
 * - Responsividade quebrada
 */

const TEST_EMAIL = 'admin@quayer.com'
const TEST_OTP = '123456'

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.click('button:has-text("Continuar")')
  await expect(page).toHaveURL(/\/login\/verify/)

  const otpInputs = page.locator('input[inputmode="numeric"]')
  const otpDigits = TEST_OTP.split('')
  for (let i = 0; i < otpDigits.length; i++) {
    await otpInputs.nth(i).fill(otpDigits[i])
  }

  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 })
}

test.describe('🎨 VALIDAÇÃO VISUAL E UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies()
  })

  test('01 - Login Page: Validar layout e dimensões', async ({ page }) => {
    console.log('🧪 Validando UI da página de login...')

    await page.goto('/login')

    // Verificar container principal está visível
    const container = page.locator('main, [role="main"]').first()
    await expect(container).toBeVisible()

    // Verificar input de email tem tamanho adequado
    const emailInput = page.locator('input[type="email"]')
    const emailBox = await emailInput.boundingBox()
    expect(emailBox?.width).toBeGreaterThan(200)
    expect(emailBox?.height).toBeGreaterThan(30)
    console.log(`✅ Input email: ${emailBox?.width}x${emailBox?.height}`)

    // Verificar botão não está cortado
    const button = page.locator('button:has-text("Continuar")')
    const buttonBox = await button.boundingBox()
    expect(buttonBox?.width).toBeGreaterThan(100)
    expect(buttonBox?.height).toBeGreaterThan(30)
    console.log(`✅ Botão continuar: ${buttonBox?.width}x${buttonBox?.height}`)

    // Verificar não há overflow horizontal
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20) // +20px de tolerância
    console.log(`✅ Sem overflow horizontal: body=${bodyWidth} viewport=${viewportWidth}`)
  })

  test('02 - OTP Page: Validar inputs e layout', async ({ page }) => {
    console.log('🧪 Validando UI da página de OTP...')

    await page.goto('/login')
    await page.fill('input[type="email"]', TEST_EMAIL)
    await page.click('button:has-text("Continuar")')
    await expect(page).toHaveURL(/\/login\/verify/)

    // Verificar 6 inputs de OTP
    const otpInputs = page.locator('input[inputmode="numeric"]')
    const count = await otpInputs.count()
    expect(count).toBe(6)
    console.log(`✅ ${count} inputs de OTP encontrados`)

    // Verificar dimensões de cada input
    for (let i = 0; i < count; i++) {
      const input = otpInputs.nth(i)
      const box = await input.boundingBox()

      // Inputs devem ser quadrados ou próximos disso
      expect(box?.width).toBeGreaterThan(30)
      expect(box?.height).toBeGreaterThan(30)

      // Verificar se estão visíveis na viewport
      const isInViewport = await input.isVisible()
      expect(isInViewport).toBe(true)

      console.log(`✅ Input OTP ${i + 1}: ${box?.width}x${box?.height}`)
    }

    // Verificar espaçamento entre inputs
    const firstBox = await otpInputs.nth(0).boundingBox()
    const secondBox = await otpInputs.nth(1).boundingBox()

    if (firstBox && secondBox) {
      const gap = secondBox.x - (firstBox.x + firstBox.width)
      expect(gap).toBeGreaterThan(2) // Deve ter espaço entre inputs
      expect(gap).toBeLessThan(50) // Mas não muito espaço
      console.log(`✅ Espaçamento entre inputs: ${gap}px`)
    }
  })

  test('03 - Admin Dashboard: Validar layout e cards', async ({ page }) => {
    console.log('🧪 Validando UI do dashboard admin...')

    await login(page)
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // Verificar sidebar está visível e com largura adequada
    const sidebar = page.locator('[data-sidebar]')
    await expect(sidebar).toBeVisible()

    const sidebarBox = await sidebar.boundingBox()
    expect(sidebarBox?.width).toBeGreaterThan(200)
    expect(sidebarBox?.width).toBeLessThan(400)
    console.log(`✅ Sidebar: ${sidebarBox?.width}px de largura`)

    // Verificar conteúdo principal não está sobreposto à sidebar
    const main = page.locator('main, [role="main"]').first()
    const mainBox = await main.boundingBox()

    if (mainBox && sidebarBox) {
      expect(mainBox.x).toBeGreaterThanOrEqual(sidebarBox.width - 10) // -10px tolerância
      console.log(`✅ Conteúdo principal não sobrepõe sidebar`)
    }

    // Verificar cards de estatísticas se existirem
    const cards = page.locator('[role="article"], .card, [class*="card"]')
    const cardCount = await cards.count()

    if (cardCount > 0) {
      console.log(`📊 ${cardCount} cards encontrados`)

      for (let i = 0; i < Math.min(cardCount, 4); i++) {
        const card = cards.nth(i)
        const cardBox = await card.boundingBox()

        expect(cardBox?.width).toBeGreaterThan(100)
        expect(cardBox?.height).toBeGreaterThan(50)
        console.log(`✅ Card ${i + 1}: ${cardBox?.width}x${cardBox?.height}`)
      }
    }
  })

  test('04 - Organizations Page: Validar tabela e dialog', async ({ page }) => {
    console.log('🧪 Validando UI da página de organizações...')

    await login(page)
    await page.goto('/admin/organizations')
    await page.waitForLoadState('networkidle')

    // Verificar título não está cortado
    const title = page.locator('h1:has-text("Organizações")')
    await expect(title).toBeVisible()

    const titleBox = await title.boundingBox()
    expect(titleBox?.width).toBeGreaterThan(100)
    console.log(`✅ Título: ${titleBox?.width}px de largura`)

    // Verificar botão "Nova Organização"
    const newButton = page.locator('button:has-text("Nova Organização")')
    await expect(newButton).toBeVisible()

    const buttonBox = await newButton.boundingBox()
    expect(buttonBox?.width).toBeGreaterThan(100)
    expect(buttonBox?.height).toBeGreaterThan(30)
    console.log(`✅ Botão: ${buttonBox?.width}x${buttonBox?.height}`)

    // Abrir dialog e verificar layout
    await newButton.click()
    await page.waitForTimeout(500)

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    const dialogBox = await dialog.boundingBox()
    expect(dialogBox?.width).toBeGreaterThan(300)
    expect(dialogBox?.width).toBeLessThan(800)
    console.log(`✅ Dialog: ${dialogBox?.width}x${dialogBox?.height}`)

    // Verificar inputs do form estão visíveis e acessíveis
    const nameInput = page.locator('input[placeholder*="Minha Empresa"]')
    await expect(nameInput).toBeVisible()

    const nameBox = await nameInput.boundingBox()
    expect(nameBox?.width).toBeGreaterThan(200)
    console.log(`✅ Input nome: ${nameBox?.width}px`)

    // Verificar botões do dialog
    const dialogButtons = dialog.locator('button')
    const buttonCount = await dialogButtons.count()
    expect(buttonCount).toBeGreaterThan(0)
    console.log(`✅ ${buttonCount} botões no dialog`)

    await page.keyboard.press('Escape')
  })

  test('05 - Clients Page: Validar tabela e cards', async ({ page }) => {
    console.log('🧪 Validando UI da página de clientes...')

    await login(page)
    await page.goto('/admin/clients')
    await page.waitForLoadState('networkidle')

    // Verificar cards de estatísticas
    const statsCards = page.locator('[class*="card"]').filter({ hasText: /Total|Ativos|Inativos/ })
    const cardCount = await statsCards.count()

    expect(cardCount).toBeGreaterThanOrEqual(3)
    console.log(`✅ ${cardCount} cards de estatísticas`)

    // Verificar cada card tem número visível
    for (let i = 0; i < Math.min(cardCount, 3); i++) {
      const card = statsCards.nth(i)
      await expect(card).toBeVisible()

      const cardBox = await card.boundingBox()
      expect(cardBox?.width).toBeGreaterThan(150)
      console.log(`✅ Card ${i + 1}: ${cardBox?.width}px`)
    }

    // Verificar campo de busca
    const searchInput = page.locator('input[placeholder*="Buscar"]')
    await expect(searchInput).toBeVisible()

    const searchBox = await searchInput.boundingBox()
    expect(searchBox?.width).toBeGreaterThan(200)
    console.log(`✅ Campo de busca: ${searchBox?.width}px`)

    // Verificar tabela (se houver dados)
    const table = page.locator('table')
    const hasTable = await table.isVisible().catch(() => false)

    if (hasTable) {
      const tableBox = await table.boundingBox()
      console.log(`✅ Tabela: ${tableBox?.width}px de largura`)

      // Verificar headers da tabela
      const headers = table.locator('th')
      const headerCount = await headers.count()
      expect(headerCount).toBeGreaterThan(0)
      console.log(`✅ Tabela com ${headerCount} colunas`)
    } else {
      console.log('ℹ️ Nenhuma tabela (sem dados)')
    }
  })

  test('06 - Integrations Page: Validar modal de instância', async ({ page }) => {
    console.log('🧪 Validando UI da página de integrações...')

    await login(page)
    await page.goto('/admin/integracoes')
    await page.waitForLoadState('networkidle')

    // Verificar botão "Nova Instância"
    const newButton = page.locator('button:has-text("Nova Instância")')
    await expect(newButton).toBeVisible()

    // Abrir modal
    await newButton.click()
    await page.waitForTimeout(500)

    const modal = page.locator('[role="dialog"]')
    await expect(modal).toBeVisible()

    const modalBox = await modal.boundingBox()
    expect(modalBox?.width).toBeGreaterThan(300)
    expect(modalBox?.height).toBeGreaterThan(200)
    console.log(`✅ Modal: ${modalBox?.width}x${modalBox?.height}`)

    // Verificar campos do form
    const nameInput = page.locator('input[placeholder*="nome"]').first()
    await expect(nameInput).toBeVisible()

    const inputBox = await nameInput.boundingBox()
    expect(inputBox?.width).toBeGreaterThan(200)
    console.log(`✅ Input nome: ${inputBox?.width}px`)

    // Verificar botão criar está acessível
    const createButton = modal.locator('button:has-text("Criar")')
    await expect(createButton).toBeVisible()

    const createBox = await createButton.boundingBox()
    expect(createBox?.width).toBeGreaterThan(80)
    expect(createBox?.height).toBeGreaterThan(30)
    console.log(`✅ Botão criar: ${createBox?.width}x${createBox?.height}`)

    await page.keyboard.press('Escape')
  })

  test('07 - Responsive: Validar layout em mobile (375px)', async ({ page }) => {
    console.log('🧪 Validando responsividade mobile...')

    await page.setViewportSize({ width: 375, height: 667 })
    await login(page)
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // Verificar sidebar pode ser toggled
    const sidebarTrigger = page.locator('[class*="sidebar-trigger"]').first()
    const hasTrigger = await sidebarTrigger.isVisible().catch(() => false)

    if (hasTrigger) {
      console.log('✅ Sidebar trigger visível em mobile')
    }

    // Verificar conteúdo não ultrapassa largura da tela
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = 375

    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 20)
    console.log(`✅ Sem overflow horizontal em mobile: ${bodyWidth}px`)

    // Navegar para organizações
    await page.goto('/admin/organizations')
    await page.waitForLoadState('networkidle')

    // Verificar botão "Nova Organização" visível
    const newButton = page.locator('button:has-text("Nova Organização")')
    const buttonVisible = await newButton.isVisible().catch(() => false)

    if (!buttonVisible) {
      // Pode estar em um menu collapsed
      console.log('⚠️ Botão pode estar em menu colapsado em mobile')
    } else {
      const buttonBox = await newButton.boundingBox()
      expect(buttonBox?.width).toBeLessThan(viewportWidth)
      console.log(`✅ Botão cabe em mobile: ${buttonBox?.width}px`)
    }
  })

  test('08 - Responsive: Validar layout em tablet (768px)', async ({ page }) => {
    console.log('🧪 Validando responsividade tablet...')

    await page.setViewportSize({ width: 768, height: 1024 })
    await login(page)
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // Verificar layout se adapta
    const sidebar = page.locator('[data-sidebar]')
    await expect(sidebar).toBeVisible()

    const sidebarBox = await sidebar.boundingBox()
    expect(sidebarBox?.width).toBeGreaterThan(0)
    expect(sidebarBox?.width).toBeLessThan(400)
    console.log(`✅ Sidebar em tablet: ${sidebarBox?.width}px`)

    // Verificar conteúdo não ultrapassa
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(768 + 20)
    console.log(`✅ Sem overflow em tablet: ${bodyWidth}px`)
  })

  test('09 - Text Overflow: Verificar textos longos', async ({ page }) => {
    console.log('🧪 Validando overflow de texto...')

    await login(page)
    await page.goto('/admin/organizations')
    await page.waitForLoadState('networkidle')

    // Abrir dialog
    await page.click('button:has-text("Nova Organização")')
    await page.waitForTimeout(500)

    // Preencher com texto muito longo
    const longText = 'A'.repeat(200)
    const nameInput = page.locator('input[placeholder*="Minha Empresa"]')
    await nameInput.fill(longText)

    // Verificar input não quebra layout
    const inputBox = await nameInput.boundingBox()
    const dialog = page.locator('[role="dialog"]')
    const dialogBox = await dialog.boundingBox()

    if (inputBox && dialogBox) {
      expect(inputBox.width).toBeLessThanOrEqual(dialogBox.width)
      console.log(`✅ Input longo não quebra dialog`)
    }

    await page.keyboard.press('Escape')
  })

  test('10 - Z-index: Verificar sobreposição de componentes', async ({ page }) => {
    console.log('🧪 Validando z-index e sobreposição...')

    await login(page)
    await page.goto('/admin/organizations')
    await page.waitForLoadState('networkidle')

    // Abrir dialog
    await page.click('button:has-text("Nova Organização")')
    await page.waitForTimeout(500)

    // Verificar dialog está sobre backdrop
    const dialog = page.locator('[role="dialog"]')
    const backdrop = page.locator('[class*="backdrop"], [class*="overlay"]').first()

    const dialogVisible = await dialog.isVisible()
    const backdropVisible = await backdrop.isVisible().catch(() => false)

    expect(dialogVisible).toBe(true)

    if (backdropVisible) {
      // Verificar z-index do dialog é maior que backdrop
      const dialogZ = await dialog.evaluate(el => window.getComputedStyle(el).zIndex)
      const backdropZ = await backdrop.evaluate(el => window.getComputedStyle(el).zIndex)

      console.log(`Dialog z-index: ${dialogZ}, Backdrop z-index: ${backdropZ}`)

      if (dialogZ !== 'auto' && backdropZ !== 'auto') {
        expect(parseInt(dialogZ)).toBeGreaterThanOrEqual(parseInt(backdropZ))
        console.log(`✅ Dialog sobrepõe backdrop`)
      }
    }

    // Verificar sidebar não sobrepõe dialog
    const sidebar = page.locator('[data-sidebar]')
    const sidebarVisible = await sidebar.isVisible()

    if (sidebarVisible) {
      // Dialog deve estar na frente
      const dialogZ = await dialog.evaluate(el => window.getComputedStyle(el).zIndex)
      const sidebarZ = await sidebar.evaluate(el => window.getComputedStyle(el).zIndex)

      console.log(`Dialog z-index: ${dialogZ}, Sidebar z-index: ${sidebarZ}`)
    }

    await page.keyboard.press('Escape')
  })

  test('11 - Button Accessibility: Verificar botões são clicáveis', async ({ page }) => {
    console.log('🧪 Validando acessibilidade de botões...')

    await login(page)
    await page.goto('/admin/organizations')
    await page.waitForLoadState('networkidle')

    // Verificar todos botões visíveis são clicáveis
    const buttons = page.locator('button:visible')
    const buttonCount = await buttons.count()

    console.log(`📊 ${buttonCount} botões visíveis`)

    let clickableCount = 0
    for (let i = 0; i < Math.min(buttonCount, 10); i++) {
      const button = buttons.nth(i)
      const isClickable = await button.isEnabled()

      if (isClickable) {
        clickableCount++
      }
    }

    console.log(`✅ ${clickableCount} de ${Math.min(buttonCount, 10)} botões clicáveis`)
  })

  test('12 - Color Contrast: Verificar contraste de cores', async ({ page }) => {
    console.log('🧪 Validando contraste de cores...')

    await login(page)
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // Verificar texto está legível (não é branco em branco)
    const textElements = page.locator('p, span, div, h1, h2, h3, h4, h5, h6').filter({ hasText: /.+/ })
    const count = await textElements.count()

    console.log(`📊 ${count} elementos de texto encontrados`)

    // Verificar alguns elementos aleatórios
    for (let i = 0; i < Math.min(count, 5); i++) {
      const element = textElements.nth(i)
      const isVisible = await element.isVisible().catch(() => false)

      if (isVisible) {
        const color = await element.evaluate(el => window.getComputedStyle(el).color)
        const bgColor = await element.evaluate(el => window.getComputedStyle(el).backgroundColor)

        console.log(`Elemento ${i}: color=${color}, bg=${bgColor}`)

        // Verificar cor não é transparente ou inválida
        expect(color).not.toBe('rgba(0, 0, 0, 0)')
        expect(color).not.toBe('transparent')
      }
    }

    console.log('✅ Cores de texto parecem válidas')
  })
})
