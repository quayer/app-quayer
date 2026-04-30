# PRD: Auth Test Pipeline + AUTH_MAP.md Update

> Branch: `ralph/auth-platform-hardening` | Data: 2026-03-14

---

## Introduction

Dois objetivos críticos:

1. **AUTH_MAP.md** está desatualizado (gerado 2026-03-13) — o branch atual (`ralph/auth-platform-hardening`) redesenhou toda a UI de auth (Mintlify style, sem Card wrappers, layout flat) e adicionou consistência de espaçamento entre páginas. O documento precisa refletir o estado real do código.

2. **Esteira de testes automatizados** — atualmente não há forma de testar os fluxos de auth de ponta a ponta sem acesso real a email ou WhatsApp. Em localhost, um endpoint de recuperação de token (`/api/dev/last-token`) devolve o OTP/magic link mais recente, permitindo que Playwright execute o fluxo completo sem dependência externa. Em produção, esse endpoint **não existe**.

---

## Goals

- AUTH_MAP.md reflete estado real do código em 2026-03-14 (UI + arquitetura)
- Endpoint `GET /api/dev/last-token` funciona somente em `NODE_ENV=development`
- `npm run test:auth` roda toda a suíte em paralelo em < 60s
- Todos os 6 fluxos críticos de auth têm cobertura E2E: Email OTP, WhatsApp OTP, Magic Link, Google OAuth (mock), 2FA TOTP, Signup
- Pipeline GitHub Actions executa em cada PR no branch `ralph/*` e `main`
- Zero dependência de email/WhatsApp real nos testes (usa token recovery)

---

## User Stories

### US-001: Atualizar AUTH_MAP.md completamente
**Description:** As a developer, I want AUTH_MAP.md to reflect the actual current state of the codebase so I can understand the auth system without reading source files.

**Acceptance Criteria:**
- [ ] Seção "Páginas Frontend" corrigida: layout auth não tem mais "fundo gradiente roxo-índigo" — agora é dark/neutro estilo Mintlify
- [ ] Seção "Componentes Auth" lista o estado atual pós-redesign: `LoginFormFinal`, `LoginOTPForm`, `SignupOTPForm`, `VerifyEmailForm`, `TwoFactorChallenge`, `LoginVerifyMagicClient` — todos com flat layout, sem Card wrappers
- [ ] Nota de consistência de espaçamento adicionada: todos os forms usam `gap-8` interno, subtitle `min-h-[2.75rem]`, max-w-sm, mx-auto
- [ ] Seção "Notas de Sincronização" atualizada com estado atual (migrations SQL raw ainda sem schema.prisma)
- [ ] Timestamp do documento atualizado para 2026-03-14
- [ ] Seção nova: **"16. Test Pipeline"** — documenta endpoint dev, variáveis de env necessárias, comando de teste
- [ ] Typecheck passes

### US-002: Criar endpoint `GET /api/dev/last-token`
**Description:** As a test automation system, I want to retrieve the most recently generated OTP/magic link token so that automated tests can complete auth flows without real email/WhatsApp access.

**Acceptance Criteria:**
- [ ] Rota: `GET /api/dev/last-token?identifier=<email_ou_telefone>&type=<otp|magic-link|email-verification|reset-password>`
- [ ] Endpoint **só existe** quando `NODE_ENV !== 'production'` — retorna 404 em produção
- [ ] Busca na tabela `VerificationCode` o código mais recente não-usado (`used: false`, `expiresAt > now()`) para o `identifier` e `type` fornecidos
- [ ] Resposta: `{ code: "123456", token?: "jwt...", expiresAt: "ISO", type: "otp" }`
- [ ] Sem autenticação necessária (é um endpoint de dev puro)
- [ ] Sem rate limiting neste endpoint (é dev only)
- [ ] Arquivo criado em: `src/app/api/dev/last-token/route.ts`
- [ ] Typecheck passes

### US-003: Variável de ambiente `AUTH_RECOVERY_TOKEN` para bypass de OTP
**Description:** As a developer running tests locally, I want a master recovery token that bypasses OTP validation so that integration tests can run without hitting the dev endpoint.

