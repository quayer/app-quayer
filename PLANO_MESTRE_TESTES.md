# 🧪 PLANO MESTRE DE TESTES - Sistema Quayer

**Data:** 2025-10-19
**Objetivo:** Cobertura completa de testes automatizados e manuais com dados REAIS (zero mocks em produção)
**Ferramentas:** Playwright (E2E), Vitest (Unit/Integration), PostgreSQL Real, Browser Real, UAZapi Real

---

## 📊 RESUMO EXECUTIVO

### Escopo Total

| Tipo | Quantidade | Status |
|------|------------|--------|
| **Páginas Frontend** | 47 | Mapear e testar |
| **Controllers Backend** | 26 | Mapear e testar |
| **Endpoints API** | ~150 | Mapear e testar |
| **Testes Existentes** | 40+ | Revisar e melhorar |
| **Testes Novos** | ~100 | Criar |

### Filosofia de Testes

✅ **100% DADOS REAIS**
- PostgreSQL real (não SQLite/in-memory)
- Browser real (Playwright headless/headed)
- UAZapi real (QR codes verdadeiros)
- Usuários reais no banco
- Organizações reais criadas

❌ **ZERO MOCKS em Testes de Integração/E2E**
- Mocks apenas em testes unitários isolados
- Testes de integração: banco real
- Testes E2E: stack completa rodando

---

## 🗺️ PARTE 1: MAPEAMENTO COMPLETO

### 1.1 Backend - 26 Controllers Registrados

**Arquivo:** `src/igniter.router.ts`

```typescript
controllers: {
  // Auth & Onboarding (2)
  auth: authController,                          // ✅ 11 endpoints
  onboarding: onboardingController,              // ✅ 3 endpoints

  // Organizations & Users (2)
  organizations: organizationsController,        // ✅ 9 endpoints
  invitations: invitationsController,            // ✅ 5 endpoints

  // Core Features (5)
  dashboard: dashboardController,                // ✅ 4 endpoints
  contacts: contactsController,                  // ✅ 8 endpoints
  sessions: sessionsController,                  // ✅ 6 endpoints
  connections: connectionsController,            // ✅ 9 endpoints
  'connection-messages': connectionMessagesController, // ✅ 4 endpoints

  // Messaging (3)
  chats: chatsController,                        // ✅ 7 endpoints
  messages: messagesController,                  // ✅ 10 endpoints
  media: mediaController,                        // ✅ 3 endpoints

  // CRM & Kanban (5)
  tabulations: tabulationsController,            // ✅ 5 endpoints
  departments: departmentsController,            // ✅ 5 endpoints
  kanban: kanbanController,                      // ✅ 8 endpoints
  labels: labelsController,                      // ✅ 5 endpoints
  'contact-observation': observationsController, // ✅ 5 endpoints

  // Attributes (2)
  attribute: attributesController,               // ✅ 5 endpoints
  'contact-attribute': contactAttributeController, // ✅ 4 endpoints

  // Infrastructure (7)
  files: filesController,                        // ✅ 4 endpoints
  groups: groupsController,                      // ✅ 5 endpoints
  projects: projectsController,                  // ✅ 5 endpoints
  webhooks: webhooksController,                  // ✅ 5 endpoints
  'uazapi-webhooks': uazapiWebhooksController,   // ✅ 3 endpoints
  'uazapi-webhooks-enhanced': uazapiWebhooksEnhancedController, // ✅ 2 endpoints
  'webhooks-receiver': webhooksReceiverController, // ✅ 2 endpoints
  'connections-realtime': connectionsRealtimeController, // ✅ 2 endpoints (SSE)
  calls: callsController,                        // ✅ 5 endpoints
  sse: sseController,                            // ✅ 2 endpoints

  // Others (3)
  share: shareController,                        // ✅ 4 endpoints
  instances: instancesController,                // ✅ 10 endpoints (LEGACY)
  example: exampleController,                    // ✅ 2 endpoints (DEMO)
}
```

**Total Estimado de Endpoints:** ~150

---

### 1.2 Frontend - 47 Páginas Mapeadas

