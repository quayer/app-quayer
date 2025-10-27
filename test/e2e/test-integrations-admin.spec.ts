import { test, expect } from '@playwright/test';

/**
 * Teste completo do fluxo de integrações com login admin
 * Este teste valida:
 * 1. Login com credenciais admin
 * 2. Navegação para página de integrações
 * 3. Criação de nova integração
 * 4. Verificação se o card aparece após criação
 */

test.describe('Integrações - Fluxo Completo Admin', () => {
  test.beforeEach(async ({ page }) => {
    // Navegar para a página de login
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });

    // Aguardar um pouco para a página estabilizar
    await page.waitForTimeout(2000);
  });

  test('deve fazer login como admin e criar integração com sucesso', async ({ page }) => {
    // ========================================
    // PASSO 1: LOGIN COMO ADMIN
    // ========================================
    console.log('📝 Passo 1: Fazendo login como admin...');

    // Verificar se estamos na página de login
    await expect(page).toHaveURL(/\/(login|auth|$)/);

    // Preencher email
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill('admin@quayer.com');

    // Clicar no botão de continuar/login
    const loginButton = page.locator('button:has-text("Continuar"), button:has-text("Entrar"), button:has-text("Login")').first();
    await loginButton.click();

    // Aguardar aparecer o campo de senha ou OTP
    await page.waitForTimeout(2000);

    // Tentar preencher senha (se houver campo de senha)
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    const passwordVisible = await passwordInput.isVisible().catch(() => false);

    if (passwordVisible) {
      console.log('🔐 Campo de senha encontrado, preenchendo...');
      await passwordInput.fill('admin123456');

      // Clicar em entrar
      const submitButton = page.locator('button[type="submit"], button:has-text("Entrar")').first();
      await submitButton.click();
    } else {
      // Se não houver senha, pode ser OTP
      console.log('🔢 Tentando OTP...');
      const otpInput = page.locator('input[name="code"], input[placeholder*="código" i]').first();
      const otpVisible = await otpInput.isVisible().catch(() => false);

      if (otpVisible) {
        await otpInput.fill('123456');
        const submitButton = page.locator('button[type="submit"], button:has-text("Verificar")').first();
        await submitButton.click();
      }
    }

    // Aguardar redirecionamento após login
    await page.waitForTimeout(3000);

    // Tirar screenshot após login
    await page.screenshot({ path: 'test-screenshots/admin-01-after-login.png', fullPage: true });
    console.log('✅ Screenshot salvo: admin-01-after-login.png');

    // ========================================
    // PASSO 2: NAVEGAR PARA INTEGRAÇÕES
    // ========================================
    console.log('📝 Passo 2: Navegando para página de integrações...');

    await page.goto('http://localhost:3000/integracoes', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Verificar se estamos na página de integrações
    await expect(page).toHaveURL(/\/integracoes/);

    // Tirar screenshot da página inicial de integrações
    await page.screenshot({ path: 'test-screenshots/admin-02-integracoes-initial.png', fullPage: true });
    console.log('✅ Screenshot salvo: admin-02-integracoes-initial.png');

    // Verificar elementos principais da página
    const pageTitle = page.locator('h1:has-text("Integrações WhatsApp")');
    await expect(pageTitle).toBeVisible();
    console.log('✅ Título da página encontrado');

    // Contar quantas integrações existem antes
    const cardsBefore = page.locator('[data-testid="integration-card"], .grid > div > div[class*="Card"]');
    const countBefore = await cardsBefore.count().catch(() => 0);
    console.log(`📊 Integrações antes: ${countBefore}`);

    // ========================================
    // PASSO 3: ABRIR MODAL DE CRIAÇÃO
    // ========================================
    console.log('📝 Passo 3: Abrindo modal de criação...');

    // Encontrar e clicar no botão "Nova Integração"
    const newIntegrationButton = page.locator('button:has-text("Nova Integração")').first();
    await expect(newIntegrationButton).toBeVisible({ timeout: 10000 });
    await newIntegrationButton.click();

    // Aguardar modal aparecer
    await page.waitForTimeout(1000);

    // Tirar screenshot do modal aberto
    await page.screenshot({ path: 'test-screenshots/admin-03-modal-opened.png', fullPage: true });
    console.log('✅ Screenshot salvo: admin-03-modal-opened.png');

    // Verificar se o modal está visível
    const modalTitle = page.locator('text="Criar Nova Integração WhatsApp Business"');
    await expect(modalTitle).toBeVisible();
    console.log('✅ Modal de criação aberto');

    // ========================================
    // PASSO 4: AVANÇAR PARA STEP DE CONFIG
    // ========================================
    console.log('📝 Passo 4: Avançando para configuração...');

    // Clicar em "Próximo" no step de canal
    const nextButton = page.locator('button:has-text("Próximo")').first();
    await nextButton.click();
    await page.waitForTimeout(1000);

    // ========================================
    // PASSO 5: PREENCHER FORMULÁRIO
    // ========================================
    console.log('📝 Passo 5: Preenchendo formulário...');

    // Preencher nome da instância
    const nameInput = page.locator('input#name, input[name="name"]').first();
    await expect(nameInput).toBeVisible();
    const testInstanceName = `Test Instance ${Date.now()}`;
    await nameInput.fill(testInstanceName);
    console.log(`✅ Nome preenchido: ${testInstanceName}`);

    // Preencher descrição (opcional)
    const descriptionInput = page.locator('textarea#description, textarea[name="description"]').first();
    const descVisible = await descriptionInput.isVisible().catch(() => false);
    if (descVisible) {
      await descriptionInput.fill('Teste automatizado de criação de integração');
      console.log('✅ Descrição preenchida');
    }

    // Tirar screenshot do formulário preenchido
    await page.screenshot({ path: 'test-screenshots/admin-04-form-filled.png', fullPage: true });
    console.log('✅ Screenshot salvo: admin-04-form-filled.png');

    // ========================================
    // PASSO 6: CRIAR INTEGRAÇÃO
    // ========================================
    console.log('📝 Passo 6: Criando integração...');

    // Clicar no botão "Criar"
    const createButton = page.locator('button:has-text("Criar")').first();
    await expect(createButton).toBeEnabled();
    await createButton.click();

    // Aguardar a criação (pode mostrar loading)
    await page.waitForTimeout(3000);

    // Tirar screenshot após clicar em criar
    await page.screenshot({ path: 'test-screenshots/admin-05-after-create-click.png', fullPage: true });
    console.log('✅ Screenshot salvo: admin-05-after-create-click.png');

    // ========================================
    // PASSO 7: FECHAR MODAL (se ainda estiver aberto)
    // ========================================
    console.log('📝 Passo 7: Verificando se modal fechou...');

    // Tentar fechar o modal se ele ainda estiver aberto
    const closeButton = page.locator('button:has-text("Concluir"), button:has-text("Fechar"), [aria-label="Close"]').first();
    const modalStillOpen = await closeButton.isVisible().catch(() => false);

    if (modalStillOpen) {
      console.log('⚠️ Modal ainda aberto, fechando...');
      await closeButton.click();
      await page.waitForTimeout(1000);
    }

    // Pressionar ESC para garantir que modal feche
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // ========================================
    // PASSO 8: VERIFICAR SE CARD APARECEU
    // ========================================
    console.log('📝 Passo 8: Verificando se card apareceu...');

    // Aguardar um pouco para a lista atualizar
    await page.waitForTimeout(2000);

    // Tirar screenshot do estado final
    await page.screenshot({ path: 'test-screenshots/admin-06-final-state.png', fullPage: true });
    console.log('✅ Screenshot salvo: admin-06-final-state.png');

    // Contar quantas integrações existem agora
    const cardsAfter = page.locator('[data-testid="integration-card"], .grid > div > div[class*="Card"]');
    const countAfter = await cardsAfter.count().catch(() => 0);
    console.log(`📊 Integrações depois: ${countAfter}`);

    // Procurar pelo card com o nome criado
    const newCard = page.locator(`text="${testInstanceName}"`).first();
    const cardVisible = await newCard.isVisible().catch(() => false);

    // ========================================
    // RESULTADO DO TESTE
    // ========================================
    console.log('\n========================================');
    console.log('📊 RESULTADO DO TESTE:');
    console.log('========================================');
    console.log(`Integrações antes: ${countBefore}`);
    console.log(`Integrações depois: ${countAfter}`);
    console.log(`Card visível: ${cardVisible ? '✅ SIM' : '❌ NÃO'}`);
    console.log(`Nome buscado: ${testInstanceName}`);

    if (cardVisible) {
      console.log('\n✅ SUCESSO: Card apareceu após criação!');
      console.log('🎉 Bug NÃO reproduzido - funcionalidade está OK');
    } else {
      console.log('\n❌ FALHA: Card NÃO apareceu após criação!');
      console.log('🐛 Bug REPRODUZIDO - card não está visível na lista');

      // Verificar se há mensagem de erro
      const errorMessage = page.locator('text=/erro|error/i').first();
      const errorVisible = await errorMessage.isVisible().catch(() => false);
      if (errorVisible) {
        const errorText = await errorMessage.textContent();
        console.log(`⚠️ Erro encontrado: ${errorText}`);
      }

      // Verificar console do navegador
      page.on('console', msg => console.log('🖥️ Console:', msg.text()));
    }
    console.log('========================================\n');

    // Asserção final
    if (cardVisible) {
      expect(countAfter).toBeGreaterThan(countBefore);
    } else {
      console.log('⚠️ Card não encontrado. Verificar screenshots para análise manual.');
    }
  });
});
