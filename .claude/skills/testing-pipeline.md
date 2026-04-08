# Skill: Testing Pipeline

## Quando carregar esta skill
Ao escrever, corrigir, debugar ou configurar qualquer teste do Quayer — unit, integration, API ou E2E. Também ao mexer em `vitest.config.ts`, `playwright.config.ts`, workflows de CI ou scripts `test:*` do `package.json`.

---

## As 5 Camadas

| Camada | Tecnologia | Onde roda | Comando npm | Quando usar |
|---|---|---|---|---|
| 1. Static Analysis | `tsc --noEmit` + `eslint` | pre-commit + CI | `npm run lint && npm run typecheck` | Sempre. Gate obrigatório antes de qualquer commit. |
| 2. Unit Backend | Vitest (node) | local + CI | `npm run test:unit` | Lógica pura em `src/server/**`: repositories, helpers, validators, JWT, permissions. |
| 3. Unit React | Vitest + Testing Library + `happy-dom` | local + CI | `npm run test:react` | Componentes em `src/client/components/**` — renderização, eventos, estados. |
| 4. API Integration | Vitest + Postgres isolado (container) | local + CI | `npm run test:api` | Controllers Igniter.js com DB real, transaction rollback por teste. |
| 5. E2E | Playwright (3 projects: local, homol, prod-readonly) | local / homol / prod | `npm run test:e2e` | Fluxos críticos de usuário: login, onboarding, envio de mensagem, CRM. |

---

## Quando usar cada camada

Guia decisório rápido:

- **Mudou função pura / helper / validator** → Camada 2 (unit backend).
- **Mudou repository ou query Prisma** → Camada 2 com mock do `@/server/services/database`, ou Camada 4 se precisa validar SQL real.
- **Mudou componente React** → Camada 3 (unit React).
- **Mudou controller / endpoint Igniter.js** → Camada 4 (API integration).
- **Mudou fluxo multi-página (login, onboarding, checkout)** → Camada 5 (E2E).
- **Subiu release para homolog** → `npm run test:e2e:homol` + smoke prod.
- **Só renomeou variável / refactor sem semântica** → Camada 1 já cobre.

Regra de ouro: **escreva o teste na camada mais barata que ainda valida a regra**. Não use E2E para validar lógica que cabe num unit.

---

## Padrões de mock

Todos os exemplos abaixo compilam com o tsconfig do projeto.

### 1. Mock do `@/igniter.client` (componente React que chama API)

```typescript
// test/client/components/auth/login-form-final.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LoginFormFinal } from '@/client/components/auth/login-form-final'

vi.mock('@/igniter.client', () => ({
  api: {
    auth: {
      login: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          error: null,
        }),
      },
    },
  },
}))

describe('LoginFormFinal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renderiza campos de email e senha', () => {
    render(<LoginFormFinal />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument()
  })
})
```

**Importante:** importe sempre do caminho exato `@/igniter.client`. Não use barrel `@/igniter` — `vi.mock()` por módulo não resolve o re-export.

### 2. Mock do contexto autenticado para `authProcedure`

```typescript
// test/server/core/auth/auth.controller.test.ts
import { describe, it, expect, vi } from 'vitest'
import type { User } from '@prisma/client'

const mockUser: Partial<User> & { currentOrgId: string } = {
  id: 'user-123',
  email: 'test@quayer.com',
  role: 'user',
  currentOrgId: 'org-456',
  onboardingCompleted: true,
  isActive: true,
}

const mockContext = {
  auth: {
    session: {
      user: mockUser,
      token: 'jwt-fake-token',
    },
  },
  request: { headers: new Headers() },
  response: {
    success: vi.fn((data) => ({ ok: true, data })),
    unauthorized: vi.fn(() => ({ ok: false, status: 401 })),
    forbidden: vi.fn(() => ({ ok: false, status: 403 })),
  },
}

describe('auth.controller.me', () => {
  it('retorna user do contexto autenticado', async () => {
    const { meHandler } = await import('@/server/core/auth/controllers/auth.controller')
    // chame o handler passando mockContext
  })
})
```