**Acceptance Criteria:**
- [ ] `AUTH_RECOVERY_TOKEN` adicionada ao `.env.example` com comentário explicativo
- [ ] Quando `NODE_ENV !== 'production'` E o código OTP enviado for igual a `process.env.AUTH_RECOVERY_TOKEN`, o endpoint `verifyLoginOTP`, `verifyLoginOTPPhone`, `verifySignupOTP`, e `verifyEmail` aceitam sem validação no DB
- [ ] Em produção (`NODE_ENV=production`), a variável é **ignorada completamente** — sem efeito
- [ ] Comentário de segurança no código explicando o bypass
- [ ] `.env.example` mostra: `AUTH_RECOVERY_TOKEN=test-recovery-token-never-use-in-prod`
- [ ] Typecheck passes

### US-004: Testes E2E — Login por Email OTP (Playwright)
**Description:** As a CI system, I want to automatically test the email OTP login flow so that regressions are caught before merge.

**Acceptance Criteria:**
- [ ] Arquivo: `test/e2e/auth/login-email-otp.spec.ts`
- [ ] Cenário 1: Login feliz — digita email → página verify → busca OTP via `/api/dev/last-token` → digita código → verifica redirect para `/integracoes` ou `/onboarding`
- [ ] Cenário 2: Código inválido → mensagem de erro visível
- [ ] Cenário 3: Resend OTP — botão "Reenviar" fica ativo após 60s (mock de timer)
- [ ] Cenário 4: Magic Link — clica no link de magic link → nova aba abre → verifica autenticação
- [ ] Usa `AUTH_RECOVERY_TOKEN` da env nos cenários principais
- [ ] Typecheck passes
- [ ] Verificar no browser: `npx playwright test test/e2e/auth/login-email-otp.spec.ts`

### US-005: Testes E2E — Login por WhatsApp OTP (Playwright)
**Description:** As a CI system, I want to automatically test the WhatsApp OTP login flow so that the phone auth path is regression-tested.

**Acceptance Criteria:**
- [ ] Arquivo: `test/e2e/auth/login-whatsapp-otp.spec.ts`
- [ ] Cenário 1: Login feliz com telefone → página verify (WhatsApp) → busca OTP via `/api/dev/last-token` → digita → verifica redirect
- [ ] Cenário 2: Formato inválido de telefone → erro de validação inline
- [ ] Cenário 3: Rate limit simulado (mock da resposta da API)
- [ ] Verifica UI: ícone WhatsApp visível no heading, subtitle com cor #25D366, slots OTP `h-14`
- [ ] Typecheck passes
- [ ] Verificar no browser: `npx playwright test test/e2e/auth/login-whatsapp-otp.spec.ts`

### US-006: Testes E2E — Signup completo (Playwright)
**Description:** As a CI system, I want to test the full signup flow from new account creation to first authenticated page.

**Acceptance Criteria:**
- [ ] Arquivo: `test/e2e/auth/signup.spec.ts`
- [ ] Cenário 1: Signup feliz — nome + email (gerado único por teste) → OTP via `AUTH_RECOVERY_TOKEN` → verifica redirect
- [ ] Cenário 2: Email já cadastrado → mensagem de erro adequada
- [ ] Cenário 3: Signup via telefone → OTP WhatsApp → redirect
- [ ] Cada teste gera email único: `test+<timestamp>@quayer-test.com`
- [ ] Cleanup: deleta usuário de teste criado (via Prisma direto ou API admin)
- [ ] Typecheck passes
- [ ] Verificar no browser: `npx playwright test test/e2e/auth/signup.spec.ts`

### US-007: Testes E2E — 2FA TOTP (Playwright)
**Description:** As a CI system, I want to test the 2FA challenge flow so that the extra security layer is regression-tested.

