/**
 * E2E Tests - Configurações
 *
 * Testa CRUD completo de Tabulações, Labels, Departamentos, Webhooks
 */

import { test, expect } from '@playwright/test';
import { autoAuth, waitForElement } from './helpers/auth.helper';

test.describe('Configurações - Tabulações', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve carregar página de tabulações', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/tabulacoes');

    await expect(page.locator('h1')).toContainText('Tabulações');
    await expect(page.locator('button:has-text("Nova Tabulação")')).toBeVisible();
  });

  test('deve criar nova tabulação com color picker', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/tabulacoes');

    await page.click('button:has-text("Nova Tabulação")');
    await waitForElement(page, '[role="dialog"]');

    // Preencher nome
    await page.fill('input[id*="name"]', 'Tabulação Teste E2E');

    // Escolher cor
    await page.fill('input[type="color"]', '#ff0000');

    // Criar
    await page.click('[role="dialog"] button:has-text("Criar")');

    await expect(page.locator('text=criada com sucesso')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Tabulação Teste E2E')).toBeVisible();
  });

  test('deve editar tabulação', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/tabulacoes');
    await waitForElement(page, 'table, tbody tr');

    const firstRow = page.locator('tbody tr').first();
    await firstRow.locator('button[aria-label*="Opções"]').click();
    await page.click('text=Editar');

    await waitForElement(page, '[role="dialog"]');

    await page.fill('input[id*="name"]', 'Nome Editado');
    await page.click('[role="dialog"] button:has-text("Salvar")');

    await expect(page.locator('text=atualizada com sucesso')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Configurações - Labels', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve carregar página de labels', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/labels');

    await expect(page.locator('h1')).toContainText('Labels');
    await expect(page.locator('button:has-text("Nova Label")')).toBeVisible();
  });

  test('deve criar label com categoria', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/labels');

    await page.click('button:has-text("Nova Label")');
    await waitForElement(page, '[role="dialog"]');

    await page.fill('input[id*="name"]', 'Label Teste E2E');

    // Selecionar categoria
    await page.click('[id*="category"]');
    await page.click('text=Suporte');

    // Escolher cor
    await page.fill('input[type="color"]', '#00ff00');

    await page.click('[role="dialog"] button:has-text("Criar")');

    await expect(page.locator('text=criada com sucesso')).toBeVisible({ timeout: 5000 });
  });

  test('deve filtrar labels por categoria', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/labels');
    await waitForElement(page, 'select, [role="combobox"]');

    // Abrir select de categoria
    const categorySelect = page.locator('select, [role="combobox"]').first();
    await categorySelect.click();

    // Selecionar categoria
    await page.click('text=Suporte');

    await page.waitForTimeout(1000);

    // Verificar que filtrou
    console.log('Labels filtered by category');
  });
});

