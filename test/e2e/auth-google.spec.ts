/**
 * Google OAuth E2E Tests
 *
 * ⚠️ ARQUIVO CRÍTICO - NÃO EXCLUIR ⚠️
 * Este arquivo contém testes essenciais para o fluxo de autenticação Google OAuth.
 * Sempre execute estes testes antes de fazer deploy para garantir que o OAuth está funcionando.
 *
 * Como executar:
 * ```bash
 * npx playwright test test/e2e/auth-google.spec.ts
 * ```
 */

import { test, expect } from '@playwright/test'

test.describe('🔐 Google OAuth - Autenticação e Cadastro', () => {
  const BASE_URL = process.env.NEXT_PUBLIC_IGNITER_API_URL || 'http://localhost:3000'
  const API_BASE_PATH = process.env.NEXT_PUBLIC_IGNITER_API_BASE_PATH || '/api/v1'
  const GOOGLE_AUTH_ENDPOINT = `${BASE_URL}${API_BASE_PATH}/auth/google`
  const GOOGLE_CALLBACK_ENDPOINT = `${BASE_URL}${API_BASE_PATH}/auth/google/callback`

  test.beforeEach(async ({ page }) => {
    // Limpar localStorage antes de cada teste
    await page.goto(BASE_URL)
    await page.evaluate(() => localStorage.clear())
  })

  /**
   * TESTE 1: Endpoint GET /api/v1/auth/google deve retornar authUrl
   *
   * Valida que o endpoint de início do fluxo OAuth está funcionando
   * e retornando uma URL válida do Google OAuth.
   */
  test('1️⃣ GET /api/v1/auth/google - Deve retornar authUrl do Google', async ({ request }) => {
    const response = await request.get(GOOGLE_AUTH_ENDPOINT)

    expect(response.ok()).toBeTruthy()
    expect(response.status()).toBe(200)

    const data = await response.json()

    // Validar estrutura da resposta
    expect(data).toHaveProperty('data')
    expect(data).toHaveProperty('error')
    expect(data.error).toBeNull()

    // Validar authUrl
    expect(data.data).toHaveProperty('authUrl')
    expect(data.data.authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth')
    expect(data.data.authUrl).toContain('client_id=')
    expect(data.data.authUrl).toContain('redirect_uri=')
    expect(data.data.authUrl).toContain('scope=')
    expect(data.data.authUrl).toContain('response_type=code')

    console.log('✅ Google Auth URL retornada com sucesso')
    console.log('📍 AuthURL:', data.data.authUrl.substring(0, 100) + '...')
  })

  /**
   * TESTE 2: Botão "Login com Google" deve redirecionar para o endpoint correto
   *
   * Valida que o frontend está corretamente integrado com o endpoint
   * de autenticação Google OAuth.
   */
  test('2️⃣ LOGIN - Botão "Login com Google" deve iniciar fluxo OAuth', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`)

    // Aguardar página carregar
    await page.waitForLoadState('networkidle')

    // Localizar botão de login Google
    const googleLoginButton = page.locator('button:has-text("Continuar com Google")')
    await expect(googleLoginButton).toBeVisible()

    // Interceptar requisições para validar chamada à API
    let apiCalled = false
    let authUrl = ''

    page.on('request', request => {
      if (request.url().includes('/api/v1/auth/google')) {
        apiCalled = true
        console.log('✅ API chamada:', request.url())
      }
    })

    page.on('response', async response => {
      if (response.url().includes('/api/v1/auth/google')) {
        const data = await response.json()
        if (data.data?.authUrl) {
          authUrl = data.data.authUrl
          console.log('✅ AuthURL recebida:', authUrl.substring(0, 80) + '...')
        }
      }
    })

    // Clicar no botão
    await googleLoginButton.click()

    // Aguardar um pouco para a requisição ser feita
    await page.waitForTimeout(2000)

    // Validações
    expect(apiCalled).toBeTruthy()
    expect(authUrl).toContain('https://accounts.google.com')

    console.log('✅ Fluxo de login iniciado com sucesso')
    console.log('⚠️ Nota: Teste não pode completar OAuth sem credenciais reais do Google')
  })

  /**
   * TESTE 3: Botão "Cadastrar com Google" deve redirecionar para o endpoint correto
   *
   * Valida que o signup está corretamente integrado com Google OAuth.
   */
  test('3️⃣ SIGNUP - Botão "Cadastrar com Google" deve iniciar fluxo OAuth', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`)

    // Aguardar página carregar
    await page.waitForLoadState('networkidle')

    // Localizar botão de signup Google
    const googleSignupButton = page.locator('button:has-text("Continuar com Google")')
    await expect(googleSignupButton).toBeVisible()

    // Interceptar requisições
    let apiCalled = false
    let authUrl = ''

    page.on('request', request => {
      if (request.url().includes('/api/v1/auth/google')) {
        apiCalled = true
        console.log('✅ API chamada:', request.url())
      }
    })

    page.on('response', async response => {
      if (response.url().includes('/api/v1/auth/google')) {
        const data = await response.json()
        if (data.data?.authUrl) {
          authUrl = data.data.authUrl
          console.log('✅ AuthURL recebida:', authUrl.substring(0, 80) + '...')
        }
      }
    })

    // Clicar no botão
    await googleSignupButton.click()

    // Aguardar requisição
    await page.waitForTimeout(2000)

    // Validações
    expect(apiCalled).toBeTruthy()
    expect(authUrl).toContain('https://accounts.google.com')

    console.log('✅ Fluxo de signup iniciado com sucesso')
  })

  /**
   * TESTE 4: Página de callback deve existir e processar código de autorização
   *
   * Valida que a página /google-callback existe e está pronta para
   * processar o retorno do Google OAuth.
   */
  test('4️⃣ CALLBACK - Página /google-callback deve existir', async ({ page }) => {
    await page.goto(`${BASE_URL}/google-callback`)

    // A página não deve retornar 404
    const title = await page.title()
    expect(title).not.toContain('404')

    // Deve mostrar loading ou erro (já que não tem código de autorização)
    const loadingOrError = await page.locator('text=/Processando|Erro|login/i').first().isVisible()
    expect(loadingOrError).toBeTruthy()

    console.log('✅ Página de callback existe e está funcional')
  })

  /**
   * TESTE 5: POST /api/v1/auth/google/callback deve validar código obrigatório
   *
   * Valida que o endpoint de callback requer o código de autorização.
   */
  test('5️⃣ CALLBACK API - Deve requerer código de autorização', async ({ request }) => {
    // Tentar callback sem código (deve falhar)
    const responseWithoutCode = await request.post(GOOGLE_CALLBACK_ENDPOINT, {
      data: {}
    })

    expect(responseWithoutCode.ok()).toBeFalsy()

    const dataWithoutCode = await responseWithoutCode.json()
    expect(dataWithoutCode.error).toBeTruthy()

    console.log('✅ Endpoint de callback valida corretamente parâmetros obrigatórios')
  })

  /**
   * TESTE 6: Validar estrutura de resposta do callback (com código inválido)
   *
   * Testa que o endpoint retorna erro adequado para código inválido.
   */
  test('6️⃣ CALLBACK API - Deve rejeitar código inválido', async ({ request }) => {
    const response = await request.post(GOOGLE_CALLBACK_ENDPOINT, {
      data: {
        code: 'codigo_invalido_teste_123456'
      }
    })

    // Deve retornar erro (código inválido)
    expect(response.ok()).toBeFalsy()

    const data = await response.json()
    expect(data.error).toBeTruthy()

    console.log('✅ Endpoint de callback rejeita códigos inválidos corretamente')
    console.log('📍 Erro esperado:', data.error)
  })
})