**Acceptance Criteria:**
- [ ] Arquivo: `test/e2e/auth/two-factor.spec.ts`
- [ ] Setup: fixture que cria usuário com 2FA habilitado (TOTP secret fixo para testes)
- [ ] Cenário 1: Login com 2FA → desafio aparece inline → digita código TOTP válido (gerado via `otpauth`) → autenticado
- [ ] Cenário 2: Código TOTP inválido → erro, tenta novamente
- [ ] Cenário 3: Login com recovery code → funciona → recovery code marcado como usado
- [ ] Typecheck passes
- [ ] Verificar no browser: `npx playwright test test/e2e/auth/two-factor.spec.ts`

### US-008: Testes de integração API (Vitest)
**Description:** As a CI system, I want API-level integration tests that validate auth endpoints directly, faster than full E2E.

**Acceptance Criteria:**
- [ ] Arquivo: `test/integration/auth/auth-endpoints.test.ts`
- [ ] Testa via `fetch` direto contra servidor local (não mocks)
- [ ] Cobre: `loginOTP` → `verifyLoginOTP` → `me` → `logout`
- [ ] Cobre: `signupOTP` → `verifySignupOTP` → `me`
- [ ] Cobre: `refresh` token rotation — novo access token emitido, refresh rotacionado
- [ ] Cobre: `logout` revoga refresh token — `refresh` subsequente retorna 401
- [ ] Cobre: endpoint protegido sem token → 401
- [ ] Cobre: `AUTH_RECOVERY_TOKEN` bypass funciona em dev
- [ ] Config em `vitest.config.integration.ts` (já existe no projeto)
- [ ] Typecheck passes

### US-009: Comando único `npm run test:auth` + paralelismo
**Description:** As a developer, I want a single command that runs all auth tests in parallel and shows a clear summary so I can validate the entire auth system in one shot.

**Acceptance Criteria:**
- [ ] `package.json` tem: `"test:auth": "concurrently \"vitest run --config vitest.config.integration.ts\" \"playwright test test/e2e/auth/\""`
- [ ] Playwright configurado com `workers: 4` no `playwright.config.ts` para paralelismo
- [ ] Output mostra claramente qual teste falhou e qual página estava sendo testada
- [ ] Total de execução < 60s em máquina local (para os testes que não dependem de rede externa)
- [ ] `npm run test:auth:e2e` roda somente Playwright
- [ ] `npm run test:auth:api` roda somente Vitest integration
- [ ] Typecheck passes

### US-010: GitHub Actions CI para auth
**Description:** As a team, I want GitHub Actions to run auth tests automatically on every PR to the `ralph/*` and `main` branches.

**Acceptance Criteria:**
- [ ] Arquivo: `.github/workflows/auth-tests.yml`
- [ ] Trigger: `push` e `pull_request` em branches `ralph/**` e `main`
- [ ] Jobs paralelos: `unit-tests` (Vitest) e `e2e-tests` (Playwright)
- [ ] `e2e-tests` inicia o servidor Next.js com `npm run build && npm start` antes dos testes
- [ ] Usa `AUTH_RECOVERY_TOKEN` como GitHub Actions Secret
- [ ] Configura banco de dados PostgreSQL via `services:` (Docker)
- [ ] Upload de artifacts: Playwright HTML report em caso de falha
- [ ] Badge de status no README opcional (não obrigatório)
- [ ] Typecheck passes

---

## Functional Requirements

- **FR-1:** `GET /api/dev/last-token` retorna 404 quando `NODE_ENV=production`. Sem exceções.
- **FR-2:** `AUTH_RECOVERY_TOKEN` é ignorado em produção mesmo que configurado. Verificação dupla: `NODE_ENV !== 'production'` **E** variável presente.
- **FR-3:** Os testes E2E usam um usuário de teste dedicado por sessão, com email gerado dinamicamente para evitar colisão.
- **FR-4:** Cada spec Playwright tem `afterAll` que limpa os usuários criados.
- **FR-5:** Testes de integração (Vitest) rodam contra `localhost:3000` (servidor deve estar rodando ou ser iniciado pelo test runner).
- **FR-6:** `AUTH_MAP.md` inclui seção de "Test Infrastructure" documentando: endpoint dev, variáveis de env, comandos de teste, e advertência de segurança.
- **FR-7:** O endpoint dev não loga em produção e não aparece no Swagger/OpenAPI docs.
- **FR-8:** Testes do WhatsApp OTP verificam a UI específica: ícone WhatsApp no heading, cor verde #25D366 no subtitle.

