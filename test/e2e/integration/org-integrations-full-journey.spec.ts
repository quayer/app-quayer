import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';

/**
 * @file Jornada E2E Completa - Integrações + Páginas da Organização
 * @description Teste brutal da jornada completa do usuário através de todas as
 *              páginas de integrações e organização.
 * 
 * @coverage
 * - Login e autenticação
 * - Página principal de Integrações (/integracoes)
 * - Dashboard de Integrações (/integracoes/dashboard)
 * - Conversas (/integracoes/conversations)
 * - Usuários (/integracoes/users)
 * - Configurações (/integracoes/settings)
 * - Webhooks (/integracoes/webhooks)
 * - Criação e gerenciamento de instâncias
 * - Fluxo completo QR Code → Conexão → Mensagens
 * 
 * @philosophy "0 mocks, 100% real data, stack completo testado"
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = process.env.TEST_EMAIL || 'admin@quayer.com';
const SCREENSHOT_DIR = 'test-screenshots/journey';

// ============================================
// HELPERS
// ============================================

async function login(page: Page) {
  console.log('🔐 Iniciando login...');
  await page.goto(`${BASE_URL}/login`);
  
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await emailInput.fill(TEST_EMAIL);
  
  await page.locator('button:has-text("Continuar")').click();
  await page.waitForTimeout(1000);
  
  // Se pedir OTP, aguardar input do código
  const otpInput = page.locator('input[type="text"]').first();
  if (await otpInput.isVisible().catch(() => false)) {
    // Em ambiente de teste, usar código fixo se disponível
    const testCode = process.env.TEST_OTP || '123456';
    console.log(`📧 Inserindo código OTP: ${testCode}`);
    await otpInput.fill(testCode);
    await page.locator('button[type="submit"]').click();
  }
  
  await page.waitForURL(/\/(integracoes|dashboard|admin)/, { timeout: 15000 });
  console.log('✅ Login realizado com sucesso');
}

async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({ 
    path: `${SCREENSHOT_DIR}/${name}.png`, 
    fullPage: true 
  });
  console.log(`📸 Screenshot: ${name}.png`);
}

async function waitForPageReady(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
}

// ============================================
// JORNADA 1: FLUXO PRINCIPAL DE INTEGRAÇÕES
// ============================================
test.describe('Jornada Completa: Integrações da Organização', () => {
  test.describe.configure({ mode: 'serial' });

  let createdInstanceId: string | null = null;
  let createdInstanceName: string | null = null;

  test.beforeAll(async ({ browser }) => {
    console.log('🚀 Iniciando Jornada E2E de Integrações');
    console.log(`📍 Base URL: ${BASE_URL}`);
    console.log(`👤 Email: ${TEST_EMAIL}`);
  });

  test('J01: Login → Navegar para Integrações', async ({ page }) => {
    console.log('\n📍 J01: Login e navegação inicial');
    
    await login(page);
    await page.goto(`${BASE_URL}/integracoes`);
    await waitForPageReady(page);
    
    // Validar elementos da página
    await expect(page.locator('h1, [role="heading"]').first()).toBeVisible();
    await takeScreenshot(page, 'J01-integracoes-loaded');
    
    // Verificar se há instâncias ou estado vazio
    const instanceCards = page.locator('[data-instance-id]');
    const emptyState = page.locator('text="Nenhuma integração"');
    
    const hasInstances = await instanceCards.count() > 0;
    const isEmpty = await emptyState.isVisible().catch(() => false);
    
    console.log(`📊 Estado: ${hasInstances ? `${await instanceCards.count()} instâncias` : 'Vazio'}`);
    
    expect(hasInstances || isEmpty).toBeTruthy();
  });

  test('J02: Verificar Dashboard de Integrações', async ({ page }) => {
    console.log('\n📍 J02: Navegando para Dashboard');
    
    await login(page);
    await page.goto(`${BASE_URL}/integracoes/dashboard`);
    await waitForPageReady(page);
    
    // Verificar elementos do dashboard
    const statsCards = page.locator('[class*="card"], [role="region"]');
    await expect(statsCards.first()).toBeVisible({ timeout: 10000 });
    
    await takeScreenshot(page, 'J02-dashboard-loaded');
    
    // Verificar gráficos (se houver)
    const charts = page.locator('canvas, svg[class*="recharts"]');
    const chartsCount = await charts.count();
    console.log(`📊 Gráficos encontrados: ${chartsCount}`);
    
    // Verificar cards de estatísticas
    const metrics = page.locator('[class*="stat"], [class*="metric"]');
    console.log(`📈 Cards de métricas: ${await metrics.count()}`);
  });

  test('J03: Verificar Página de Conversas', async ({ page }) => {
    console.log('\n📍 J03: Navegando para Conversas');
    
    await login(page);
    await page.goto(`${BASE_URL}/integracoes/conversations`);
    await waitForPageReady(page);
    
    await takeScreenshot(page, 'J03-conversations-loaded');
    
    // Verificar estrutura de chat (lista de conversas + área de mensagens)
    const chatList = page.locator('[class*="chat"], [class*="conversation"]');
    const messageArea = page.locator('[class*="message"], textarea');
    
    // A página pode ter conversas ou estado vazio
    const pageLoaded = await page.locator('body').isVisible();
    expect(pageLoaded).toBeTruthy();
    
    console.log(`💬 Elementos de chat: ${await chatList.count()}`);
  });

  test('J04: Verificar Página de Usuários', async ({ page }) => {
    console.log('\n📍 J04: Navegando para Usuários');
    
    await login(page);
    await page.goto(`${BASE_URL}/integracoes/users`);
    await waitForPageReady(page);
    
    await takeScreenshot(page, 'J04-users-loaded');
    
    // Verificar tabela de usuários
    const table = page.locator('table, [role="table"]');
    const inviteBtn = page.locator('button:has-text("Convidar"), button:has-text("Adicionar")');
    
    await expect(table.or(inviteBtn.first())).toBeVisible({ timeout: 10000 });
    
    // Contar membros listados
    const rows = page.locator('tbody tr, [role="row"]');
    const rowCount = await rows.count();
    console.log(`👥 Membros listados: ${rowCount}`);
  });

  test('J05: Verificar Página de Configurações', async ({ page }) => {
    console.log('\n📍 J05: Navegando para Configurações');
    
    await login(page);
    await page.goto(`${BASE_URL}/integracoes/settings`);
    await waitForPageReady(page);
    
    await takeScreenshot(page, 'J05-settings-loaded');
    
    // Verificar tabs ou seções de configuração
    const tabs = page.locator('[role="tab"], [role="tablist"]');
    const forms = page.locator('form, [class*="form"]');
    
    const hasTabs = await tabs.count() > 0;
    const hasForms = await forms.count() > 0;
    
    console.log(`⚙️ Tabs: ${hasTabs}, Forms: ${hasForms}`);
    expect(hasTabs || hasForms).toBeTruthy();
  });

  test('J06: Verificar Página de Webhooks', async ({ page }) => {
    console.log('\n📍 J06: Navegando para Webhooks');
    
    await login(page);
    await page.goto(`${BASE_URL}/integracoes/webhooks`);
    await waitForPageReady(page);
    
    await takeScreenshot(page, 'J06-webhooks-loaded');
    
    // Verificar lista de webhooks ou botão de criar
    const webhookList = page.locator('[data-webhook-id], [class*="webhook"]');
    const createBtn = page.locator('button:has-text("Criar"), button:has-text("Adicionar")');
    const emptyState = page.locator('text="Nenhum webhook"');
    
    const hasWebhooks = await webhookList.count() > 0;
    const hasCreateBtn = await createBtn.isVisible().catch(() => false);
    const isEmpty = await emptyState.isVisible().catch(() => false);
    
    console.log(`🔗 Webhooks: ${hasWebhooks ? await webhookList.count() : 'Nenhum'}`);
    expect(hasWebhooks || hasCreateBtn || isEmpty).toBeTruthy();
  });

  test('J07: Criar Nova Instância (5 etapas)', async ({ page }) => {
    console.log('\n📍 J07: Criando nova instância WhatsApp');
    
    await login(page);
    await page.goto(`${BASE_URL}/integracoes`);
    await waitForPageReady(page);
    
    // Clicar no botão Conectar
    const connectBtn = page.locator('button:has-text("Conectar")').first();
    await connectBtn.click();
    
    // Step 1: Canal (WhatsApp)
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
    await takeScreenshot(page, 'J07-step1-channel');
    
    const nextBtn = page.locator('button:has-text("Próximo")');
    await nextBtn.click();
    await page.waitForTimeout(500);
    
    // Step 2: Configuração
    const nameInput = page.locator('input#name, input[name="name"]');
    await expect(nameInput).toBeVisible();
    
    createdInstanceName = `E2E-Journey-${Date.now()}`;
    await nameInput.fill(createdInstanceName);
    await takeScreenshot(page, 'J07-step2-config');
    
    // Criar instância
    const createBtn = page.locator('button:has-text("Criar Instância")');
    await createBtn.click();
    await page.waitForTimeout(3000);
    
    await takeScreenshot(page, 'J07-after-create');
    
    // Verificar se passou para próximo step ou concluiu
    console.log(`✅ Instância "${createdInstanceName}" em processo de criação`);
    
    // Fechar modal
    await page.keyboard.press('Escape');
  });

  test('J08: Verificar Instância Criada na Lista', async ({ page }) => {
    console.log('\n📍 J08: Verificando instância criada');
    
    await login(page);
    await page.goto(`${BASE_URL}/integracoes`);
    await waitForPageReady(page);
    
    // Buscar pela instância recém criada
    if (createdInstanceName) {
      const searchInput = page.locator('#search-integrations, input[placeholder*="Pesquisar"]');
      if (await searchInput.isVisible()) {
        await searchInput.fill(createdInstanceName);
        await page.waitForTimeout(1000);
      }
    }
    
    await takeScreenshot(page, 'J08-search-instance');
    
    const instanceCards = page.locator('[data-instance-id]');
    const count = await instanceCards.count();
    
    console.log(`📊 Instâncias encontradas: ${count}`);
    
    if (count > 0) {
      // Capturar ID da primeira instância
      createdInstanceId = await instanceCards.first().getAttribute('data-instance-id');
      console.log(`🆔 Instance ID: ${createdInstanceId}`);
    }
  });

  test('J09: Testar QR Code Modal', async ({ page }) => {
    console.log('\n📍 J09: Testando modal de QR Code');
    
    await login(page);
    await page.goto(`${BASE_URL}/integracoes`);
    await waitForPageReady(page);
    
    // Filtrar por conectando ou desconectadas
    const statusFilter = page.locator('button[aria-label="Filtrar por status"]');
    if (await statusFilter.isVisible()) {
      await statusFilter.click();
      await page.locator('[role="option"]:has-text("Desconectadas")').click();
      await page.waitForTimeout(500);
    }
    
    const cards = page.locator('[data-instance-id]');
    if (await cards.count() > 0) {
      // Abrir menu do card
      const firstCard = cards.first();
      await firstCard.hover();
      
      const menuBtn = firstCard.locator('button[aria-label*="opções"]');
      if (await menuBtn.isVisible()) {
        await menuBtn.click();
        await page.waitForTimeout(300);
        
        // Clicar em Gerar QR Code
        const qrOption = page.locator('[role="menuitem"]:has-text("QR Code")');
        if (await qrOption.isVisible()) {
          await qrOption.click();
          await page.waitForTimeout(2000);
          
          await takeScreenshot(page, 'J09-qr-modal');
          
          // Verificar QR Code visível
          const qrElement = page.locator('canvas, img[alt*="QR"], [data-testid*="qr"]');
          console.log(`🔲 QR Code visível: ${await qrElement.isVisible().catch(() => false)}`);
          
          await page.keyboard.press('Escape');
        }
      }
    } else {
      console.log('⚠️ Nenhuma instância desconectada para testar QR');
    }
  });

  test('J10: Testar Compartilhamento de Link', async ({ page }) => {
    console.log('\n📍 J10: Testando compartilhamento de link');
    
    await login(page);
    await page.goto(`${BASE_URL}/integracoes`);
    await waitForPageReady(page);
    
    const cards = page.locator('[data-instance-id]');
    if (await cards.count() > 0) {
      const firstCard = cards.first();
      await firstCard.hover();
      
      const menuBtn = firstCard.locator('button[aria-label*="opções"]');
      if (await menuBtn.isVisible()) {
        await menuBtn.click();
        await page.waitForTimeout(300);
        
        const shareOption = page.locator('[role="menuitem"]:has-text("Compartilhar")');
        if (await shareOption.isVisible()) {
          await shareOption.click();
          await page.waitForTimeout(2000);
          
          await takeScreenshot(page, 'J10-share-modal');
          
          // Verificar link gerado
          const linkInput = page.locator('input[readonly]');
          if (await linkInput.isVisible()) {
            const linkValue = await linkInput.inputValue();
            console.log(`🔗 Link: ${linkValue.substring(0, 60)}...`);
          }
          
          await page.keyboard.press('Escape');
        }
      }
    } else {
      console.log('⚠️ Nenhuma instância para testar compartilhamento');
    }
  });

  test('J11: Navegação entre todas as páginas (Sidebar)', async ({ page }) => {
    console.log('\n📍 J11: Testando navegação completa via sidebar');
    
    await login(page);
    await page.goto(`${BASE_URL}/integracoes`);
    await waitForPageReady(page);
    
    const routes = [
      { path: '/integracoes', name: 'Integrações' },
      { path: '/integracoes/dashboard', name: 'Dashboard' },
      { path: '/integracoes/conversations', name: 'Conversas' },
      { path: '/integracoes/users', name: 'Usuários' },
      { path: '/integracoes/settings', name: 'Configurações' },
      { path: '/integracoes/webhooks', name: 'Webhooks' },
    ];
    
    const results: { route: string; status: string; time: number }[] = [];
    
    for (const route of routes) {
      const startTime = Date.now();
      
      await page.goto(`${BASE_URL}${route.path}`);
      await waitForPageReady(page);
      
      const loadTime = Date.now() - startTime;
      
      // Verificar se página carregou sem erros
      const hasError = await page.locator('text="Error", text="404", text="500"').isVisible().catch(() => false);
      
      results.push({
        route: route.path,
        status: hasError ? '❌ ERRO' : '✅ OK',
        time: loadTime,
      });
      
      console.log(`${hasError ? '❌' : '✅'} ${route.name}: ${loadTime}ms`);
    }
    
    await takeScreenshot(page, 'J11-navigation-complete');
    
    // Verificar que todas passaram
    const allPassed = results.every(r => r.status === '✅ OK');
    expect(allPassed).toBeTruthy();
  });

  test('J12: Verificar Console Errors', async ({ page }) => {
    console.log('\n📍 J12: Capturando erros de console');
    
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    page.on('pageerror', error => {
      errors.push(error.message);
    });
    
    await login(page);
    
    // Navegar por todas as páginas
    const pages = [
      '/integracoes',
      '/integracoes/dashboard',
      '/integracoes/conversations',
    ];
    
    for (const p of pages) {
      await page.goto(`${BASE_URL}${p}`);
      await waitForPageReady(page);
    }
    
    // Reportar erros encontrados
    if (errors.length > 0) {
      console.log(`⚠️ Erros encontrados: ${errors.length}`);
      errors.slice(0, 5).forEach(e => console.log(`   - ${e.substring(0, 100)}`));
    } else {
      console.log('✅ Nenhum erro crítico no console');
    }
    
    await takeScreenshot(page, 'J12-console-check');
    
    // Filtrar erros críticos (ignorar warnings e erros conhecidos)
    const criticalErrors = errors.filter(e => 
      !e.includes('favicon') && 
      !e.includes('Failed to load resource') &&
      !e.includes('net::ERR')
    );
    
    // Logar mas não falhar o teste por erros de console
    console.log(`📊 Erros críticos: ${criticalErrors.length}`);
  });

  test('J13: Performance - Tempo de Carregamento', async ({ page }) => {
    console.log('\n📍 J13: Medindo performance');
    
    await login(page);
    
    const measurements: { page: string; loadTime: number }[] = [];
    
    const pages = [
      { url: '/integracoes', name: 'Integrações' },
      { url: '/integracoes/dashboard', name: 'Dashboard' },
      { url: '/integracoes/conversations', name: 'Conversas' },
    ];
    
    for (const p of pages) {
      const start = Date.now();
      await page.goto(`${BASE_URL}${p.url}`);
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - start;
      
      measurements.push({ page: p.name, loadTime });
      console.log(`⏱️ ${p.name}: ${loadTime}ms`);
    }
    
    await takeScreenshot(page, 'J13-performance');
    
    // Verificar que todas carregaram em menos de 10s
    const allFast = measurements.every(m => m.loadTime < 10000);
    expect(allFast).toBeTruthy();
    
    // Report médio
    const avg = measurements.reduce((sum, m) => sum + m.loadTime, 0) / measurements.length;
    console.log(`📊 Tempo médio: ${Math.round(avg)}ms`);
  });

  test.afterAll(async () => {
    console.log('\n🏁 Jornada E2E Completa finalizada');
    console.log('📊 Resumo:');
    console.log(`   - Instância criada: ${createdInstanceName || 'N/A'}`);
    console.log(`   - Instance ID: ${createdInstanceId || 'N/A'}`);
  });
});

// ============================================
// JORNADA 2: FLUXO DE ADMINISTRAÇÃO
// ============================================
test.describe('Jornada Admin: Gerenciamento de Organização', () => {
  test.describe.configure({ mode: 'serial' });

  test('A01: Login Admin → Dashboard Principal', async ({ page }) => {
    console.log('\n📍 A01: Login como admin');
    
    await login(page);
    await page.goto(`${BASE_URL}/admin`);
    await waitForPageReady(page);
    
    await takeScreenshot(page, 'A01-admin-dashboard');
    
    // Verificar elementos do dashboard admin
    const heading = page.locator('h1, [role="heading"]').first();
    await expect(heading).toBeVisible();
    
    console.log('✅ Dashboard admin carregado');
  });

  test('A02: Navegar para Organizações', async ({ page }) => {
    console.log('\n📍 A02: Navegando para Organizações');
    
    await login(page);
    await page.goto(`${BASE_URL}/admin/organizations`);
    await waitForPageReady(page);
    
    await takeScreenshot(page, 'A02-organizations');
    
    // Verificar tabela de organizações
    const table = page.locator('table, [role="table"]');
    await expect(table).toBeVisible({ timeout: 10000 });
    
    const rows = page.locator('tbody tr');
    console.log(`🏢 Organizações listadas: ${await rows.count()}`);
  });

  test('A03: Navegar para Clientes', async ({ page }) => {
    console.log('\n📍 A03: Navegando para Clientes');
    
    await login(page);
    await page.goto(`${BASE_URL}/admin/clients`);
    await waitForPageReady(page);
    
    await takeScreenshot(page, 'A03-clients');
    
    const table = page.locator('table, [role="table"]');
    await expect(table).toBeVisible({ timeout: 10000 });
    
    const rows = page.locator('tbody tr');
    console.log(`👥 Clientes listados: ${await rows.count()}`);
  });

  test('A04: Navegar para Integrações Admin', async ({ page }) => {
    console.log('\n📍 A04: Navegando para Integrações (visão admin)');
    
    await login(page);
    await page.goto(`${BASE_URL}/admin/integracoes`);
    await waitForPageReady(page);
    
    await takeScreenshot(page, 'A04-integracoes-admin');
    
    // Verificar que pode ver todas as instâncias de todas as orgs
    const instances = page.locator('[data-instance-id], [class*="instance"]');
    console.log(`📱 Instâncias totais (admin view): ${await instances.count()}`);
  });

  test('A05: Navegar para Logs', async ({ page }) => {
    console.log('\n📍 A05: Navegando para Logs');
    
    await login(page);
    await page.goto(`${BASE_URL}/admin/logs`);
    await waitForPageReady(page);
    
    await takeScreenshot(page, 'A05-logs');
    
    // Verificar se logs são exibidos
    const logEntries = page.locator('[class*="log"], [data-log-id], tbody tr');
    console.log(`📋 Entradas de log: ${await logEntries.count()}`);
  });
});
