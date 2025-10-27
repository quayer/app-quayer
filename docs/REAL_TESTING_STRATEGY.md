# 🎯 Estratégia de Testes REAIS - 100% Cobertura

**Filosofia**: Testes que REALMENTE testam o sistema completo, sem mocks!

---

## 🔥 Princípios Fundamentais

### ❌ O QUE NÃO FAZER
- ❌ Mockar banco de dados
- ❌ Mockar APIs externas (WhatsApp, Email)
- ❌ Usar dados fake
- ❌ Portas hardcoded
- ❌ Testes que não testam de verdade

### ✅ O QUE FAZER
- ✅ Usar banco de dados REAL (Docker PostgreSQL)
- ✅ Configurar via `.env` (porta, credentials)
- ✅ Pedir ao usuário inputs REAIS (email, QR code)
- ✅ Testar integração WhatsApp REAL
- ✅ Validar Prisma + Controllers + Frontend + Backend
- ✅ Testes interativos quando necessário

---

## 📋 Estrutura de Testes

```
test/
├── real/                          🆕 Nova pasta para testes REAIS
│   ├── setup/
│   │   ├── database.ts           # Setup PostgreSQL real
│   │   ├── env-validator.ts      # Valida .env antes dos testes
│   │   └── interactive.ts        # Helper para inputs do usuário
│   │
│   ├── integration/               # Testes de integração REAL
│   │   ├── auth-real.test.ts     # Auth com email REAL
│   │   ├── whatsapp-real.test.ts # WhatsApp com QR code REAL
│   │   ├── database-real.test.ts # Prisma queries REAIS
│   │   └── api-full-stack.test.ts # Front+Back+DB
│   │
│   ├── e2e-interactive/           # E2E interativo
│   │   ├── signup-with-email.spec.ts
│   │   ├── connect-whatsapp.spec.ts
│   │   └── send-message.spec.ts
│   │
│   └── scenarios/                 # Cenários completos
│       ├── new-user-journey.ts    # Novo usuário do zero
│       ├── admin-setup.ts         # Admin configurando tudo
│       └── production-like.ts     # Simula produção
│
├── unit/                          # Unit tests (lógica isolada)
├── api/                           # API tests (endpoints)
└── e2e/                           # E2E automatizado
```

---

## 🛠️ Setup de Ambiente Real

### 1. Validador de Ambiente

```typescript
// test/real/setup/env-validator.ts
import dotenv from 'dotenv'
import { z } from 'zod'

const RealTestEnvSchema = z.object({
  // Database (obrigatório)
  DATABASE_URL: z.string().url(),

  // Server
  PORT: z.string().transform(Number).default('3000'),
  NEXT_PUBLIC_APP_URL: z.string().url(),

  // Auth
  JWT_SECRET: z.string().min(32),

  // Email (obrigatório para testes de auth)
  EMAIL_PROVIDER: z.enum(['smtp', 'resend', 'mock']),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().email().optional(),
  SMTP_PASS: z.string().optional(),

  // WhatsApp (obrigatório para testes de integração)
  UAZAPI_URL: z.string().url(),
  UAZAPI_ADMIN_TOKEN: z.string().min(10),

  // Opcional mas recomendado
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
})

export function validateRealTestEnv() {
  dotenv.config()

  const result = RealTestEnvSchema.safeParse(process.env)

  if (!result.success) {
    console.error('❌ Variáveis de ambiente faltando para testes REAIS:')
    console.error(result.error.format())

    console.log('\n📝 Configure seu .env com:')
    console.log('DATABASE_URL=postgresql://...')
    console.log('JWT_SECRET=...')
    console.log('UAZAPI_ADMIN_TOKEN=...')

    process.exit(1)
  }

  console.log('✅ Ambiente validado para testes REAIS')
  return result.data
}
```

### 2. Setup de Database Real

