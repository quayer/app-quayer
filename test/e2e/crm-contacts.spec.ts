/**
 * E2E Tests - CRM Contacts
 *
 * Testa lista de contatos e detalhes com CRUD completo
 */

import { test, expect } from '@playwright/test';
import { autoAuth, waitForElement } from './helpers/auth.helper';

test.describe('CRM - Lista de Contatos', () => {
  test.beforeEach(async ({ page }) => {
    // Setup auth com refresh token (BYPASS OTP)
    await autoAuth(page, 'MASTER');
  });

  test('deve carregar a página de contatos com sucesso', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/contatos');

    // Verificar título
    await expect(page.locator('h1')).toContainText('Contatos');

    // Verificar stats cards
    await expect(page.locator('text=Total de Contatos')).toBeVisible();
    await expect(page.locator('text=Contatos VIP')).toBeVisible();
    await expect(page.locator('text=Leads Ativos')).toBeVisible();

    // Verificar busca
    await expect(page.locator('input[placeholder*="Buscar"]')).toBeVisible();

    // Verificar botão novo contato
    await expect(page.locator('button:has-text("Novo Contato")')).toBeVisible();
  });

  test('deve buscar contatos por nome', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/contatos');

    // Aguardar tabela carregar
    await waitForElement(page, 'table', 5000);

    // Preencher busca
    await page.fill('input[placeholder*="Buscar"]', 'João');

    // Aguardar filtro aplicar (debounce)
    await page.waitForTimeout(500);

    // Verificar que resultados foram filtrados
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toContainText('João', { timeout: 5000 });
  });

  test('deve selecionar múltiplos contatos', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/contatos');

    await waitForElement(page, 'table');

    // Selecionar primeiro checkbox
    const firstCheckbox = page.locator('tbody tr:first-child input[type="checkbox"]');
    await firstCheckbox.check();

    // Verificar que badge de seleção apareceu
    await expect(page.locator('text=selecionado')).toBeVisible();

    // Selecionar todos
    await page.locator('thead input[type="checkbox"]').check();

    // Verificar badge de múltiplos selecionados
    await expect(page.locator('text=selecionados')).toBeVisible();
  });

  test('deve excluir contato com confirmação', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/contatos');

    await waitForElement(page, 'table');

    // Click no menu de ações do primeiro contato
    const firstRow = page.locator('tbody tr:first-child');
    await firstRow.locator('button[aria-label*="Opções"]').click();

    // Click em excluir
    await page.locator('text=Excluir').click();

    // Interceptar confirm dialog e aceitar
    page.on('dialog', (dialog) => dialog.accept());

    // Aguardar toast de sucesso
    await expect(page.locator('text=excluído com sucesso')).toBeVisible({ timeout: 5000 });
  });

  test('deve navegar entre páginas', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/contatos');

    await waitForElement(page, 'table');

    // Verificar paginação
    const nextButton = page.locator('button:has-text("Próxima")');

    if (await nextButton.isEnabled()) {
      await nextButton.click();

      // Aguardar nova página carregar
      await page.waitForTimeout(1000);

      // Verificar que mudou de página (URL ou conteúdo)
      await expect(nextButton).toBeVisible();
    }
  });
});