#### Grupo: (auth) - 11 páginas
```
/login                          ✅ Login principal
/login/verify                   ✅ OTP verification
/login/verify-magic             ✅ Magic link
/signup                         ✅ Cadastro
/signup/verify                  ✅ Email verification
/signup/verify-magic            ✅ Magic link signup
/onboarding                     ✅ Primeira organização
/register                       ✅ Registro alternativo
/forgot-password                ✅ Esqueci senha
/reset-password/[token]         ✅ Reset com token
/verify-email                   ✅ Verificação email
/google-callback                ✅ OAuth Google
```

#### Grupo: admin - 10 páginas
```
/admin                          ✅ Dashboard admin
/admin/organizations            ✅ CRUD organizações
/admin/clients                  ✅ Usuários sistema
/admin/integracoes              ✅ Todas integrações
/admin/webhooks                 ✅ Webhooks sistema
/admin/logs                     ✅ Logs técnicos
/admin/permissions              ✅ Permissões
/admin/brokers                  ✅ Brokers WhatsApp
/admin/messages                 ✅ Mensagens globais
/admin/invitations              ✅ Convites
```

#### Grupo: integracoes - 7 páginas
```
/integracoes                    ✅ Lista integrações
/integracoes/dashboard          ✅ Dashboard org
/integracoes/users              ✅ Usuários org
/integracoes/settings           ✅ Configurações
/integracoes/conversations      ✅ Conversas
/integracoes/compartilhar/[token] ✅ Compartilhar QR
/integracoes/admin/clients      ⚠️  Verificar se necessário
```

#### Grupo: conversas - 1 página
```
/conversas/[sessionId]          ✅ Chat individual
```

#### Grupo: crm - 4 páginas
```
/crm/contatos                   ✅ Lista contatos
/crm/contatos/[id]              ✅ Detalhes contato
/crm/kanban                     ✅ Kanban funil
/crm/kanban/[id]                ✅ Card kanban
```

#### Grupo: configuracoes - 4 páginas
```
/configuracoes/tabulacoes       ✅ Tabulações
/configuracoes/labels           ✅ Labels
/configuracoes/departamentos    ✅ Departamentos
/configuracoes/webhooks         ✅ Webhooks org
```

#### Grupo: (dashboard) - 2 páginas
```
/(dashboard)/organizacao        ✅ Página org
/(dashboard)/conexoes           ✅ Conexões
```

#### Grupo: (public) - 4 páginas
```
/(public)/connect               ✅ Aceitar convite
/(public)/connect/[token]       ✅ QR público
/(public)/conversas             ⚠️  Verificar se público
/(public)/docs                  ✅ API Docs
```

#### Grupo: user - 1 página
```
/user/dashboard                 ✅ Dashboard user
```

#### Root - 1 página
```
/                               ✅ Landing/Redirect
```

**Total:** 47 páginas

---

### 1.3 Testes Existentes - 40+ Arquivos

**Estrutura Atual:**
```
test/
├── api/                        # Testes de API (6 arquivos)
│   ├── auth.test.ts
│   ├── instances-integration.test.ts
│   ├── instances.test.ts
│   ├── messages.test.ts
│   └── share.test.ts
├── e2e/                        # Testes End-to-End (30+ arquivos)
│   ├── auth-flow.spec.ts
│   ├── auth-google.spec.ts
│   ├── whatsapp-integration-complete.spec.ts
│   ├── dashboard.spec.ts
│   ├── conversations.spec.ts
│   ├── crm-contacts.spec.ts
│   ├── kanban.spec.ts
│   ├── configuracoes.spec.ts
│   └── ...
├── real/                       # Testes com dados reais
├── unit/                       # Testes unitários
├── mocks/                      # Mocks para testes isolados
└── setup/                      # Setup de testes
```

---

## 🎯 PARTE 2: ESTRATÉGIA DE TESTES

### 2.1 Pirâmide de Testes

```
                  ┌──────────────┐
                  │   E2E Tests  │ 20% - Jornadas completas
                  │  (Playwright)│
                  └──────────────┘
               ┌─────────────────────┐
               │ Integration Tests   │ 30% - API + DB Real
               │    (Vitest + DB)    │
               └─────────────────────┘
          ┌────────────────────────────────┐
          │      Unit Tests                │ 50% - Funções isoladas
          │   (Vitest + Mocks)             │
          └────────────────────────────────┘
```

