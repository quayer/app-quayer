/**
 * Authentication Helper for Playwright E2E Tests
 *
 * Sistema PASSWORDLESS - não usa senha!
 * Usa refresh token para bypass de OTP/Magic Link em testes
 */

import { Page, BrowserContext } from '@playwright/test';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    currentOrgId?: string;
    organizationRole?: string;
  };
}

/**
 * Configura autenticação usando refresh token
 * BYPASS de OTP/Magic Link para testes automatizados
 */
export async function setupAuthWithRefreshToken(
  page: Page,
  refreshToken: string
): Promise<AuthTokens> {
  // Fazer request para refresh endpoint
  const response = await page.request.post('http://localhost:3000/api/v1/auth/refresh', {
    headers: {
      'Content-Type': 'application/json',
    },
    data: {
      refreshToken,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to refresh token: ${response.status()} ${await response.text()}`);
  }

  const data = await response.json();

  const tokens: AuthTokens = {
    accessToken: data.data.accessToken,
    refreshToken: data.data.refreshToken,
    user: data.data.user,
  };

  // Salvar tokens no localStorage
  await page.goto('http://localhost:3000');
  await page.evaluate((tokens) => {
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    localStorage.setItem('user', JSON.stringify(tokens.user));
  }, tokens);

  return tokens;
}

/**
 * Faz login usando OTP passwordless (para setup inicial se necessário)
 * APENAS PARA SETUP - testes devem usar refresh token
 */
export async function loginWithOTP(
  page: Page,
  email: string
): Promise<{ email: string; message: string }> {
  await page.goto('http://localhost:3000/login');

  // Preencher email
  await page.fill('input[type="email"]', email);

  // Click no botão de enviar OTP
  await page.click('button:has-text("Enviar Código")');

  // Aguardar resposta
  await page.waitForTimeout(2000);

  return {
    email,
    message: 'OTP enviado para o email. Verifique o console do servidor para o código.',
  };
}

/**
 * Verifica OTP e completa login
 * APENAS PARA SETUP - testes devem usar refresh token
 */
export async function verifyOTP(
  page: Page,
  email: string,
  code: string
): Promise<AuthTokens> {
  // Assumindo que já está na tela de verificação
  // Preencher código OTP
  await page.fill('input[name="code"]', code);

  // Clicar em verificar
  await page.click('button:has-text("Verificar")');

  // Aguardar redirect após login
  await page.waitForURL('http://localhost:3000/dashboard', { timeout: 10000 });

  // Extrair tokens do localStorage
  const tokens = await page.evaluate(() => {
    return {
      accessToken: localStorage.getItem('accessToken') || '',
      refreshToken: localStorage.getItem('refreshToken') || '',
      user: JSON.parse(localStorage.getItem('user') || '{}'),
    };
  });

  return tokens as AuthTokens;
}

/**
 * Faz logout e limpa tokens
 */
export async function logout(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  });

  await page.goto('http://localhost:3000/login');
}

/**
 * Verifica se está autenticado
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
  return !!accessToken;
}

/**
 * Setup de contexto compartilhado com auth (evita re-autenticação)
 */
export async function createAuthenticatedContext(
  context: BrowserContext,
  refreshToken: string
): Promise<void> {
  // Criar página temporária para setup
  const page = await context.newPage();
  await setupAuthWithRefreshToken(page, refreshToken);
  await page.close();
}

/**
 * Helper para testes que precisam de role específica
 */
export function requireRole(tokens: AuthTokens, expectedRole: string): boolean {
  return tokens.user.role === expectedRole;
}

/**
 * Helper para testes que precisam de org role específica
 */
export function requireOrgRole(tokens: AuthTokens, expectedOrgRole: string): boolean {
  return tokens.user.organizationRole === expectedOrgRole;
}

/**
 * Credenciais de teste (configurar no .env.test)
 * USAR REFRESH TOKEN RECOVERY para bypass de OTP
 */
export const TEST_CREDENTIALS = {
  ADMIN: {
    email: 'admin@quayer.com',
    refreshToken: process.env.TEST_ADMIN_REFRESH_TOKEN || '',
    role: 'admin',
  },
  MASTER: {
    email: 'master@acme.com',
    refreshToken: process.env.TEST_MASTER_REFRESH_TOKEN || '',
    role: 'user',
    orgRole: 'master',
  },
  MANAGER: {
    email: 'manager@acme.com',
    refreshToken: process.env.TEST_MANAGER_REFRESH_TOKEN || '',
    role: 'user',
    orgRole: 'manager',
  },
  USER: {
    email: 'user@acme.com',
    refreshToken: process.env.TEST_USER_REFRESH_TOKEN || '',
    role: 'user',
    orgRole: 'agent',
  },
};

/**
 * Setup automático de auth para cada teste
 *
 * Uso:
 * test.beforeEach(async ({ page }) => {
 *   await autoAuth(page, 'ADMIN');
 * });
 */
export async function autoAuth(
  page: Page,
  role: keyof typeof TEST_CREDENTIALS
): Promise<AuthTokens> {
  const credentials = TEST_CREDENTIALS[role];

  if (!credentials.refreshToken) {
    throw new Error(
      `Refresh token not configured for ${role}. Set TEST_${role}_REFRESH_TOKEN in .env.test`
    );
  }

  return await setupAuthWithRefreshToken(page, credentials.refreshToken);
}

/**
 * Espera por elemento estar visível (helper comum)
 */
export async function waitForElement(
  page: Page,
  selector: string,
  timeout: number = 10000
): Promise<void> {
  await page.waitForSelector(selector, { state: 'visible', timeout });
}

/**
 * Espera por navegação completar
 */
export async function waitForNavigation(
  page: Page,
  url?: string,
  timeout: number = 10000
): Promise<void> {
  if (url) {
    await page.waitForURL(url, { timeout });
  } else {
    await page.waitForLoadState('networkidle', { timeout });
  }
}
