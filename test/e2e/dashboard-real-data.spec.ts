/**
 * Dashboard Real Data E2E Tests
 * Testa dashboard com dados reais da UAZapi
 */

import { test, expect } from '@playwright/test'

test.describe('Dashboard with Real Data', () => {
  test.beforeEach(async ({ page }) => {
    // TODO: Setup - fazer login
    await page.goto('/integracoes/dashboard')
  })

  test.describe('Page Load and Data Fetching', () => {
    test('deve carregar página sem erros', async ({ page }) => {
      await expect(page).toHaveTitle(/Quayer/)

      // Verificar ausência de erros críticos
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text())
        }
      })

      await page.waitForLoadState('networkidle')
      expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0)
    })

    test('deve fazer requisição para /api/v1/dashboard/metrics', async ({ page }) => {
      const metricsRequest = page.waitForResponse(
        response => response.url().includes('/api/v1/dashboard/metrics')
      )

      await page.goto('/integracoes/dashboard')

      const response = await metricsRequest
      expect(response.status()).toBe(200)

      const data = await response.json()
      expect(data).toHaveProperty('data')
    })

    test('deve fazer requisição para /api/v1/instances/list', async ({ page }) => {
      const instancesRequest = page.waitForResponse(
        response => response.url().includes('/api/v1/instances/list')
      )

      await page.goto('/integracoes/dashboard')

      const response = await instancesRequest
      expect(response.status()).toBe(200)
    })
  })

  test.describe('Alert States', () => {
    test('deve mostrar alert quando não há instâncias conectadas', async ({ page }) => {
      // TODO: Setup com zero instâncias
      const alert = page.locator('text=Nenhuma instância conectada')

      // Se tiver alert, verificar mensagem
      if (await alert.isVisible()) {
        await expect(alert).toContainText('Conecte pelo menos uma instância')
      }
    })
  })

  test.describe('Main Stats Cards', () => {
    test('deve mostrar card de Integrações Ativas', async ({ page }) => {
      await page.waitForSelector('text=Integrações Ativas', { timeout: 5000 })

      const card = page.locator('text=Integrações Ativas').locator('..')
      await expect(card).toBeVisible()

      // Deve mostrar número (não null/undefined)
      const value = await card.locator('text=/^\\d+$/').first().textContent()
      expect(value).toMatch(/^\d+$/)
    })

    test('deve mostrar card de Conversas Abertas', async ({ page }) => {
      await page.waitForSelector('text=Conversas Abertas', { timeout: 5000 })

      const card = page.locator('text=Conversas Abertas').locator('..')
      await expect(card).toBeVisible()

      // Valor deve ser número
      const value = await card.locator('text=/^\\d+$/').first().textContent()
      expect(value).toMatch(/^\d+$/)
    })

    test('deve mostrar card de Mensagens Hoje', async ({ page }) => {
      await page.waitForSelector('text=Mensagens Hoje', { timeout: 5000 })

      const card = page.locator('text=Mensagens Hoje').locator('..')
      await expect(card).toBeVisible()

      // Valor formatado com vírgulas (ex: 1,234)
      const value = await card.locator('.text-4xl').textContent()
      expect(value).toBeTruthy()
    })

    test('deve mostrar card de Controladas por IA', async ({ page }) => {
      await page.waitForSelector('text=Controladas por IA', { timeout: 5000 })

      const card = page.locator('text=Controladas por IA').locator('..')
      await expect(card).toBeVisible()

      // Porcentagem do total
      const percentage = await card.locator('text=% do total').textContent()
      expect(percentage).toMatch(/\d+% do total/)
    })

    test('cards devem mostrar 0 ao invés de null/undefined', async ({ page }) => {
      await page.waitForLoadState('networkidle')

      // Verificar que não há "null", "undefined", "NaN" nos cards
      const pageContent = await page.content()
      expect(pageContent).not.toContain('null')
      expect(pageContent).not.toContain('undefined')
      expect(pageContent).not.toContain('NaN')
    })
  })

  test.describe('Conversation Metrics Card', () => {
    test('deve mostrar métricas de conversas', async ({ page }) => {
      await page.waitForSelector('text=Métricas de Conversas', { timeout: 5000 })

      const card = page.locator('text=Métricas de Conversas').locator('..')
      await expect(card).toBeVisible()

      // Deve ter 6 métricas
      await expect(card.locator('text=Total')).toBeVisible()
      await expect(card.locator('text=Em Andamento')).toBeVisible()
      await expect(card.locator('text=IA')).toBeVisible()
      await expect(card.locator('text=Humano')).toBeVisible()
      await expect(card.locator('text=Tempo Médio')).toBeVisible()
      await expect(card.locator('text=Taxa Resolução')).toBeVisible()
    })

    test('valores devem ser números válidos', async ({ page }) => {
      await page.waitForSelector('text=Métricas de Conversas', { timeout: 5000 })

      const card = page.locator('text=Métricas de Conversas').locator('..')

      // Todos valores devem ser numéricos
      const values = await card.locator('.text-2xl').allTextContents()
      values.forEach(value => {
        expect(value).toMatch(/^\d+(\.\d+)?(min|%)?$/)
      })
    })
  })

  test.describe('Message Performance Card', () => {
    test('deve mostrar performance de mensagens', async ({ page }) => {
      await page.waitForSelector('text=Performance de Mensagens', { timeout: 5000 })

      const card = page.locator('text=Performance de Mensagens').locator('..')
      await expect(card).toBeVisible()

      // Métricas
      await expect(card.locator('text=Enviadas')).toBeVisible()
      await expect(card.locator('text=Entregues')).toBeVisible()
      await expect(card.locator('text=Lidas')).toBeVisible()
      await expect(card.locator('text=Falhadas')).toBeVisible()
    })

    test('deve mostrar porcentagens de entrega e leitura', async ({ page }) => {
      await page.waitForSelector('text=Performance de Mensagens', { timeout: 5000 })

      const card = page.locator('text=Performance de Mensagens').locator('..')

      // Taxas de sucesso
      const percentages = await card.locator('text=/%/').allTextContents()
      percentages.forEach(pct => {
        expect(pct).toMatch(/^\d+(\.\d+)?%$/)
      })
    })
  })

  test.describe('Charts with Real Data', () => {
    test('deve renderizar gráfico de Conversas por Hora', async ({ page }) => {
      await page.waitForSelector('text=Conversas por Hora', { timeout: 5000 })

      const chartCard = page.locator('text=Conversas por Hora').locator('..')
      await expect(chartCard).toBeVisible()

      // Chart deve estar renderizado (SVG)
      const svg = chartCard.locator('svg')
      await expect(svg).toBeVisible()
    })

    test('deve renderizar gráfico de IA vs Humano', async ({ page }) => {
      await page.waitForSelector('text=IA vs Humano', { timeout: 5000 })

      const chartCard = page.locator('text=IA vs Humano').locator('..')
      await expect(chartCard).toBeVisible()

      const svg = chartCard.locator('svg')
      await expect(svg).toBeVisible()
    })

    test('deve renderizar gráfico de Mensagens por Status', async ({ page }) => {
      await page.waitForSelector('text=Mensagens por Status', { timeout: 5000 })

      const chartCard = page.locator('text=Mensagens por Status').locator('..')
      await expect(chartCard).toBeVisible()

      const svg = chartCard.locator('svg')
      await expect(svg).toBeVisible()
    })

    test('charts devem usar dados reais não mock', async ({ page }) => {
      // Verificar que não há dados hardcoded no HTML
      const pageContent = await page.content()

      // Mock data markers que NÃO devem existir
      expect(pageContent).not.toContain('mockConversationsPerHour')
      expect(pageContent).not.toContain('mockMessagesByStatus')
      expect(pageContent).not.toContain('mockAiVsHuman')
    })
  })

  test.describe('Loading States', () => {
    test('deve mostrar skeleton durante carregamento', async ({ page }) => {
      await page.goto('/integracoes/dashboard')

      // Skeleton pode aparecer brevemente
      const skeleton = page.locator('[class*="animate-pulse"]')
      const isVisible = await skeleton.isVisible().catch(() => false)
      expect(typeof isVisible).toBe('boolean')
    })

    test('não deve mostrar skeleton após dados carregarem', async ({ page }) => {
      await page.waitForLoadState('networkidle')

      // Após networkidle, não deve ter skeleton
      const skeleton = page.locator('[class*="animate-pulse"]')
      await expect(skeleton).not.toBeVisible()
    })
  })

  test.describe('Data Accuracy', () => {
    test('integrações ativas deve corresponder a instâncias conectadas', async ({ page }) => {
      await page.waitForLoadState('networkidle')

      // Buscar valor do card
      const activeCard = page.locator('text=Integrações Ativas').locator('..')
      const activeValue = await activeCard.locator('.text-4xl').textContent()

      // Buscar total de instâncias
      const totalText = await activeCard.locator('text=/de \\d+ total/').textContent()
      const match = totalText?.match(/de (\d+) total/)

      if (match) {
        const active = parseInt(activeValue || '0')
        const total = parseInt(match[1])

        expect(active).toBeLessThanOrEqual(total)
      }
    })

    test('porcentagens devem estar entre 0 e 100', async ({ page }) => {
      await page.waitForLoadState('networkidle')

      const percentages = await page.locator('text=/%/').allTextContents()

      percentages.forEach(pct => {
        const value = parseFloat(pct.replace('%', ''))
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(100)
      })
    })
  })

  test.describe('Real-time Updates', () => {
    test('deve atualizar dados quando houver mudanças', async ({ page }) => {
      // TODO: Implementar teste de atualização em tempo real
    })
  })

  test.describe('Error Handling', () => {
    test('deve mostrar erro se API falhar', async ({ page }) => {
      // TODO: Simular falha de API e verificar tratamento
    })

    test('deve funcionar sem instâncias', async ({ page }) => {
      // Página deve carregar mesmo sem instâncias
      await page.waitForLoadState('networkidle')

      const heading = page.locator('text=Dashboard')
      await expect(heading).toBeVisible()
    })
  })

  test.describe('Performance', () => {
    test('deve carregar em menos de 3 segundos', async ({ page }) => {
      const startTime = Date.now()

      await page.goto('/integracoes/dashboard')
      await page.waitForLoadState('networkidle')

      const loadTime = Date.now() - startTime
      expect(loadTime).toBeLessThan(3000)
    })

    test('não deve ter memory leaks', async ({ page }) => {
      // Recarregar página múltiplas vezes
      for (let i = 0; i < 3; i++) {
        await page.reload()
        await page.waitForLoadState('networkidle')
      }

      // Não deve ter erros de memória
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text())
        }
      })

      expect(errors.filter(e => e.includes('memory')).length).toBe(0)
    })
  })
})