---

## Non-Goals

- Não implementar mocks de email SMTP (usar endpoint dev é suficiente)
- Não implementar servidor fake de WhatsApp
- Não testar Passkeys/WebAuthn via Playwright (requer hardware autenticador — testar manualmente)
- Não testar Google OAuth real (requer browser com conta Google — testar manualmente)
- Não criar dashboard visual de cobertura de testes
- Não testar performance/load (isso é um PRD separado)
- Não modificar lógica de negócio de auth (apenas adicionar infraestrutura de teste)

---

## Technical Considerations

### Endpoint Dev — Implementação

```typescript
// src/app/api/dev/last-token/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/services/database'

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const identifier = req.nextUrl.searchParams.get('identifier') // email ou telefone
  const type = req.nextUrl.searchParams.get('type') // 'otp' | 'magic-link' | etc.

  const code = await prisma.verificationCode.findFirst({
    where: {
      email: identifier,
      type: type?.toUpperCase(),
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!code) return NextResponse.json({ error: 'No token found' }, { status: 404 })

  return NextResponse.json({ code: code.code, token: code.token, expiresAt: code.expiresAt, type: code.type })
}
```

### AUTH_RECOVERY_TOKEN — Implementação

No `auth.controller.ts`, nas funções `verifyLoginOTP`, `verifyLoginOTPPhone`, `verifySignupOTP`, `verifyEmail`:

```typescript
// Antes da validação normal do código
const recoveryToken = process.env.AUTH_RECOVERY_TOKEN
if (
  process.env.NODE_ENV !== 'production' &&
  recoveryToken &&
  request.body.code === recoveryToken
) {
  // bypass: pula verificação do DB, continua fluxo normal de geração de tokens
}
```

### Playwright Config

```typescript
// playwright.config.ts (adicionar/atualizar)
{
  workers: process.env.CI ? 2 : 4,
  testDir: './test/e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  }
}
```

### Fixture de Usuário de Teste

```typescript
// test/e2e/fixtures/auth.fixture.ts
export const testUser = {
  email: () => `test+${Date.now()}@quayer-test.com`,
  phone: '+5511999990001',
  name: 'Test User',
  recoveryToken: process.env.AUTH_RECOVERY_TOKEN ?? '000000',
}
```

---

## Security Considerations

> **CRÍTICO:** O endpoint `/api/dev/last-token` e o `AUTH_RECOVERY_TOKEN` são **armas de segurança** se vazarem para produção. As seguintes proteções são obrigatórias:
>
> 1. `process.env.NODE_ENV === 'production'` check **no início** de cada arquivo, não delegado a middleware
> 2. `AUTH_RECOVERY_TOKEN` nunca deve estar no `.env` de produção — apenas `.env.local` e `.env.test`
> 3. GitHub Actions usa Secrets, não env direto no YAML
> 4. O endpoint dev retorna 404 (não 403) para não revelar sua existência em produção

---

## Success Metrics

- `npm run test:auth` roda em < 60s localmente
- Cobertura de 6/6 fluxos principais de auth
- Fluxo Email OTP testado end-to-end sem acesso a email real
- Fluxo WhatsApp OTP testado end-to-end sem acesso ao WhatsApp real
- 0 falsos positivos (testes que passam mesmo com a feature quebrada)
- CI passa em cada PR para branches `ralph/**`

---

## Open Questions

- O `vitest.config.integration.ts` já existe — verificar se o servidor precisa ser iniciado manualmente ou se o Vitest pode fazer isso via `globalSetup`
- Para o 2FA test (US-007): o fixture de TOTP secret fixo precisa de endpoint admin para criar o setup, ou podemos inserir diretamente via Prisma no fixture?
- Quantos usuários de teste ficam no banco após os testes? Precisamos de um `npm run test:cleanup` para limpar periodicamente?