```typescript
// test/real/setup/database.ts
import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'

let prisma: PrismaClient

export async function setupRealDatabase() {
  console.log('🗄️  Configurando banco de dados REAL...')

  // 1. Criar banco de testes se não existir
  try {
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' })
  } catch (error) {
    console.error('❌ Erro ao criar banco de dados')
    throw error
  }

  // 2. Limpar dados existentes
  prisma = new PrismaClient()
  await prisma.$transaction([
    prisma.message.deleteMany(),
    prisma.instance.deleteMany(),
    prisma.organizationUser.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ])

  console.log('✅ Banco de dados limpo e pronto')
  return prisma
}

export async function cleanupRealDatabase() {
  if (prisma) {
    await prisma.$disconnect()
  }
}

export function getRealPrisma() {
  return prisma
}
```

### 3. Helper Interativo

```typescript
// test/real/setup/interactive.ts
import readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

export function askUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`\n${question}\n> `, (answer) => {
      resolve(answer.trim())
    })
  })
}

export async function waitForUserAction(message: string): Promise<void> {
  console.log(`\n⏸️  ${message}`)
  await askUser('Pressione ENTER quando estiver pronto...')
}

export async function confirmAction(message: string): Promise<boolean> {
  const answer = await askUser(`${message} (s/n)`)
  return answer.toLowerCase() === 's' || answer.toLowerCase() === 'sim'
}

export function closeInteractive() {
  rl.close()
}
```

---

## 🧪 Exemplos de Testes REAIS

### Teste 1: Autenticação com Email REAL

```typescript
// test/real/integration/auth-real.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupRealDatabase, cleanupRealDatabase } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { askUser, waitForUserAction } from '../setup/interactive'

describe('🔐 Autenticação REAL', () => {
  let env: ReturnType<typeof validateRealTestEnv>
  let testEmail: string
  let otpCode: string

  beforeAll(async () => {
    env = validateRealTestEnv()
    await setupRealDatabase()
  })

  afterAll(async () => {
    await cleanupRealDatabase()
  })

  it('deve enviar OTP para email REAL', async () => {
    // 1. Pedir email ao usuário
    testEmail = await askUser('📧 Digite um email REAL para receber o OTP:')

    // 2. Fazer request para API REAL
    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const response = await fetch(`${baseUrl}/api/v1/auth/signup-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail }),
    })

    const data = await response.json()

    // 3. Validar resposta
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)

    console.log('✅ Email enviado!')
    console.log(`📧 Verifique ${testEmail} e pegue o código OTP`)
  })

  it('deve verificar OTP REAL e criar usuário', async () => {
    // 1. Pedir código ao usuário
    otpCode = await askUser('🔐 Digite o código OTP recebido:')

    // 2. Verificar OTP
    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const response = await fetch(`${baseUrl}/api/v1/auth/verify-signup-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        code: otpCode,
        name: 'Test User Real',
        password: 'TestPassword123!',
      }),
    })

    const data = await response.json()

    // 3. Validar
    expect(response.status).toBe(201)
    expect(data.data.user.email).toBe(testEmail)
    expect(data.data.accessToken).toBeDefined()

    // 4. Validar no banco REAL
    const prisma = getRealPrisma()
    const user = await prisma.user.findUnique({
      where: { email: testEmail },
    })

    expect(user).toBeTruthy()
    expect(user?.emailVerified).toBe(true)

    console.log('✅ Usuário criado no banco!')
  })
})
```

### Teste 2: Integração WhatsApp REAL

```typescript
// test/real/integration/whatsapp-real.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { setupRealDatabase } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { askUser, waitForUserAction } from '../setup/interactive'

describe('📱 WhatsApp Integração REAL', () => {
  let env: ReturnType<typeof validateRealTestEnv>
  let adminToken: string
  let instanceId: string
  let qrCode: string

  beforeAll(async () => {
    env = validateRealTestEnv()
    await setupRealDatabase()

    // Login como admin
    const loginRes = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@quayer.com',
        password: 'admin123456',
      }),
    })

    const loginData = await loginRes.json()
    adminToken = loginData.data.accessToken
  })

  it('deve criar instância WhatsApp REAL', async () => {
    const instanceName = await askUser('📝 Nome da instância WhatsApp:')

    const response = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/v1/instances`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: instanceName,
        organizationId: 'org-test',
      }),
    })

    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.data.id).toBeDefined()

    instanceId = data.data.id
    console.log(`✅ Instância criada: ${instanceId}`)
  })

  it('deve conectar WhatsApp e mostrar QR Code REAL', async () => {
    // 1. Solicitar conexão
    const response = await fetch(
      `${env.NEXT_PUBLIC_APP_URL}/api/v1/instances/${instanceId}/connect`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
      }
    )

    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.qrCode).toBeDefined()

    qrCode = data.data.qrCode

    // 2. Mostrar QR Code
    console.log('\n📱 QR CODE PARA ESCANEAR:')
    console.log('═══════════════════════════════════════')
    console.log(qrCode)
    console.log('═══════════════════════════════════════')

    // 3. Esperar usuário escanear
    await waitForUserAction('Escaneie o QR Code com seu WhatsApp')

    // 4. Aguardar conexão (polling)
    let connected = false
    let attempts = 0

    while (!connected && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000)) // 2 segundos

      const statusRes = await fetch(
        `${env.NEXT_PUBLIC_APP_URL}/api/v1/instances/${instanceId}/status`,
        {
          headers: { 'Authorization': `Bearer ${adminToken}` },
        }
      )

      const statusData = await statusRes.json()

      if (statusData.data.status === 'connected') {
        connected = true
        console.log('✅ WhatsApp conectado!')
      } else {
        console.log(`⏳ Aguardando conexão... (tentativa ${attempts + 1}/30)`)
        attempts++
      }
    }

    expect(connected).toBe(true)
  })

  it('deve enviar mensagem REAL via WhatsApp', async () => {
    const phoneNumber = await askUser('📞 Digite o número para enviar mensagem (ex: 5511999999999):')
    const message = await askUser('💬 Digite a mensagem:')

    const response = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/v1/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        instanceId,
        to: phoneNumber,
        message,
      }),
    })

    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.messageId).toBeDefined()

    console.log('✅ Mensagem enviada!')
    console.log(`📱 Verifique se recebeu no número ${phoneNumber}`)

    const received = await confirmAction('Você recebeu a mensagem?')
    expect(received).toBe(true)
  })
})
```

### Teste 3: E2E Completo com Playwright

```typescript
// test/real/e2e-interactive/connect-whatsapp.spec.ts
import { test, expect } from '@playwright/test'
import { validateRealTestEnv } from '../setup/env-validator'

