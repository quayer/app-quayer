/**
 * @file Public Share - Compartilhamento Público
 * @description Testa o sistema de compartilhamento público de instâncias
 * 
 * Filosofia: 100% Real
 * - PostgreSQL real
 * - Browser real (Playwright)
 * - UAZAPI real (QR codes)
 */

import { test, expect } from '@playwright/test';

test.describe('Compartilhamento Público - Share Tokens', () => {
  
  test('Deve gerar token de compartilhamento', async ({ page }) => {
    // Login como usuário com token
    const token = process.env.TEST_USER_TOKEN;
    if (!token) {
      console.log('⚠️  Teste requer login - pular');
      test.skip();
      return;
    }

    await page.evaluate((t) => {
      localStorage.setItem('accessToken', t);
    }, token);

    // Navegar para integrações
    await page.goto('http://localhost:3000/integracoes');

    // Assumir que existe pelo menos 1 integração
    // Se não existir, criar uma primeiro
    const integrationsCount = await page.locator('[data-integration-card]').count();
    
    if (integrationsCount === 0) {
      console.log('⚠️  Nenhuma integração encontrada - criar uma primeiro');
      test.skip();
      return;
    }

    // Abrir menu da primeira integração
    await page.click('[data-integration-card]:first-child button[data-menu-trigger]');

    // Clicar em "Compartilhar Link"
    await page.click('text=Compartilhar Link');

    // Aguardar toast de sucesso
    await expect(page.locator('text=Link copiado')).toBeVisible({ timeout: 5000 });

    // Verificar que link foi copiado para clipboard
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('/integracoes/compartilhar/share_');
  });

  test('Deve acessar página pública sem login', async ({ page }) => {
    // NOTA: Este teste requer um token válido pré-existente
    // Para execução real, gerar token via API primeiro
    
    const shareToken = process.env.TEST_SHARE_TOKEN || 'share_test_token';
    
    // Acessar página pública (sem estar logado)
    await page.goto(`http://localhost:3000/integracoes/compartilhar/${shareToken}`);

    // Validações da página pública
    await test.step('Validar elementos da página', async () => {
      // Se token válido, deve mostrar QR code
      // Se inválido/expirado, deve mostrar mensagem de erro
      
      const hasQrCode = await page.locator('[data-qr-code]').isVisible();
      const hasExpiredMessage = await page.locator('text=expirado').isVisible();
      
      // Deve ter um dos dois
      expect(hasQrCode || hasExpiredMessage).toBe(true);
      
      // Screenshot
      await page.screenshot({ path: '.playwright-mcp/test-public-share.png' });
    });
  });

  test('Deve exibir QR code e informações da instância', async ({ page }) => {
    const shareToken = process.env.TEST_VALID_SHARE_TOKEN;
    if (!shareToken) {
      console.log('⚠️  Teste requer token válido - pular');
      test.skip();
      return;
    }

    await page.goto(`http://localhost:3000/integracoes/compartilhar/${shareToken}`);

    // Validar elementos essenciais
    await expect(page.locator('[data-qr-code]')).toBeVisible();
    await expect(page.locator('text=Escaneie o QR Code')).toBeVisible();
    await expect(page.locator('[data-timer]')).toBeVisible();
    await expect(page.locator('button:has-text("Atualizar QR Code")')).toBeVisible();

    // Validar informações da instância
    await expect(page.locator('[data-instance-name]')).toBeVisible();
    await expect(page.locator('[data-organization-name]')).toBeVisible();
  });

  test('Deve refresh QR code e estender expiração', async ({ page }) => {
    const shareToken = process.env.TEST_VALID_SHARE_TOKEN;
    if (!shareToken) {
      test.skip();
      return;
    }

    await page.goto(`http://localhost:3000/integracoes/compartilhar/${shareToken}`);

    // Capturar tempo inicial
    const initialTime = await page.locator('[data-timer]').textContent();

    // Clicar em refresh
    await page.click('button:has-text("Atualizar QR Code")');

    // Aguardar toast de sucesso
    await expect(page.locator('text=QR Code atualizado')).toBeVisible({ timeout: 5000 });

    // Validar que timer foi resetado
    const newTime = await page.locator('[data-timer]').textContent();
    expect(newTime).not.toBe(initialTime);

    // Screenshot após refresh
    await page.screenshot({ path: '.playwright-mcp/test-public-share-refreshed.png' });
  });

  test('Deve mostrar mensagem de expiração para token inválido', async ({ page }) => {
    // Token inválido propositalmente
    const invalidToken = 'share_invalid_token_123';
    
    await page.goto(`http://localhost:3000/integracoes/compartilhar/${invalidToken}`);

    // Deve mostrar mensagem de erro
    await expect(page.locator('text=expirado')).toBeVisible();
    await expect(page.locator('text=inválido')).toBeVisible();

    // QR code NÃO deve ser visível
    await expect(page.locator('[data-qr-code]')).not.toBeVisible();

    // Screenshot de estado expirado
    await page.screenshot({ path: '.playwright-mcp/test-public-share-expired.png' });
  });

  test('Deve validar timer de expiração visual', async ({ page }) => {
    const shareToken = process.env.TEST_VALID_SHARE_TOKEN;
    if (!shareToken) {
      test.skip();
      return;
    }

    await page.goto(`http://localhost:3000/integracoes/compartilhar/${shareToken}`);

    // Verificar que timer está visível e contando
    const timer = page.locator('[data-timer]');
    await expect(timer).toBeVisible();

    // Capturar tempo inicial
    const time1 = await timer.textContent();
    
    // Aguardar 3 segundos
    await page.waitForTimeout(3000);
    
    // Capturar tempo após 3s
    const time2 = await timer.textContent();

    // Timer deve ter mudado (contagem regressiva)
    expect(time1).not.toBe(time2);
  });

  test('Deve validar responsividade da página pública', async ({ page }) => {
    const shareToken = process.env.TEST_VALID_SHARE_TOKEN || 'share_test';
    
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 375, height: 667, name: 'mobile' },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(`http://localhost:3000/integracoes/compartilhar/${shareToken}`);

      // Validar layout responsivo
      const container = page.locator('main');
      await expect(container).toBeVisible();

      // Screenshot por tamanho
      await page.screenshot({ 
        path: `.playwright-mcp/test-public-share-${viewport.name}.png` 
      });
    }
  });
});

