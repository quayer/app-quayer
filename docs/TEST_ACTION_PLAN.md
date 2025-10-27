# 🎯 Plano de Ação: Melhorar Cobertura de Testes

**Status Atual**: 16% de cobertura
**Meta**: 80% de cobertura
**Gap**: 64 pontos percentuais
**Prioridade**: 🔴 CRÍTICA

---

## 📊 Situação Atual

### Distribuição de Testes
- **Unit Tests**: 6 (19%) - MUITO BAIXO
- **API Tests**: 5 (16%) - MUITO BAIXO
- **E2E Tests**: 20 (65%) - BOM, mas desproporcional
- **Total**: 31 testes

### Pirâmide de Testes Atual vs Ideal

```
        ATUAL                  IDEAL

E2E    ████████ 65%       E2E    ██ 10%
API    ████ 16%           API    ████ 20%
Unit   ████ 19%           Unit   ██████████ 70%
```

**Problema**: Pirâmide invertida! Muitos E2E, poucos Unit.

---

## 🎯 Estratégia de Ação

### SPRINT 1: Fundação (Semana 1-2)
**Objetivo**: Criar infraestrutura de testes e cobrir componentes críticos

#### 1.1. Setup de Ferramentas
- [ ] Instalar `@vitest/coverage-v8` para relatórios de cobertura
- [ ] Configurar `@testing-library/react` para componentes
- [ ] Configurar `@testing-library/react-hooks` para hooks
- [ ] Adicionar `msw` (Mock Service Worker) para APIs

```bash
npm install -D @vitest/coverage-v8 @testing-library/react @testing-library/react-hooks @testing-library/user-event msw
```

#### 1.2. Componentes de Autenticação (CRÍTICO)
Prioridade: 🔴 ALTA - São os mais usados

- [ ] `login-form-final.tsx` - Formulário principal de login
- [ ] `login-otp-form.tsx` - Verificação OTP
- [ ] `signup-form.tsx` - Cadastro
- [ ] `passkey-button.tsx` - Botão de autenticação

**Cenários de Teste**:
```typescript
// login-form-final.test.tsx
describe('LoginFormFinal', () => {
  it('should render form fields', () => {})
  it('should validate email', () => {})
  it('should show OTP button', () => {})
  it('should handle Google OAuth', () => {})
  it('should show error messages', () => {})
})
```

#### 1.3. Hooks Customizados (CRÍTICO)
Prioridade: 🔴 ALTA - Lógica de negócio

- [ ] `useInstance.ts` - ✅ JÁ TEM (mas precisa expandir)
- [ ] `useOrganization.ts` - Gerenciamento de org
- [ ] `usePermissions.ts` - Controle de acesso
- [ ] `useOnboarding.ts` - Fluxo de onboarding

---

### SPRINT 2: Componentes Core (Semana 3-4)
**Objetivo**: Cobrir componentes reutilizáveis e UI

#### 2.1. Componentes UI Customizados
- [ ] `status-badge.tsx` - Badge de status
- [ ] `empty-state.tsx` - Estados vazios
- [ ] `error-boundary.tsx` - Error boundary
- [ ] Navigation components (`nav-*.tsx`)

#### 2.2. Componentes WhatsApp
- [ ] `connection-modal.tsx` - Modal de conexão
- [ ] `create-instance-modal.tsx` - Criar instância
- [ ] `send-message-dialog.tsx` - Enviar mensagem
- [ ] `whatsapp-chat.tsx` - Chat interface

#### 2.3. Componentes de Onboarding
- [ ] `onboarding-wizard.tsx` - Wizard principal
- [ ] Todos os steps de onboarding

---

### SPRINT 3: Serviços e Controllers (Semana 5-6)
**Objetivo**: Testar lógica de negócio e integrações

#### 3.1. Services
- [ ] `email.service.ts` - Envio de emails
- [ ] `auth.service.ts` - Lógica de autenticação
- [ ] `instances.service.ts` - Gerenciamento de instâncias

#### 3.2. Controllers (Igniter.js)
- [ ] `auth.controller.ts` - Endpoints de auth
- [ ] `instances.controller.ts` - Endpoints de instâncias
- [ ] `messages.controller.ts` - Endpoints de mensagens
- [ ] `organizations.controller.ts` - Endpoints de orgs

#### 3.3. Repositories
- [ ] `invitations.repository.ts` - ✅ JÁ TEM
- [ ] `users.repository.ts` - Gerenciamento de usuários
- [ ] `instances.repository.ts` - Banco de instâncias

---

### SPRINT 4: Integration & Performance (Semana 7-8)
**Objetivo**: Testes de integração e otimização

#### 4.1. Integration Tests
- [ ] Fluxo completo de signup → onboarding → dashboard
- [ ] Fluxo de criação de instância → conexão → mensagem
- [ ] Fluxo de convite → aceitação → uso

#### 4.2. Performance Tests
- [ ] Benchmark de queries pesadas
- [ ] Testes de carga em endpoints críticos
- [ ] Otimização de bundles grandes (>20KB)

---

## 📋 Templates de Testes

### Template: Componente React
```typescript
// src/components/auth/__tests__/login-form.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoginForm } from '../login-form'
import { vi } from 'vitest'

describe('LoginForm', () => {
  it('should render form fields correctly', () => {
    render(<LoginForm />)

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument()
  })

  it('should validate email format', async () => {
    render(<LoginForm />)

    const emailInput = screen.getByLabelText(/email/i)
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } })
    fireEvent.blur(emailInput)

    await waitFor(() => {
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument()
    })
  })

  it('should call onSubmit with form data', async () => {
    const mockSubmit = vi.fn()
    render(<LoginForm onSubmit={mockSubmit} />)

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'test@example.com' }
    })
    fireEvent.click(screen.getByRole('button', { name: /login/i }))

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith({ email: 'test@example.com' })
    })
  })
})
```

