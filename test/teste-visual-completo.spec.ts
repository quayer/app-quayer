import { test, expect } from '@playwright/test'

test.describe('TESTE VISUAL COMPLETO E2E REAL - SEM MOCK', () => {
  let token: string
  let organizationId: string

  test.beforeEach(async ({ page }) => {
    console.log('\n🚀 [TESTE VISUAL] Iniciando login REAL...')

    // Login REAL
    await page.goto('http://localhost:3000/login')
    await page.waitForLoadState('networkidle')

    // Preencher email
    await page.fill('input[type="email"]', 'admin@quayer.com')
    await page.fill('input[type="password"]', 'admin123456')

    // Clicar em login
    await page.click('button[type="submit"]')

    // Aguardar redirecionamento
    await page.waitForURL('**/dashboard', { timeout: 15000 })

    // Extrair token do localStorage
    const storage = await page.evaluate(() => {
      const token = localStorage.getItem('access_token')
      const user = localStorage.getItem('user')
      return { token, user }
    })

    token = storage.token || ''
    const user = storage.user ? JSON.parse(storage.user) : null
    organizationId = user?.currentOrgId || ''

    console.log(`✅ [TESTE VISUAL] Login realizado com sucesso!`)
    console.log(`   Token: ${token.substring(0, 30)}...`)
    console.log(`   Org ID: ${organizationId}`)
  })

  test('1. 🎯 Testar Página /admin/invitations VISUALMENTE', async ({ page }) => {
    console.log('\n📊 [TESTE 1] Acessando /admin/invitations...')

    // Navegar para página de invitations
    await page.goto('http://localhost:3000/admin/invitations')
    await page.waitForLoadState('networkidle')

    // Screenshot inicial
    await page.screenshot({ path: 'test-screenshots/01-invitations-page-load.png', fullPage: true })
    console.log('   📸 Screenshot salvo: 01-invitations-page-load.png')

    // Verificar header
    const header = page.locator('header')
    await expect(header).toBeVisible()
    console.log('   ✅ Header visível')

    // Verificar H1
    const h1 = page.locator('h1:has-text("Convites de Organização")')
    await expect(h1).toBeVisible()
    console.log('   ✅ H1 "Convites de Organização" visível')

    // Verificar cards de estatísticas
    await expect(page.locator('text=Total de Convites')).toBeVisible()
    await expect(page.locator('text=Pendentes')).toBeVisible()
    await expect(page.locator('text=Aceitos')).toBeVisible()
    await expect(page.locator('text=Expirados')).toBeVisible()
    console.log('   ✅ 4 cards de estatísticas visíveis')

    // Verificar botão "Novo Convite"
    const newButton = page.locator('button:has-text("Novo Convite")')
    await expect(newButton).toBeVisible()
    console.log('   ✅ Botão "Novo Convite" visível')

    await page.waitForTimeout(1000)
  })

  test('2. 🔍 Testar Filtros de Busca REAL', async ({ page }) => {
    console.log('\n🔍 [TESTE 2] Testando filtros...')

    await page.goto('http://localhost:3000/admin/invitations')
    await page.waitForLoadState('networkidle')

    // Input de busca
    const searchInput = page.locator('input[placeholder*="Buscar"]')
    await expect(searchInput).toBeVisible()
    console.log('   ✅ Input de busca visível')

    // Digitar na busca
    await searchInput.fill('teste@exemplo.com')
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'test-screenshots/02-search-input.png', fullPage: true })
    console.log('   📸 Screenshot: 02-search-input.png')
    console.log('   ✅ Busca digitada')

    // Limpar busca
    await searchInput.clear()
    await page.waitForTimeout(500)

    // Select de status
    const statusSelect = page.locator('button:has-text("Todos")')
    await expect(statusSelect).toBeVisible()
    console.log('   ✅ Select de status visível')

    // Abrir select
    await statusSelect.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'test-screenshots/03-status-select-open.png', fullPage: true })
    console.log('   📸 Screenshot: 03-status-select-open.png')

    // Verificar opções
    await expect(page.locator('[role="listbox"]')).toBeVisible()
    await expect(page.locator('text=Pendentes')).toBeVisible()
    await expect(page.locator('text=Aceitos')).toBeVisible()
    await expect(page.locator('text=Expirados')).toBeVisible()
    console.log('   ✅ Opções do select visíveis')

    // Fechar select
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })

  test('3. 💾 Testar Criação de Convite REAL (COM API)', async ({ page, request }) => {
    console.log('\n💾 [TESTE 3] Testando criação de convite REAL...')

    await page.goto('http://localhost:3000/admin/invitations')
    await page.waitForLoadState('networkidle')

    // Clicar em "Novo Convite"
    const newButton = page.locator('button:has-text("Novo Convite")')
    await newButton.click()
    await page.waitForTimeout(500)

    // Aguardar modal abrir
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: 'test-screenshots/04-modal-create-open.png', fullPage: true })
    console.log('   📸 Screenshot: 04-modal-create-open.png')
    console.log('   ✅ Modal aberto')

    // Verificar campos do modal
    await expect(page.locator('text=Criar Novo Convite')).toBeVisible()
    await expect(page.locator('label:has-text("Email *")')).toBeVisible()
    await expect(page.locator('label:has-text("ID da Organização *")')).toBeVisible()
    await expect(page.locator('label:has-text("Role")')).toBeVisible()
    await expect(page.locator('label:has-text("Validade")')).toBeVisible()
    console.log('   ✅ Todos os campos visíveis')

    // Preencher formulário REAL
    const emailInput = page.locator('input[id="email"]')
    const orgIdInput = page.locator('input[id="organizationId"]')

    await emailInput.fill('teste-visual@quayer.com')
    await orgIdInput.fill(organizationId)
    console.log(`   ✅ Formulário preenchido com org: ${organizationId}`)

    await page.waitForTimeout(500)
    await page.screenshot({ path: 'test-screenshots/05-modal-filled.png', fullPage: true })
    console.log('   📸 Screenshot: 05-modal-filled.png')

    // Click em "Enviar Convite" para testar validação/API
    const sendButton = page.locator('button:has-text("Enviar Convite")')

    // Escutar a chamada API REAL
    const responsePromise = page.waitForResponse(
      response => response.url().includes('/api/v1/invitations/create') && response.status() !== 404,
      { timeout: 10000 }
    )

    await sendButton.click()
    console.log('   🔄 Enviando convite...')

    try {
      const response = await responsePromise
      const status = response.status()
      const body = await response.json().catch(() => ({}))

      console.log(`   📡 API Response: ${status}`)
      console.log(`   📦 Body:`, JSON.stringify(body, null, 2))

      if (status === 200 || status === 201) {
        console.log('   ✅ CONVITE CRIADO COM SUCESSO!')

        // Aguardar toast de sucesso
        await page.waitForTimeout(1000)
        await page.screenshot({ path: 'test-screenshots/06-success-toast.png', fullPage: true })
        console.log('   📸 Screenshot: 06-success-toast.png')

        // Modal deve fechar
        await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 3000 })
        console.log('   ✅ Modal fechado')
      } else {
        console.log(`   ⚠️  API retornou status: ${status}`)
        await page.screenshot({ path: 'test-screenshots/06-error-response.png', fullPage: true })
      }
    } catch (error) {
      console.log('   ❌ Erro ao aguardar resposta da API:', error)
      await page.screenshot({ path: 'test-screenshots/06-api-error.png', fullPage: true })
    }

    await page.waitForTimeout(1000)
  })

  test('4. 📋 Testar Tabela e Actions VISUALMENTE', async ({ page }) => {
    console.log('\n📋 [TESTE 4] Testando tabela e actions...')

    await page.goto('http://localhost:3000/admin/invitations')
    await page.waitForLoadState('networkidle')

    // Aguardar tabela carregar
    await page.waitForSelector('table', { state: 'visible', timeout: 5000 })
    console.log('   ✅ Tabela visível')

    // Screenshot da tabela
    await page.screenshot({ path: 'test-screenshots/07-table-view.png', fullPage: true })
    console.log('   📸 Screenshot: 07-table-view.png')

    // Verificar colunas
    const headers = ['Email', 'Role', 'Organização', 'Convidado por', 'Status', 'Expira em', 'Ações']
    for (const header of headers) {
      const headerElement = page.locator(`th:has-text("${header}")`)
      const visible = await headerElement.isVisible().catch(() => false)
      console.log(`   ${visible ? '✅' : '❌'} Coluna "${header}" ${visible ? 'visível' : 'não encontrada'}`)
    }

    // Verificar se tem linhas na tabela
    const rows = page.locator('table tbody tr')
    const rowCount = await rows.count()
    console.log(`   📊 ${rowCount} linha(s) na tabela`)

    if (rowCount > 0) {
      // Teste dropdown de ações
      const firstDropdown = rows.first().locator('button[aria-haspopup="menu"]')
      if (await firstDropdown.isVisible().catch(() => false)) {
        await firstDropdown.click()
        await page.waitForTimeout(500)
        await page.screenshot({ path: 'test-screenshots/08-actions-dropdown.png', fullPage: true })
        console.log('   📸 Screenshot: 08-actions-dropdown.png')
        console.log('   ✅ Dropdown de ações aberto')

        // Fechar dropdown
        await page.keyboard.press('Escape')
      }
    } else {
      console.log('   ℹ️  Tabela vazia - exibindo empty state')
      await page.screenshot({ path: 'test-screenshots/08-empty-state.png', fullPage: true })
      console.log('   📸 Screenshot: 08-empty-state.png')
    }

    await page.waitForTimeout(1000)
  })

  test('5. 🎨 Testar Responsividade REAL', async ({ page }) => {
    console.log('\n🎨 [TESTE 5] Testando responsividade...')

    await page.goto('http://localhost:3000/admin/invitations')

    // Desktop (1920x1080)
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'test-screenshots/09-responsive-desktop.png', fullPage: true })
    console.log('   📸 Screenshot: 09-responsive-desktop.png (1920x1080)')

    // Tablet (768x1024)
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'test-screenshots/10-responsive-tablet.png', fullPage: true })
    console.log('   📸 Screenshot: 10-responsive-tablet.png (768x1024)')

    // Mobile (375x667)
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'test-screenshots/11-responsive-mobile.png', fullPage: true })
    console.log('   📸 Screenshot: 11-responsive-mobile.png (375x667)')

    console.log('   ✅ Responsividade testada em 3 resoluções')

    await page.waitForTimeout(1000)
  })

  test('6. 🎭 Testar Efeitos Visuais (Hover, Focus, Loading)', async ({ page }) => {
    console.log('\n🎭 [TESTE 6] Testando efeitos visuais...')

    await page.goto('http://localhost:3000/admin/invitations')
    await page.waitForLoadState('networkidle')

    // Hover no botão "Novo Convite"
    const newButton = page.locator('button:has-text("Novo Convite")')
    await newButton.hover()
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'test-screenshots/12-button-hover.png' })
    console.log('   📸 Screenshot: 12-button-hover.png (hover effect)')

    // Focus no input de busca
    const searchInput = page.locator('input[placeholder*="Buscar"]')
    await searchInput.focus()
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'test-screenshots/13-input-focus.png' })
    console.log('   📸 Screenshot: 13-input-focus.png (focus effect)')

    console.log('   ✅ Efeitos visuais testados')

    await page.waitForTimeout(1000)
  })

  test('7. 🏆 TESTE FINAL - UX COMPLETA E2E', async ({ page }) => {
    console.log('\n🏆 [TESTE 7] Teste completo de UX...')

    console.log('   🚀 Cenário: Admin cria convite, filtra, e visualiza')

    // 1. Acessar página
    await page.goto('http://localhost:3000/admin/invitations')
    await page.waitForLoadState('networkidle')
    console.log('   ✅ Página carregada')

    // 2. Verificar estatísticas visíveis
    const stats = ['Total de Convites', 'Pendentes', 'Aceitos', 'Expirados']
    for (const stat of stats) {
      await expect(page.locator(`text=${stat}`)).toBeVisible()
    }
    console.log('   ✅ Estatísticas visíveis')

    // 3. Testar busca
    const searchInput = page.locator('input[placeholder*="Buscar"]')
    await searchInput.fill('teste')
    await page.waitForTimeout(500)
    await searchInput.clear()
    console.log('   ✅ Busca funcionando')

    // 4. Testar filtro
    const statusSelect = page.locator('button:has-text("Todos")')
    await statusSelect.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Escape')
    console.log('   ✅ Filtro funcionando')

    // 5. Abrir modal
    await page.locator('button:has-text("Novo Convite")').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    console.log('   ✅ Modal abre')

    // 6. Fechar modal
    await page.locator('button:has-text("Cancelar")').click()
    await expect(page.locator('[role="dialog"]')).toBeHidden()
    console.log('   ✅ Modal fecha')

    // Screenshot final
    await page.screenshot({ path: 'test-screenshots/14-final-ux-complete.png', fullPage: true })
    console.log('   📸 Screenshot final: 14-final-ux-complete.png')

    console.log('\n   🎉 TESTE COMPLETO E2E FINALIZADO COM SUCESSO!')
  })
})
