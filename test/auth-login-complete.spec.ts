import { test, expect } from '@playwright/test'

test.describe('Página de Login - Testes Completos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/login')
  })

  test('deve carregar a página de login com todos os elementos visuais', async ({ page }) => {
    // Aguardar Stars Background carregar
    await page.waitForSelector('[class*="stars"]', { timeout: 10000 })

    // Verificar logo
    const logo = page.locator('img[alt="Quayer Logo"]')
    await expect(logo).toBeVisible()

    // Verificar título
    const title = page.locator('h1:has-text("Bem-vindo de volta")')
    await expect(title).toBeVisible()
    await expect(title).toHaveCSS('font-weight', '700') // bold

    // Verificar subtítulo
    const subtitle = page.locator('p:has-text("Entre com suas credenciais")')
    await expect(subtitle).toBeVisible()
  })

  test('deve exibir campos de Email e Senha com ícones', async ({ page }) => {
    // Verificar campo Email
    const emailLabel = page.locator('label[for="email"]')
    await expect(emailLabel).toHaveText('Email')

    const emailInput = page.locator('input[name="email"]')
    await expect(emailInput).toBeVisible()
    await expect(emailInput).toHaveAttribute('type', 'email')
    await expect(emailInput).toHaveAttribute('placeholder', 'seu@email.com')

    // Verificar ícone Mail no input Email
    const mailIcon = page.locator('[class*="lucide-mail"]').first()
    await expect(mailIcon).toBeVisible()

    // Verificar campo Senha
    const passwordLabel = page.locator('label[for="password"]')
    await expect(passwordLabel).toHaveText('Senha')

    const passwordInput = page.locator('input[name="password"]')
    await expect(passwordInput).toBeVisible()
    await expect(passwordInput).toHaveAttribute('type', 'password')
    await expect(passwordInput).toHaveAttribute('placeholder', '••••••••')

    // Verificar ícone Lock no input Senha
    const lockIcon = page.locator('[class*="lucide-lock"]').first()
    await expect(lockIcon).toBeVisible()
  })

  test('deve exibir link "Esqueceu a senha?"', async ({ page }) => {
    const forgotPasswordLink = page.locator('a[href="/forgot-password"]')
    await expect(forgotPasswordLink).toBeVisible()
    await expect(forgotPasswordLink).toHaveText('Esqueceu a senha?')
  })

  test('deve navegar para página de "Esqueceu a senha" ao clicar no link', async ({ page }) => {
    const forgotPasswordLink = page.locator('a[href="/forgot-password"]')
    await forgotPasswordLink.click()

    await page.waitForURL('**/forgot-password')
    expect(page.url()).toContain('/forgot-password')
  })

  test('deve exibir botão "Entrar" com gradient', async ({ page }) => {
    const loginButton = page.locator('button[type="submit"]')
    await expect(loginButton).toBeVisible()
    await expect(loginButton).toHaveText('Entrar')

    // Verificar classes de gradient
    const classes = await loginButton.getAttribute('class')
    expect(classes).toContain('from-purple-600')
    expect(classes).toContain('to-pink-600')
  })

  test('deve exibir divider "Ou continue com"', async ({ page }) => {
    const divider = page.locator('span:has-text("Ou continue com")')
    await expect(divider).toBeVisible()
    await expect(divider).toHaveText('Ou continue com')
  })

  test('deve exibir botão Google OAuth', async ({ page }) => {
    const googleButton = page.locator('button:has-text("Google")')
    await expect(googleButton).toBeVisible()

    // Verificar ícone Chrome
    const chromeIcon = page.locator('[class*="lucide-chrome"]')
    await expect(chromeIcon).toBeVisible()
  })

  test('deve exibir link "Não tem uma conta? Registre-se"', async ({ page }) => {
    const registerLink = page.locator('a[href="/register"]')
    await expect(registerLink).toBeVisible()
    await expect(registerLink).toHaveText('Registre-se')

    // Verificar texto completo do parágrafo
    const registerText = page.locator('p:has-text("Não tem uma conta?")')
    await expect(registerText).toBeVisible()
  })

  test('deve navegar para página de registro ao clicar em "Registre-se"', async ({ page }) => {
    const registerLink = page.locator('a[href="/register"]')
    await registerLink.click()

    await page.waitForURL('**/register')
    expect(page.url()).toContain('/register')
  })

  test('deve exibir glassmorphism card (backdrop-blur)', async ({ page }) => {
    const card = page.locator('[class*="backdrop-blur"]')
    await expect(card).toBeVisible()
  })

  test('deve validar campo de email vazio', async ({ page }) => {
    const loginButton = page.locator('button[type="submit"]')
    await loginButton.click()

    // HTML5 validation vai impedir submit
    const emailInput = page.locator('input[name="email"]')
    const isValid = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid)
    expect(isValid).toBe(false)
  })

  test('deve validar email inválido', async ({ page }) => {
    const emailInput = page.locator('input[name="email"]')
    await emailInput.fill('email-invalido')

    const loginButton = page.locator('button[type="submit"]')
    await loginButton.click()

    // Verificar validação HTML5
    const isValid = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid)
    expect(isValid).toBe(false)
  })

  test('deve mostrar loading state ao tentar fazer login', async ({ page }) => {
    const emailInput = page.locator('input[name="email"]')
    const passwordInput = page.locator('input[name="password"]')
    const loginButton = page.locator('button[type="submit"]')

    await emailInput.fill('teste@teste.com')
    await passwordInput.fill('senha123')

    // Clicar no botão de login
    await loginButton.click()

    // Verificar se botão mostra "Entrando..." com spinner
    const loadingText = page.locator('button:has-text("Entrando...")')
    await expect(loadingText).toBeVisible({ timeout: 2000 })

    // Verificar spinner (Loader2)
    const spinner = page.locator('[class*="animate-spin"]')
    await expect(spinner).toBeVisible()
  })

  test('deve desabilitar inputs e botões durante loading', async ({ page }) => {
    const emailInput = page.locator('input[name="email"]')
    const passwordInput = page.locator('input[name="password"]')
    const loginButton = page.locator('button[type="submit"]')

    await emailInput.fill('teste@teste.com')
    await passwordInput.fill('senha123')
    await loginButton.click()

    // Verificar se inputs ficam disabled
    await expect(emailInput).toBeDisabled({ timeout: 1000 })
    await expect(passwordInput).toBeDisabled({ timeout: 1000 })
    await expect(loginButton).toBeDisabled({ timeout: 1000 })
  })

  test('deve exibir erro ao tentar login com credenciais inválidas', async ({ page }) => {
    const emailInput = page.locator('input[name="email"]')
    const passwordInput = page.locator('input[name="password"]')
    const loginButton = page.locator('button[type="submit"]')

    await emailInput.fill('invalido@teste.com')
    await passwordInput.fill('senhaerrada')
    await loginButton.click()

    // Aguardar mensagem de erro aparecer
    const errorAlert = page.locator('[role="alert"]')
    await expect(errorAlert).toBeVisible({ timeout: 5000 })
  })

  test('deve ter espaçamentos corretos (8pt grid)', async ({ page }) => {
    // Verificar espaçamento do CardHeader
    const cardHeader = page.locator('[class*="CardHeader"]').first()
    const cardHeaderPadding = await cardHeader.evaluate((el) => {
      const styles = window.getComputedStyle(el)
      return styles.paddingBottom
    })

    // pb-6 = 24px (1.5rem)
    expect(cardHeaderPadding).toBe('24px')
  })

  test('deve ter cores corretas no tema dark', async ({ page }) => {
    // Verificar cor do título (white)
    const title = page.locator('h1:has-text("Bem-vindo de volta")')
    const titleColor = await title.evaluate((el) => {
      return window.getComputedStyle(el).color
    })

    // white = rgb(255, 255, 255)
    expect(titleColor).toBe('rgb(255, 255, 255)')
  })

  test('deve ter botões acessíveis (tab navigation)', async ({ page }) => {
    // Pressionar Tab sequencialmente
    await page.keyboard.press('Tab') // Email
    let focused = await page.evaluate(() => document.activeElement?.getAttribute('name'))
    expect(focused).toBe('email')

    await page.keyboard.press('Tab') // Senha
    focused = await page.evaluate(() => document.activeElement?.getAttribute('name'))
    expect(focused).toBe('password')

    await page.keyboard.press('Tab') // Esqueceu a senha?
    focused = await page.evaluate(() => document.activeElement?.getAttribute('href'))
    expect(focused).toBe('/forgot-password')

    await page.keyboard.press('Tab') // Botão Entrar
    focused = await page.evaluate(() => document.activeElement?.getAttribute('type'))
    expect(focused).toBe('submit')
  })

  test('deve ser responsivo em mobile (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })

    const card = page.locator('[class*="Card"]').first()
    await expect(card).toBeVisible()

    // Verificar se o card não ultrapassa a largura da tela
    const cardWidth = await card.evaluate((el) => el.getBoundingClientRect().width)
    expect(cardWidth).toBeLessThanOrEqual(375)
  })

  test('deve ser responsivo em tablet (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })

    const card = page.locator('[class*="Card"]').first()
    await expect(card).toBeVisible()
  })
})