### 2.2 Tipos de Testes

#### A. Testes Unitários (50% da cobertura)
**Ferramenta:** Vitest
**Características:**
- Funções isoladas
- Mocks permitidos
- Rápidos (< 1s cada)
- Sem dependências externas

**Exemplos:**
- Validadores (`validatePhoneNumber`, `validatePublicUrl`)
- Helpers (`generateSlug`, `formatWhatsAppNumber`)
- Utils (`encrypt`, `decrypt`)
- Schemas Zod

---

#### B. Testes de Integração (30% da cobertura)
**Ferramenta:** Vitest + PostgreSQL Real
**Características:**
- Controllers + Repository + DB
- Banco PostgreSQL real
- Dados criados/destruídos por teste
- API HTTP real

**Exemplos:**
- POST /api/v1/auth/login → Verifica token gerado
- POST /api/v1/organizations → Cria org no banco
- GET /api/v1/organizations/current → Busca org real
- POST /api/v1/connections → Integração UAZapi

---

#### C. Testes End-to-End (20% da cobertura)
**Ferramenta:** Playwright + Browser Real
**Características:**
- Jornadas completas de usuário
- Browser real (Chromium/Firefox/Safari)
- Interações de UI completas
- Screenshots e vídeos de falhas

**Exemplos:**
- Cadastro completo → Login → Onboarding → Criar integração
- Admin troca de organização → Sidebar atualiza
- Criar conexão → Gerar QR → **PAUSAR PARA SCAN MANUAL** → Validar conectado
- CRM: Criar contato → Mover no Kanban → Atualizar

---

### 2.3 Testes Manuais com Automação Assistida

**Cenários que requerem interação humana:**

1. **Scan de QR Code WhatsApp**
   - Teste cria conexão
   - Gera QR code
   - **PAUSA:** Exibe QR na tela + aguarda scan
   - Usuário escaneia com WhatsApp real
   - Teste continua verificando status
   - Valida conexão estabelecida

2. **Recebimento de Mensagens WhatsApp**
   - Teste envia mensagem para número conectado
   - **PAUSA:** Aguarda mensagem ser enviada
   - Verifica webhook recebido
   - Valida transcrição (se áudio/vídeo)
   - Valida concatenação (se múltiplas mensagens)

3. **OAuth Google**
   - Abre popup de login Google
   - **PAUSA:** Aguarda login manual
   - Verifica callback recebido
   - Valida token gerado

---

## 🔧 PARTE 3: CONFIGURAÇÃO DE LOGGING E CAPTURA

### 3.1 Sistema de Logging Completo

**Objetivo:** Capturar TODOS os eventos, cliques, navegações, erros

#### Backend Logging

**Arquivo:** `src/lib/logging/logger.ts` (criar se não existir)

```typescript
import winston from 'winston'
import { randomUUID } from 'crypto'

// Request ID middleware
export const requestIdMiddleware = (req: Request) => {
  req.headers.set('x-request-id', randomUUID())
}

// Logger configurado
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'quayer-api',
    environment: process.env.NODE_ENV,
  },
  transports: [
    // Console (desenvolvimento)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),

    // File (produção)
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: 'logs/combined.log'
    }),

    // File específico para testes
    new winston.transports.File({
      filename: 'logs/test-execution.log',
      level: 'debug'
    })
  ]
})

// Helper para logs estruturados
export const logApiCall = (endpoint: string, method: string, userId?: string, duration?: number) => {
  logger.info('API Call', {
    endpoint,
    method,
    userId,
    duration,
    timestamp: new Date().toISOString()
  })
}

export const logUserAction = (action: string, userId: string, metadata?: any) => {
  logger.info('User Action', {
    action,
    userId,
    metadata,
    timestamp: new Date().toISOString()
  })
}
```

---

#### Frontend Logging (Analytics de UI)

**Arquivo:** `src/lib/logging/ui-logger.ts` (criar)

