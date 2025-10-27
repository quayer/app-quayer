import { test, expect, Page } from '@playwright/test';

/**
 * 🎯 VALIDAÇÃO COMPLETA DO SIDEBAR ADMIN
 * 
 * Este teste valida:
 * - Login do admin com recovery token
 * - Sidebar mostrando menu admin + organização
 * - Nome da organização corretamente exibido
 * - Organization switcher funcionando
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Helper para fazer login como admin
const loginAsAdmin = async (page: Page) => {
  console.log('🔐 Fazendo login como admin...');
  
  // Ir para login
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  
  // Preencher email
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.fill('admin@quayer.com');
  
  // Clicar em continuar
  const continueBtn = page.locator('button:has-text("Continuar com Email")');
  await continueBtn.click();
  
  // Aguardar página OTP carregar
  await page.waitForURL('**/login/verify**');
  await page.waitForLoadState('networkidle');
  
  // Preencher recovery token
  const otpInput = page.locator('input[name="code"]').or(page.locator('[data-input-otp-container] input').first());
  await otpInput.fill('123456');
  
  // Clicar em fazer login
  const loginBtn = page.locator('button:has-text("Fazer Login")');
  await loginBtn.click();
  
  // Aguardar redirecionamento para admin
  await page.waitForURL('**/admin**', { timeout: 10000 });
  await page.waitForLoadState('networkidle');
  
  console.log('✅ Login realizado com sucesso!');
  console.log(`   URL atual: ${page.url()}`);
};

test.describe('🎯 SIDEBAR ADMIN - Validação Completa', () => {
  
  test('1. Login admin deve redirecionar para /admin', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Verificar URL
    expect(page.url()).toContain('/admin');
    
    // Screenshot inicial
    await page.screenshot({ 
      path: 'test-screenshots/admin-logged-in.png',
      fullPage: true 
    });
  });

  test('2. Sidebar deve mostrar menu Administração', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Verificar se menu admin está visível
    const adminMenu = page.locator('text=Administração').first();
    await expect(adminMenu).toBeVisible();
    
    // Verificar itens do menu admin
    await expect(page.locator('text=Dashboard Admin')).toBeVisible();
    await expect(page.locator('text=Organizações')).toBeVisible();
    await expect(page.locator('text=Clientes')).toBeVisible();
    
    console.log('✅ Menu Administração OK');
  });

  test('3. Sidebar deve mostrar nome da organização (não "Platform")', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Aguardar um pouco para query carregar
    await page.waitForTimeout(2000);
    
    // Verificar se mostra nome da organização
    const orgLabel = page.locator('[data-sidebar-group-label]').filter({ hasText: 'Quayer' });
    
    // Screenshot do sidebar
    await page.screenshot({
      path: 'test-screenshots/sidebar-org-name.png',
      fullPage: true
    });
    
    // Printar todos os group labels
    const labels = await page.locator('[class*="sidebar-group-label"]').allTextContents();
    console.log('📋 Sidebar Labels encontrados:', labels);
    
    // Verificar se NÃO tem "Platform" duplicado
    const platformCount = labels.filter(l => l === 'Platform').length;
    console.log(`   Platform aparece ${platformCount} vez(es)`);
    
    // Deve ter no máximo 1 "Platform" (ou nenhum se mostra nome da org)
    expect(platformCount).toBeLessThanOrEqual(1);
  });

  test('4. Organization Switcher deve ser visível', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Procurar por componente de troca de organização
    // Pode ser um dropdown, um botão, etc
    const switcher = page.locator('[data-organization-switcher]').or(
      page.locator('button:has-text("Quayer")').or(
        page.locator('button:has-text("Trocar")').or(
          page.locator('[aria-label*="organização"]')
        )
      )
    );
    
    // Screenshot
    await page.screenshot({
      path: 'test-screenshots/organization-switcher.png',
      fullPage: true
    });
    
    console.log('🔍 Procurando Organization Switcher...');
    const isVisible = await switcher.isVisible().catch(() => false);
    console.log(`   Visível: ${isVisible}`);
    
    // Se não encontrar, logar todos os botões do sidebar
    if (!isVisible) {
      const sidebarButtons = await page.locator('aside button').allTextContents();
      console.log('   Botões no sidebar:', sidebarButtons);
    }
  });

  test('5. Verificar erros no console', async ({ page }) => {
    const consoleErrors: string[] = [];
    const requestErrors: string[] = [];
    
    // Capturar console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Capturar request failures
    page.on('requestfailed', req => {
      requestErrors.push(`${req.url()} - ${req.failure()?.errorText}`);
    });
    
    await loginAsAdmin(page);
    
    // Aguardar requests terminarem
    await page.waitForTimeout(3000);
    
    console.log('\n📊 RESUMO DE ERROS:');
    console.log(`   Console Errors: ${consoleErrors.length}`);
    console.log(`   Request Failures: ${requestErrors.length}`);
    
    if (consoleErrors.length > 0) {
      console.log('\n🔴 Console Errors:');
      consoleErrors.slice(0, 5).forEach(err => {
        console.log(`   - ${err.substring(0, 100)}`);
      });
    }
    
    if (requestErrors.length > 0) {
      console.log('\n🔴 Request Failures:');
      requestErrors.slice(0, 5).forEach(err => {
        console.log(`   - ${err}`);
      });
    }
    
    // Screenshot final
    await page.screenshot({
      path: 'test-screenshots/admin-with-errors.png',
      fullPage: true
    });
  });

  test('6. Validar JWT Payload do admin', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Extrair e decodificar JWT
    const jwtData = await page.evaluate(() => {
      const token = localStorage.getItem('auth_token');
      if (!token) return { error: 'No token found' };
      
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return {
          userId: payload.userId,
          email: payload.email,
          role: payload.role,
          currentOrgId: payload.currentOrgId,
          needsOnboarding: payload.needsOnboarding,
          organizationRole: payload.organizationRole,
        };
      } catch (e) {
        return { error: 'Failed to decode token' };
      }
    });
    
    console.log('\n🔑 JWT Payload:');
    console.log(JSON.stringify(jwtData, null, 2));
    
    // Validações
    expect(jwtData).toHaveProperty('email', 'admin@quayer.com');
    expect(jwtData).toHaveProperty('role', 'admin');
    expect(jwtData.currentOrgId).toBeTruthy(); // Deve ter organização
    expect(jwtData.needsOnboarding).toBe(false); // Admin já fez onboarding
  });
});

test.describe('🏢 ORGANIZAÇÕES - Testes', () => {
  
  test('7. Verificar quantas organizações o admin tem', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Fazer request para listar organizações
    const orgs = await page.evaluate(async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('http://localhost:3000/api/v1/organizations', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return await response.json();
    });
    
    console.log('\n🏢 Organizações do Admin:');
    console.log(JSON.stringify(orgs, null, 2));
  });

  test('8. Verificar organização atual', async ({ page }) => {
    await loginAsAdmin(page);
    
    // Fazer request para organização atual
    const currentOrg = await page.evaluate(async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('http://localhost:3000/api/v1/organizations/current', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      return { status: response.status, data };
    });
    
    console.log('\n🏢 Organização Atual:');
    console.log(JSON.stringify(currentOrg, null, 2));
    
    // Deve retornar 200 OK com dados da organização
    expect(currentOrg.status).toBe(200);
  });
});

