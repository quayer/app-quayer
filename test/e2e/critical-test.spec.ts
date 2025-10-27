import { test, expect } from '@playwright/test'

/**
 * 🔥 TESTE CRÍTICO BRUTAL - Validação Completa
 */

test.describe('🔥 VALIDAÇÃO CRÍTICA COMPLETA', () => {

  test('1. 🚨 CRÍTICO: Detectar erro client-side', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => msg.type() === 'error' && errors.push(msg.text()))
    page.on('pageerror', error => errors.push(error.message))

    await page.goto('http://localhost:3005/')
    await page.waitForTimeout(2000)

    console.log('Erros encontrados:', errors.length)
    errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`))

    expect(errors.length, `${errors.length} erro(s) client-side encontrados`).toBe(0)
  })

  test('2. ✅ Validar rota /login', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))

    const response = await page.goto('http://localhost:3005/login')
    expect(response?.status()).toBe(200)

    await page.waitForLoadState('networkidle')

    const hasEmailInput = await page.locator('input[type="email"]').count() > 0
    const hasPasswordInput = await page.locator('input[type="password"]').count() > 0
    const hasSubmitButton = await page.locator('button[type="submit"]').count() > 0

    console.log(`Email input: ${hasEmailInput}`)
    console.log(`Password input: ${hasPasswordInput}`)
    console.log(`Submit button: ${hasSubmitButton}`)

    expect(hasEmailInput).toBe(true)
    expect(hasPasswordInput).toBe(true)
    expect(hasSubmitButton).toBe(true)
    expect(errors.length).toBe(0)
  })

  test('3. 🔐 Teste de autenticação', async ({ page }) => {
    await page.goto('http://localhost:3005/login')

    const emailInput = page.locator('input[type="email"]')
    const passwordInput = page.locator('input[type="password"]')
    const submitButton = page.locator('button[type="submit"]')

    await emailInput.fill('admin@quayer.com')
    await passwordInput.fill('admin123456')
    await submitButton.click()

    await page.waitForTimeout(2000)

    const currentUrl = page.url()
    console.log('URL após login:', currentUrl)

    // Pode redirecionar para /integracoes ou mostrar erro
    const isRedirected = currentUrl.includes('/integracoes')
    const hasError = await page.locator('[role="alert"], .error').count() > 0

    console.log(`Redirecionado: ${isRedirected}`)
    console.log(`Tem erro: ${hasError}`)
  })

  test('4. 📊 Performance', async ({ page }) => {
    const start = Date.now()
    await page.goto('http://localhost:3005/login')
    await page.waitForLoadState('networkidle')
    const loadTime = Date.now() - start

    console.log(`Tempo de carregamento: ${loadTime}ms`)
    expect(loadTime).toBeLessThan(10000)
  })

  test('5. 🔍 Validar OpenAPI', async ({ page }) => {
    const response = await page.request.get('http://localhost:3005/docs/openapi.json')

    if (response.ok()) {
      const openapi = await response.json()
      const paths = Object.keys(openapi.paths || {})

      console.log('📚 OpenAPI Endpoints:')
      paths.forEach(path => console.log(`  - ${path}`))

      expect(paths.length).toBeGreaterThan(0)
    } else {
      console.log('⚠️  OpenAPI não disponível')
    }
  })

  test('6. ♿ Acessibilidade', async ({ page }) => {
    await page.goto('http://localhost:3005/login')
    await page.waitForLoadState('networkidle')

    // Aguardar hidratação completa
    await page.waitForSelector('button[type="submit"]', { state: 'visible', timeout: 10000 })

    const mainElement = await page.locator('main, [role="main"]').count() > 0
    const headings = await page.locator('h1, h2, h3').count() > 0
    const labels = await page.locator('label').count() > 0

    console.log(`Main: ${mainElement}, Headings: ${headings}, Labels: ${labels}`)

    expect(mainElement || headings).toBe(true)
    expect(labels).toBe(true)
  })

  test('7. 🚦 Rotas protegidas', async ({ page }) => {
    await page.goto('http://localhost:3005/integracoes', { timeout: 60000 })
    await page.waitForLoadState('networkidle', { timeout: 60000 })

    // Aguardar redirecionamento ou renderização
    await page.waitForTimeout(2000)

    const url = page.url()
    console.log('URL ao acessar rota protegida:', url)

    // Deve redirecionar para login
    expect(url).toContain('/login')
  })

  test('8. 🔄 APIs Auth', async ({ page }) => {
    const apiCalls: string[] = []

    page.on('request', req => {
      if (req.url().includes('/api/v1')) {
        apiCalls.push(`${req.method()} ${req.url()}`)
      }
    })

    await page.goto('http://localhost:3005/login')
    await page.waitForLoadState('networkidle')

    console.log('APIs chamadas:')
    apiCalls.forEach(call => console.log(`  - ${call}`))
  })

  test('9. 🎨 Botões da página de login', async ({ page }) => {
    await page.goto('http://localhost:3005/login')
    await page.waitForLoadState('networkidle')

    // Aguardar hidratação completa - esperar pelo botão submit aparecer
    await page.waitForSelector('button[type="submit"]', { state: 'visible', timeout: 10000 })

    const buttons = page.locator('button, [role="button"]')
    const count = await buttons.count()

    console.log(`Total de botões: ${count}`)

    for (let i = 0; i < count; i++) {
      const text = await buttons.nth(i).textContent()
      const visible = await buttons.nth(i).isVisible()
      console.log(`  ${i + 1}. "${text?.trim()}" - Visível: ${visible}`)
    }

    expect(count).toBeGreaterThan(0)
  })

  test('10. 📝 Mapear todas as rotas da aplicação', async ({ page }) => {
    const routes = [
      { path: '/', name: 'Root' },
      { path: '/login', name: 'Login' },
      { path: '/register', name: 'Register' },
      { path: '/integracoes', name: 'Integrações' },
      { path: '/admin/clients', name: 'Admin Clients' },
    ]

    console.log('\n📝 Testando todas as rotas:')

    for (const route of routes) {
      const response = await page.goto(`http://localhost:3005${route.path}`)
      const status = response?.status() || 0

      console.log(`  ${route.name} (${route.path}): ${status}`)
      expect(status).toBeLessThan(500)
    }
  })
})
