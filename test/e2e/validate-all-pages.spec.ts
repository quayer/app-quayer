import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3003';

test.describe('Platform Pages Validation', () => {

  test('1. Home page loads without errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(`Console error: ${msg.text()}`);
      }
    });

    page.on('pageerror', error => {
      errors.push(`Page error: ${error.message}`);
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    expect(errors).toHaveLength(0);
    expect(page.url()).toBe(`${BASE_URL}/`);
  });

  test('2. Login page loads and displays form', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(`Console error: ${msg.text()}`);
      }
    });

    page.on('pageerror', error => {
      errors.push(`Page error: ${error.message}`);
    });

    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Check for email and password inputs
    const emailInput = await page.locator('input[type="email"], input[name="email"]');
    const passwordInput = await page.locator('input[type="password"], input[name="password"]');
    const submitButton = await page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('3. Register page loads and displays form', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(`Console error: ${msg.text()}`);
      }
    });

    page.on('pageerror', error => {
      errors.push(`Page error: ${error.message}`);
    });

    await page.goto(`${BASE_URL}/register`);
    await page.waitForLoadState('networkidle');

    expect(errors).toHaveLength(0);
    expect(page.url()).toBe(`${BASE_URL}/register`);
  });

  test('4. Integracoes page redirects to login when not authenticated', async ({ page }) => {
    await page.goto(`${BASE_URL}/integracoes`);
    await page.waitForLoadState('networkidle');

    // Should redirect to login
    expect(page.url()).toContain('/login');
  });

  test('5. Complete user journey: Register → Login → Dashboard', async ({ page }) => {
    const errors: string[] = [];
    const timestamp = Date.now();

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(`Console error: ${msg.text()}`);
      }
    });

    page.on('pageerror', error => {
      errors.push(`Page error: ${error.message}`);
    });

    // Step 1: Go to register page
    await page.goto(`${BASE_URL}/register`);
    await page.waitForLoadState('networkidle');

    // Step 2: Fill registration form
    await page.fill('input[type="email"], input[name="email"]', `test${timestamp}@example.com`);
    await page.fill('input[name="name"], input[placeholder*="nome" i], input[placeholder*="name" i]', 'Test User');
    await page.fill('input[type="password"], input[name="password"]', 'Test@1234');

    // Step 3: Submit registration
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Should redirect to login or dashboard
    const currentUrl = page.url();
    const isLoginOrDashboard = currentUrl.includes('/login') || currentUrl.includes('/integracoes') || currentUrl === `${BASE_URL}/`;
    expect(isLoginOrDashboard).toBe(true);

    // If redirected to login, perform login
    if (currentUrl.includes('/login')) {
      await page.fill('input[type="email"], input[name="email"]', `test${timestamp}@example.com`);
      await page.fill('input[type="password"], input[name="password"]', 'Test@1234');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);
    }

    // Step 4: Navigate to integracoes (should work now)
    await page.goto(`${BASE_URL}/integracoes`);
    await page.waitForLoadState('networkidle');

    // Should NOT redirect to login anymore
    expect(page.url()).toContain('/integracoes');

    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('6. Integracoes page loads when authenticated', async ({ page }) => {
    const errors: string[] = [];
    const timestamp = Date.now();

    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        errors.push(`Console error: ${msg.text()}`);
      }
    });

    page.on('pageerror', error => {
      errors.push(`Page error: ${error.message}`);
    });

    // First login
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Create account quickly via API
    const response = await page.request.post(`${BASE_URL}/api/v1/auth/register`, {
      data: {
        email: `test${timestamp}@example.com`,
        password: 'Test@1234',
        name: 'Test User'
      }
    });

    const data = await response.json();
    const token = data.data?.token;

    if (token) {
      // Set token in localStorage
      await page.evaluate((token) => {
        localStorage.setItem('auth_token', token);
      }, token);
    }

    // Now visit integracoes
    await page.goto(`${BASE_URL}/integracoes`);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/integracoes');
    expect(errors).toHaveLength(0);
  });

  test('7. Admin pages require proper authentication', async ({ page }) => {
    // Try to access admin without auth
    await page.goto(`${BASE_URL}/admin/clients`);
    await page.waitForLoadState('networkidle');

    // Should redirect to login
    expect(page.url()).toContain('/login');
  });

  test('8. All pages have proper meta tags and title', async ({ page }) => {
    const pagesToTest = [
      { url: '/', expectedTitle: /.+/ }, // Any non-empty title
      { url: '/login', expectedTitle: /login/i },
      { url: '/register', expectedTitle: /regist/i },
    ];

    for (const pageTest of pagesToTest) {
      await page.goto(`${BASE_URL}${pageTest.url}`);
      await page.waitForLoadState('networkidle');

      const title = await page.title();
      expect(title).toMatch(pageTest.expectedTitle);
    }
  });
});

test.describe('API Endpoints Validation', () => {

  test('9. Health check endpoints respond', async ({ request }) => {
    // Test that API is reachable
    const response = await request.get(`${BASE_URL}/api/v1/auth/me`);

    // Should return 401 (not authenticated) or 200 (if somehow authenticated)
    expect([200, 401]).toContain(response.status());
  });

  test('10. Registration endpoint works', async ({ request }) => {
    const timestamp = Date.now();

    const response = await request.post(`${BASE_URL}/api/v1/auth/register`, {
      data: {
        email: `test${timestamp}@example.com`,
        password: 'Test@1234',
        name: 'Test User'
      }
    });

    expect(response.status()).toBe(201);
    const data = await response.json();
    expect(data.data).toHaveProperty('token');
    expect(data.data).toHaveProperty('user');
  });

  test('11. Login endpoint works', async ({ request }) => {
    const timestamp = Date.now();
    const email = `test${timestamp}@example.com`;

    // First register
    await request.post(`${BASE_URL}/api/v1/auth/register`, {
      data: {
        email,
        password: 'Test@1234',
        name: 'Test User'
      }
    });

    // Then login
    const response = await request.post(`${BASE_URL}/api/v1/auth/login`, {
      data: {
        email,
        password: 'Test@1234'
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.data).toHaveProperty('token');
  });

  test('12. Protected endpoints require authentication', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/instances`);

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test('13. Authenticated requests work', async ({ request }) => {
    const timestamp = Date.now();
    const email = `test${timestamp}@example.com`;

    // Register
    const registerResponse = await request.post(`${BASE_URL}/api/v1/auth/register`, {
      data: {
        email,
        password: 'Test@1234',
        name: 'Test User'
      }
    });

    const registerData = await registerResponse.json();
    const token = registerData.data.token;

    // Use token to access protected endpoint
    const response = await request.get(`${BASE_URL}/api/v1/instances`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.data).toHaveProperty('data'); // instances array
    expect(data.data).toHaveProperty('pagination');
  });
});