test.describe('📊 Google OAuth - Testes de Integração', () => {
  const BASE_URL = process.env.NEXT_PUBLIC_IGNITER_API_URL || 'http://localhost:3000'

  /**
   * TESTE 7: Validar variáveis de ambiente Google OAuth
   *
   * Verifica se as credenciais do Google OAuth estão configuradas.
   */
  test('7️⃣ CONFIG - Variáveis de ambiente devem estar configuradas', async ({ request }) => {
    // Testar endpoint (se as variáveis não estiverem configuradas, vai falhar)
    const response = await request.get(`${BASE_URL}/api/v1/auth/google`)

    expect(response.ok()).toBeTruthy()

    const data = await response.json()

    // Se authUrl contém client_id, significa que está configurado
    expect(data.data.authUrl).toContain('client_id=')

    // Extract client_id da URL
    const clientIdMatch = data.data.authUrl.match(/client_id=([^&]+)/)
    expect(clientIdMatch).toBeTruthy()
    expect(clientIdMatch![1]).not.toBe('')

    console.log('✅ Google OAuth Client ID configurado')
    console.log('📍 Client ID:', clientIdMatch![1].substring(0, 20) + '...')
  })

  /**
   * TESTE 8: Validar redirect_uri está correto
   *
   * Verifica que o redirect_uri configurado aponta para /google-callback.
   */
  test('8️⃣ CONFIG - Redirect URI deve apontar para /google-callback', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/auth/google`)
    const data = await response.json()

    expect(data.data.authUrl).toContain('redirect_uri=')
    expect(data.data.authUrl).toContain('google-callback')

    // Extract redirect_uri
    const redirectUriMatch = data.data.authUrl.match(/redirect_uri=([^&]+)/)
    expect(redirectUriMatch).toBeTruthy()

    const redirectUri = decodeURIComponent(redirectUriMatch![1])
    expect(redirectUri).toContain('/google-callback')

    console.log('✅ Redirect URI configurado corretamente')
    console.log('📍 Redirect URI:', redirectUri)
  })
})

/**
 * 📚 DOCUMENTAÇÃO ADICIONAL
 *
 * ## Como testar manualmente o fluxo completo:
 *
 * 1. Acesse http://localhost:3000/login
 * 2. Clique em "Continuar com Google"
 * 3. Faça login com uma conta Google válida
 * 4. Autorize o aplicativo
 * 5. Você será redirecionado para /google-callback
 * 6. Se tudo funcionar, você será redirecionado para o dashboard
 *
 * ## Troubleshooting:
 *
 * **Erro 404 no endpoint:**
 * - Verifique se o servidor Next.js está rodando
 * - Confirme que as variáveis de ambiente estão carregadas
 * - Reinicie o servidor com `npm run dev`
 *
 * **Google OAuth error:**
 * - Verifique se GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET estão corretos
 * - Confirme que GOOGLE_REDIRECT_URI está registrado no Google Console
 * - Verifique se o redirect_uri no console Google é exatamente: http://localhost:3000/google-callback
 *
 * **Código de autorização inválido:**
 * - Códigos OAuth são de uso único e expiram rapidamente
 * - Não tente reutilizar códigos de autorização
 * - Sempre inicie um novo fluxo OAuth
 */