### 3. Mock do Prisma client

```typescript
// test/server/core/auth/auth.repository.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/services/database', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn({})),
  },
}))

import { prisma } from '@/server/services/database'

describe('auth repository', () => {
  beforeEach(() => vi.clearAllMocks())

  it('busca usuário por email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
    } as never)

    const result = await prisma.user.findUnique({ where: { email: 'a@b.com' } })
    expect(result?.id).toBe('u1')
  })
})
```

---

## Troubleshooting comum

| Sintoma | Causa / Correção |
|---|---|
| `Vitest não encontra alias @/` | Revisar `vitest.config.ts` → `resolve.alias`. Deve apontar `@` para `./src`. Se usar `vite-tsconfig-paths`, garantir que o plugin está registrado no array `plugins`. |
| Teste passa local, falha em CI | Variáveis de ambiente divergentes. Criar `.env.test` e carregar via `dotenv/config` no `setupFiles` do Vitest. CI deve setar `DATABASE_URL`, `JWT_SECRET`, `NEXT_PUBLIC_APP_URL` iguais ao local. |
| Playwright não encontra elemento | Prefira `getByRole('button', { name: /entrar/i })` e `getByLabel(/email/i)` em vez de seletores CSS (`.btn-primary`). Seletores semânticos resistem a refactor de UI. |
| Mock de Igniter client não funciona | Importar caminho exato: `vi.mock('@/igniter.client', ...)`, nunca `@/igniter` ou barrel. O `vi.mock` opera por module id resolvido. |
| `prisma migrate dev` falha em CI | Usar `prisma migrate deploy` no pipeline — `dev` precisa shadow DB e prompts interativos. `deploy` só aplica migrations já commitadas. |
| `happy-dom` quebra com `window.matchMedia` | Adicionar shim no `setupFiles`: `Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: false, addListener: () => {}, removeListener: () => {} }) })`. |
| Test DB não limpa entre testes | Use `await prisma.$transaction(async (tx) => { ... throw ROLLBACK })` — nunca `truncate`, que quebra FKs e é lento. |

---

## Comandos copiáveis

```bash
npm run test:unit          # Camada 2 - Vitest backend
npm run test:react         # Camada 3 - Vitest + Testing Library
npm run test:api           # Camada 4 - Integration com Postgres
npm run test:e2e           # Camada 5 - Playwright local
npm run test:e2e:homol     # Camada 5 - homologação
npm run test:all           # roda tudo em sequência (pre-release)
npm run lint               # Camada 1 - ESLint
npm run typecheck          # Camada 1 - tsc --noEmit
```

---

## Regras duras

- Zero tipos `any` em testes — use `vi.mocked()`, `as never` só como último recurso em mocks de Prisma.
- Sempre rodar `npm run typecheck` antes de commit — Camada 1 é gate obrigatório.
- Testes de integração (Camada 4) usam **transaction rollback**, nunca `truncate` nem `deleteMany` em tabelas de produção.
- Smoke prod (Playwright project `prod-readonly`) é **read-only** — nunca faz login real, nunca escreve no DB de produção. Apenas GETs em rotas públicas.
- Contract tests falham se o payload de resposta mudar sem atualização explícita — isso é feature, não bug.
- Nunca mockar o que você está testando. Se está testando o `auth.controller`, mocke `prisma` e `jwt`, não mocke o próprio controller.
- Testes não compartilham estado entre arquivos. Cada teste inicializa seu próprio fixture.

---

## Referências cruzadas

- `docs/auth/TESTING_PATTERNS.md` — padrões detalhados de mock e fixtures (criado em US posterior).
- `docs/auth/TESTING_SETUP.md` — setup de ambiente local + CI (criado em US posterior).
- `.claude/skills/release-checklist.md` — checklist de release (criado em US-114).
- `tasks/prd-01-testing-pipeline.md` — PRD fonte com todas as decisões arquiteturais das 5 camadas.
- `.claude/skills/auth.md` — contexto de auth para mockar `authProcedure` corretamente.
