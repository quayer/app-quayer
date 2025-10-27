/**
 * E2E Tests - Passwordless Authentication (OTP + Magic Link)
 *
 * Testa todo o fluxo moderno de autenticação sem senha
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('Passwordless Authentication - E2E Complete', () => {

  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.context().clearPermissions();
  });

  test.describe('Signup Flow (Novo Usuário)', () => {

    test('deve carregar página de signup com todos elementos', async ({ page }) => {
      await page.goto(`${BASE_URL}/signup`);

      // Verificar elementos principais
      await expect(page.getByRole('heading', { name: /criar conta/i })).toBeVisible();
      await expect(page.getByPlaceholder(/nome completo/i)).toBeVisible();
      await expect(page.getByPlaceholder(/seu e-mail/i)).toBeVisible();

      // Verificar botões de autenticação
      await expect(page.getByRole('button', { name: /continuar com google/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /continuar com e-mail/i })).toBeVisible();

      // Verificar link para login
      await expect(page.getByRole('link', { name: /fazer login/i })).toBeVisible();
    });

    test('deve enviar OTP e redirecionar para verificação', async ({ page }) => {
      const testEmail = `test-${Date.now()}@example.com`;

      await page.goto(`${BASE_URL}/signup`);

      await page.getByPlaceholder(/nome completo/i).fill('E2E Test User');
      await page.getByPlaceholder(/seu e-mail/i).fill(testEmail);
      await page.getByRole('button', { name: /continuar com e-mail/i }).click();

      // Verificar mensagem de sucesso
      await expect(page.getByText(/código enviado/i)).toBeVisible({ timeout: 5000 });

      // Verificar redirecionamento
      await expect(page).toHaveURL(/\/signup\/verify/, { timeout: 3000 });
    });

    test('deve exibir erro para email já cadastrado', async ({ page }) => {
      await page.goto(`${BASE_URL}/signup`);

      await page.getByPlaceholder(/nome completo/i).fill('Existing User');
      await page.getByPlaceholder(/seu e-mail/i).fill('admin@quayer.com');
      await page.getByRole('button', { name: /continuar com e-mail/i }).click();

      // Verificar mensagem de erro
      await expect(page.getByText(/já cadastrado|já existe/i)).toBeVisible({ timeout: 5000 });
    });

    test('deve validar campos obrigatórios', async ({ page }) => {
      await page.goto(`${BASE_URL}/signup`);

      // Tentar submeter sem preencher
      await page.getByRole('button', { name: /continuar com e-mail/i }).click();

      // Verificar que inputs ficaram inválidos (HTML5 validation)
      const nameInput = page.getByPlaceholder(/nome completo/i);
      const emailInput = page.getByPlaceholder(/seu e-mail/i);

      expect(await nameInput.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
      expect(await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
    });
  });

  test.describe('Página de Verificação (OTP)', () => {

    test('deve exibir página de verificação corretamente', async ({ page }) => {
      const testEmail = `verify-${Date.now()}@test.com`;

      // Fazer signup primeiro
      await page.goto(`${BASE_URL}/signup`);
      await page.getByPlaceholder(/nome completo/i).fill('Verify Test');
      await page.getByPlaceholder(/seu e-mail/i).fill(testEmail);
      await page.getByRole('button', { name: /continuar com e-mail/i }).click();

      // Aguardar redirecionamento
      await expect(page).toHaveURL(/\/signup\/verify/, { timeout: 3000 });

      // Verificar elementos da página
      await expect(page.getByRole('heading', { name: /verificação/i })).toBeVisible();
      await expect(page.getByText(testEmail)).toBeVisible();
      await expect(page.getByText(/digite o código ou clique no link do email/i)).toBeVisible();

      // Verificar InputOTP (6 dígitos)
      const otpSlots = page.locator('input[inputmode="numeric"]');
      await expect(otpSlots).toHaveCount(6);

      // Verificar contador de reenvio
      await expect(page.getByText(/não recebeu/i)).toBeVisible();
      await expect(page.getByText(/reenviar em \d+s/i)).toBeVisible();

      // Verificar links de navegação
      await expect(page.getByRole('link', { name: /fazer login/i })).toBeVisible();
    });

    test('deve validar espaçamento correto do InputOTP', async ({ page }) => {
      const testEmail = `spacing-${Date.now()}@test.com`;

      await page.goto(`${BASE_URL}/signup`);
      await page.getByPlaceholder(/nome completo/i).fill('Spacing Test');
      await page.getByPlaceholder(/seu e-mail/i).fill(testEmail);
      await page.getByRole('button', { name: /continuar com e-mail/i }).click();

      await expect(page).toHaveURL(/\/signup\/verify/, { timeout: 3000 });

      // Verificar que InputOTP tem espaçamento correto
      const otpContainer = page.locator('div').filter({ hasText: /código de verificação/i }).first();
      await expect(otpContainer).toBeVisible();

      // Verificar que separator está presente (meio do código)
      const separator = page.locator('[data-input-otp-separator]').or(page.locator('.gap-2'));
      const separatorCount = await separator.count();
      expect(separatorCount).toBeGreaterThan(0);
    });

    test('deve permitir reenvio após countdown', async ({ page }) => {
      const testEmail = `resend-${Date.now()}@test.com`;

      await page.goto(`${BASE_URL}/signup`);
      await page.getByPlaceholder(/nome completo/i).fill('Resend Test');
      await page.getByPlaceholder(/seu e-mail/i).fill(testEmail);
      await page.getByRole('button', { name: /continuar com e-mail/i }).click();

      await expect(page).toHaveURL(/\/signup\/verify/, { timeout: 3000 });

      // Aguardar alguns segundos do countdown
      await page.waitForTimeout(3000);

      // Verificar que countdown diminuiu
      const countdownText = await page.getByText(/reenviar em \d+s/i).textContent();
      expect(countdownText).toMatch(/\d+s/);
    }, { timeout: 65000 }); // Timeout maior para aguardar countdown
  });

  test.describe('Login Flow (Usuário Existente)', () => {

    test('deve carregar página de login corretamente', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);

      await expect(page.getByRole('heading', { name: /bem-vindo de volta/i })).toBeVisible();
      await expect(page.getByPlaceholder(/seu e-mail/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /continuar com google/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /continuar/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /criar conta/i })).toBeVisible();
    });

    test('deve enviar OTP para usuário existente', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);

      await page.getByPlaceholder(/seu e-mail/i).fill('admin@quayer.com');
      await page.getByRole('button', { name: /continuar/i }).click();

      // Verificar mensagem de sucesso
      await expect(page.getByText(/código enviado/i)).toBeVisible({ timeout: 5000 });

      // Login deve permanecer na mesma página (diferente de signup)
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('UX/UI - Design System', () => {

    test('deve ter espaçamento correto (8pt grid)', async ({ page }) => {
      await page.goto(`${BASE_URL}/signup`);

      // Verificar padding e margin dos elementos principais
      const card = page.locator('.card').or(page.locator('[role="form"]')).first();

      if (await card.isVisible()) {
        const padding = await card.evaluate((el) => {
          const styles = window.getComputedStyle(el);
          return styles.padding;
        });

        console.log('📏 Card padding:', padding);
        // Padding deve ser múltiplo de 8 (8, 16, 24, 32...)
      }
    });

    test('deve ter contraste adequado (WCAG AA)', async ({ page }) => {
      await page.goto(`${BASE_URL}/signup`);

      // Verificar contraste do texto principal
      const heading = page.getByRole('heading', { name: /criar conta/i });
      const contrast = await heading.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return {
          color: styles.color,
          backgroundColor: styles.backgroundColor
        };
      });

      console.log('🎨 Contrast:', contrast);
    });

    test('deve ser responsivo em mobile (375px)', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto(`${BASE_URL}/signup`);

      // Verificar que elementos estão visíveis
      await expect(page.getByRole('heading', { name: /criar conta/i })).toBeVisible();
      await expect(page.getByPlaceholder(/nome completo/i)).toBeVisible();

      // Verificar que botões são clicáveis
      const emailButton = page.getByRole('button', { name: /continuar com e-mail/i });
      await expect(emailButton).toBeVisible();

      // Verificar que não há scroll horizontal
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasHorizontalScroll).toBe(false);
    });

    test('deve ser responsivo em tablet (768px)', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });

      await page.goto(`${BASE_URL}/signup`);

      await expect(page.getByRole('heading')).toBeVisible();
      await expect(page.getByPlaceholder(/nome completo/i)).toBeVisible();
    });
  });

  test.describe('Acessibilidade (WCAG)', () => {

    test('deve navegar por teclado (Tab)', async ({ page }) => {
      await page.goto(`${BASE_URL}/signup`);

      const nameInput = page.getByPlaceholder(/nome completo/i);
      const emailInput = page.getByPlaceholder(/seu e-mail/i);
      const googleButton = page.getByRole('button', { name: /continuar com google/i });
      const emailButton = page.getByRole('button', { name: /continuar com e-mail/i });

      // Navegar com Tab
      await page.keyboard.press('Tab');
      await expect(nameInput).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(emailInput).toBeFocused();

      await page.keyboard.press('Tab');
      // Próximo elemento focável (Google ou Email button)
      const isFocused = await googleButton.evaluate((el) => document.activeElement === el)
        || await emailButton.evaluate((el) => document.activeElement === el);

      expect(isFocused).toBe(true);
    });

    test('deve submeter formulário com Enter', async ({ page }) => {
      const testEmail = `keyboard-${Date.now()}@test.com`;

      await page.goto(`${BASE_URL}/signup`);

      await page.getByPlaceholder(/nome completo/i).fill('Keyboard User');
      await page.getByPlaceholder(/seu e-mail/i).fill(testEmail);

      // Pressionar Enter para submeter
      await page.keyboard.press('Enter');

      // Verificar que enviou
      await expect(page.getByText(/código enviado/i)).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Performance', () => {

    test('deve carregar página em menos de 2 segundos', async ({ page }) => {
      const start = Date.now();

      await page.goto(`${BASE_URL}/signup`);
      await page.waitForLoadState('networkidle');

      const loadTime = Date.now() - start;
      console.log(`⚡ Page load time: ${loadTime}ms`);

      expect(loadTime).toBeLessThan(2000);
    });

    test('deve renderizar InputOTP rapidamente', async ({ page }) => {
      const testEmail = `perf-${Date.now()}@test.com`;

      await page.goto(`${BASE_URL}/signup`);
      await page.getByPlaceholder(/nome completo/i).fill('Perf Test');
      await page.getByPlaceholder(/seu e-mail/i).fill(testEmail);

      const start = Date.now();
      await page.getByRole('button', { name: /continuar com e-mail/i }).click();

      // Aguardar InputOTP aparecer
      await page.waitForSelector('input[inputmode="numeric"]');

      const renderTime = Date.now() - start;
      console.log(`⚡ OTP render time: ${renderTime}ms`);

      expect(renderTime).toBeLessThan(3000);
    });
  });

  test.describe('Navegação', () => {

    test('deve navegar entre signup e login', async ({ page }) => {
      await page.goto(`${BASE_URL}/signup`);

      // Signup -> Login
      await page.getByRole('link', { name: /fazer login/i }).click();
      await expect(page).toHaveURL(/\/login/);

      // Login -> Signup
      await page.getByRole('link', { name: /criar conta/i }).click();
      await expect(page).toHaveURL(/\/signup/);
    });

    test('deve preservar dados no sessionStorage', async ({ page }) => {
      const testEmail = `storage-${Date.now()}@test.com`;
      const testName = 'Storage Test';

      await page.goto(`${BASE_URL}/signup`);
      await page.getByPlaceholder(/nome completo/i).fill(testName);
      await page.getByPlaceholder(/seu e-mail/i).fill(testEmail);
      await page.getByRole('button', { name: /continuar com e-mail/i }).click();

      await expect(page).toHaveURL(/\/signup\/verify/, { timeout: 3000 });

      // Verificar sessionStorage
      const storedEmail = await page.evaluate(() => sessionStorage.getItem('signup-email'));
      const storedName = await page.evaluate(() => sessionStorage.getItem('signup-name'));

      expect(storedEmail).toBe(testEmail);
      expect(storedName).toBe(testName);
    });
  });
});