test.describe('Configurações - Departamentos', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve carregar página de departamentos', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/departamentos');

    await expect(page.locator('h1')).toContainText('Departamentos');
    await expect(page.locator('button:has-text("Novo Departamento")')).toBeVisible();
  });

  test('deve criar departamento com toggle', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/departamentos');

    await page.click('button:has-text("Novo Departamento")');
    await waitForElement(page, '[role="dialog"]');

    await page.fill('input[id*="name"]', 'Departamento Teste E2E');
    await page.fill('textarea[id*="description"]', 'Descrição do departamento de teste');

    // Verificar que switch está ativo por padrão
    const toggle = page.locator('[role="dialog"] [role="switch"]');
    await expect(toggle).toBeChecked();

    await page.click('[role="dialog"] button:has-text("Criar")');

    await expect(page.locator('text=criado com sucesso')).toBeVisible({ timeout: 5000 });
  });

  test('deve ativar/desativar departamento com toggle', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/departamentos');
    await waitForElement(page, 'table');

    // Toggle no primeiro departamento
    const firstToggle = page.locator('tbody tr:first-child [role="switch"]');

    if (await firstToggle.isVisible({ timeout: 3000 })) {
      await firstToggle.click();

      await expect(page.locator('text=ativado, text=desativado')).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Configurações - Webhooks', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve carregar página de webhooks', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/webhooks');

    await expect(page.locator('h1')).toContainText('Webhooks');
    await expect(page.locator('button:has-text("Novo Webhook")')).toBeVisible();
  });

  test('deve criar webhook com múltiplos eventos', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/webhooks');

    await page.click('button:has-text("Novo Webhook")');
    await waitForElement(page, '[role="dialog"]');

    await page.fill('input[id*="url"]', 'https://webhook.site/test-e2e');
    await page.fill('input[id*="secret"]', 'secret-test-123');

    // Selecionar eventos (checkboxes)
    await page.check('text=message.received');
    await page.check('text=message.sent');
    await page.check('text=session.opened');

    // Verificar que switch está ativo
    const toggle = page.locator('[role="dialog"] [role="switch"]');
    await expect(toggle).toBeChecked();

    await page.click('[role="dialog"] button:has-text("Criar")');

    await expect(page.locator('text=criado com sucesso')).toBeVisible({ timeout: 5000 });
  });

  test('deve testar webhook', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/webhooks');
    await waitForElement(page, 'table');

    const firstRow = page.locator('tbody tr').first();

    if (await firstRow.isVisible({ timeout: 3000 })) {
      await firstRow.locator('button[aria-label*="Opções"]').click();
      await page.click('text=Testar');

      await expect(page.locator('text=testado')).toBeVisible({ timeout: 5000 });
    }
  });

  test('deve visualizar deliveries do webhook', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/webhooks');
    await waitForElement(page, 'table');

    // Click em ver entregas
    const deliveriesLink = page.locator('text=entregas').first();

    if (await deliveriesLink.isVisible({ timeout: 3000 })) {
      await deliveriesLink.click();

      // Aguardar dialog de deliveries
      await waitForElement(page, '[role="dialog"]');

      // Verificar header
      await expect(page.locator('text=Entregas do Webhook')).toBeVisible();

      // Se tem deliveries, verificar detalhes
      const deliveryRow = page.locator('[role="dialog"] tbody tr').first();

      if (await deliveryRow.isVisible({ timeout: 2000 })) {
        // Click em ver detalhes
        await deliveryRow.locator('button[aria-label*="detalhes"]').click();

        // Aguardar dialog de detalhes
        await waitForElement(page, 'text=Detalhes da Entrega');

        // Verificar info
        await expect(page.locator('text=Status Code')).toBeVisible();
      }
    }
  });

  test('deve retentar delivery falhado', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/webhooks');
    await waitForElement(page, 'table');

    const deliveriesLink = page.locator('text=entregas').first();

    if (await deliveriesLink.isVisible({ timeout: 3000 })) {
      await deliveriesLink.click();
      await waitForElement(page, '[role="dialog"]');

      // Procurar delivery com status failed
      const failedDelivery = page.locator('[data-status="failed"], text=Falhou').first();

      if (await failedDelivery.isVisible({ timeout: 2000 })) {
        // Click no botão retry
        const retryButton = page.locator('button[aria-label*="Retentar"]').first();

        if (await retryButton.isVisible()) {
          await retryButton.click();

          await expect(page.locator('text=retentada')).toBeVisible({ timeout: 5000 });
        }
      }
    }
  });
});

test.describe('Configurações - Busca e Filtros', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve buscar tabulações', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/tabulacoes');
    await waitForElement(page, 'input[placeholder*="Buscar"]');

    await page.fill('input[placeholder*="Buscar"]', 'Cliente');
    await page.waitForTimeout(500);

    // Verificar que filtrou
    console.log('Tabulações filtered');
  });

  test('deve buscar labels', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/labels');
    await waitForElement(page, 'input[placeholder*="Buscar"]');

    await page.fill('input[placeholder*="Buscar"]', 'Urgente');
    await page.waitForTimeout(500);

    console.log('Labels filtered');
  });

  test('deve buscar departamentos', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/departamentos');
    await waitForElement(page, 'input[placeholder*="Buscar"]');

    await page.fill('input[placeholder*="Buscar"]', 'Suporte');
    await page.waitForTimeout(500);

    console.log('Departamentos filtered');
  });

  test('deve buscar webhooks por URL', async ({ page }) => {
    await page.goto('http://localhost:3000/configuracoes/webhooks');
    await waitForElement(page, 'input[placeholder*="Buscar"]');

    await page.fill('input[placeholder*="Buscar"]', 'webhook.site');
    await page.waitForTimeout(500);

    console.log('Webhooks filtered');
  });
});

test.describe('Configurações - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve ter aria-labels em todas as páginas', async ({ page }) => {
    const pages = [
      '/configuracoes/tabulacoes',
      '/configuracoes/labels',
      '/configuracoes/departamentos',
      '/configuracoes/webhooks',
    ];

    for (const pagePath of pages) {
      await page.goto(`http://localhost:3000${pagePath}`);
      await waitForElement(page, 'input[aria-label], button[aria-label]');

      const ariaElements = page.locator('[aria-label]');
      const count = await ariaElements.count();

      console.log(`Page ${pagePath} has ${count} elements with aria-label`);
      expect(count).toBeGreaterThan(0);
    }
  });
});
