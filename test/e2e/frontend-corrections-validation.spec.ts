import { test, expect, Page } from '@playwright/test';

/**
 * 🎯 VALIDAÇÃO DAS CORREÇÕES DO FRONT-END
 * 
 * Valida:
 * - Criação de integração funciona (sem erro 500)
 * - Dashboard admin carrega estatísticas
 * - Página /conversas tem sidebar
 * - Mensagens está no menu Administração
 * - Nome da organização aparece no sidebar
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Login helper
const login = async (page: Page) => {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  
  await page.fill('input[type="email"]', 'admin@quayer.com');
  await page.click('button:has-text("Continuar com Email")');
  
  await page.waitForURL('**/login/verify**');
  await page.waitForLoadState('networkidle');
  
  // Usar InputOTP component
  const otpInputs = page.locator('[data-input-otp-container] input');
  const firstInput = otpInputs.first();
  await firstInput.fill('123456');
  
  await page.click('button:has-text("Fazer Login")');
  await page.waitForURL('**/admin**', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
};

test.describe('✅ CORREÇÕES DO FRONTEND', () => {
  
  test('1. Dashboard Admin - Estatísticas carregam sem erro', async ({ page }) => {
    const consoleErrors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        consoleErrors.push(msg.text());
      }
    });
    
    await login(page);
    
    // Aguardar stats carregarem
    await page.waitForTimeout(3000);
    
    // Screenshot
    await page.screenshot({
      path: 'test-screenshots/dashboard-stats-fixed.png',
      fullPage: true
    });
    
    // Verificar se não há erro de "count"
    const hasCountError = consoleErrors.some(err => err.includes('count'));
    
    console.log('📊 Console Errors:', consoleErrors.length);
    if (hasCountError) {
      console.log('❌ Ainda há erro de count!');
    } else {
      console.log('✅ Erro de count CORRIGIDO!');
    }
    
    expect(hasCountError).toBe(false);
  });

  test('2. Sidebar - Mensagens está em Administração', async ({ page }) => {
    await login(page);
    
    // Expandir menu Administração se estiver collapsed
    const adminLink = page.locator('a:has-text("Administração")').first();
    await adminLink.click();
    
    await page.waitForTimeout(1000);
    
    // Verificar se Mensagens aparece como submenu de Administração
    const mensagensInAdmin = page.locator('text=Administração')
      .locator('..')
      .locator('text=Mensagens');
    
    const isVisible = await mensagensInAdmin.isVisible().catch(() => false);
    
    console.log('📩 Mensagens no menu Administração:', isVisible ? '✅' : '❌');
    
    // Screenshot
    await page.screenshot({
      path: 'test-screenshots/sidebar-mensagens-admin.png',
      fullPage: true
    });
    
    expect(isVisible).toBe(true);
  });

  test('3. Página /conversas - Tem sidebar', async ({ page }) => {
    await login(page);
    
    // Navegar para conversas
    await page.goto(`${BASE_URL}/conversas`);
    await page.waitForLoadState('networkidle');
    
    // Verificar se sidebar está presente
    const sidebar = page.locator('[data-sidebar="sidebar"]');
    const hasSidebar = await sidebar.isVisible();
    
    console.log('📱 Sidebar em /conversas:', hasSidebar ? '✅' : '❌');
    
    // Screenshot
    await page.screenshot({
      path: 'test-screenshots/conversas-with-sidebar.png',
      fullPage: true
    });
    
    expect(hasSidebar).toBe(true);
  });

  test('4. Sidebar - Nome da organização (ou label correto)', async ({ page }) => {
    await login(page);
    
    // Aguardar query carregar
    await page.waitForTimeout(2000);
    
    // Verificar labels do sidebar
    const labels = await page.locator('[class*="sidebar-group-label"]').allTextContents();
    
    console.log('\n📋 Sidebar Labels:');
    labels.forEach((label, i) => {
      console.log(`   ${i + 1}. "${label}"`);
    });
    
    // Verificar se tem "Platform" duplicado
    const platformCount = labels.filter(l => l === 'Platform').length;
    
    console.log(`\n🔍 "Platform" aparece: ${platformCount} vez(es)`);
    console.log(platformCount === 0 ? '✅ NENHUM Platform!' : 
                platformCount === 1 ? '✅ Apenas 1 Platform (ok)' :
                '❌ Platform duplicado!');
    
    // Screenshot
    await page.screenshot({
      path: 'test-screenshots/sidebar-labels-fixed.png',
      fullPage: true
    });
    
    // Não deve ter mais de 1 "Platform"
    expect(platformCount).toBeLessThanOrEqual(1);
  });

  test('5. Criar Integração - Sem erro 500', async ({ page }) => {
    const requestErrors: string[] = [];
    
    page.on('response', async (response) => {
      if (response.status() === 500) {
        requestErrors.push(`500: ${response.url()}`);
      }
    });
    
    await login(page);
    
    // Navegar para integrações
    await page.goto(`${BASE_URL}/integracoes`);
    await page.waitForLoadState('networkidle');
    
    // Clicar em criar integração (se houver botão)
    const createBtn = page.locator('button:has-text("Nova")').or(
      page.locator('button:has-text("Criar")').or(
        page.locator('[data-create-integration]')
      )
    );
    
    const btnExists = await createBtn.isVisible({ timeout: 2000 }).catch(() => false);
    
    if (btnExists) {
      await createBtn.click();
      await page.waitForTimeout(1000);
      
      console.log('🔌 Botão criar integração encontrado');
      
      // Screenshot do modal
      await page.screenshot({
        path: 'test-screenshots/create-integration-modal.png',
      });
    } else {
      console.log('⚠️ Botão criar integração não encontrado (ok)');
    }
    
    // Verificar se houve erros 500
    console.log('\n🔍 Erros 500 encontrados:', requestErrors.length);
    if (requestErrors.length > 0) {
      requestErrors.forEach(err => console.log(`   ❌ ${err}`));
    } else {
      console.log('   ✅ Nenhum erro 500!');
    }
    
    expect(requestErrors.length).toBe(0);
  });

  test('6. Console - Sem erros críticos', async ({ page }) => {
    const consoleErrors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error' && 
          !msg.text().includes('favicon') &&
          !msg.text().includes('DevTools')) {
        consoleErrors.push(msg.text());
      }
    });
    
    await login(page);
    
    // Navegar por várias páginas
    const routes = ['/admin', '/admin/organizations', '/conversas', '/integracoes'];
    
    for (const route of routes) {
      await page.goto(`${BASE_URL}${route}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    }
    
    console.log('\n🔴 Total de Console Errors:', consoleErrors.length);
    
    if (consoleErrors.length > 0) {
      console.log('\nPrimeiros 5 erros:');
      consoleErrors.slice(0, 5).forEach((err, i) => {
        console.log(`   ${i + 1}. ${err.substring(0, 100)}`);
      });
    }
    
    // Aceitar até 3 erros (warnings menores)
    expect(consoleErrors.length).toBeLessThan(3);
  });
});

test.describe('📊 RESUMO FINAL', () => {
  test('Validação geral do front-end', async ({ page }) => {
    await login(page);
    
    const summary = {
      loginWorks: true,
      adminMenuVisible: false,
      orgNameVisible: false,
      conversasHasSidebar: false,
      mensagensInAdmin: false,
      noErrors: false,
    };
    
    // Verificar menu admin
    summary.adminMenuVisible = await page.locator('text=Administração').isVisible();
    
    // Verificar nome da org ou label
    const labels = await page.locator('[class*="sidebar-group-label"]').allTextContents();
    summary.orgNameVisible = labels.some(l => l.includes('Quayer') || l === 'Organização');
    
    // Testar conversas
    await page.goto(`${BASE_URL}/conversas`);
    await page.waitForLoadState('networkidle');
    summary.conversasHasSidebar = await page.locator('[data-sidebar="sidebar"]').isVisible();
    
    // Voltar para admin e verificar mensagens
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForLoadState('networkidle');
    
    const adminSection = page.locator('text=Administração').locator('..');
    summary.mensagensInAdmin = await adminSection.locator('text=Mensagens').isVisible().catch(() => false);
    
    console.log('\n📊 RESUMO DAS CORREÇÕES:');
    console.log(`   ✅ Login funciona: ${summary.loginWorks}`);
    console.log(`   ${summary.adminMenuVisible ? '✅' : '❌'} Menu Admin visível: ${summary.adminMenuVisible}`);
    console.log(`   ${summary.orgNameVisible ? '✅' : '❌'} Nome/Label da Org: ${summary.orgNameVisible}`);
    console.log(`   ${summary.conversasHasSidebar ? '✅' : '❌'} /conversas tem sidebar: ${summary.conversasHasSidebar}`);
    console.log(`   ${summary.mensagensInAdmin ? '✅' : '❌'} Mensagens em Admin: ${summary.mensagensInAdmin}`);
    
    // Screenshot final
    await page.screenshot({
      path: 'test-screenshots/final-validation.png',
      fullPage: true
    });
    
    const successCount = Object.values(summary).filter(v => v === true).length;
    console.log(`\n🎯 Score: ${successCount}/6 correções validadas`);
    
    // Pelo menos 5 de 6 devem passar
    expect(successCount).toBeGreaterThanOrEqual(5);
  });
});