test.describe('Página Esqueceu a Senha', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/forgot-password')
  })

  test('deve exibir todos os elementos da página', async ({ page }) => {
    // Logo
    const logo = page.locator('img[alt="Quayer Logo"]')
    await expect(logo).toBeVisible()

    // Campo Email
    const emailInput = page.locator('input[type="email"]')
    await expect(emailInput).toBeVisible()

    // Botão Enviar
    const submitButton = page.locator('button[type="submit"]:has-text("Enviar instruções")')
    await expect(submitButton).toBeVisible()

    // Link "Voltar para login"
    const backLink = page.locator('a[href="/login"]')
    await expect(backLink).toBeVisible()
  })

  test('deve voltar para login ao clicar no link', async ({ page }) => {
    const backLink = page.locator('a[href="/login"]')
    await backLink.click()

    await page.waitForURL('**/login')
    expect(page.url()).toContain('/login')
  })
})

test.describe('Página de Registro', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/register')
  })

  test('deve exibir todos os campos do formulário', async ({ page }) => {
    // Logo
    const logo = page.locator('img[alt="Quayer Logo"]')
    await expect(logo).toBeVisible()

    // Campo Nome
    const nameInput = page.locator('input[type="text"]')
    await expect(nameInput).toBeVisible()

    // Campo Email
    const emailInput = page.locator('input[type="email"]')
    await expect(emailInput).toBeVisible()

    // Campos Senha
    const passwordInputs = page.locator('input[type="password"]')
    await expect(passwordInputs).toHaveCount(2) // Senha + Confirmar Senha

    // Botão Criar Conta
    const submitButton = page.locator('button[type="submit"]:has-text("Criar Conta")')
    await expect(submitButton).toBeVisible()

    // Link "Já tem uma conta?"
    const loginLink = page.locator('a[href="/login"]')
    await expect(loginLink).toBeVisible()
  })

  test('deve voltar para login ao clicar no link', async ({ page }) => {
    const loginLink = page.locator('a[href="/login"]')
    await loginLink.click()

    await page.waitForURL('**/login')
    expect(page.url()).toContain('/login')
  })

  test('deve validar senhas diferentes', async ({ page }) => {
    const nameInput = page.locator('input[type="text"]')
    const emailInput = page.locator('input[type="email"]')
    const passwordInputs = page.locator('input[type="password"]')
    const submitButton = page.locator('button[type="submit"]')

    await nameInput.fill('Teste User')
    await emailInput.fill('teste@teste.com')
    await passwordInputs.nth(0).fill('senha123')
    await passwordInputs.nth(1).fill('senha456') // Diferente

    await submitButton.click()

    // Deve mostrar erro
    const errorAlert = page.locator('[role="alert"]:has-text("não coincidem")')
    await expect(errorAlert).toBeVisible({ timeout: 2000 })
  })

  test('deve validar senha mínima de 8 caracteres', async ({ page }) => {
    const nameInput = page.locator('input[type="text"]')
    const emailInput = page.locator('input[type="email"]')
    const passwordInputs = page.locator('input[type="password"]')
    const submitButton = page.locator('button[type="submit"]')

    await nameInput.fill('Teste User')
    await emailInput.fill('teste@teste.com')
    await passwordInputs.nth(0).fill('123') // Menos de 8
    await passwordInputs.nth(1).fill('123')

    await submitButton.click()

    // Deve mostrar erro
    const errorAlert = page.locator('[role="alert"]:has-text("8 caracteres")')
    await expect(errorAlert).toBeVisible({ timeout: 2000 })
  })
})