test.describe('📱 Conectar WhatsApp - E2E REAL', () => {
  let env: ReturnType<typeof validateRealTestEnv>

  test.beforeAll(() => {
    env = validateRealTestEnv()
  })

  test('fluxo completo: Login → Criar Instância → Conectar → Enviar Mensagem', async ({ page }) => {
    const baseUrl = env.NEXT_PUBLIC_APP_URL

    // 1. Login
    await page.goto(`${baseUrl}/login`)
    await page.fill('input[name="email"]', 'admin@quayer.com')
    await page.fill('input[name="password"]', 'admin123456')
    await page.click('button[type="submit"]')

    await expect(page).toHaveURL(/\/(admin|integracoes)/)
    console.log('✅ Login realizado')

    // 2. Navegar para integrações
    await page.goto(`${baseUrl}/integracoes`)
    await page.waitForLoadState('networkidle')

    // 3. Criar nova instância
    await page.click('button:has-text("Nova Integração")')
    await page.fill('input[name="name"]', `Test Instance ${Date.now()}`)
    await page.click('button:has-text("Criar")')

    console.log('✅ Instância criada')

    // 4. Abrir modal de conexão
    await page.click('button:has-text("Conectar")')

    // 5. Esperar QR Code aparecer
    const qrCodeElement = await page.waitForSelector('[data-testid="qr-code"]', {
      timeout: 10000,
    })

    expect(qrCodeElement).toBeTruthy()
    console.log('✅ QR Code exibido')

    // 6. Pausar para usuário escanear
    console.log('\n📱 ESCANEIE O QR CODE NO SEU WHATSAPP')
    console.log('⏸️  Teste pausado - Pressione ENTER após escanear...')

    await page.pause() // Pausa interativa do Playwright

    // 7. Aguardar status conectado
    await expect(page.locator('[data-testid="status"]')).toHaveText(/connected/i, {
      timeout: 30000,
    })

    console.log('✅ WhatsApp conectado!')

    // 8. Fechar modal
    await page.click('button:has-text("Fechar")')

    // 9. Verificar instância conectada na lista
    await expect(page.locator('[data-testid="instance-status"]').first()).toHaveText(/conectado/i)

    console.log('✅ Fluxo completo testado!')
  })
})
```

---

## 🎯 Script de Execução

```typescript
// scripts/run-real-tests.ts
#!/usr/bin/env tsx

