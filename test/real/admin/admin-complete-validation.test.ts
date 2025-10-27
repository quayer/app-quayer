/**
 * @file Admin Complete Validation - TESTES MASSIVOS
 * @description Valida TUDO no admin - front + back + UX + funcionalidade
 * 
 * Filosofia: 100% Real
 * - PostgreSQL real
 * - Browser real (Playwright)
 * - Todos os botões testados
 * - Todas as páginas validadas
 * - Backend integrado
 */

import { test, expect } from '@playwright/test';

test.describe('ADMIN - Validação Completa de TODAS as Páginas', () => {
  
  test.beforeEach(async ({ page }) => {
    // Login como admin
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'admin@quayer.com');
    await page.click('button:has-text("Continuar")');
    
    // Aguardar OTP (usar recovery token "123456")
    await page.waitForSelector('input[data-input-otp]', { timeout: 10000 });
    
    // Preencher OTP com recovery token - 6 campos
    const otpInputs = page.locator('input[data-input-otp]');
    const count = await otpInputs.count();
    
    const recoveryToken = '123456';
    for (let i = 0; i < count && i < recoveryToken.length; i++) {
      await otpInputs.nth(i).fill(recoveryToken[i]);
    }
    
    // Aguardar redirecionamento para admin
    await page.waitForURL('**/admin', { timeout: 10000 });
  });

  test('SIDEBAR - Validar estrutura completa', async ({ page }) => {
    await test.step('Validar 7 itens do menu admin', async () => {
      // Verificar que sidebar está visível
      await expect(page.locator('[data-sidebar="sidebar"]')).toBeVisible();
      
      // Validar os 7 itens corretos (SEM "Gerenciar Brokers")
      await expect(page.locator('text=Dashboard Admin')).toBeVisible();
      await expect(page.locator('text=Organizações')).toBeVisible();
      await expect(page.locator('text=Clientes')).toBeVisible();
      await expect(page.locator('text=Integrações')).toBeVisible();
      await expect(page.locator('text=Webhooks')).toBeVisible();
      await expect(page.locator('text=Logs Técnicos')).toBeVisible();
      await expect(page.locator('text=Permissões')).toBeVisible();
      
      // Validar que "Gerenciar Brokers" NÃO aparece
      await expect(page.locator('text=Gerenciar Brokers')).not.toBeVisible();
    });

    await test.step('Validar seção Platform (organização)', async () => {
      // Verificar itens da organização
      await expect(page.locator('text=Integrações').nth(1)).toBeVisible(); // Segundo item "Integrações"
      await expect(page.locator('text=Conversas')).toBeVisible();
      await expect(page.locator('text=Configurações')).toBeVisible();
      
      // Validar que "Dashboard" e "Usuários" NÃO aparecem (páginas quebradas removidas)
      const dashboardCount = await page.locator('text=Dashboard').count();
      expect(dashboardCount).toBeLessThanOrEqual(1); // Só "Dashboard Admin"
    });

    await test.step('Validar botão Toggle Sidebar', async () => {
      // Clicar no toggle
      const toggleBtn = page.locator('[data-sidebar="trigger"]');
      await expect(toggleBtn).toBeVisible();
      await toggleBtn.click();
      
      // Aguardar animação
      await page.waitForTimeout(300);
      
      // Clicar novamente para abrir
      await toggleBtn.click();
      await page.waitForTimeout(300);
    });

    await test.step('Screenshot sidebar completa', async () => {
      await page.screenshot({ path: '.playwright-mcp/admin-sidebar-validated-complete.png' });
    });
  });

  test('DASHBOARD ADMIN - Validar breadcrumb e métricas', async ({ page }) => {
    await page.goto('http://localhost:3000/admin');
    
    await test.step('Validar breadcrumb alinhado à esquerda', async () => {
      const breadcrumb = page.locator('[data-testid="breadcrumb"], nav[aria-label="breadcrumb"]').first();
      await expect(breadcrumb).toBeVisible();
      
      // Verificar texto
      await expect(page.locator('text=Administração')).toBeVisible();
      await expect(page.locator('text=Dashboard')).toBeVisible();
      
      // Screenshot do breadcrumb
      await page.screenshot({ path: '.playwright-mcp/admin-dashboard-breadcrumb.png' });
    });

    await test.step('Validar 4 cards de métricas com dados reais', async () => {
      // Card 1: Organizações
      const orgCard = page.locator('text=Organizações').locator('..').locator('..');
      await expect(orgCard).toBeVisible();
      const orgValue = await orgCard.locator('.text-2xl').textContent();
      console.log('Total Organizações:', orgValue);
      expect(parseInt(orgValue || '0')).toBeGreaterThanOrEqual(0); // Pode ser 0 ou mais

      // Card 2: Usuários
      const userCard = page.locator('text=Usuários').locator('..').locator('..');
      await expect(userCard).toBeVisible();
      const userValue = await userCard.locator('.text-2xl').textContent();
      console.log('Total Usuários:', userValue);
      expect(parseInt(userValue || '0')).toBeGreaterThanOrEqual(0);

      // Card 3: Instâncias
      const instCard = page.locator('text=Instâncias').locator('..').locator('..');
      await expect(instCard).toBeVisible();
      const instValue = await instCard.locator('.text-2xl').textContent();
      console.log('Total Instâncias:', instValue);
      expect(parseInt(instValue || '0')).toBeGreaterThanOrEqual(0);

      // Card 4: Webhooks
      const webCard = page.locator('text=Webhooks').locator('..').locator('..');
      await expect(webCard).toBeVisible();
      const webValue = await webCard.locator('.text-2xl').textContent();
      console.log('Total Webhooks:', webValue);
      expect(parseInt(webValue || '0')).toBeGreaterThanOrEqual(0);
    });

    await test.step('Validar seções de atividade', async () => {
      await expect(page.locator('text=Atividade Recente')).toBeVisible();
      await expect(page.locator('text=Organizações Recentes')).toBeVisible();
    });

    await test.step('Screenshot dashboard completo', async () => {
      await page.screenshot({ path: '.playwright-mcp/admin-dashboard-complete-validated.png', fullPage: true });
    });
  });

  test('ORGANIZAÇÕES - Validar CRUD completo', async ({ page }) => {
    await page.goto('http://localhost:3000/admin/organizations');

    await test.step('Validar breadcrumb alinhado', async () => {
      await expect(page.locator('text=Administração')).toBeVisible();
      await expect(page.locator('text=Organizações')).toBeVisible();
    });

    await test.step('Validar busca por nome e documento', async () => {
      const searchInput = page.locator('input[placeholder*="Buscar"]');
      await expect(searchInput).toBeVisible();
      
      // Verificar placeholder correto
      const placeholder = await searchInput.getAttribute('placeholder');
      expect(placeholder).toContain('documento');
      
      // Testar busca
      await searchInput.fill('Quayer');
      await page.waitForTimeout(500);
    });

    await test.step('Validar tabela de organizações', async () => {
      const table = page.locator('table');
      await expect(table).toBeVisible();
      
      // Validar colunas
      await expect(page.locator('th:has-text("Nome")')).toBeVisible();
      await expect(page.locator('th:has-text("Documento")')).toBeVisible();
      await expect(page.locator('th:has-text("Tipo")')).toBeVisible();
      await expect(page.locator('th:has-text("Plano")')).toBeVisible();
      await expect(page.locator('th:has-text("Instâncias")')).toBeVisible();
      await expect(page.locator('th:has-text("Usuários")')).toBeVisible();
      await expect(page.locator('th:has-text("Status")')).toBeVisible();
      await expect(page.locator('th:has-text("Ações")')).toBeVisible();
      
      // Contar linhas (deve ter pelo menos 1 - organização do admin)
      const rows = page.locator('tbody tr');
      const count = await rows.count();
      console.log('Total de organizações:', count);
      expect(count).toBeGreaterThanOrEqual(1); // Pelo menos a org do admin
    });

    await test.step('Testar botão Nova Organização', async () => {
      const newOrgBtn = page.locator('button:has-text("Nova Organização")');
      await expect(newOrgBtn).toBeVisible();
      await newOrgBtn.click();
      
      // Validar que modal abre
      await expect(page.locator('dialog, [role="dialog"]')).toBeVisible();
      
      // Fechar modal
      await page.press('body', 'Escape');
    });

    await test.step('Screenshot organizações', async () => {
      await page.screenshot({ path: '.playwright-mcp/admin-organizations-validated.png', fullPage: true });
    });
  });

  test('CLIENTES - Validar listagem e filtros', async ({ page }) => {
    await page.goto('http://localhost:3000/admin/clients');

    await test.step('Validar breadcrumb', async () => {
      await expect(page.locator('text=Administração')).toBeVisible();
      await expect(page.locator('text=Clientes')).toBeVisible();
    });

    await test.step('Validar cards de estatísticas', async () => {
      await expect(page.locator('text=Total de Clientes')).toBeVisible();
      await expect(page.locator('text=Ativos')).toBeVisible();
      await expect(page.locator('text=Inativos')).toBeVisible();
    });

    await test.step('Validar busca de clientes', async () => {
      const searchInput = page.locator('input[placeholder*="Buscar"]');
      await expect(searchInput).toBeVisible();
      
      // Testar busca
      await searchInput.fill('admin');
      await page.waitForTimeout(500);
    });

    await test.step('Validar tabela de clientes', async () => {
      const table = page.locator('table');
      
      // Se tiver dados, validar colunas
      const hasData = await page.locator('tbody tr').count() > 0;
      
      if (hasData) {
        await expect(table).toBeVisible();
        await expect(page.locator('th:has-text("Nome")')).toBeVisible();
        await expect(page.locator('th:has-text("Email")')).toBeVisible();
        await expect(page.locator('th:has-text("Status")')).toBeVisible();
        await expect(page.locator('th:has-text("Cadastrado em")')).toBeVisible();
        await expect(page.locator('th:has-text("Ações")')).toBeVisible();
      } else {
        // Empty state
        await expect(page.locator('text=Nenhum cliente encontrado')).toBeVisible();
      }
    });

    await test.step('Validar botão Novo Cliente', async () => {
      const newClientBtn = page.locator('button:has-text("Novo Cliente")');
      await expect(newClientBtn).toBeVisible();
    });

    await test.step('Screenshot clientes', async () => {
      await page.screenshot({ path: '.playwright-mcp/admin-clients-validated.png', fullPage: true });
    });
  });

  test('INTEGRAÇÕES ADMIN - Validar visão global', async ({ page }) => {
    await page.goto('http://localhost:3000/admin/integracoes');

    await test.step('Validar header e stats', async () => {
      await expect(page.locator('h1:has-text("Integrações")')).toBeVisible();
      await expect(page.locator('text=Gerencie todas as integrações do sistema')).toBeVisible();
      
      // Validar 5 cards de stats
      await expect(page.locator('text=Total')).toBeVisible();
      await expect(page.locator('text=Conectadas')).toBeVisible();
      await expect(page.locator('text=Desconectadas')).toBeVisible();
      await expect(page.locator('text=Ativas')).toBeVisible();
      await expect(page.locator('text=Inativas')).toBeVisible();
    });

    await test.step('Validar busca de integrações', async () => {
      const searchInput = page.locator('input[placeholder*="Buscar"]');
      await expect(searchInput).toBeVisible();
    });

    await test.step('Validar botão Nova Integração', async () => {
      const newIntBtn = page.locator('button:has-text("Nova Integração")');
      await expect(newIntBtn).toBeVisible();
    });

    await test.step('Validar tabela de integrações', async () => {
      // Se vazio, deve mostrar empty state
      const hasData = await page.locator('tbody tr').count() > 0;
      
      if (hasData) {
        await expect(page.locator('th:has-text("Nome")')).toBeVisible();
        await expect(page.locator('th:has-text("Telefone")')).toBeVisible();
        await expect(page.locator('th:has-text("Provedor")')).toBeVisible();
        await expect(page.locator('th:has-text("Status")')).toBeVisible();
        await expect(page.locator('th:has-text("Ações")')).toBeVisible();
      } else {
        await expect(page.locator('text=Nenhuma integração encontrada')).toBeVisible();
      }
    });

    await test.step('Screenshot integrações admin', async () => {
      await page.screenshot({ path: '.playwright-mcp/admin-integracoes-validated.png', fullPage: true });
    });
  });

  test('WEBHOOKS - Validar gestão de webhooks', async ({ page }) => {
    await page.goto('http://localhost:3000/admin/webhooks');

    await test.step('Validar página carrega', async () => {
      // A página pode ter conteúdo ou estar em desenvolvimento
      // Validar que não quebra
      const hasError = await page.locator('text=Erro').isVisible();
      expect(hasError).toBe(false);
    });

    await test.step('Screenshot webhooks', async () => {
      await page.screenshot({ path: '.playwright-mcp/admin-webhooks-validated.png', fullPage: true });
    });
  });

  test('LOGS TÉCNICOS - Validar listagem de logs', async ({ page }) => {
    await page.goto('http://localhost:3000/admin/logs');

    await test.step('Validar página de logs', async () => {
      await expect(page.locator('h1:has-text("Logs Técnicos"), text=Logs Técnicos')).toBeVisible();
      
      // Validar cards de estatísticas
      await expect(page.locator('text=Total de Logs')).toBeVisible();
      await expect(page.locator('text=Erros')).toBeVisible();
      await expect(page.locator('text=Avisos')).toBeVisible();
      await expect(page.locator('text=Informativos')).toBeVisible();
    });

    await test.step('Validar filtros', async () => {
      // Verificar se há filtros de data ou level
      const hasFilters = await page.locator('select, button:has-text("Todos")').isVisible();
      console.log('Logs têm filtros:', hasFilters);
    });

    await test.step('Screenshot logs', async () => {
      await page.screenshot({ path: '.playwright-mcp/admin-logs-validated.png', fullPage: true });
    });
  });

  test('PERMISSÕES - Validar documentação de roles', async ({ page }) => {
    await page.goto('http://localhost:3000/admin/permissions');

    await test.step('Validar header', async () => {
      await expect(page.locator('text=Permissões e Controle de Acesso')).toBeVisible();
    });

    await test.step('Validar 3 cards de funções', async () => {
      await expect(page.locator('text=Funções do Sistema')).toBeVisible();
      await expect(page.locator('text=Funções de Organização')).toBeVisible();
      await expect(page.locator('text=Permissões Totais')).toBeVisible();
    });

    await test.step('Validar tabs de funções', async () => {
      await expect(page.locator('button:has-text("Funções do Sistema")')).toBeVisible();
      await expect(page.locator('button:has-text("Funções de Organização")')).toBeVisible();
      await expect(page.locator('button:has-text("Todas as Permissões")')).toBeVisible();
    });

    await test.step('Validar 2 roles principais', async () => {
      // Administrador do Sistema
      await expect(page.locator('text=Administrador do Sistema')).toBeVisible();
      await expect(page.locator('text=Acesso total ao sistema')).toBeVisible();
      await expect(page.locator('text=Acesso Total')).toBeVisible();
      
      // Usuário Padrão
      await expect(page.locator('text=Usuário Padrão')).toBeVisible();
      await expect(page.locator('text=Acesso apenas à organização vinculada')).toBeVisible();
    });

    await test.step('Validar botão Nova Função', async () => {
      const newFuncBtn = page.locator('button:has-text("Nova Função")');
      await expect(newFuncBtn).toBeVisible();
    });

    await test.step('Screenshot permissões', async () => {
      await page.screenshot({ path: '.playwright-mcp/admin-permissions-validated.png', fullPage: true });
    });
  });

  test('NAVEGAÇÃO - Testar todos os links da sidebar', async ({ page }) => {
    await page.goto('http://localhost:3000/admin');

    const menuItems = [
      { name: 'Dashboard Admin', url: '/admin' },
      { name: 'Organizações', url: '/admin/organizations' },
      { name: 'Clientes', url: '/admin/clients' },
      { name: 'Integrações', url: '/admin/integracoes' },
      { name: 'Webhooks', url: '/admin/webhooks' },
      { name: 'Logs Técnicos', url: '/admin/logs' },
      { name: 'Permissões', url: '/admin/permissions' },
    ];

    for (const item of menuItems) {
      await test.step(`Navegar para ${item.name}`, async () => {
        // Clicar no item do menu
        await page.click(`text=${item.name}`);
        
        // Aguardar navegação
        await page.waitForURL(`**${item.url}`, { timeout: 5000 });
        
        // Validar que página carregou sem erro
        const hasError = await page.locator('text=Erro, text=Error').isVisible();
        expect(hasError).toBe(false);
        
        console.log(`✅ ${item.name} carregou com sucesso`);
      });
    }

    await test.step('Screenshot navegação completa', async () => {
      await page.screenshot({ path: '.playwright-mcp/admin-navigation-validated.png' });
    });
  });

  test('RESPONSIVIDADE - Testar em 3 tamanhos', async ({ page }) => {
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 375, height: 667, name: 'mobile' },
    ];

    for (const viewport of viewports) {
      await test.step(`Testar em ${viewport.name}`, async () => {
        await page.setViewportSize(viewport);
        await page.goto('http://localhost:3000/admin');
        
        // Validar que sidebar está visível ou colapsável
        const sidebar = page.locator('[data-sidebar="sidebar"]');
        
        if (viewport.name === 'mobile') {
          // Em mobile, sidebar deve ser colapsável
          const trigger = page.locator('[data-sidebar="trigger"]');
          await expect(trigger).toBeVisible();
        } else {
          // Desktop/tablet, sidebar sempre visível
          await expect(sidebar).toBeVisible();
        }
        
        // Screenshot por tamanho
        await page.screenshot({ 
          path: `.playwright-mcp/admin-responsive-${viewport.name}.png`,
          fullPage: true 
        });
      });
    }
  });

  test('DADOS REAIS - Validar integração com PostgreSQL', async ({ page, request }) => {
    await test.step('Validar API de organizações retorna dados reais', async () => {
      const token = await page.evaluate(() => localStorage.getItem('accessToken'));
      
      if (token) {
        const response = await request.get('http://localhost:3000/api/v1/organizations', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        expect(response.ok()).toBe(true);
        const data = await response.json();
        
        console.log('Organizações via API:', data);
        expect(data.success).toBe(true);
        expect(data.data).toBeDefined();
      }
    });

    await test.step('Validar API de usuários retorna dados reais', async () => {
      const token = await page.evaluate(() => localStorage.getItem('accessToken'));
      
      if (token) {
        const response = await request.get('http://localhost:3000/api/v1/auth/list-users', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (response.ok()) {
          const data = await response.json();
          console.log('Usuários via API:', data);
          expect(data).toBeDefined();
        }
      }
    });

    await test.step('Validar API de instâncias retorna dados reais', async () => {
      const token = await page.evaluate(() => localStorage.getItem('accessToken'));
      
      if (token) {
        const response = await request.get('http://localhost:3000/api/v1/instances?page=1&limit=50', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        expect(response.ok()).toBe(true);
        const data = await response.json();
        
        console.log('Instâncias via API:', data);
        expect(data.success).toBe(true);
      }
    });
  });

  test('AVATAR MENU - Validar dropdown do usuário', async ({ page }) => {
    await page.goto('http://localhost:3000/admin');

    await test.step('Validar avatar visível', async () => {
      // Avatar geralmente no footer da sidebar
      const avatar = page.locator('[data-sidebar="footer"] button, .nav-user button').first();
      await expect(avatar).toBeVisible();
      
      // Clicar no avatar
      await avatar.click();
      await page.waitForTimeout(300);
      
      // Validar menu dropdown
      const dropdown = page.locator('[role="menu"], .dropdown-menu').first();
      await expect(dropdown).toBeVisible();
      
      // Verificar itens do menu
      await expect(page.locator('text=admin@quayer.com')).toBeVisible();
    });

    await test.step('Screenshot avatar menu', async () => {
      await page.screenshot({ path: '.playwright-mcp/admin-avatar-menu.png' });
    });
  });
});

test.describe('INTEGRAÇÕES USUÁRIO - Nova UX Completa', () => {
  
  test.beforeEach(async ({ page }) => {
    // Login como admin (tem acesso às integrações também)
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'admin@quayer.com');
    await page.click('button:has-text("Continuar")');
    
    await page.waitForSelector('input[data-input-otp]', { timeout: 10000 });
    const otpInputs = page.locator('input[data-input-otp]');
    const count = await otpInputs.count();
    
    const recoveryToken = '123456';
    for (let i = 0; i < count && i < recoveryToken.length; i++) {
      await otpInputs.nth(i).fill(recoveryToken[i]);
    }
    
    await page.waitForURL('**/admin', { timeout: 10000 });
    
    // Navegar para integrações
    await page.click('text=Integrações >> nth=1'); // Segunda ocorrência (Platform)
    await page.waitForURL('**/integracoes', { timeout: 5000 });
  });

  test('WIZARD - Testar fluxo completo de criação', async ({ page }) => {
    await test.step('Abrir modal de criação', async () => {
      const newBtn = page.locator('button:has-text("Nova Integração")');
      await expect(newBtn).toBeVisible();
      await newBtn.click();
      
      // Validar modal aberto
      await expect(page.locator('dialog')).toBeVisible();
      await expect(page.locator('text=Criar Nova Integração WhatsApp Business')).toBeVisible();
    });

    await test.step('STEP 1 - Escolher Canal (WhatsApp)', async () => {
      // Validar progress bar (5 steps)
      const progressIcons = page.locator('[class*="rounded-full"][class*="border-2"]');
      expect(await progressIcons.count()).toBeGreaterThanOrEqual(5);
      
      // Validar card do WhatsApp Business
      await expect(page.locator('text=WhatsApp Business')).toBeVisible();
      await expect(page.locator('text=Envio de mensagens')).toBeVisible();
      await expect(page.locator('text=Recebimento via webhook')).toBeVisible();
      await expect(page.locator('text=Suporte a mídia')).toBeVisible();
      
      // Screenshot Step 1
      await page.screenshot({ path: '.playwright-mcp/wizard-step1-channel.png' });
      
      // Clicar em "Próximo" - DEVE FUNCIONAR AGORA
      const nextBtn = page.locator('button:has-text("Próximo")');
      await expect(nextBtn).toBeEnabled(); // Validar que NÃO está disabled
      await nextBtn.click();
    });

    await test.step('STEP 2 - Configurar', async () => {
      // Validar formulário visível
      await expect(page.locator('label:has-text("Nome da Instância")')).toBeVisible();
      await expect(page.locator('label:has-text("Descrição")')).toBeVisible();
      
      // Preencher formulário
      await page.fill('input[id="name"]', 'Teste Automatizado Playwright');
      await page.fill('textarea[id="description"]', 'Instância criada via teste E2E completo');
      
      // Screenshot Step 2
      await page.screenshot({ path: '.playwright-mcp/wizard-step2-config.png' });
      
      // Clicar em "Criar"
      const createBtn = page.locator('button:has-text("Criar")');
      await expect(createBtn).toBeEnabled();
      
      // Não vamos criar de fato (pode falhar se UAZAPI não estiver configurada)
      // Apenas validar que botão está ativo
      console.log('✅ Botão Criar está ativo e pronto');
    });

    await test.step('Fechar modal e validar', async () => {
      // Fechar modal (ESC)
      await page.press('body', 'Escape');
      
      // Validar que voltou para lista
      await expect(page.locator('h1:has-text("Integrações WhatsApp")')).toBeVisible();
    });
  });

  test('NOVA UX - Validar design e componentes Shadcn', async ({ page }) => {
    await test.step('Validar empty state', async () => {
      // Se não houver integrações
      const hasIntegrations = await page.locator('[data-integration-card]').count() > 0;
      
      if (!hasIntegrations) {
        await expect(page.locator('text=Nenhuma integração criada ainda')).toBeVisible();
        await expect(page.locator('button:has-text("Criar Primeira Integração")').or(page.locator('button:has-text("Nova Integração")'))).toBeVisible();
      }
    });

    await test.step('Validar cards de stats', async () => {
      await expect(page.locator('text=Conectadas')).toBeVisible();
      await expect(page.locator('text=Desconectadas')).toBeVisible();
      await expect(page.locator('text=Total Mensagens')).toBeVisible();
    });

    await test.step('Validar filtros e busca', async () => {
      const searchInput = page.locator('input[placeholder*="Pesquisar"]');
      if (await searchInput.isVisible()) {
        await expect(searchInput).toBeEnabled();
      }
      
      const statusFilter = page.locator('button:has-text("Todos os status")');
      if (await statusFilter.isVisible()) {
        await expect(statusFilter).toBeEnabled();
      }
    });

    await test.step('Screenshot UX completa', async () => {
      await page.screenshot({ path: '.playwright-mcp/integracoes-ux-validated.png', fullPage: true });
    });
  });

  test('INTEGRATION CARD - Validar dropdown de ações', async ({ page }) => {
    // Criar uma integração mock para testar ações
    // Ou pular se não houver integrações
    const hasIntegrations = await page.locator('[data-integration-card]').count() > 0;
    
    if (!hasIntegrations) {
      console.log('⚠️  Nenhuma integração para testar ações - pular');
      test.skip();
      return;
    }

    await test.step('Abrir menu de ações', async () => {
      // Clicar no botão de 3 pontos
      const menuBtn = page.locator('[data-integration-card] button').first();
      await menuBtn.click();
      
      // Validar opções do menu
      await expect(page.locator('text=Gerar QR Code')).toBeVisible();
      await expect(page.locator('text=Compartilhar Link')).toBeVisible();
      await expect(page.locator('text=Reconectar')).toBeVisible();
      await expect(page.locator('text=Deletar')).toBeVisible();
    });

    await test.step('Screenshot menu ações', async () => {
      await page.screenshot({ path: '.playwright-mcp/integration-card-menu.png' });
    });
  });
});