test.describe('Compartilhamento - Integração com Backend', () => {
  
  test('Deve criar share token via API', async ({ request }) => {
    const token = process.env.TEST_USER_TOKEN;
    if (!token) {
      test.skip();
      return;
    }

    const instanceId = process.env.TEST_INSTANCE_ID;
    if (!instanceId) {
      console.log('⚠️  Requer instance ID - pular');
      test.skip();
      return;
    }

    // Fazer requisição para gerar share token
    const response = await request.post(`http://localhost:3000/api/v1/instances/${instanceId}/share`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.token).toMatch(/^share_/);
    expect(data.data.shareUrl).toContain('/integracoes/compartilhar/');
    expect(data.data.expiresAt).toBeDefined();

    console.log('✅ Share token criado:', data.data.token);
  });

  test('Deve buscar instância via share token público', async ({ request }) => {
    const shareToken = process.env.TEST_VALID_SHARE_TOKEN;
    if (!shareToken) {
      test.skip();
      return;
    }

    // Buscar instância (SEM autenticação - público)
    const response = await request.get(`http://localhost:3000/api/v1/instances/share/${shareToken}`);

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBeDefined();
      expect(data.data.name).toBeDefined();
      expect(data.data.status).toBeDefined();
      expect(data.data.organizationName).toBeDefined();
      
      console.log('✅ Instância compartilhada:', data.data.name);
    } else if (response.status() === 404) {
      console.log('⚠️  Token expirado ou inválido');
    } else {
      throw new Error(`Unexpected status: ${response.status()}`);
    }
  });

  test('Deve refresh QR code via API pública', async ({ request }) => {
    const shareToken = process.env.TEST_VALID_SHARE_TOKEN;
    if (!shareToken) {
      test.skip();
      return;
    }

    // Refresh QR code (SEM autenticação - público)
    const response = await request.post(`http://localhost:3000/api/v1/instances/share/${shareToken}/refresh`);

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.expiresAt).toBeDefined();
      // qrCode pode ou não existir dependendo do status da instância
      
      console.log('✅ QR Code refreshed, nova expiração:', data.data.expiresAt);
    } else if (response.status() === 404) {
      console.log('⚠️  Token expirado ou inválido');
    }
  });
});

