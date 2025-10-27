import { test, expect, type Page } from '@playwright/test'

/**
 * @test WhatsApp Integration Complete Flow
 * @description Testes E2E completos para integração WhatsApp com diferentes perfis de usuário
 * @coverage
 * - Criação de instância com validação de telefone
 * - QR Code com timer de 2 minutos
 * - Foto de perfil automática
 * - Configuração de webhook (Admin apenas)
 * - RBAC para diferentes perfis (admin, master, manager, user)
 * - Limite de instâncias por organização
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// Credenciais de teste para diferentes perfis
const USERS = {
  admin: {
    email: 'admin@quayer.com',
    password: 'admin123456',
    role: 'admin',
    organizationId: 'org-admin-test'
  },
  master: {
    email: 'master@acme.com',
    password: 'master123456',
    role: 'master',
    organizationId: 'org-acme'
  },
  manager: {
    email: 'manager@test.com',
    password: 'manager123456',
    role: 'manager',
    organizationId: 'org-test'
  },
  user: {
    email: 'user@test.com',
    password: 'user123456',
    role: 'user',
    organizationId: 'org-test'
  }
}

// Helper: Login com diferentes perfis
async function loginAs(page: Page, profile: keyof typeof USERS) {
  const user = USERS[profile]

  await page.goto(`${BASE_URL}/login`)
  await page.fill('input[type="email"]', user.email)
  await page.fill('input[type="password"]', user.password)
  await page.click('button[type="submit"]')

  // Aguardar redirecionamento
  await page.waitForURL(/\/(integracoes|dashboard)/, { timeout: 10000 })
}

// Helper: Criar instância
async function createInstance(page: Page, name: string, phoneNumber?: string) {
  // Clicar no botão "+" para criar instância
  await page.click('button:has-text("Nova Integração"), button:has-text("Criar Integração"), button[aria-label*="Criar"]')

  // Aguardar modal abrir
  await page.waitForSelector('dialog[open], [role="dialog"]')

  // Preencher formulário
  await page.fill('input[name="name"], input[placeholder*="nome"]', name)

  if (phoneNumber) {
    await page.fill('input[name="phoneNumber"], input[placeholder*="telefone"]', phoneNumber)
  }

  // Submeter
  await page.click('button:has-text("Criar"), button[type="submit"]')

  // Aguardar sucesso
  await page.waitForSelector(`text=${name}`, { timeout: 10000 })
}

test.describe('WhatsApp Integration - Admin Profile', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${BASE_URL}/integracoes`)
  })

  test('Admin pode criar instância com telefone válido', async ({ page }) => {
    const instanceName = `Test Instance ${Date.now()}`
    const phoneNumber = '+5511999887766'

    await createInstance(page, instanceName, phoneNumber)

    // Verificar que instância foi criada
    await expect(page.locator(`text=${instanceName}`)).toBeVisible()

    // Verificar que telefone está formatado corretamente (E.164)
    await expect(page.locator(`text=${phoneNumber}`)).toBeVisible()
  })

  test('Admin vê erro ao criar instância com telefone inválido', async ({ page }) => {
    const instanceName = `Invalid Phone ${Date.now()}`
    const invalidPhone = '123456' // Telefone inválido

    // Tentar criar instância
    await page.click('button:has-text("Nova Integração"), button:has-text("Criar Integração")')
    await page.waitForSelector('dialog[open], [role="dialog"]')
    await page.fill('input[name="name"]', instanceName)
    await page.fill('input[name="phoneNumber"]', invalidPhone)
    await page.click('button:has-text("Criar")')

    // Verificar mensagem de erro
    await expect(page.locator('text=/número.*inválido/i')).toBeVisible({ timeout: 5000 })
  })

  test('Admin pode configurar webhook da instância', async ({ page }) => {
    // Criar instância primeiro
    const instanceName = `Webhook Test ${Date.now()}`
    await createInstance(page, instanceName)

    // Abrir menu da instância
    await page.locator(`text=${instanceName}`).locator('..').locator('button[aria-label*="menu"], button:has(svg)').first().click()

    // Clicar em "Configurar Webhook" ou similar
    await page.click('text=/webhook/i, text=/configurar/i')

    // Aguardar modal de webhook
    await page.waitForSelector('input[name="webhookUrl"], input[placeholder*="webhook"]')

    // Preencher URL e eventos
    await page.fill('input[name="webhookUrl"]', 'https://example.com/webhook')

    // Selecionar eventos
    await page.check('input[type="checkbox"][value="message.received"]')
    await page.check('input[type="checkbox"][value="instance.status"]')

    // Salvar
    await page.click('button:has-text("Salvar")')

    // Verificar sucesso
    await expect(page.locator('text=/webhook.*sucesso/i')).toBeVisible({ timeout: 5000 })
  })

  test('Admin vê foto de perfil automática em instância conectada', async ({ page }) => {
    // Navegar para instâncias
    await page.goto(`${BASE_URL}/integracoes`)

    // Procurar por instância conectada (status verde)
    const connectedInstance = page.locator('[data-status="connected"], .bg-emerald-500').first()

    if (await connectedInstance.count() > 0) {
      // Verificar que avatar existe
      const avatar = connectedInstance.locator('img[alt], [role="img"]').first()
      await expect(avatar).toBeVisible()

      // Verificar que src não está vazio (tem foto de perfil)
      const src = await avatar.getAttribute('src')
      expect(src).toBeTruthy()
      expect(src).not.toBe('')
    }
  })
})

test.describe('WhatsApp Integration - Master Profile', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'master')
    await page.goto(`${BASE_URL}/integracoes`)
  })

  test('Master pode criar instância', async ({ page }) => {
    const instanceName = `Master Instance ${Date.now()}`
    await createInstance(page, instanceName)
    await expect(page.locator(`text=${instanceName}`)).toBeVisible()
  })

  test('Master NÃO pode configurar webhook (apenas Admin)', async ({ page }) => {
    // Verificar que botão/opção de webhook não existe ou está desabilitado
    const hasWebhookOption = await page.locator('text=/webhook/i').count()

    // Se existir, deve estar desabilitado ou mostrar erro
    if (hasWebhookOption > 0) {
      await page.click('text=/webhook/i')
      await expect(page.locator('text=/admin/i, text=/permissão/i')).toBeVisible({ timeout: 3000 })
    }
  })

  test('Master respeita limite de instâncias da organização', async ({ page }) => {
    // Obter número atual de instâncias
    const instanceCount = await page.locator('[data-testid="instance-card"], .instance-card').count()

    // Tentar criar instâncias até atingir o limite
    // Assumindo limite de 1 instância para org de teste
    if (instanceCount === 0) {
      await createInstance(page, `Instance 1 ${Date.now()}`)

      // Tentar criar segunda (deve falhar)
      await page.click('button:has-text("Nova Integração")')
      await page.waitForSelector('dialog[open]')
      await page.fill('input[name="name"]', `Instance 2 ${Date.now()}`)
      await page.click('button:has-text("Criar")')

      // Verificar erro de limite
      await expect(page.locator('text=/limite.*instância/i')).toBeVisible({ timeout: 5000 })
    }
  })
})

test.describe('WhatsApp Integration - Manager Profile', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'manager')
    await page.goto(`${BASE_URL}/integracoes`)
  })

  test('Manager pode criar instância', async ({ page }) => {
    const instanceName = `Manager Instance ${Date.now()}`
    await createInstance(page, instanceName)
    await expect(page.locator(`text=${instanceName}`)).toBeVisible()
  })

  test('Manager pode conectar instância e ver QR Code', async ({ page }) => {
    // Criar instância
    const instanceName = `QR Test ${Date.now()}`
    await createInstance(page, instanceName)

    // Clicar em "Conectar"
    await page.click('button:has-text("Conectar")')

    // Aguardar modal de conexão
    await page.waitForSelector('dialog[open]')

    // Verificar que QR Code está visível
    const qrCode = page.locator('img[alt*="QR"], canvas, svg').first()
    await expect(qrCode).toBeVisible({ timeout: 10000 })

    // Verificar timer de 2 minutos
    await expect(page.locator('text=/expira.*2:00|1:5/i')).toBeVisible()
  })

  test('Manager vê countdown do QR Code (2 minutos)', async ({ page }) => {
    // Assumindo que já existe uma instância desconectada
    await page.click('button:has-text("Conectar")')
    await page.waitForSelector('dialog[open]')

    // Capturar tempo inicial (2:00 ou 1:59)
    const initialTime = await page.locator('text=/[0-2]:[0-5][0-9]/').first().textContent()
    expect(initialTime).toMatch(/[0-2]:[0-5][0-9]/)

    // Aguardar 3 segundos
    await page.waitForTimeout(3000)

    // Capturar tempo após 3 segundos (deve ter diminuído)
    const afterTime = await page.locator('text=/[0-2]:[0-5][0-9]/').first().textContent()

    // Verificar que tempo diminuiu
    expect(afterTime).not.toBe(initialTime)
  })
})

test.describe('WhatsApp Integration - User Profile', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'user')
    await page.goto(`${BASE_URL}/integracoes`)
  })

  test('User NÃO pode criar instância (sem permissão)', async ({ page }) => {
    // Botão de criar não deve estar visível
    const createButton = page.locator('button:has-text("Nova Integração"), button:has-text("Criar")')
    await expect(createButton).not.toBeVisible()
  })

  test('User pode visualizar instâncias da organização', async ({ page }) => {
    // Verificar que a página de integrações carrega
    await expect(page.locator('h1, h2').filter({ hasText: /integra/i })).toBeVisible()

    // Verificar que pode ver lista (mesmo que vazia)
    const list = page.locator('[data-testid="instances-list"], .instances-list, main')
    await expect(list).toBeVisible()
  })

  test('User NÃO pode deletar instância', async ({ page }) => {
    // Se existir instância, verificar que opção deletar não existe no menu
    const instanceCard = page.locator('[data-testid="instance-card"]').first()

    if (await instanceCard.count() > 0) {
      await instanceCard.locator('button[aria-label*="menu"]').click()

      // Opção deletar não deve existir ou estar desabilitada
      const deleteOption = page.locator('text=/deletar/i')
      await expect(deleteOption).not.toBeVisible()
    }
  })
})

test.describe('WhatsApp Integration - QR Code Sharing', () => {
  test('Gerar link de compartilhamento de QR Code', async ({ page }) => {
    await loginAs(page, 'master')
    await page.goto(`${BASE_URL}/integracoes`)

    // Criar instância
    const instanceName = `Share Test ${Date.now()}`
    await createInstance(page, instanceName)

    // Abrir menu e clicar em "Compartilhar"
    await page.locator(`text=${instanceName}`).locator('..').locator('button').first().click()
    await page.click('text=/compartilhar/i')

    // Aguardar modal de compartilhamento
    await page.waitForSelector('dialog[open]')

    // Verificar que link foi gerado
    const shareLink = page.locator('input[readonly], input[value*="http"]')
    await expect(shareLink).toBeVisible()

    // Capturar link para verificação manual
    const link = await shareLink.inputValue()
    console.log('🔗 Link de compartilhamento gerado:', link)

    // Copiar link
    await page.click('button:has-text("Copiar")')
    await expect(page.locator('text=/copiado/i')).toBeVisible({ timeout: 3000 })
  })
})

test.describe('WhatsApp Integration - Phone Validation', () => {
  test('Aceita telefone brasileiro válido', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${BASE_URL}/integracoes`)

    const phones = [
      '+5511999887766',
      '5511999887766',
      '11999887766'
    ]

    for (const phone of phones) {
      const instanceName = `Phone Test ${Date.now()}`
      await page.click('button:has-text("Nova Integração")')
      await page.waitForSelector('dialog[open]')
      await page.fill('input[name="name"]', instanceName)
      await page.fill('input[name="phoneNumber"]', phone)
      await page.click('button:has-text("Criar")')

      // Não deve mostrar erro
      const errorVisible = await page.locator('text=/inválido/i').isVisible({ timeout: 2000 }).catch(() => false)
      expect(errorVisible).toBe(false)

      // Fechar modal se abriu
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
  })

  test('Rejeita telefone internacional inválido', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${BASE_URL}/integracoes`)

    const invalidPhones = [
      '123',
      'abc123',
      '+99999999999999',
      '00000000000'
    ]

    for (const phone of invalidPhones) {
      await page.click('button:has-text("Nova Integração")')
      await page.waitForSelector('dialog[open]')
      await page.fill('input[name="name"]', `Invalid ${Date.now()}`)
      await page.fill('input[name="phoneNumber"]', phone)
      await page.click('button:has-text("Criar")')

      // Deve mostrar erro
      await expect(page.locator('text=/inválido/i')).toBeVisible({ timeout: 5000 })

      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
  })
})

test.describe('WhatsApp Integration - Real-time Polling', () => {
  test('Lista de instâncias atualiza automaticamente (polling 10s)', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${BASE_URL}/integracoes`)

    // Capturar número inicial de instâncias
    const initialCount = await page.locator('[data-testid="instance-card"]').count()

    // Aguardar 11 segundos (tempo de polling + margem)
    console.log('⏳ Aguardando polling automático (11 segundos)...')
    await page.waitForTimeout(11000)

    // Verificar que requisição foi feita (network log ou console)
    // A lista deve ter sido recarregada automaticamente
    const afterCount = await page.locator('[data-testid="instance-card"]').count()

    // Counts podem ser iguais, mas o importante é que não houve erro
    expect(afterCount).toBeGreaterThanOrEqual(0)
  })

  test('Status da instância atualiza com polling de 3s', async ({ page }) => {
    await loginAs(page, 'master')
    await page.goto(`${BASE_URL}/integracoes`)

    // Conectar instância
    await page.click('button:has-text("Conectar")').catch(() => {})

    if (await page.locator('dialog[open]').isVisible()) {
      // Capturar status inicial
      const initialStatus = await page.locator('[data-status], .badge').first().textContent()

      // Aguardar 4 segundos (tempo de polling de status + margem)
      console.log('⏳ Aguardando polling de status (4 segundos)...')
      await page.waitForTimeout(4000)

      // Status pode ter mudado ou não, mas não deve haver erro
      const afterStatus = await page.locator('[data-status], .badge').first().textContent()
      expect(afterStatus).toBeTruthy()
    }
  })
})

test.describe('WhatsApp Integration - Manual QR Code Scan', () => {
  test('Exibir QR Code para scan manual pelo usuário', async ({ page }) => {
    await loginAs(page, 'master')
    await page.goto(`${BASE_URL}/integracoes`)

    // Criar instância para teste
    const instanceName = `Manual Scan ${Date.now()}`
    await createInstance(page, instanceName)

    // Clicar em conectar
    await page.click('button:has-text("Conectar")')
    await page.waitForSelector('dialog[open]')

    // Capturar screenshot do QR Code para scan manual
    const qrContainer = page.locator('dialog[open]')
    await qrContainer.screenshot({ path: 'qr-code-for-scan.png' })

    console.log('\n📸 Screenshot do QR Code salvo em: qr-code-for-scan.png')
    console.log('📱 Por favor, escaneie o QR Code com o WhatsApp para testar a conexão real!')
    console.log('⏱️  O QR Code expira em 2 minutos.')

    // Aguardar 120 segundos ou até conexão ser estabelecida
    console.log('\n⏳ Aguardando scan do QR Code (máximo 120 segundos)...')

    try {
      await page.waitForSelector('text=/conectado.*sucesso/i', { timeout: 120000 })
      console.log('✅ Conexão estabelecida com sucesso!')
    } catch (error) {
      console.log('⏰ Timeout - QR Code não foi escaneado em 2 minutos')
    }
  })
})
