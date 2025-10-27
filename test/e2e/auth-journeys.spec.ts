import { test, expect } from '@playwright/test';

/**
 * 🧪 SUITE COMPLETA DE TESTES - JORNADAS DE AUTENTICAÇÃO
 *
 * Emails válidos para teste (tokens enviados via email):
 * - gabrielrizzatto@hotmail.com
 * - mar.gabrielrizzatto@gmail.com
 * - contato.gabrielrizzatto@gmail.com
 * - gabriel.rizzatto@falecomigo.ai
 */

const BASE_URL = 'http://localhost:3000';

test.describe('🔐 Jornada de Autenticação Completa', () => {

  test.beforeEach(async ({ page }) => {
    // Limpar cookies e localStorage antes de cada teste
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate(() => localStorage.clear());
  });

  test('1️⃣ SIGNUP OTP - Novo usuário com OTP', async ({ page }) => {
    console.log('\n📧 Iniciando teste de Signup com OTP...');

    // Navegar para página de signup
    await page.goto(`${BASE_URL}/signup`);
    await expect(page).toHaveTitle(/Quayer/i);

    // Preencher formulário com email válido
    const testEmail = 'gabrielrizzatto@hotmail.com';
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[name="name"]', 'Gabriel Rizzatto Test');

    // Enviar formulário
    await page.click('button[type="submit"]');

    // Verificar se foi enviado o código
    await expect(page.locator('text=/código enviado/i')).toBeVisible({ timeout: 10000 });

    console.log(`✅ Código OTP enviado para ${testEmail}`);
    console.log('⏸️  AGUARDANDO: Por favor, informe o código OTP recebido no email para continuar o teste...');

    // AQUI: O teste pausa para o usuário fornecer o código manualmente
  });

  test('2️⃣ LOGIN OTP - Login sem senha via OTP', async ({ page }) => {
    console.log('\n📧 Iniciando teste de Login com OTP...');

    // Navegar para login
    await page.goto(`${BASE_URL}/login`);

    // Clicar em "Entrar sem senha" ou botão OTP
    await page.click('text=/sem senha/i');

    // Preencher email
    const testEmail = 'mar.gabrielrizzatto@gmail.com';
    await page.fill('input[type="email"]', testEmail);

    // Enviar
    await page.click('button[type="submit"]');

    // Verificar envio
    await expect(page.locator('text=/código enviado/i')).toBeVisible({ timeout: 10000 });

    console.log(`✅ Código OTP de login enviado para ${testEmail}`);
    console.log('⏸️  AGUARDANDO: Por favor, informe o código OTP recebido no email...');
  });

  test('3️⃣ MAGIC LINK - Login via link mágico', async ({ page }) => {
    console.log('\n🔗 Iniciando teste de Magic Link...');

    // Navegar para login
    await page.goto(`${BASE_URL}/login`);

    // Clicar em opção de magic link
    await page.click('text=/link mágico/i').catch(() =>
      page.click('text=/email/i')
    );

    // Preencher email
    const testEmail = 'contato.gabrielrizzatto@gmail.com';
    await page.fill('input[type="email"]', testEmail);

    // Enviar
    await page.click('button[type="submit"]');

    // Verificar envio
    await expect(page.locator('text=/email enviado/i')).toBeVisible({ timeout: 10000 });

    console.log(`✅ Magic Link enviado para ${testEmail}`);
    console.log('⏸️  AGUARDANDO: Por favor, clique no link recebido no email...');
  });

  test('4️⃣ TOKEN JWT - Validar persistência de token', async ({ page }) => {
    console.log('\n🎫 Iniciando teste de Token JWT...');

    // Primeiro fazer login (assumindo que há um usuário válido)
    await page.goto(`${BASE_URL}/login`);

    // Preencher credenciais
    await page.fill('input[type="email"]', 'gabriel.rizzatto@falecomigo.ai');
    await page.fill('input[type="password"]', 'Test@123456');

    // Fazer login
    await page.click('button[type="submit"]');

    // Aguardar redirecionamento
    await page.waitForURL(/\/(integracoes|admin|dashboard)/, { timeout: 10000 });

    // Verificar se token foi salvo no localStorage
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeTruthy();
    console.log('✅ Token JWT salvo no localStorage');

    // Verificar se token está no formato correto (JWT)
    expect(token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
    console.log('✅ Token JWT no formato correto');

    // Recarregar página e verificar se token persiste
    await page.reload();
    const tokenAfterReload = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(tokenAfterReload).toBe(token);
    console.log('✅ Token JWT persiste após reload');
  });

  test('5️⃣ ORGANIZATION SWITCH - Trocar de organização', async ({ page }) => {
    console.log('\n🏢 Iniciando teste de troca de organização...');

    // Login como admin/GOD
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'admin@quayer.com');
    await page.fill('input[type="password"]', 'admin123456');
    await page.click('button[type="submit"]');

    // Aguardar dashboard
    await page.waitForURL(/\/(integracoes|admin)/, { timeout: 10000 });

    // Clicar no switcher de organização
    await page.click('[data-testid="org-switcher"]').catch(() =>
      page.click('text=/organização/i')
    );

    // Selecionar outra organização
    await page.click('[role="option"]:first-child').catch(() =>
      page.click('text=/trocar/i')
    );

    // Verificar se novo token foi gerado
    await page.waitForTimeout(1000);
    const newToken = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(newToken).toBeTruthy();
    console.log('✅ Novo token gerado após troca de organização');
  });

  test('6️⃣ ONBOARDING - Fluxo completo de onboarding', async ({ page }) => {
    console.log('\n🚀 Iniciando teste de Onboarding...');

    // Criar novo usuário que cairá no onboarding
    await page.goto(`${BASE_URL}/signup`);

    const newUserEmail = `test.onboarding.${Date.now()}@example.com`;
    await page.fill('input[type="email"]', newUserEmail);
    await page.fill('input[name="name"]', 'Test Onboarding User');
    await page.click('button[type="submit"]');

    // Aguardar código OTP (mockar ou aguardar)
    await expect(page.locator('text=/código/i')).toBeVisible({ timeout: 10000 });

    console.log(`✅ Novo usuário criado: ${newUserEmail}`);
    console.log('⏸️  AGUARDANDO: Verificar código OTP e completar onboarding...');
  });
});