### Template: Hook Customizado
```typescript
// src/hooks/__tests__/useOrganization.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { useOrganization } from '../useOrganization'
import { vi } from 'vitest'

describe('useOrganization', () => {
  it('should fetch organization data', async () => {
    const { result } = renderHook(() => useOrganization('org-123'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toMatchObject({
      id: 'org-123',
      name: expect.any(String)
    })
  })

  it('should handle errors gracefully', async () => {
    vi.mocked(api.organizations.get).mockRejectedValueOnce(new Error('Failed'))

    const { result } = renderHook(() => useOrganization('invalid'))

    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })
  })
})
```

### Template: API Integration Test
```typescript
// test/api/__tests__/organizations.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { app } from '@/igniter'

describe('Organizations API', () => {
  let adminToken: string

  beforeEach(async () => {
    // Setup: Login como admin
    const response = await app.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@test.com', password: 'admin123' })
    })
    const data = await response.json()
    adminToken = data.data.token
  })

  it('should list organizations', async () => {
    const response = await app.request('/api/v1/organizations', {
      headers: { Authorization: `Bearer ${adminToken}` }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(Array.isArray(data.data)).toBe(true)
  })

  it('should create organization', async () => {
    const response = await app.request('/api/v1/organizations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Test Org', slug: 'test-org' })
    })

    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.data.name).toBe('Test Org')
  })
})
```

---

## 🎯 Metas de Cobertura por Sprint

| Sprint | Componentes Testados | Cobertura Estimada | Status |
|--------|---------------------|-------------------|--------|
| **Sprint 1** | 15 críticos | 30% (+14%) | 🟡 Planejado |
| **Sprint 2** | +20 componentes UI | 50% (+20%) | 🟡 Planejado |
| **Sprint 3** | +15 services/controllers | 65% (+15%) | 🟡 Planejado |
| **Sprint 4** | +10 integration | 80% (+15%) | 🟡 Planejado |

---

## 🚀 Quick Wins (Primeiros 5 Testes)

Para ganhar impulso, comece com estes 5 testes fáceis:

### 1. `status-badge.test.tsx` (5 min)
```typescript
import { render } from '@testing-library/react'
import { StatusBadge } from '@/components/custom/status-badge'

describe('StatusBadge', () => {
  it('renders with correct color for connected', () => {
    const { container } = render(<StatusBadge status="connected" />)
    expect(container.firstChild).toHaveClass('bg-green')
  })
})
```

### 2. `empty-state.test.tsx` (5 min)
```typescript
import { render, screen } from '@testing-library/react'
import { EmptyState } from '@/components/custom/empty-state'

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No data" description="Add something" />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })
})
```

### 3. `phone-validator.test.ts` (10 min) - ✅ JÁ EXISTE
Expandir com mais casos de teste

### 4. `usePermissions.test.ts` (15 min)
```typescript
import { renderHook } from '@testing-library/react'
import { usePermissions } from '@/hooks/usePermissions'

describe('usePermissions', () => {
  it('admin can do everything', () => {
    const { result } = renderHook(() => usePermissions({ role: 'admin' }))
    expect(result.current.canCreateInstance).toBe(true)
  })
})
```

### 5. `format-utils.test.ts` (10 min)
Testar funções utilitárias de formatação

**Total**: ~45 minutos → Cobertura sobe para ~20%! 🎉

---

## 📊 KPIs de Sucesso

### Métricas Objetivo
- ✅ Cobertura geral: **80%**
- ✅ Cobertura de componentes críticos: **100%**
- ✅ Cobertura de hooks: **90%**
- ✅ Cobertura de services: **85%**
- ✅ Todos os testes passando no CI/CD

### Prazo
- **8 semanas** (2 meses)
- **2 sprints** de 4 semanas cada
- **Review** semanal de progresso

---

## 🛠️ Ferramentas Necessárias

### Instalação
```bash
# Testing tools
npm install -D @vitest/coverage-v8
npm install -D @testing-library/react
npm install -D @testing-library/react-hooks
npm install -D @testing-library/user-event
npm install -D @testing-library/jest-dom
npm install -D msw

# Accessibility testing
npm install -D @axe-core/react
npm install -D vitest-axe
```

### Configuração Coverage
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        '**/types',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
```

---

## ✅ Checklist de Execução

### Antes de Começar
- [ ] Instalar dependências de teste
- [ ] Configurar coverage thresholds
- [ ] Criar pasta `__tests__` em cada feature
- [ ] Documentar padrões de teste no README

### Durante os Sprints
- [ ] Daily: Escrever pelo menos 2 testes por dia
- [ ] Weekly: Review de cobertura e ajuste de prioridades
- [ ] Bi-weekly: Sprint review e retrospectiva

### Validação Final
- [ ] Cobertura >= 80%
- [ ] Todos os testes passando
- [ ] CI/CD verde
- [ ] Documentação atualizada

---

## 📞 Suporte

**Executar análise de cobertura**:
```bash
npx tsx scripts/analyze-test-coverage.ts
```

**Rodar testes com coverage**:
```bash
npm run test:coverage
```

**Ver relatório HTML**:
```bash
open coverage/index.html
```

---

**Status**: 📋 PLANO PRONTO PARA EXECUÇÃO
**Tempo Estimado**: 8 semanas (2 meses)
**Prioridade**: 🔴 CRÍTICA
**ROI**: 🚀 ALTO (reduz bugs, facilita manutenção)