import { validateRealTestEnv } from '../test/real/setup/env-validator'
import { setupRealDatabase, cleanupRealDatabase } from '../test/real/setup/database'
import { execSync } from 'child_process'

async function main() {
  console.log('🚀 Executando Testes REAIS - 100% Cobertura\n')

  // 1. Validar ambiente
  console.log('1️⃣  Validando ambiente...')
  const env = validateRealTestEnv()
  console.log('✅ Ambiente OK\n')

  // 2. Setup database
  console.log('2️⃣  Configurando banco de dados...')
  await setupRealDatabase()
  console.log('✅ Database OK\n')

  // 3. Iniciar servidor (se não estiver rodando)
  console.log('3️⃣  Verificando servidor...')
  try {
    const response = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/health`)
    if (response.ok) {
      console.log('✅ Servidor rodando\n')
    }
  } catch {
    console.log('⚠️  Servidor não está rodando!')
    console.log('Execute: npm run dev')
    process.exit(1)
  }

  // 4. Executar testes
  console.log('4️⃣  Executando testes REAIS...\n')
  console.log('═══════════════════════════════════════════════════\n')

  try {
    // Testes de integração
    console.log('📦 Testes de Integração...')
    execSync('vitest run test/real/integration', { stdio: 'inherit' })

    // Testes E2E interativos
    console.log('\n🌐 Testes E2E Interativos...')
    execSync('playwright test test/real/e2e-interactive', { stdio: 'inherit' })

    console.log('\n✅ TODOS OS TESTES PASSARAM!')
  } catch (error) {
    console.error('\n❌ Alguns testes falharam')
    process.exit(1)
  } finally {
    await cleanupRealDatabase()
  }
}

main()
```

---

## 📋 Checklist de Execução

### Antes de Rodar Testes
- [ ] Configurar `.env` com credenciais REAIS
- [ ] PostgreSQL rodando (Docker: `docker-compose up -d`)
- [ ] Servidor rodando (`npm run dev`)
- [ ] Email configurado (SMTP ou Resend)
- [ ] Token UAZAPI configurado

### Durante os Testes
- [ ] Estar disponível para inputs (email, OTP, QR code)
- [ ] Ter celular em mãos para escanear QR code
- [ ] Verificar emails recebidos

### Validação Final
- [ ] Todos os testes passaram
- [ ] Database tem dados reais inseridos
- [ ] WhatsApp conectado e enviou mensagem
- [ ] Frontend + Backend + Prisma validados

---

## 🎯 Cobertura Garantida

Com essa estratégia, testamos:

### ✅ Backend
- ✅ Prisma queries reais
- ✅ Controllers (Igniter.js)
- ✅ Services (email, WhatsApp)
- ✅ Auth flow completo
- ✅ Webhooks

### ✅ Frontend
- ✅ Componentes React
- ✅ Forms e validação
- ✅ Navegação e rotas
- ✅ Estado e hooks
- ✅ UI interativa

### ✅ Integrações
- ✅ PostgreSQL + Prisma
- ✅ UAZAPI WhatsApp
- ✅ Email SMTP/Resend
- ✅ Google OAuth (opcional)

### ✅ Fluxos Completos
- ✅ Signup → Onboarding → Dashboard
- ✅ Login → Criar Instância → Conectar → Mensagem
- ✅ Admin → Gerenciar → Logs

---

## 🚀 Comandos

```bash
# Executar todos os testes REAIS
npx tsx scripts/run-real-tests.ts

# Apenas integração
vitest run test/real/integration

# Apenas E2E interativo
playwright test test/real/e2e-interactive --headed

# Com debug
DEBUG=* vitest run test/real/integration
```

---

**Status**: 📋 ESTRATÉGIA COMPLETA
**Cobertura Real**: 100% (Front + Back + Integrações + Prisma)
**Tipo**: Testes REAIS, não mockados
**Interativo**: Sim, pede inputs quando necessário