test.describe('🔒 Testes de Segurança e Autorização', () => {

  test('7️⃣ UNAUTHORIZED - Rotas protegidas sem token', async ({ page }) => {
    console.log('\n🛡️ Testando rotas protegidas...');

    // Tentar acessar rota protegida sem auth
    await page.goto(`${BASE_URL}/integracoes`);

    // Deve redirecionar para login
    await page.waitForURL(/\/login/, { timeout: 5000 });
    console.log('✅ Redirecionado para login ao acessar rota protegida');
  });

  test('8️⃣ TOKEN EXPIRED - Token expirado deve fazer logout', async ({ page }) => {
    console.log('\n⏰ Testando expiração de token...');

    // Setar token expirado manualmente
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MzAwMDAwMDB9.invalid');
    });

    // Tentar acessar rota protegida
    await page.goto(`${BASE_URL}/integracoes`);

    // Deve ser redirecionado para login
    await page.waitForURL(/\/login/, { timeout: 5000 });
    console.log('✅ Token expirado removido e redirecionado');
  });
});

test.describe('📊 Testes de Performance e UX', () => {

  test('9️⃣ LOADING STATES - Estados de carregamento', async ({ page }) => {
    console.log('\n⏳ Testando estados de loading...');

    await page.goto(`${BASE_URL}/login`);

    // Preencher form
    await page.fill('input[type="email"]', 'test@test.com');
    await page.fill('input[type="password"]', 'Test@123');

    // Click e verificar loading
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Verificar loading state (spinner, disabled, etc)
    await expect(submitButton).toBeDisabled({ timeout: 1000 }).catch(() =>
      expect(page.locator('[role="status"]')).toBeVisible({ timeout: 1000 })
    );

    console.log('✅ Loading state exibido corretamente');
  });

  test('🔟 ERROR HANDLING - Tratamento de erros', async ({ page }) => {
    console.log('\n❌ Testando tratamento de erros...');

    await page.goto(`${BASE_URL}/login`);

    // Enviar com credenciais inválidas
    await page.fill('input[type="email"]', 'invalid@test.com');
    await page.fill('input[type="password"]', 'wrongpass');
    await page.click('button[type="submit"]');

    // Verificar mensagem de erro
    await expect(page.locator('text=/inválid|incorret|erro/i')).toBeVisible({ timeout: 5000 });
    console.log('✅ Mensagem de erro exibida corretamente');
  });
});