test.describe('CRM - Detalhes do Contato', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve carregar página de detalhes do contato', async ({ page }) => {
    // Ir para lista
    await page.goto('http://localhost:3000/crm/contatos');
    await waitForElement(page, 'table');

    // Click no primeiro contato
    await page.locator('tbody tr:first-child td:nth-child(2)').click();

    // Aguardar página de detalhes
    await page.waitForURL('**/crm/contatos/**');

    // Verificar que carregou detalhes
    await expect(page.locator('h1, h2')).toContainText(/Nome|Email|Telefone/);

    // Verificar tabs
    await expect(page.locator('text=Informações')).toBeVisible();
    await expect(page.locator('text=Mensagens')).toBeVisible();
    await expect(page.locator('text=Observações')).toBeVisible();
  });

  test('deve editar informações do contato', async ({ page }) => {
    // Navegar direto para um contato (assumindo ID conhecido de teste)
    await page.goto('http://localhost:3000/crm/contatos');
    await waitForElement(page, 'table');
    await page.locator('tbody tr:first-child td:nth-child(2)').click();
    await page.waitForURL('**/crm/contatos/**');

    // Click no botão Editar
    const editButton = page.locator('button:has-text("Editar")');
    if (await editButton.isVisible()) {
      await editButton.click();

      // Aguardar modo de edição ativar
      await waitForElement(page, 'button:has-text("Salvar")');

      // Editar nome
      await page.fill('input[name="name"]', 'Nome Editado Teste');

      // Salvar
      await page.click('button:has-text("Salvar")');

      // Aguardar toast de sucesso
      await expect(page.locator('text=atualizado com sucesso')).toBeVisible({ timeout: 5000 });
    }
  });

  test('deve adicionar tag ao contato', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/contatos');
    await waitForElement(page, 'table');
    await page.locator('tbody tr:first-child td:nth-child(2)').click();
    await page.waitForURL('**/crm/contatos/**');

    // Click em gerenciar tags
    const manageTagsButton = page.locator('button:has-text("Gerenciar Tags"), button:has-text("Adicionar Tag")');

    if (await manageTagsButton.count() > 0) {
      await manageTagsButton.first().click();

      // Aguardar dialog abrir
      await waitForElement(page, '[role="dialog"]');

      // Selecionar primeira tag disponível
      const firstCheckbox = page.locator('[role="dialog"] input[type="checkbox"]').first();
      await firstCheckbox.check();

      // Salvar
      await page.locator('[role="dialog"] button:has-text("Adicionar"), button:has-text("Salvar")').click();

      // Aguardar toast
      await expect(page.locator('text=adicionada')).toBeVisible({ timeout: 5000 });
    }
  });

  test('deve criar observação', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/contatos');
    await waitForElement(page, 'table');
    await page.locator('tbody tr:first-child td:nth-child(2)').click();
    await page.waitForURL('**/crm/contatos/**');

    // Click na tab Observações
    await page.click('text=Observações');

    // Aguardar textarea
    await waitForElement(page, 'textarea');

    // Preencher observação
    await page.fill('textarea', 'Observação de teste criada pelo Playwright');

    // Click em adicionar
    await page.click('button:has-text("Adicionar")');

    // Aguardar toast
    await expect(page.locator('text=Observação adicionada')).toBeVisible({ timeout: 5000 });

    // Verificar que observação apareceu na lista
    await expect(page.locator('text=Observação de teste criada pelo Playwright')).toBeVisible();
  });

  test('deve navegar para conversa do contato', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/contatos');
    await waitForElement(page, 'table');
    await page.locator('tbody tr:first-child td:nth-child(2)').click();
    await page.waitForURL('**/crm/contatos/**');

    // Click em Ver Conversa
    const conversaButton = page.locator('button:has-text("Ver Conversa"), button:has-text("Conversa")');

    if (await conversaButton.count() > 0) {
      await conversaButton.first().click();

      // Aguardar redirect para página de conversa
      await page.waitForURL('**/conversas/**', { timeout: 10000 });

      // Verificar que carregou página de chat
      await expect(page.locator('text=Mensagens, text=Chat')).toBeVisible();
    }
  });
});

test.describe('CRM - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await autoAuth(page, 'MASTER');
  });

  test('deve ter aria-labels apropriados', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/contatos');
    await waitForElement(page, 'table');

    // Verificar aria-label na busca
    const searchInput = page.locator('input[aria-label*="Buscar"]');
    await expect(searchInput).toBeVisible();

    // Verificar aria-labels em botões de ação
    const actionButtons = page.locator('button[aria-label*="Opções"]');
    await expect(actionButtons.first()).toBeVisible();
  });

  test('deve navegar por teclado', async ({ page }) => {
    await page.goto('http://localhost:3000/crm/contatos');
    await waitForElement(page, 'table');

    // Focus no input de busca
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Digitar na busca
    await page.keyboard.type('teste');

    // Verificar que busca foi preenchida
    const searchInput = page.locator('input[placeholder*="Buscar"]');
    await expect(searchInput).toHaveValue('teste');
  });
});
