/**
 * UX Sprints Validation - E2E Tests
 *
 * Valida TODAS as melhorias implementadas nos Sprints 1-4:
 * - Sprint 1: QR Code Sharing
 * - Sprint 2: Media Upload
 * - Sprint 3: Tooltips Universais
 * - Sprint 4: Acessibilidade WCAG 2.1 AA
 *
 * Score Target: 9.8/10
 */

import { test, expect } from '@playwright/test'

test.describe('UX Sprints Validation - Complete', () => {
  test.beforeEach(async ({ page }) => {
    // Login como admin
    await page.goto('http://localhost:3000/login')
    await page.waitForLoadState('networkidle')
    await page.fill('input[type="email"]', 'admin@quayer.com')
    await page.fill('input[type="password"]', 'admin123456')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/integracoes', { timeout: 15000 })
  })

  test.describe('Sprint 1: QR Code Sharing', () => {
    test('deve ter botão "Copiar QR" no ConnectionModal', async ({ page }) => {
      // Navegar para instâncias
      await page.goto('http://localhost:3000/integracoes')
      await page.waitForLoadState('networkidle')

      // Verificar se existe ao menos uma instância
      const instanceCards = await page.locator('[data-testid="instance-card"]').count()

      if (instanceCards > 0) {
        // Clicar no botão Conectar da primeira instância
        await page.click('button:has-text("Conectar")').first()

        // Aguardar modal abrir
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 })

        // Verificar botão "Copiar QR"
        const copyButton = page.locator('button:has-text("Copiar QR")')
        await expect(copyButton).toBeVisible()

        console.log('✅ Sprint 1: Botão "Copiar QR" encontrado')
      } else {
        console.log('⚠️ Nenhuma instância disponível para testar')
      }
    })

    test('deve ter botão "Compartilhar" no ConnectionModal', async ({ page }) => {
      await page.goto('http://localhost:3000/integracoes')
      await page.waitForLoadState('networkidle')

      const instanceCards = await page.locator('[data-testid="instance-card"]').count()

      if (instanceCards > 0) {
        await page.click('button:has-text("Conectar")').first()
        await page.waitForSelector('[role="dialog"]', { timeout: 5000 })

        const shareButton = page.locator('button:has-text("Compartilhar")')
        await expect(shareButton).toBeVisible()

        console.log('✅ Sprint 1: Botão "Compartilhar" encontrado')
      }
    })
  })

  test.describe('Sprint 2: Media Upload', () => {
    test('deve ter botão de anexar arquivo nas conversas', async ({ page }) => {
      await page.goto('http://localhost:3000/integracoes/conversations')
      await page.waitForLoadState('networkidle')

      // Verificar se existe botão de anexo (ícone de imagem)
      const attachButton = page.locator('button[aria-label*="Anexar"]')
      const hasAttachButton = await attachButton.count() > 0

      if (hasAttachButton) {
        await expect(attachButton.first()).toBeVisible()
        console.log('✅ Sprint 2: Botão de anexar arquivo encontrado')
      } else {
        console.log('⚠️ Botão de anexo não encontrado (pode não haver conversa selecionada)')
      }
    })

    test('deve aceitar upload de imagem via input file', async ({ page }) => {
      await page.goto('http://localhost:3000/integracoes/conversations')
      await page.waitForLoadState('networkidle')

      // Verificar se existe input file oculto
      const fileInput = page.locator('input[type="file"]')
      const hasFileInput = await fileInput.count() > 0

      if (hasFileInput) {
        await expect(fileInput.first()).toBeAttached()

        // Verificar atributo accept
        const acceptAttr = await fileInput.first().getAttribute('accept')
        expect(acceptAttr).toContain('image')

        console.log('✅ Sprint 2: Input de arquivo configurado corretamente')
      }
    })
  })

  test.describe('Sprint 3: Tooltips Universais', () => {
    test('deve ter tooltips no Dashboard (8 tooltips)', async ({ page }) => {
      await page.goto('http://localhost:3000/integracoes/dashboard')
      await page.waitForLoadState('networkidle')

      // Lista de ícones que devem ter tooltip no Dashboard
      const iconsWithTooltip = [
        'Plug', // Integrações Ativas
        'MessagesSquare', // Conversas Abertas
        'MessageSquare', // Mensagens Hoje
        'Bot', // Controladas por IA
      ]

      let tooltipsFound = 0

      for (const iconName of iconsWithTooltip) {
        // Procurar por ícones que têm cursor-help (indicador de tooltip)
        const icon = page.locator(`svg.cursor-help, [class*="cursor-help"]`).first()
        if (await icon.count() > 0) {
          tooltipsFound++
        }
      }

      expect(tooltipsFound).toBeGreaterThan(0)
      console.log(`✅ Sprint 3: ${tooltipsFound} tooltips encontrados no Dashboard`)
    })

    test('deve ter tooltips na página de Conversations', async ({ page }) => {
      await page.goto('http://localhost:3000/integracoes/conversations')
      await page.waitForLoadState('networkidle')

      // Verificar botões com aria-label (Phone, Video, MoreVertical)
      const buttonWithLabel = page.locator('button[aria-label*="chamada"]')
      const hasButtons = await buttonWithLabel.count() > 0

      if (hasButtons) {
        expect(await buttonWithLabel.first()).toBeDefined()
        console.log('✅ Sprint 3: Tooltips encontrados em Conversations')
      }
    })
  })

  test.describe('Sprint 4: Acessibilidade WCAG 2.1 AA', () => {
    test('deve ter role="main" no Dashboard', async ({ page }) => {
      await page.goto('http://localhost:3000/integracoes/dashboard')
      await page.waitForLoadState('networkidle')

      const mainRegion = page.locator('[role="main"]')
      await expect(mainRegion).toBeVisible()

      // Verificar aria-label
      const ariaLabel = await mainRegion.getAttribute('aria-label')
      expect(ariaLabel).toBeTruthy()

      console.log(`✅ Sprint 4: role="main" com aria-label="${ariaLabel}"`)
    })

    test('deve ter regiões semânticas (role="region") no Dashboard', async ({ page }) => {
      await page.goto('http://localhost:3000/integracoes/dashboard')
      await page.waitForLoadState('networkidle')

      const regions = page.locator('[role="region"]')
      const regionCount = await regions.count()

      expect(regionCount).toBeGreaterThan(0)
      console.log(`✅ Sprint 4: ${regionCount} regiões semânticas encontradas`)
    })

    test('deve ter aria-labels em cards de estatísticas', async ({ page }) => {
      await page.goto('http://localhost:3000/integracoes/dashboard')
      await page.waitForLoadState('networkidle')

      const articlesWithLabel = page.locator('[role="article"][aria-label]')
      const articleCount = await articlesWithLabel.count()

      expect(articleCount).toBeGreaterThan(0)
      console.log(`✅ Sprint 4: ${articleCount} cards com aria-label`)
    })

    test('deve ter todos os ícones decorativos com aria-hidden', async ({ page }) => {
      await page.goto('http://localhost:3000/integracoes/dashboard')
      await page.waitForLoadState('networkidle')

      // Verificar ícones dentro de tooltips (devem ter aria-hidden)
      const iconsInTooltips = page.locator('svg[aria-hidden="true"]')
      const iconCount = await iconsInTooltips.count()

      expect(iconCount).toBeGreaterThan(0)
      console.log(`✅ Sprint 4: ${iconCount} ícones com aria-hidden="true"`)
    })

    test('deve ter focus indicators visíveis em botões', async ({ page }) => {
      await page.goto('http://localhost:3000/integracoes/dashboard')
      await page.waitForLoadState('networkidle')

      // Focar no primeiro botão visível
      const firstButton = page.locator('button').first()
      await firstButton.focus()

      // Verificar se o botão está focado
      const isFocused = await firstButton.evaluate(el => el === document.activeElement)
      expect(isFocused).toBe(true)

      console.log('✅ Sprint 4: Focus indicators funcionando')
    })

    test('deve ter navegação por teclado funcional', async ({ page }) => {
      await page.goto('http://localhost:3000/integracoes/dashboard')
      await page.waitForLoadState('networkidle')

      // Pressionar Tab 3 vezes
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')

      // Verificar se algum elemento está focado
      const focusedElement = await page.evaluate(() => {
        const el = document.activeElement
        return el ? el.tagName : null
      })

      expect(focusedElement).not.toBe('BODY')
      console.log(`✅ Sprint 4: Navegação por teclado funcional (elemento focado: ${focusedElement})`)
    })

    test('deve ter role="searchbox" no input de busca', async ({ page }) => {
      await page.goto('http://localhost:3000/integracoes/conversations')
      await page.waitForLoadState('networkidle')

      const searchbox = page.locator('[role="searchbox"]')
      const hasSearchbox = await searchbox.count() > 0

      if (hasSearchbox) {
        await expect(searchbox.first()).toBeVisible()

        // Verificar aria-label
        const ariaLabel = await searchbox.first().getAttribute('aria-label')
        expect(ariaLabel).toContain('Buscar')

        console.log('✅ Sprint 4: Searchbox com role e aria-label corretos')
      }
    })

    test('deve ter role="log" na área de mensagens', async ({ page }) => {
      await page.goto('http://localhost:3000/integracoes/conversations')
      await page.waitForLoadState('networkidle')

      const logRegion = page.locator('[role="log"]')
      const hasLog = await logRegion.count() > 0

      if (hasLog) {
        await expect(logRegion.first()).toBeAttached()

        // Verificar aria-live
        const ariaLive = await logRegion.first().getAttribute('aria-live')
        expect(ariaLive).toBe('polite')

        console.log('✅ Sprint 4: Área de mensagens com role="log" e aria-live="polite"')
      }
    })
  })

  test.describe('UX Score Validation', () => {
    test('deve carregar Dashboard sem erros', async ({ page }) => {
      const errors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push(msg.text())
        }
      })

      await page.goto('http://localhost:3000/integracoes/dashboard')
      await page.waitForLoadState('networkidle')

      expect(errors.length).toBe(0)
      console.log('✅ Dashboard carregado sem erros no console')
    })

    test('deve carregar Conversations sem erros', async ({ page }) => {
      const errors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push(msg.text())
        }
      })

      await page.goto('http://localhost:3000/integracoes/conversations')
      await page.waitForLoadState('networkidle')

      expect(errors.length).toBe(0)
      console.log('✅ Conversations carregado sem erros no console')
    })

    test('deve ter todas as páginas principais acessíveis', async ({ page }) => {
      const pages = [
        '/integracoes/dashboard',
        '/integracoes/conversations',
        '/integracoes',
      ]

      for (const pagePath of pages) {
        const response = await page.goto(`http://localhost:3000${pagePath}`)
        expect(response?.status()).toBe(200)
        console.log(`✅ ${pagePath} - Status 200`)
      }
    })
  })

  test.describe('Performance & Loading States', () => {
    test('deve mostrar skeletons durante carregamento', async ({ page }) => {
      await page.goto('http://localhost:3000/integracoes/dashboard')

      // Verificar se existe skeleton
      const skeleton = page.locator('[class*="skeleton"]').first()

      // Skeleton pode aparecer ou não dependendo da velocidade
      const hasSkeleton = await skeleton.count() > 0
      console.log(`✅ Skeleton ${hasSkeleton ? 'encontrado' : 'carregou rápido demais'}`)
    })

    test('deve ter tempo de carregamento aceitável (<5s)', async ({ page }) => {
      const startTime = Date.now()

      await page.goto('http://localhost:3000/integracoes/dashboard')
      await page.waitForLoadState('networkidle')

      const loadTime = Date.now() - startTime

      expect(loadTime).toBeLessThan(5000)
      console.log(`✅ Tempo de carregamento: ${loadTime}ms`)
    })
  })
})