```typescript
/**
 * UI Event Logger
 * Captura todos cliques, navegações, erros de UI
 */

type UIEvent = {
  type: 'click' | 'navigation' | 'error' | 'form_submit' | 'api_call'
  timestamp: string
  url: string
  element?: string
  data?: any
  userId?: string
  sessionId?: string
}

class UILogger {
  private events: UIEvent[] = []
  private sessionId: string
  private flushInterval: NodeJS.Timeout | null = null

  constructor() {
    this.sessionId = this.generateSessionId()
    this.init()
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private init() {
    // Capturar todos os cliques
    if (typeof window !== 'undefined') {
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        this.log('click', {
          element: target.tagName,
          id: target.id,
          className: target.className,
          textContent: target.textContent?.substring(0, 50),
          xpath: this.getXPath(target)
        })
      })

      // Capturar navegações
      window.addEventListener('popstate', () => {
        this.log('navigation', {
          url: window.location.href
        })
      })

      // Capturar erros de console
      window.addEventListener('error', (e) => {
        this.log('error', {
          message: e.message,
          filename: e.filename,
          lineno: e.lineno,
          colno: e.colno
        })
      })

      // Flush logs a cada 10 segundos
      this.flushInterval = setInterval(() => {
        this.flush()
      }, 10000)
    }
  }

  private getXPath(element: HTMLElement): string {
    if (element.id) return `//*[@id="${element.id}"]`

    if (element === document.body) return '/html/body'

    let ix = 0
    const siblings = element.parentNode?.childNodes || []

    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i] as HTMLElement
      if (sibling === element) {
        return this.getXPath(element.parentNode as HTMLElement) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']'
      }
      if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
        ix++
      }
    }

    return ''
  }

  log(type: UIEvent['type'], data?: any) {
    const event: UIEvent = {
      type,
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : '',
      data,
      sessionId: this.sessionId,
      userId: this.getUserId()
    }

    this.events.push(event)

    // Log no console em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
      console.log('[UI Event]', event)
    }
  }

  private getUserId(): string | undefined {
    // Buscar do localStorage ou contexto
    if (typeof window !== 'undefined') {
      return localStorage.getItem('userId') || undefined
    }
    return undefined
  }

  async flush() {
    if (this.events.length === 0) return

    const eventsToSend = [...this.events]
    this.events = []

    try {
      // Enviar para backend
      await fetch('/api/v1/analytics/ui-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          events: eventsToSend
        })
      })
    } catch (error) {
      console.error('Failed to send UI events:', error)
      // Re-adicionar eventos em caso de falha
      this.events.unshift(...eventsToSend)
    }
  }

  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
    }
    this.flush()
  }
}

