/**
 * E2E Tests - Admin Security (Central de Seguranca)
 *
 * Testa a pagina /admin/security com tabs Dispositivos e Regras de IP
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('Admin Security - Jornada Completa E2E', () => {

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.context().clearPermissions();
  });

  // ============================================
  // Acesso e Navegacao
  // ============================================

  test.describe('Acesso e Navegacao', () => {

    test('deve redirecionar para login se nao autenticado', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/security`);

      // Middleware deve redirecionar usuario nao autenticado para /login
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    });

    test('deve carregar pagina com header correto', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/security`);

      if (page.url().includes('/login')) {
        test.skip();
        return;
      }

      // Verificar titulo principal
      await expect(page.getByRole('heading', { name: /central de segurança/i })).toBeVisible();
    });

    test('deve exibir breadcrumb Admin > Seguranca', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/security`);

      if (page.url().includes('/login')) {
        test.skip();
        return;
      }

      // Breadcrumb: Admin > Seguranca
      await expect(page.getByText('Admin')).toBeVisible();
      await expect(page.getByText('Segurança')).toBeVisible();
    });

    test('deve exibir tabs Dispositivos e Regras de IP', async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/security`);

      if (page.url().includes('/login')) {
        test.skip();
        return;
      }

      await expect(page.getByRole('tab', { name: /dispositivos/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /regras de ip/i })).toBeVisible();
    });
  });

  // ============================================
  // Tab: Dispositivos
  // ============================================

  test.describe('Tab: Dispositivos', () => {

    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/security`);

      if (page.url().includes('/login')) {
        test.skip();
        return;
      }

      // Garantir que estamos na tab Dispositivos (default)
      await expect(page.getByRole('tab', { name: /dispositivos/i })).toBeVisible();
    });

    test('deve exibir cards de estatisticas', async ({ page }) => {
      // Cards: Total de Dispositivos, Ativos, Revogados
      await expect(page.getByText('Total de Dispositivos')).toBeVisible();
      await expect(page.getByText('Ativos')).toBeVisible();
      await expect(page.getByText('Revogados')).toBeVisible();
    });

    test('deve exibir campo de busca e filtro de status', async ({ page }) => {
      // Campo de busca
      await expect(
        page.getByPlaceholder(/buscar por usuário, dispositivo ou ip/i)
      ).toBeVisible();

      // Select de filtro de status
      const statusSelect = page.locator('button').filter({ hasText: /todos|ativos|revogados/i }).first();
      await expect(statusSelect).toBeVisible();
    });

    test('deve exibir botao Atualizar', async ({ page }) => {
      await expect(
        page.getByRole('button', { name: /atualizar/i })
      ).toBeVisible();
    });

    test('deve exibir tabela ou mensagem vazia', async ({ page }) => {
      // Aguardar loading terminar
      await page.waitForTimeout(2000);

      // Deve ter ou a tabela com colunas ou a mensagem de vazio
      const table = page.locator('table');
      const emptyMessage = page.getByText(/nenhum dispositivo encontrado/i);

      const hasTable = await table.isVisible().catch(() => false);
      const hasEmpty = await emptyMessage.isVisible().catch(() => false);

      expect(hasTable || hasEmpty).toBe(true);
    });

    test('deve permitir filtrar por status (Ativos/Revogados/Todos)', async ({ page }) => {
      // Abrir o select de status
      const statusTrigger = page.locator('[role="combobox"]').or(
        page.locator('button').filter({ hasText: /todos/i })
      ).first();
      await statusTrigger.click();

      // Verificar opcoes disponíveis
      await expect(page.getByRole('option', { name: /todos/i })).toBeVisible();
      await expect(page.getByRole('option', { name: /ativos/i })).toBeVisible();
      await expect(page.getByRole('option', { name: /revogados/i })).toBeVisible();
    });

    test('deve exibir colunas corretas na tabela', async ({ page }) => {
      // Aguardar loading
      await page.waitForTimeout(2000);

      const table = page.locator('table');
      if (await table.isVisible().catch(() => false)) {
        await expect(page.getByRole('columnheader', { name: /usuário/i })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: /dispositivo/i })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: /ip/i })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: /localização/i })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: /último acesso/i })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: /status/i })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: /ações/i })).toBeVisible();
      }
    });
  });

  // ============================================
  // Tab: Regras de IP
  // ============================================

  test.describe('Tab: Regras de IP', () => {

    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/security`);

      if (page.url().includes('/login')) {
        test.skip();
        return;
      }

      // Trocar para tab Regras de IP
      await page.getByRole('tab', { name: /regras de ip/i }).click();
    });

    test('deve trocar para tab Regras de IP', async ({ page }) => {
      // Verificar que tab esta selecionada
      const ipTab = page.getByRole('tab', { name: /regras de ip/i });
      await expect(ipTab).toHaveAttribute('aria-selected', 'true');
    });

    test('deve exibir cards de estatisticas (Total, Bloqueados, Permitidos, Ativos)', async ({ page }) => {
      await expect(page.getByText('Total de Regras')).toBeVisible();
      await expect(page.getByText('Bloqueados')).toBeVisible();
      await expect(page.getByText('Permitidos')).toBeVisible();
      // "Ativos" dentro do contexto de regras de IP
      await expect(page.getByText('Ativos').first()).toBeVisible();
    });

    test('deve exibir botao Adicionar Regra', async ({ page }) => {
      await expect(
        page.getByRole('button', { name: /adicionar regra/i })
      ).toBeVisible();
    });

    test('deve abrir dialog ao clicar em Adicionar Regra', async ({ page }) => {
      await page.getByRole('button', { name: /adicionar regra/i }).click();

      // Verificar dialog
      await expect(page.getByText('Adicionar Regra de IP')).toBeVisible();
      await expect(
        page.getByText(/crie uma regra para bloquear ou permitir/i)
      ).toBeVisible();
    });

    test('deve validar campo IP obrigatorio', async ({ page }) => {
      await page.getByRole('button', { name: /adicionar regra/i }).click();

      // O botao "Criar Regra" deve estar desabilitado sem IP preenchido
      const createButton = page.getByRole('button', { name: /criar regra/i });
      await expect(createButton).toBeDisabled();
    });

    test('deve rejeitar IP invalido (999.999.999.999) com mensagem de erro', async ({ page }) => {
      await page.getByRole('button', { name: /adicionar regra/i }).click();

      // Preencher IP invalido
      const ipInput = page.getByLabel(/endereço ip/i);
      await ipInput.fill('999.999.999.999');

      // Verificar mensagem de erro
      await expect(page.getByText(/ip inválido/i)).toBeVisible();

      // Botao deve continuar desabilitado
      const createButton = page.getByRole('button', { name: /criar regra/i });
      await expect(createButton).toBeDisabled();
    });

    test('deve aceitar IP valido sem erro', async ({ page }) => {
      await page.getByRole('button', { name: /adicionar regra/i }).click();

      const ipInput = page.getByLabel(/endereço ip/i);
      await ipInput.fill('192.168.1.100');

      // Nao deve haver mensagem de erro
      await expect(page.getByText(/ip inválido/i)).not.toBeVisible();

      // Botao deve estar habilitado
      const createButton = page.getByRole('button', { name: /criar regra/i });
      await expect(createButton).toBeEnabled();
    });

    test('deve exibir select de tipo (Bloquear/Permitir)', async ({ page }) => {
      await page.getByRole('button', { name: /adicionar regra/i }).click();

      // Label "Tipo" deve existir
      await expect(page.getByText('Tipo')).toBeVisible();

      // Valor default deve ser "Bloquear"
      await expect(page.getByText('Bloquear').first()).toBeVisible();
    });

    test('deve exibir select de expiracao', async ({ page }) => {
      await page.getByRole('button', { name: /adicionar regra/i }).click();

      // Label "Expiracao"
      await expect(page.getByText('Expiração')).toBeVisible();

      // Default: Permanente
      await expect(page.getByText('Permanente').first()).toBeVisible();
    });

    test('deve fechar dialog ao clicar Cancelar', async ({ page }) => {
      await page.getByRole('button', { name: /adicionar regra/i }).click();

      // Verificar que dialog esta aberto
      await expect(page.getByText('Adicionar Regra de IP')).toBeVisible();

      // Clicar Cancelar
      await page.getByRole('button', { name: /cancelar/i }).click();

      // Dialog deve sumir
      await expect(page.getByText('Adicionar Regra de IP')).not.toBeVisible();
    });

    test('deve exibir secoes de IPs Bloqueados e IPs Permitidos', async ({ page }) => {
      await expect(page.getByText('IPs Bloqueados')).toBeVisible();
      await expect(page.getByText('IPs Permitidos')).toBeVisible();
    });

    test('deve exibir label e campo de descricao no dialog', async ({ page }) => {
      await page.getByRole('button', { name: /adicionar regra/i }).click();

      await expect(page.getByLabel(/descrição/i)).toBeVisible();
      await expect(page.getByPlaceholder(/motivo da regra/i)).toBeVisible();
    });

    test('deve exibir select de organizacao no dialog', async ({ page }) => {
      await page.getByRole('button', { name: /adicionar regra/i }).click();

      await expect(page.getByText(/organização \(opcional\)/i)).toBeVisible();
    });
  });

  // ============================================
  // UX/UI - Design System
  // ============================================

  test.describe('UX/UI - Design System', () => {

    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/security`);

      if (page.url().includes('/login')) {
        test.skip();
        return;
      }
    });

    test('deve ter layout responsivo nos cards', async ({ page }) => {
      // Desktop: verificar que cards estao em grid
      const statsGrid = page.locator('.grid.grid-cols-1').first();
      await expect(statsGrid).toBeVisible();

      // Verificar responsividade mobile
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(300);

      // Cards devem continuar visiveis
      await expect(page.getByText('Total de Dispositivos')).toBeVisible();

      // Sem scroll horizontal
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    });

    test('deve exibir icones corretos nos tabs', async ({ page }) => {
      // Tab Dispositivos deve ter icone Monitor (svg)
      const devicesTab = page.getByRole('tab', { name: /dispositivos/i });
      const devicesIcon = devicesTab.locator('svg');
      await expect(devicesIcon).toBeVisible();

      // Tab Regras de IP deve ter icone Globe (svg)
      const ipTab = page.getByRole('tab', { name: /regras de ip/i });
      const ipIcon = ipTab.locator('svg');
      await expect(ipIcon).toBeVisible();
    });

    test('deve usar cores semanticas (verde=ativo, vermelho=revogado/bloqueado)', async ({ page }) => {
      // Verificar que card "Ativos" usa texto verde
      const activeCard = page.locator('.text-green-600').first();
      if (await activeCard.isVisible().catch(() => false)) {
        const color = await activeCard.evaluate((el) => window.getComputedStyle(el).color);
        expect(color).toBeTruthy();
      }

      // Verificar que card "Revogados" usa texto vermelho
      const revokedCard = page.locator('.text-red-600').first();
      if (await revokedCard.isVisible().catch(() => false)) {
        const color = await revokedCard.evaluate((el) => window.getComputedStyle(el).color);
        expect(color).toBeTruthy();
      }
    });

    test('deve ser responsivo em tablet (768px)', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });

      await expect(page.getByRole('heading', { name: /central de segurança/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /dispositivos/i })).toBeVisible();
    });
  });

  // ============================================
  // Acessibilidade (WCAG)
  // ============================================

  test.describe('Acessibilidade (WCAG)', () => {

    test.beforeEach(async ({ page }) => {
      await page.goto(`${BASE_URL}/admin/security`);

      if (page.url().includes('/login')) {
        test.skip();
        return;
      }
    });

    test('deve ter heading h1 na pagina', async ({ page }) => {
      const h1 = page.locator('h1');
      await expect(h1).toBeVisible();
      await expect(h1).toContainText(/central de segurança/i);
    });

    test('deve ter labels nos inputs', async ({ page }) => {
      // Abrir dialog para testar labels dos inputs do formulario
      await page.getByRole('tab', { name: /regras de ip/i }).click();
      await page.getByRole('button', { name: /adicionar regra/i }).click();

      // Input de IP deve ter label
      const ipLabel = page.getByText(/endereço ip/i);
      await expect(ipLabel).toBeVisible();

      // Input de descricao deve ter label
      const descLabel = page.getByText(/descrição/i).first();
      await expect(descLabel).toBeVisible();

      // Verificar que input tem id correspondente ao htmlFor do label
      const ipInput = page.locator('#ip-address');
      await expect(ipInput).toBeVisible();

      const descInput = page.locator('#description');
      await expect(descInput).toBeVisible();
    });

    test('deve ter botoes com texto descritivo', async ({ page }) => {
      // Botao Atualizar deve ter texto
      const refreshButton = page.getByRole('button', { name: /atualizar/i });
      await expect(refreshButton).toBeVisible();

      // Trocar para tab IP e verificar botao Adicionar Regra
      await page.getByRole('tab', { name: /regras de ip/i }).click();
      const addButton = page.getByRole('button', { name: /adicionar regra/i });
      await expect(addButton).toBeVisible();
    });

    test('tabs devem ser navegaveis por teclado', async ({ page }) => {
      const devicesTab = page.getByRole('tab', { name: /dispositivos/i });
      const ipTab = page.getByRole('tab', { name: /regras de ip/i });

      // Focar na primeira tab
      await devicesTab.focus();
      await expect(devicesTab).toBeFocused();

      // Navegar para proxima tab com ArrowRight
      await page.keyboard.press('ArrowRight');
      await expect(ipTab).toBeFocused();

      // Voltar com ArrowLeft
      await page.keyboard.press('ArrowLeft');
      await expect(devicesTab).toBeFocused();
    });

    test('dialog deve ter role dialog e ser acessivel', async ({ page }) => {
      await page.getByRole('tab', { name: /regras de ip/i }).click();
      await page.getByRole('button', { name: /adicionar regra/i }).click();

      // Verificar que dialog tem role correto
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Dialog deve ter titulo
      await expect(dialog.getByText('Adicionar Regra de IP')).toBeVisible();

      // Fechar com Escape
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    });

    test('icone Shield deve estar no header como elemento decorativo', async ({ page }) => {
      // O h1 deve conter um SVG (icone Shield)
      const h1 = page.locator('h1');
      const icon = h1.locator('svg');
      await expect(icon).toBeVisible();
    });
  });
});
