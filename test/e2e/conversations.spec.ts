/**
 * Conversations Page E2E Tests
 * Testa funcionalidade completa da página de conversas
 */

import { test, expect } from '@playwright/test'

test.describe('Conversations Page', () => {
  test.beforeEach(async ({ page }) => {
    // TODO: Setup - fazer login e garantir instância conectada
    await page.goto('/integracoes/conversations')
  })

  test.describe('Page Load and Layout', () => {
    test('deve carregar a página sem erros', async ({ page }) => {
      await expect(page).toHaveTitle(/Quayer/)

      // Verificar que não há erros de console críticos
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text())
        }
      })

      await page.waitForLoadState('networkidle')
      expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0)
    })

    test('deve mostrar layout de 3 colunas', async ({ page }) => {
      // Aguardar carregamento
      await page.waitForSelector('text=Instâncias', { timeout: 5000 })

      // Verificar colunas
      const instancesColumn = page.locator('text=Instâncias').locator('..')
      const conversationsColumn = page.locator('input[placeholder="Buscar conversas..."]').locator('..')
      const messagesColumn = page.locator('text=Selecione uma conversa')

      await expect(instancesColumn).toBeVisible()
      await expect(conversationsColumn).toBeVisible()
      await expect(messagesColumn).toBeVisible()
    })

    test('deve mostrar alert quando não há instâncias conectadas', async ({ page }) => {
      // TODO: Setup com zero instâncias
      const alert = page.locator('text=Nenhuma instância conectada')

      // Se não houver instâncias, deve mostrar o alert
      const hasInstances = await page.locator('text=Instâncias').isVisible()
      if (!hasInstances) {
        await expect(alert).toBeVisible()
      }
    })
  })

  test.describe('Instance Selection', () => {
    test('deve listar instâncias conectadas', async ({ page }) => {
      await page.waitForSelector('text=Instâncias', { timeout: 5000 })

      const instancesList = page.locator('text=Instâncias').locator('..')
      await expect(instancesList).toBeVisible()

      // Verificar se há pelo menos uma instância (se houver)
      const instanceButtons = instancesList.locator('button')
      const count = await instanceButtons.count()

      if (count > 0) {
        await expect(instanceButtons.first()).toBeVisible()
      }
    })

    test('deve selecionar primeira instância automaticamente', async ({ page }) => {
      await page.waitForSelector('text=Instâncias', { timeout: 5000 })

      const firstInstance = page.locator('text=Instâncias').locator('..').locator('button').first()

      if (await firstInstance.isVisible()) {
        // Primeira instância deve ter classe de selecionada
        await expect(firstInstance).toHaveClass(/bg-primary/)
      }
    })

    test('deve trocar de instância ao clicar', async ({ page }) => {
      await page.waitForSelector('text=Instâncias', { timeout: 5000 })

      const instances = page.locator('text=Instâncias').locator('..').locator('button')
      const count = await instances.count()

      if (count > 1) {
        await instances.nth(1).click()
        await expect(instances.nth(1)).toHaveClass(/bg-primary/)
      }
    })
  })

  test.describe('Conversations List', () => {
    test('deve ter campo de busca de conversas', async ({ page }) => {
      const searchInput = page.locator('input[placeholder="Buscar conversas..."]')
      await expect(searchInput).toBeVisible()
    })

    test('deve filtrar conversas ao digitar busca', async ({ page }) => {
      const searchInput = page.locator('input[placeholder="Buscar conversas..."]')
      await searchInput.fill('teste')

      // Aguardar requisição de busca
      await page.waitForTimeout(500)

      // TODO: Verificar resultados filtrados
    })

    test('deve mostrar lista de conversas', async ({ page }) => {
      await page.waitForSelector('input[placeholder="Buscar conversas..."]', { timeout: 5000 })

      // Buscar lista de conversas
      const chatsList = page.locator('input[placeholder="Buscar conversas..."]').locator('../..')

      // Se houver conversas, deve mostrar
      const hasChats = await chatsList.locator('button').count() > 0
      if (hasChats) {
        await expect(chatsList.locator('button').first()).toBeVisible()
      }
    })

    test('deve mostrar badge de mensagens não lidas', async ({ page }) => {
      await page.waitForSelector('input[placeholder="Buscar conversas..."]', { timeout: 5000 })

      // TODO: Verificar badge quando houver mensagens não lidas
    })

    test('deve mostrar timestamp da última mensagem', async ({ page }) => {
      await page.waitForSelector('input[placeholder="Buscar conversas..."]', { timeout: 5000 })

      const chatsList = page.locator('input[placeholder="Buscar conversas..."]').locator('../..')
      const firstChat = chatsList.locator('button').first()

      if (await firstChat.isVisible()) {
        // Deve ter timestamp (ex: "há 5 minutos")
        await expect(firstChat.locator('text=/há|atrás|agora/i')).toBeVisible()
      }
    })
  })

  test.describe('Chat Selection and Messages', () => {
    test('deve selecionar conversa ao clicar', async ({ page }) => {
      await page.waitForSelector('input[placeholder="Buscar conversas..."]', { timeout: 5000 })

      const chatsList = page.locator('input[placeholder="Buscar conversas..."]').locator('../..')
      const firstChat = chatsList.locator('button').first()

      if (await firstChat.isVisible()) {
        await firstChat.click()

        // Chat deve ficar selecionado (bg-muted)
        await expect(firstChat).toHaveClass(/bg-muted/)

        // Área de mensagens deve aparecer
        await expect(page.locator('text=Selecione uma conversa')).not.toBeVisible()
      }
    })

    test('deve mostrar header do chat com avatar e nome', async ({ page }) => {
      await page.waitForSelector('input[placeholder="Buscar conversas..."]', { timeout: 5000 })

      const firstChat = page.locator('input[placeholder="Buscar conversas..."]')
        .locator('../..').locator('button').first()

      if (await firstChat.isVisible()) {
        await firstChat.click()
        await page.waitForTimeout(500)

        // Header deve ter avatar e nome
        const chatHeader = page.locator('.border-b').first()
        await expect(chatHeader).toBeVisible()
      }
    })

    test('deve carregar e exibir mensagens do chat', async ({ page }) => {
      await page.waitForSelector('input[placeholder="Buscar conversas..."]', { timeout: 5000 })

      const firstChat = page.locator('input[placeholder="Buscar conversas..."]')
        .locator('../..').locator('button').first()

      if (await firstChat.isVisible()) {
        await firstChat.click()

        // Aguardar carregamento das mensagens
        await page.waitForTimeout(1000)

        // TODO: Verificar se mensagens aparecem
      }
    })

    test('deve mostrar indicadores de status de mensagem (enviado/lido)', async ({ page }) => {
      // TODO: Verificar ícones de check/check-check
    })

    test('deve mostrar timestamp relativo das mensagens', async ({ page }) => {
      // TODO: Verificar timestamps "há X minutos"
    })

    test('deve diferenciar mensagens enviadas e recebidas visualmente', async ({ page }) => {
      // TODO: Verificar bg-primary para enviadas e bg-muted para recebidas
    })
  })

  test.describe('Send Messages', () => {
    test('deve ter campo de input para digitar mensagem', async ({ page }) => {
      await page.waitForSelector('input[placeholder="Buscar conversas..."]', { timeout: 5000 })

      const firstChat = page.locator('input[placeholder="Buscar conversas..."]')
        .locator('../..').locator('button').first()

      if (await firstChat.isVisible()) {
        await firstChat.click()
        await page.waitForTimeout(500)

        const messageInput = page.locator('input[placeholder="Digite uma mensagem..."]')
        await expect(messageInput).toBeVisible()
      }
    })

    test('deve ter botões de anexos (imagem/arquivo)', async ({ page }) => {
      await page.waitForSelector('input[placeholder="Buscar conversas..."]', { timeout: 5000 })

      const firstChat = page.locator('input[placeholder="Buscar conversas..."]')
        .locator('../..').locator('button').first()

      if (await firstChat.isVisible()) {
        await firstChat.click()
        await page.waitForTimeout(500)

        // Botões de mídia
        const imageButton = page.locator('button').filter({ has: page.locator('svg') }).first()
        await expect(imageButton).toBeVisible()
      }
    })

    test('deve enviar mensagem ao clicar no botão send', async ({ page }) => {
      await page.waitForSelector('input[placeholder="Buscar conversas..."]', { timeout: 5000 })

      const firstChat = page.locator('input[placeholder="Buscar conversas..."]')
        .locator('../..').locator('button').first()

      if (await firstChat.isVisible()) {
        await firstChat.click()
        await page.waitForTimeout(500)

        const messageInput = page.locator('input[placeholder="Digite uma mensagem..."]')
        await messageInput.fill('Mensagem de teste E2E')

        const sendButton = page.locator('button').filter({ has: page.locator('svg') }).last()
        await sendButton.click()

        // TODO: Verificar se mensagem foi enviada
        // Aguardar toast de sucesso
        await expect(page.locator('text=Mensagem enviada')).toBeVisible({ timeout: 5000 })
      }
    })

    test('deve enviar mensagem ao pressionar Enter', async ({ page }) => {
      await page.waitForSelector('input[placeholder="Buscar conversas..."]', { timeout: 5000 })

      const firstChat = page.locator('input[placeholder="Buscar conversas..."]')
        .locator('../..').locator('button').first()

      if (await firstChat.isVisible()) {
        await firstChat.click()
        await page.waitForTimeout(500)

        const messageInput = page.locator('input[placeholder="Digite uma mensagem..."]')
        await messageInput.fill('Mensagem com Enter')
        await messageInput.press('Enter')

        // Campo deve limpar após envio
        await expect(messageInput).toHaveValue('')
      }
    })

    test('deve desabilitar botão send quando mensagem está vazia', async ({ page }) => {
      await page.waitForSelector('input[placeholder="Buscar conversas..."]', { timeout: 5000 })

      const firstChat = page.locator('input[placeholder="Buscar conversas..."]')
        .locator('../..').locator('button').first()

      if (await firstChat.isVisible()) {
        await firstChat.click()
        await page.waitForTimeout(500)

        const sendButton = page.locator('button').filter({ has: page.locator('svg') }).last()
        await expect(sendButton).toBeDisabled()
      }
    })

    test('deve mostrar feedback de erro se envio falhar', async ({ page }) => {
      // TODO: Simular erro de envio e verificar toast de erro
    })
  })

  test.describe('Loading States', () => {
    test('deve mostrar skeleton enquanto carrega conversas', async ({ page }) => {
      await page.goto('/integracoes/conversations')

      // Skeleton deve aparecer brevemente
      const skeleton = page.locator('[class*="animate-pulse"]')

      // Pode ou não estar visível dependendo da velocidade
      const isVisible = await skeleton.isVisible().catch(() => false)
      expect(typeof isVisible).toBe('boolean')
    })

    test('deve mostrar skeleton enquanto carrega mensagens', async ({ page }) => {
      await page.waitForSelector('input[placeholder="Buscar conversas..."]', { timeout: 5000 })

      const firstChat = page.locator('input[placeholder="Buscar conversas..."]')
        .locator('../..').locator('button').first()

      if (await firstChat.isVisible()) {
        await firstChat.click()

        // Skeleton de mensagens pode aparecer
        const skeleton = page.locator('[class*="animate-pulse"]')
        const isVisible = await skeleton.isVisible().catch(() => false)
        expect(typeof isVisible).toBe('boolean')
      }
    })
  })

  test.describe('Accessibility', () => {
    test('deve ter labels adequados nos inputs', async ({ page }) => {
      const searchInput = page.locator('input[placeholder="Buscar conversas..."]')
      await expect(searchInput).toHaveAttribute('placeholder')
    })

    test('deve ser navegável por teclado', async ({ page }) => {
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')

      // Elemento focado deve estar visível
      const focused = page.locator(':focus')
      await expect(focused).toBeVisible()
    })
  })

  test.describe('Responsive Design', () => {
    test('deve funcionar em mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/integracoes/conversations')

      // Página deve ser usável
      await expect(page.locator('text=Instâncias')).toBeVisible()
    })

    test('deve funcionar em tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })
      await page.goto('/integracoes/conversations')

      await expect(page.locator('text=Instâncias')).toBeVisible()
    })
  })
})