// Singleton
export const uiLogger = new UILogger()
```

---

### 3.2 Playwright Test Logger

**Arquivo:** `test/helpers/playwright-logger.ts` (criar)

```typescript
import { test, Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Playwright Logger Helper
 * Captura screenshots, console logs, network requests
 */

export class PlaywrightLogger {
  private page: Page
  private testName: string
  private logsDir: string
  private screenshotsDir: string
  private networkLogs: any[] = []
  private consoleLogs: any[] = []

  constructor(page: Page, testName: string) {
    this.page = page
    this.testName = testName
    this.logsDir = path.join(process.cwd(), 'logs', 'playwright', testName)
    this.screenshotsDir = path.join(this.logsDir, 'screenshots')

    // Criar diretórios
    fs.mkdirSync(this.logsDir, { recursive: true })
    fs.mkdirSync(this.screenshotsDir, { recursive: true })

    this.setupListeners()
  }

  private setupListeners() {
    // Capturar console logs
    this.page.on('console', (msg) => {
      const log = {
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      }
      this.consoleLogs.push(log)
    })

    // Capturar network requests
    this.page.on('request', (request) => {
      this.networkLogs.push({
        type: 'request',
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        timestamp: new Date().toISOString()
      })
    })

    this.page.on('response', (response) => {
      this.networkLogs.push({
        type: 'response',
        url: response.url(),
        status: response.status(),
        headers: response.headers(),
        timestamp: new Date().toISOString()
      })
    })
  }

  async screenshot(name: string) {
    const filename = `${Date.now()}_${name}.png`
    const filepath = path.join(this.screenshotsDir, filename)
    await this.page.screenshot({ path: filepath, fullPage: true })
    console.log(`📸 Screenshot saved: ${filepath}`)
  }

  async saveNetworkLogs() {
    const filepath = path.join(this.logsDir, 'network.json')
    fs.writeFileSync(filepath, JSON.stringify(this.networkLogs, null, 2))
    console.log(`🌐 Network logs saved: ${filepath}`)
  }

  async saveConsoleLogs() {
    const filepath = path.join(this.logsDir, 'console.json')
    fs.writeFileSync(filepath, JSON.stringify(this.consoleLogs, null, 2))
    console.log(`📝 Console logs saved: ${filepath}`)
  }

  async saveLogs() {
    await this.saveNetworkLogs()
    await this.saveConsoleLogs()
  }
}

/**
 * Test wrapper com logging automático
 */
export const testWithLogging = test.extend<{ logger: PlaywrightLogger }>({
  logger: async ({ page }, use, testInfo) => {
    const logger = new PlaywrightLogger(page, testInfo.title)

    await use(logger)

    // Salvar logs ao final do teste
    await logger.saveLogs()
  }
})
```

---

## 🧪 PARTE 4: TESTES A SEREM CRIADOS

### 4.1 Testes Unitários (Prioridade: ALTA)

**Arquivo:** `test/unit/validators/url.validator.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { validatePublicUrl, isValidPublicUrl } from '@/lib/validators/url.validator'

describe('URL Validator', () => {
  describe('validatePublicUrl', () => {
    it('should accept valid HTTPS URL', () => {
      const result = validatePublicUrl('https://example.com/webhook')
      expect(result.isValid).toBe(true)
      expect(result.url).toBeDefined()
    })

    it('should reject localhost', () => {
      const result = validatePublicUrl('http://localhost:3000')
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('não permitida')
    })

    it('should reject private IPs', () => {
      const privateIPs = [
        'http://192.168.1.1',
        'http://10.0.0.1',
        'http://172.16.0.1',
      ]

      privateIPs.forEach(ip => {
        const result = validatePublicUrl(ip)
        expect(result.isValid).toBe(false)
      })
    })

    it('should require HTTPS in production', () => {
      process.env.NODE_ENV = 'production'
      const result = validatePublicUrl('http://example.com')
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('HTTPS')
    })
  })
})
```

---

### 4.2 Testes de Integração (Prioridade: ALTA)

**Arquivo:** `test/integration/organizations.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { database } from '@/services/database'
import { api } from '@/igniter.client'

describe('Organizations Integration Tests', () => {
  let adminUserId: string
  let adminToken: string
  let createdOrgId: string

  beforeAll(async () => {
    // Criar usuário admin para testes
    const admin = await database.user.create({
      data: {
        email: 'admin-test@test.com',
        password: 'hashedPassword',
        name: 'Admin Test',
        role: 'admin',
        onboardingCompleted: true
      }
    })
    adminUserId = admin.id

    // Gerar token
    adminToken = signAccessToken({ userId: admin.id, email: admin.email, role: 'admin' })
  })

  afterAll(async () => {
    // Limpar dados criados
    if (createdOrgId) {
      await database.organization.delete({ where: { id: createdOrgId } })
    }
    await database.user.delete({ where: { id: adminUserId } })
  })

  it('should create organization', async () => {
    const result = await fetch('http://localhost:3000/api/v1/organizations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test Organization',
        document: '12345678000190',
        type: 'pj'
      })
    })

    const data = await result.json()
    expect(result.status).toBe(201)
    expect(data.success).toBe(true)
    expect(data.data.organization.name).toBe('Test Organization')

    createdOrgId = data.data.organization.id
  })

  it('should get current organization', async () => {
    // Atualizar currentOrgId do admin
    await database.user.update({
      where: { id: adminUserId },
      data: { currentOrgId: createdOrgId }
    })

    const result = await fetch('http://localhost:3000/api/v1/organizations/current', {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    })

    const data = await result.json()
    expect(result.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.id).toBe(createdOrgId)
  })
})
```

---

### 4.3 Testes E2E Completos (Prioridade: CRÍTICA)

**Arquivo:** `test/e2e/complete-integration-flow-with-qr.spec.ts`

```typescript
import { test, expect } from '@playwright/test'
import { PlaywrightLogger, testWithLogging } from '../helpers/playwright-logger'

