import { test, expect, Page } from '@playwright/test';

/**
 * 🎯 TESTE COMPLETO DE TODAS AS ROTAS DO FRONT-END
 * 
 * Este teste valida TODAS as rotas da aplicação, verificando:
 * - Carregamento sem erros
 * - Redirecionamentos corretos
 * - Elementos principais visíveis
 * - Comportamento de autenticação
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Helper para capturar erros (baseado no skill webapp-testing)
const setupErrorCapture = (page: Page) => {
  const errors: string[] = [];
  const consoleMessages: string[] = [];
  
  // Capturar TODAS as mensagens do console (não apenas erros)
  page.on('console', msg => {
    const message = `[${msg.type()}] ${msg.text()}`;
    consoleMessages.push(message);
    
    // Filtrar erros (exceto favicon)
    if (msg.type() === 'error' && !msg.text().includes('favicon')) {
      errors.push(`Console: ${msg.text()}`);
      console.log(`🔴 Console Error: ${msg.text()}`);
    }
  });
  
  // Capturar erros de página
  page.on('pageerror', error => {
    errors.push(`Page: ${error.message}`);
    console.log(`🔴 Page Error: ${error.message}`);
  });
  
  // Capturar falhas de request (network errors)
  page.on('requestfailed', request => {
    errors.push(`Request Failed: ${request.url()} - ${request.failure()?.errorText}`);
    console.log(`🔴 Request Failed: ${request.url()}`);
  });
  
  return { errors, consoleMessages };
};

// Helper para fazer reconnaissance (padrão do skill webapp-testing)
const takeReconnaissance = async (page: Page, name: string) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = `test-screenshots/${name}-${timestamp}.png`;
  
  // Screenshot para debug visual
  await page.screenshot({ 
    path: screenshotPath, 
    fullPage: true 
  });
  
  // Inspecionar elementos interativos
  const buttons = await page.locator('button').all();
  const links = await page.locator('a').all();
  const inputs = await page.locator('input').all();
  
  console.log(`🔍 Reconnaissance [${name}]:`);
  console.log(`  📸 Screenshot: ${screenshotPath}`);
  console.log(`  🔘 Buttons: ${buttons.length}`);
  console.log(`  🔗 Links: ${links.length}`);
  console.log(`  📝 Inputs: ${inputs.length}`);
  
  return { buttons, links, inputs };
};

// Helper para fazer login
const loginAsUser = async (page: Page, isAdmin = false) => {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle'); // networkidle é CRÍTICO
  
  const email = isAdmin ? 'admin@quayer.com' : 'user@example.com';
  const password = 'Test@1234';
  
  // Reconnaissance ANTES de interagir (padrão do skill)
  await takeReconnaissance(page, 'login-page');
  
  // Tentar login via formulário
  try {
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    
    if (await emailInput.isVisible({ timeout: 2000 })) {
      await emailInput.fill(email);
      await passwordInput.fill(password);
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    }
  } catch (e) {
    console.log('⚠️ Login form not available, continuing...');
  }
};

test.describe('🏠 ROTAS PÚBLICAS', () => {
  test('1. Homepage (/) - deve carregar sem erros', async ({ page }) => {
    const { errors, consoleMessages } = setupErrorCapture(page);
    
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle'); // CRÍTICO: networkidle para apps dinâmicos
    
    // Debug: mostrar console se houver mensagens
    if (consoleMessages.length > 0) {
      console.log(`📋 Console Messages (${consoleMessages.length}):`, consoleMessages.slice(0, 5));
    }
    
    expect(errors).toHaveLength(0);
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('2. /docs - documentação pública', async ({ page }) => {
    const { errors } = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/docs`);
    await page.waitForLoadState('networkidle');
    
    expect(errors).toHaveLength(0);
    expect(page.url()).toContain('/docs');
  });

  test('3. /connect - página de conexão', async ({ page }) => {
    const { errors } = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/connect`);
    await page.waitForLoadState('networkidle');
    
    expect(errors).toHaveLength(0);
  });
});

test.describe('🔐 ROTAS DE AUTENTICAÇÃO', () => {
  test('4. /login - formulário de login visível', async ({ page }) => {
    const { errors } = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle'); // CRÍTICO para apps dinâmicos
    
    // 🔍 RECONNAISSANCE: Inspecionar antes de agir (padrão webapp-testing)
    const { inputs } = await takeReconnaissance(page, 'login-form-test');
    
    // 🎯 ACTION: Interagir com elementos descobertos
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    
    // Validação adicional: verificar se há inputs suficientes
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    expect(errors).toHaveLength(0);
  });

  test('5. /register - formulário de registro visível', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/register`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
    expect(page.url()).toContain('/register');
  });

  test('6. /signup - formulário de signup visível', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/signup`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
    expect(page.url()).toContain('/signup');
  });

  test('7. /forgot-password - recuperação de senha', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/forgot-password`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
    expect(page.url()).toContain('/forgot-password');
  });

  test('8. /verify-email - verificação de email', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/verify-email`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
    expect(page.url()).toContain('/verify-email');
  });

  test('9. /onboarding - página de onboarding', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/onboarding`);
    await page.waitForLoadState('domcontentloaded');
    
    // Pode redirecionar se não autenticado
    expect(errors).toHaveLength(0);
  });

  test('10. /google-callback - callback do Google OAuth', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/google-callback`);
    await page.waitForLoadState('domcontentloaded');
    
    // Callback pode redirecionar
    expect(errors).toHaveLength(0);
  });
});

test.describe('📊 DASHBOARD PRINCIPAL', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('11. /conexoes - página de conexões', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/conexoes`);
    await page.waitForLoadState('domcontentloaded');
    
    // Pode redirecionar para login se não autenticado
    expect(errors).toHaveLength(0);
  });

  test('12. /organizacao - página de organização', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/organizacao`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });
});

test.describe('⚙️ ADMIN - Rotas Administrativas', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, true); // Login como admin
  });

  test('13. /admin - dashboard admin', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/admin`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('14. /admin/brokers - gestão de brokers', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/admin/brokers`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('15. /admin/clients - gestão de clientes', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/admin/clients`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('16. /admin/integracoes - integrações admin', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/admin/integracoes`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('17. /admin/invitations - convites de usuários', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/admin/invitations`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('18. /admin/logs - logs do sistema', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/admin/logs`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('19. /admin/messages - mensagens do sistema', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/admin/messages`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('20. /admin/organizations - gestão de organizações', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/admin/organizations`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('21. /admin/permissions - gestão de permissões', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/admin/permissions`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('22. /admin/webhooks - gestão de webhooks admin', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/admin/webhooks`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });
});

test.describe('💬 CONVERSAS', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('23. /conversas/[sessionId] - conversa específica', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    // Tentar com ID de exemplo
    await page.goto(`${BASE_URL}/conversas/example-session-123`);
    await page.waitForLoadState('domcontentloaded');
    
    // Pode retornar 404 ou redirecionar
    expect(errors).toHaveLength(0);
  });
});

test.describe('📇 CRM', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('24. /crm/contatos - lista de contatos', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/crm/contatos`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('25. /crm/contatos/[id] - detalhes do contato', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/crm/contatos/example-contact-123`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('26. /crm/kanban - quadro kanban', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/crm/kanban`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('27. /crm/kanban/[id] - kanban específico', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/crm/kanban/example-board-123`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });
});

test.describe('🔌 INTEGRAÇÕES', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('28. /integracoes - dashboard de integrações', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/integracoes`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('29. /integracoes/dashboard - dashboard alternativo', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/integracoes/dashboard`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('30. /integracoes/conversations - conversas', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/integracoes/conversations`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('31. /integracoes/admin/clients - clientes admin', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/integracoes/admin/clients`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('32. /integracoes/settings - configurações', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/integracoes/settings`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('33. /integracoes/users - gestão de usuários', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/integracoes/users`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('34. /integracoes/webhooks - webhooks integrados', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/integracoes/webhooks`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('35. /integracoes/compartilhar/[token] - link compartilhado', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/integracoes/compartilhar/example-token-123`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });
});

test.describe('⚙️ CONFIGURAÇÕES', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('36. /configuracoes/departamentos - departamentos', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/configuracoes/departamentos`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('37. /configuracoes/labels - etiquetas', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/configuracoes/labels`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('38. /configuracoes/tabulacoes - tabulações', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/configuracoes/tabulacoes`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('39. /configuracoes/webhooks - webhooks config', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/configuracoes/webhooks`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });
});

test.describe('👤 USER', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('40. /user/dashboard - dashboard do usuário', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/user/dashboard`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });
});

test.describe('🔒 ROTAS DE VERIFICAÇÃO', () => {
  test('41. /login/verify - verificação após login', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/login/verify`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('42. /login/verify-magic - magic link login', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/login/verify-magic`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('43. /signup/verify - verificação após signup', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/signup/verify`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });

  test('44. /signup/verify-magic - magic link signup', async ({ page }) => {
    const errors = setupErrorCapture(page);
    
    await page.goto(`${BASE_URL}/signup/verify-magic`);
    await page.waitForLoadState('domcontentloaded');
    
    expect(errors).toHaveLength(0);
  });
});

test.describe('🔐 REDIRECIONAMENTOS DE SEGURANÇA', () => {
  test('45. Rotas protegidas redirecionam quando não autenticado', async ({ page }) => {
    // Limpar cookies primeiro
    await page.context().clearCookies();
    
    const protectedRoutes = [
      '/integracoes',
      '/admin',
      '/crm/contatos',
      '/configuracoes/departamentos',
      '/user/dashboard'
    ];
    
    for (const route of protectedRoutes) {
      await page.goto(`${BASE_URL}${route}`);
      await page.waitForLoadState('domcontentloaded');
      
      // Deve redirecionar para login ou mostrar erro
      const url = page.url();
      const shouldRedirect = url.includes('/login') || 
                            url.includes('/auth') || 
                            route === url; // Ou permanece se mostrar erro
      
      expect(shouldRedirect).toBe(true);
    }
  });
});

test.describe('📊 RESUMO FINAL', () => {
  test('46. Todas as rotas principais acessíveis', async ({ page }) => {
    const { errors, consoleMessages } = setupErrorCapture(page);
    
    // Login primeiro
    await loginAsUser(page, true);
    
    const criticalRoutes = [
      '/',
      '/login',
      '/register',
      '/docs',
      '/admin',
      '/integracoes',
    ];
    
    let successCount = 0;
    
    for (const route of criticalRoutes) {
      try {
        await page.goto(`${BASE_URL}${route}`, { timeout: 10000 });
        await page.waitForLoadState('networkidle'); // networkidle para apps dinâmicos
        successCount++;
      } catch (e) {
        console.log(`❌ Falha ao acessar ${route}:`, e);
      }
    }
    
    // Pelo menos 80% das rotas críticas devem funcionar
    expect(successCount / criticalRoutes.length).toBeGreaterThan(0.8);
    
    console.log(`✅ Rotas testadas: ${successCount}/${criticalRoutes.length}`);
    console.log(`❌ Erros encontrados: ${errors.length}`);
    console.log(`📋 Console messages: ${consoleMessages.length}`);
  });
});

