/**
 * @file Integration Creation Flow - Nova UX
 * @description Testa o fluxo completo de criação de integração com 5 etapas
 * 
 * Filosofia: 100% Real
 * - PostgreSQL real
 * - Browser real (Playwright)
 * - Dados reais (sem mocks)
 */

import { test, expect } from '@playwright/test';

test.describe('Nova UX - Fluxo Completo de Criação de Integração', () => {
  test.beforeEach(async ({ page }) => {
    // Navegar para a página de login
    await page.goto('http://localhost:3000/login');
  });

  test('Deve criar integração completa - 5 etapas', async ({ page }) => {
    // ============================================================
    // PRÉ-REQUISITO: Login como usuário autenticado
    // ============================================================
    // NOTA: Este teste requer login manual ou mock de OTP
    // Para execução automatizada, configurar variável de ambiente com token válido
    
    const token = process.env.TEST_USER_TOKEN;
    if (token) {
      await page.evaluate((t) => {
        localStorage.setItem('accessToken', t);
      }, token);
      await page.goto('http://localhost:3000/integracoes');
    } else {
      console.log('⚠️  Teste requer login manual - pular por enquanto');
      test.skip();
      return;
    }

    // ============================================================
    // STEP 1: Abrir Modal de Criação
    // ============================================================
    await test.step('Abrir modal de criação', async () => {
      await page.click('button:has-text("Nova Integração")');
      
      // Validar que modal abriu
      await expect(page.locator('dialog')).toBeVisible();
      await expect(page.locator('h2:has-text("Criar Nova Integração")')).toBeVisible();
      
      // Screenshot Step 1
      await page.screenshot({ path: '.playwright-mcp/test-nova-ux-step1.png' });
    });

    // ============================================================
    // STEP 2: Selecionar Canal (WhatsApp Business)
    // ============================================================
    await test.step('Selecionar WhatsApp Business', async () => {
      // Verificar progress bar
      const progressSteps = page.locator('[data-step]');
      await expect(progressSteps).toHaveCount(5);
      
      // Clicar no card do WhatsApp Business
      await page.click('[data-channel="whatsapp"]');
      
      // Validar que card foi selecionado (borda roxa)
      const whatsappCard = page.locator('[data-channel="whatsapp"]');
      await expect(whatsappCard).toHaveClass(/border-purple/);
      
      // Clicar em "Próximo"
      await page.click('button:has-text("Próximo")');
      
      // Screenshot Step 2
      await page.screenshot({ path: '.playwright-mcp/test-nova-ux-step2.png' });
    });

    // ============================================================
    // STEP 3: Configurar Integração
    // ============================================================
    await test.step('Configurar integração', async () => {
      // Preencher formulário
      await page.fill('input[name="name"]', 'Integração Teste E2E');
      await page.fill('textarea[name="description"]', 'Integração criada via teste automatizado');
      
      // Webhook apenas para admin (verificar se visível)
      const isAdmin = await page.locator('input[name="webhookUrl"]').isVisible();
      if (isAdmin) {
        await page.fill('input[name="webhookUrl"]', 'https://webhook.site/test-e2e');
      }
      
      // Clicar em "Próximo"
      await page.click('button:has-text("Próximo")');
      
      // Screenshot Step 3
      await page.screenshot({ path: '.playwright-mcp/test-nova-ux-step3.png' });
    });

    // ============================================================
    // STEP 4: Aguardar Conexão
    // ============================================================
    await test.step('Aguardar criação da instância', async () => {
      // Aguardar loading
      await page.waitForSelector('text=Criando integração', { timeout: 5000 });
      
      // Aguardar sucesso ou QR code
      await page.waitForSelector('[data-step="3"][data-status="completed"]', { timeout: 10000 });
      
      // Screenshot Step 4
      await page.screenshot({ path: '.playwright-mcp/test-nova-ux-step4.png' });
    });

    // ============================================================
    // STEP 5: Compartilhar
    // ============================================================
    await test.step('Compartilhar integração', async () => {
      // Verificar opções de compartilhamento
      const shareButton = page.locator('button:has-text("Copiar Link")');
      await expect(shareButton).toBeVisible();
      
      // Clicar em copiar link
      await shareButton.click();
      
      // Validar toast de sucesso
      await expect(page.locator('text=Link copiado')).toBeVisible({ timeout: 3000 });
      
      // Screenshot Step 5
      await page.screenshot({ path: '.playwright-mcp/test-nova-ux-step5.png' });
      
      // Clicar em "Finalizar"
      await page.click('button:has-text("Finalizar")');
    });

    // ============================================================
    // VALIDAÇÃO FINAL: Instância Criada
    // ============================================================
    await test.step('Validar instância criada', async () => {
      // Aguardar redirecionamento para lista
      await expect(page).toHaveURL('http://localhost:3000/integracoes');
      
      // Validar que integração aparece na lista
      await expect(page.locator('text=Integração Teste E2E')).toBeVisible();
      
      // Screenshot final
      await page.screenshot({ path: '.playwright-mcp/test-nova-ux-final.png' });
    });
  });

  test('Deve validar todas as etapas do progress bar', async ({ page }) => {
    // Login (skip se não tiver token)
    const token = process.env.TEST_USER_TOKEN;
    if (!token) {
      test.skip();
      return;
    }

    await page.evaluate((t) => {
      localStorage.setItem('accessToken', t);
    }, token);
    await page.goto('http://localhost:3000/integracoes');

    // Abrir modal
    await page.click('button:has-text("Nova Integração")');

    // Validar 5 steps no progress bar
    const steps = page.locator('[data-step]');
    await expect(steps).toHaveCount(5);

    // Validar ícones de cada step
    await expect(page.locator('[data-step="0"]')).toContainText('1'); // Channel
    await expect(page.locator('[data-step="1"]')).toContainText('2'); // Config
    await expect(page.locator('[data-step="2"]')).toContainText('3'); // Connect
    await expect(page.locator('[data-step="3"]')).toContainText('4'); // Share
    await expect(page.locator('[data-step="4"]')).toContainText('5'); // Success
  });

  test('Deve mostrar features do WhatsApp Business', async ({ page }) => {
    const token = process.env.TEST_USER_TOKEN;
    if (!token) {
      test.skip();
      return;
    }

    await page.evaluate((t) => {
      localStorage.setItem('accessToken', t);
    }, token);
    await page.goto('http://localhost:3000/integracoes');

    // Abrir modal
    await page.click('button:has-text("Nova Integração")');

    // Validar features listadas
    await expect(page.locator('text=Envio de mensagens')).toBeVisible();
    await expect(page.locator('text=Recebimento via webhook')).toBeVisible();
    await expect(page.locator('text=Suporte a mídia')).toBeVisible();
    await expect(page.locator('text=Status de entrega')).toBeVisible();
  });

  test('Deve validar responsividade do modal', async ({ page }) => {
    const token = process.env.TEST_USER_TOKEN;
    if (!token) {
      test.skip();
      return;
    }

    await page.evaluate((t) => {
      localStorage.setItem('accessToken', t);
    }, token);

    // Testar em diferentes tamanhos
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 375, height: 667, name: 'mobile' },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('http://localhost:3000/integracoes');
      
      // Abrir modal
      await page.click('button:has-text("Nova Integração")');
      
      // Validar que modal é visível e responsivo
      const modal = page.locator('dialog');
      await expect(modal).toBeVisible();
      
      // Screenshot por tamanho
      await page.screenshot({ 
        path: `.playwright-mcp/test-nova-ux-${viewport.name}.png` 
      });
      
      // Fechar modal
      await page.press('body', 'Escape');
    }
  });
});