testWithLogging.describe('Jornada Completa: Criar Integração com QR Real', () => {
  test('Admin cria integração WhatsApp e conecta via QR real', async ({ page, logger }) => {
    test.setTimeout(300000) // 5 minutos para scan manual

    // ===== PASSO 1: Login =====
    await test.step('Login como admin', async () => {
      await page.goto('/login')
      await logger.screenshot('01-login-page')

      await page.fill('[name="email"]', 'admin@quayer.com')
      await page.fill('[name="password"]', 'admin123456')
      await page.click('button[type="submit"]')

      await page.waitForURL('/integracoes')
      await logger.screenshot('02-logged-in')
    })

    // ===== PASSO 2: Navegar para Integrações =====
    await test.step('Abrir página de integrações', async () => {
      await page.goto('/integracoes')
      await logger.screenshot('03-integracoes-page')

      // Verificar empty state ou lista
      const hasIntegrations = await page.locator('[data-integration-card]').count()
      console.log(`📊 Integrações existentes: ${hasIntegrations}`)
    })

    // ===== PASSO 3: Criar Nova Integração =====
    let integrationName = ''
    await test.step('Criar nova integração', async () => {
      await page.click('button:has-text("Nova Integração")')
      await logger.screenshot('04-modal-opened')

      integrationName = `Teste Auto ${Date.now()}`

      // Preencher formulário
      await page.fill('[name="name"]', integrationName)
      await page.fill('[name="n8nWebhookUrl"]', 'https://webhook.site/unique-id')

      await logger.screenshot('05-form-filled')

      // Submeter
      await page.click('button[type="submit"]')

      // Aguardar criação
      await expect(page.locator('text=criada com sucesso')).toBeVisible({ timeout: 10000 })
      await logger.screenshot('06-integration-created')
    })

    // ===== PASSO 4: Abrir Modal de Conexão =====
    let qrCodeDataUrl = ''
    await test.step('Gerar QR Code', async () => {
      // Encontrar integração criada
      const card = page.locator(`text=${integrationName}`).first()
      await card.scrollIntoViewIfNeeded()
      await logger.screenshot('07-integration-card')

      // Clicar em "Conectar"
      await card.click()
      await page.click('button:has-text("Conectar WhatsApp")')

      // Aguardar QR code aparecer
      await expect(page.locator('[data-qr-code]')).toBeVisible({ timeout: 15000 })
      await logger.screenshot('08-qr-code-displayed')

      // Capturar data URL do QR
      const qrImg = page.locator('[data-qr-code] img')
      qrCodeDataUrl = await qrImg.getAttribute('src') || ''
      console.log('📱 QR Code gerado:', qrCodeDataUrl.substring(0, 50) + '...')
    })

    // ===== PASSO 5: PAUSA PARA SCAN MANUAL =====
    await test.step('⏸️  AGUARDAR SCAN MANUAL DO QR CODE', async () => {
      console.log('\n' + '='.repeat(60))
      console.log('🔶 AÇÃO MANUAL NECESSÁRIA')
      console.log('='.repeat(60))
      console.log('1. Abra o WhatsApp no seu celular')
      console.log('2. Vá em: Menu > Dispositivos Conectados')
      console.log('3. Toque em: Conectar um dispositivo')
      console.log('4. Escaneie o QR Code exibido na tela')
      console.log('5. Este teste aguardará até 2 minutos')
      console.log('='.repeat(60) + '\n')

      // Aguardar status mudar para "connected" (polling)
      let connected = false
      const startTime = Date.now()
      const timeout = 120000 // 2 minutos

      while (!connected && (Date.now() - startTime) < timeout) {
        // Verificar se status mudou
        const statusElement = page.locator('[data-connection-status]')
        const status = await statusElement.textContent()

        if (status?.includes('Conectado')) {
          connected = true
          console.log('✅ WhatsApp conectado com sucesso!')
          await logger.screenshot('09-connected-success')
          break
        }

        // Aguardar 3 segundos antes de verificar novamente
        await page.waitForTimeout(3000)
        console.log(`⏳ Aguardando conexão... (${Math.floor((Date.now() - startTime) / 1000)}s)`)
      }

      // Verificar se conectou
      expect(connected).toBe(true) // ← Falha se não conectar em 2 min
    })

    // ===== PASSO 6: Verificar Integração Conectada =====
    await test.step('Validar integração conectada', async () => {
      // Fechar modal
      await page.click('button:has-text("Fechar")')

      // Verificar card mostra "Conectado"
      const card = page.locator(`text=${integrationName}`).first()
      await expect(card.locator('[data-status="connected"]')).toBeVisible()

      await logger.screenshot('10-final-state')
    })

    // ===== PASSO 7: Validar no Backend =====
    await test.step('Verificar dados no banco', async () => {
      // Fazer request para API
      const response = await page.request.get('/api/v1/connections')
      const data = await response.json()

      const createdConnection = data.data.data.find((c: any) => c.name === integrationName)
      expect(createdConnection).toBeDefined()
      expect(createdConnection.status).toBe('CONNECTED')

      console.log('✅ Conexão validada no backend:', createdConnection.id)
    })
  })
})
```

---

## 📋 PARTE 5: CHECKLIST DE IMPLEMENTAÇÃO

### Fase 1: Setup e Infraestrutura (1-2 dias)

- [ ] Criar `src/lib/logging/logger.ts` (backend logging)
- [ ] Criar `src/lib/logging/ui-logger.ts` (frontend logging)
- [ ] Criar `test/helpers/playwright-logger.ts` (test logging)
- [ ] Criar `test/helpers/qr-scan-helper.ts` (pausar para scan)
- [ ] Configurar Winston para logs estruturados
- [ ] Criar endpoint `/api/v1/analytics/ui-events` (receber logs frontend)
- [ ] Adicionar logs em todos os controllers
- [ ] Adicionar UI logger em `app/layout.tsx`

### Fase 2: Testes Unitários (2-3 dias)

- [ ] `test/unit/validators/url.validator.test.ts`
- [ ] `test/unit/validators/phone.validator.test.ts`
- [ ] `test/unit/lib/crypto.test.ts`
- [ ] `test/unit/lib/auth/jwt.test.ts`
- [ ] `test/unit/lib/auth/bcrypt.test.ts`
- [ ] `test/unit/repositories/*.test.ts` (10 repositórios)

### Fase 3: Testes de Integração (3-4 dias)

- [ ] `test/integration/auth.integration.test.ts`
- [ ] `test/integration/organizations.integration.test.ts`
- [ ] `test/integration/connections.integration.test.ts`
- [ ] `test/integration/share.integration.test.ts`
- [ ] `test/integration/messages.integration.test.ts`
- [ ] `test/integration/webhooks.integration.test.ts`
- [ ] Testar TODOS os 26 controllers

### Fase 4: Testes E2E Críticos (4-5 dias)

- [ ] `test/e2e/complete-integration-flow-with-qr.spec.ts` ⭐
- [ ] `test/e2e/admin-organization-switch.spec.ts`
- [ ] `test/e2e/share-qr-link-public.spec.ts`
- [ ] `test/e2e/whatsapp-message-flow.spec.ts` (enviar + receber)
- [ ] `test/e2e/crm-complete-flow.spec.ts`
- [ ] `test/e2e/all-47-pages-visual.spec.ts`

### Fase 5: Validação e Documentação (1-2 dias)

- [ ] Executar todos os testes
- [ ] Gerar relatório de cobertura
- [ ] Documentar casos de falha
- [ ] Criar vídeos dos testes passando
- [ ] Criar README de como executar testes

---

## ✅ CONCLUSÃO

Este plano garante:
- ✅ **100% cobertura** de páginas e endpoints
- ✅ **Dados reais** em todos os testes de integração/E2E
- ✅ **Logging completo** de todas ações
- ✅ **Testes automatizados** com pausa para ações manuais
- ✅ **Screenshots e vídeos** de todas execuções

**Próximo passo:** Começar implementação pela Fase 1 (Setup) ✅