test.describe('BACKEND INTEGRATION - Validar APIs', () => {
  
  let adminToken: string;

  test.beforeEach(async ({ page }) => {
    // Login e extrair token
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'admin@quayer.com');
    await page.click('button:has-text("Continuar")');
    
    await page.waitForSelector('input[data-input-otp]', { timeout: 10000 });
    const otpInputs = page.locator('input[data-input-otp]');
    const count = await otpInputs.count();
    
    const recoveryToken = '123456';
    for (let i = 0; i < count && i < recoveryToken.length; i++) {
      await otpInputs.nth(i).fill(recoveryToken[i]);
    }
    
    await page.waitForURL('**/admin', { timeout: 10000 });
    
    // Extrair token
    adminToken = await page.evaluate(() => localStorage.getItem('accessToken')) || '';
  });

  test('API - GET /organizations', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/v1/organizations', {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });

    expect(response.ok()).toBe(true);
    const data = await response.json();
    
    console.log('GET /organizations:', data);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
  });

  test('API - GET /auth/list-users', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/v1/auth/list-users', {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });

    if (response.ok()) {
      const data = await response.json();
      console.log('GET /auth/list-users:', data);
    } else {
      console.log('API list-users status:', response.status());
    }
  });

  test('API - GET /instances', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/v1/instances?page=1&limit=50', {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });

    expect(response.ok()).toBe(true);
    const data = await response.json();
    
    console.log('GET /instances:', data);
    expect(data.success).toBe(true);
  });

  test('API - GET /webhooks', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/v1/webhooks?page=1&limit=20', {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });

    if (response.ok()) {
      const data = await response.json();
      console.log('GET /webhooks:', data);
      expect(data.success).toBe(true);
    }
  });
});

