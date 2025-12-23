# Analise de Bugs e Inconsistencias - Jornada de Criacao de Conta

**Data:** 2025-12-22
**Escopo:** Fluxo completo de criacao de conta (signup publico + onboarding + convites)

---

## Resumo Executivo

| Severidade | Quantidade | Descricao | Status |
|------------|------------|-----------|--------|
| CRITICO | 1 | Pagina `/connect` nao existe - convites quebrados | ✅ CORRIGIDO |
| ALTO | 2 | CPF falso gerado, componentes duplicados | Pendente |
| MEDIO | 3 | Inconsistencias de token, UX | Pendente |
| BAIXO | 2 | Melhorias de UX | Pendente |

---

## Mapeamento dos Fluxos

### FLUXO 1: Signup Publico (Novo Usuario)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SIGNUP PUBLICO - FLUXO ATUAL                     │
└─────────────────────────────────────────────────────────────────────┘

[Usuario] ──► /signup
             │
             ├──► SignupForm.tsx
             │    ├── Input: Nome
             │    ├── Input: Email
             │    └── Botao: "Continuar com Email"
             │
             ├──► API: POST /auth/signup-otp
             │    └── Cria TempUser + envia email OTP
             │
             └──► Redirect: /signup/verify?email=xxx&name=xxx

[Usuario] ──► /signup/verify
             │
             ├──► SignupOTPForm.tsx
             │    ├── Input: Codigo OTP (6 digitos)
             │    └── Botao: "Verificar"
             │
             ├──► API: POST /auth/verify-signup-otp
             │    ├── Valida OTP
             │    ├── CRIA ORGANIZACAO AUTOMATICA ⚠️
             │    │   └── document: UUID aleatorio (NAO E CPF VALIDO!)
             │    ├── Cria User com role='user' (ou 'admin' se primeiro)
             │    ├── Vincula user como 'master' da org
             │    └── Retorna accessToken
             │
             └──► Redirect: /integracoes (master) ou /admin (admin)

⚠️ PROBLEMAS IDENTIFICADOS:
1. Org criada com CPF/CNPJ FALSO (UUID parcial)
2. Usuario NAO passa pelo onboarding real
3. Nome da org e generico ("Joao's Organization")
```

**Arquivos Envolvidos:**
- Frontend: [signup/page.tsx](src/app/(auth)/signup/page.tsx)
- Frontend: [signup-form.tsx](src/components/auth/signup-form.tsx)
- Frontend: [signup/verify/page.tsx](src/app/(auth)/signup/verify/page.tsx)
- Frontend: [signup-otp-form.tsx](src/components/auth/signup-otp-form.tsx)
- Backend: [auth.controller.ts:1238-1427](src/features/auth/controllers/auth.controller.ts#L1238-L1427)

---

### FLUXO 2: Admin Cria Organizacao

```
┌─────────────────────────────────────────────────────────────────────┐
│                  ADMIN CRIA ORGANIZACAO - FLUXO                     │
└─────────────────────────────────────────────────────────────────────┘

[Admin] ──► /admin/organizations
            │
            ├──► Clica "Nova Organizacao"
            │
            ├──► CreateOrganizationDialog.tsx
            │    ├── Input: Nome
            │    ├── Select: Tipo (PF/PJ)
            │    ├── Input: CPF/CNPJ (validado)
            │    ├── Select: Plano
            │    ├── Input: Nome do Admin
            │    ├── Input: Email do Admin
            │    ├── Input: Max Instancias
            │    └── Input: Max Usuarios
            │
            ├──► API: POST /organizations
            │    ├── Valida CPF/CNPJ (algoritmo real) ✅
            │    ├── Verifica se documento ja existe
            │    ├── Cria Organization
            │    ├── Cria User se nao existe (com password aleatorio)
            │    ├── Envia email de boas-vindas
            │    ├── Vincula user como 'master'
            │    └── Retorna organization + accessToken
            │
            └──► Atualiza lista de organizacoes

✅ FLUXO OK - Sem problemas identificados
```

**Arquivos Envolvidos:**
- Frontend: [organizations/page.tsx](src/app/admin/organizations/page.tsx)
- Frontend: [create-organization-dialog.tsx](src/app/admin/organizations/create-organization-dialog.tsx)
- Backend: [organizations.controller.ts](src/features/organizations/controllers/organizations.controller.ts)
- Schema: [organizations.schemas.ts](src/features/organizations/organizations.schemas.ts)

---

### FLUXO 3: Onboarding (Usuario sem Org)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ONBOARDING - FLUXO                             │
└─────────────────────────────────────────────────────────────────────┘

[Usuario] ──► /onboarding
             │
             ├──► OnboardingForm.tsx (USADO ATUALMENTE)
             │    ├── Step 1: Welcome
             │    ├── Step 2: Organization
             │    │   ├── Input: Nome
             │    │   ├── Input: CPF/CNPJ (formatado)
             │    │   └── Botoes: PF/PJ
             │    └── Step 3: Complete
             │
             ├──► Server Action: createOrganizationAction
             │    └── POST /api/v1/organizations
             │
             └──► Redirect: /integracoes

⚠️ PROBLEMA: Existe OUTRO componente!

[Usuario] ──► OnboardingWizard.tsx (NAO USADO!)
             ├── Step 1: Welcome (mais completo)
             ├── Step 2: Organization
             │   ├── Input: Nome
             │   ├── RadioGroup: PF/PJ
             │   ├── Input: CPF/CNPJ
             │   ├── Switch: Horario de Funcionamento
             │   │   ├── Input: Hora Inicio
             │   │   ├── Input: Hora Fim
             │   │   ├── Buttons: Dias da Semana
             │   │   └── Select: Timezone
             │   └── Validacao real de CPF/CNPJ
             └── Step 3: Complete

⚠️ PROBLEMAS IDENTIFICADOS:
1. DUPLICACAO: 2 componentes de onboarding diferentes
2. OnboardingWizard e mais completo mas NAO E USADO
3. OnboardingForm nao tem campo de horario de funcionamento
```

**Arquivos Envolvidos:**
- Frontend: [onboarding/page.tsx](src/app/(auth)/onboarding/page.tsx) - Usa OnboardingForm
- Frontend: [onboarding-form.tsx](src/components/auth/onboarding-form.tsx) - Simples
- Frontend: [onboarding-wizard.tsx](src/components/onboarding/onboarding-wizard.tsx) - Completo (NAO USADO)
- Backend: [actions.ts](src/app/(auth)/onboarding/actions.ts)

---

### FLUXO 4: Convite de Membros

```
┌─────────────────────────────────────────────────────────────────────┐
│                      CONVITES - FLUXO                               │
└─────────────────────────────────────────────────────────────────────┘

[Master/Manager] ──► Criar Convite
                     │
                     ├──► API: POST /invitations/create
                     │    ├── Valida permissoes (RBAC)
                     │    ├── Verifica limite de usuarios
                     │    ├── Cria Invitation com token
                     │    ├── Envia email com link
                     │    └── Link: /connect?token=xxx
                     │
                     └──► Convite criado

[Convidado] ──► Clica no link do email
               │
               └──► /connect?token=xxx
                    │
                    ├──► PAGINA NAO EXISTE! ❌❌❌
                    │
                    └──► 404 Not Found

❌ BUG CRITICO: Pagina /connect NAO EXISTE!

BACKEND ESPERADO (mas frontend falta):
├── GET /invitations/validate/:token
│   └── Retorna: valid, email, role, organizationName, hasAccount
│
├── Se hasAccount=true:
│   └── POST /invitations/accept (usuario logado)
│
└── Se hasAccount=false:
    └── POST /invitations/accept/new (cria conta + aceita)
```

**Arquivos Envolvidos:**
- Backend: [invitations.controller.ts](src/features/invitations/controllers/invitations.controller.ts) - COMPLETO
- Frontend: FALTA `/connect` page!

---

## Bugs e Inconsistencias Detalhados

### 🔴 CRITICO

#### BUG-001: Pagina `/connect` Nao Existe - ✅ CORRIGIDO

**Impacto:** Convites de novos membros estao 100% quebrados
**Localizacao:** ~~Falta criar `src/app/connect/page.tsx`~~ **CRIADO!**
**Status:** ✅ **CORRIGIDO em 2025-12-22**

**Implementacao:**
- Criado `src/app/(auth)/connect/page.tsx`
- Valida token via GET /invitations/validate/:token
- Se hasAccount=true: mostra botao de login + aceitar
- Se hasAccount=false: mostra formulario de criar conta
- Chama POST /invitations/accept ou /invitations/accept/new
- Estados de erro: expirado, usado, invalido
- UI consistente com outras paginas de auth

---

### 🟠 ALTO

#### BUG-002: CPF/CNPJ Falso no Signup Automatico

**Impacto:** Organizacoes criadas com documento invalido
**Localizacao:** [auth.controller.ts:1352](src/features/auth/controllers/auth.controller.ts#L1352)
**Codigo Problematico:**
```typescript
const uniqueDocument = crypto.randomUUID().replace(/-/g, '').substring(0, 14);
```
**Problema:** UUID nao e um CPF/CNPJ valido, pode causar:
- Problemas de integridade de dados
- Conflito se usuario tentar atualizar para documento real
- Validacoes futuras podem falhar
**Sugestao:** Redirecionar usuario para onboarding apos signup para preencher dados reais

---

#### BUG-003: Componentes de Onboarding Duplicados

**Impacto:** Confusao, manutencao duplicada
**Localizacao:**
- [onboarding-form.tsx](src/components/auth/onboarding-form.tsx) - USADO
- [onboarding-wizard.tsx](src/components/onboarding/onboarding-wizard.tsx) - NAO USADO
**Problema:**
- OnboardingWizard e mais completo (tem horario de funcionamento)
- Mas a pagina usa OnboardingForm (simples)
**Sugestao:**
- Unificar em um unico componente
- Ou usar OnboardingWizard na pagina principal

---

### 🟡 MEDIO

#### BUG-004: Token httpOnly Inconsistente

**Impacto:** Potencial vulnerabilidade de seguranca
**Localizacao:**
- [signup-otp-form.tsx:81](src/components/auth/signup-otp-form.tsx#L81) - NAO httpOnly
- [onboarding/actions.ts:59](src/app/(auth)/onboarding/actions.ts#L59) - httpOnly
**Problema:** Em alguns lugares o cookie e httpOnly, em outros nao
**Sugestao:** Padronizar como httpOnly em producao

---

#### BUG-005: Fluxo Signup Pula Onboarding

**Impacto:** UX inconsistente, dados incompletos
**Localizacao:** [auth.controller.ts:1354-1362](src/features/auth/controllers/auth.controller.ts#L1354-L1362)
**Problema:**
- Signup automatico cria org com dados minimos
- Usuario vai direto para /integracoes
- Nunca passa pelo onboarding para completar dados
**Sugestao:**
- Marcar `onboardingCompleted: false` no signup
- Redirecionar para /onboarding
- Deixar usuario completar dados reais

---

#### BUG-006: Falta Validacao de Email Unico no Convite

**Impacto:** Pode criar duplicidade
**Localizacao:** [invitations.controller.ts:271](src/features/invitations/controllers/invitations.controller.ts#L271)
**Problema:**
- `acceptNew` cria usuario sem verificar se email foi alterado
- Possivelmente race condition com signup
**Sugestao:** Adicionar verificacao de `findUnique` antes do create com tratamento de erro

---

### 🟢 BAIXO

#### UX-001: Sem Loading State no Botao Reenviar OTP

**Localizacao:** [signup-otp-form.tsx:123-137](src/components/auth/signup-otp-form.tsx#L123-L137)
**Problema:** Nao tem indicador visual ao reenviar
**Sugestao:** Adicionar `isResending` state

---

#### UX-002: Nome da Org Automatica e Generico

**Localizacao:** [auth.controller.ts:1355](src/features/auth/controllers/auth.controller.ts#L1355)
**Problema:** `"${tempUser.name}'s Organization"` - ingles em app portugues
**Sugestao:** `"Organizacao de ${tempUser.name}"` ou redirecionar para onboarding

---

## Diagramas de Fluxo Comparativo

### Fluxo ATUAL vs Fluxo IDEAL

```
ATUAL (com bugs):
┌──────────────────────────────────────────────────────────────────────┐
│ /signup → /verify → [CRIA ORG FAKE] → /integracoes                   │
│           ↓                                                          │
│    NUNCA passa pelo onboarding                                       │
│           ↓                                                          │
│    Dados incompletos (CPF falso, nome generico)                      │
└──────────────────────────────────────────────────────────────────────┘

IDEAL (corrigido):
┌──────────────────────────────────────────────────────────────────────┐
│ /signup → /verify → [CRIA USER SEM ORG] → /onboarding                │
│                                              ↓                       │
│                                    [WIZARD COMPLETO]                 │
│                                    - Nome da org                     │
│                                    - CPF/CNPJ real                   │
│                                    - Horario funcionamento           │
│                                              ↓                       │
│                                    [CRIA ORG COM DADOS REAIS]        │
│                                              ↓                       │
│                                    /integracoes                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Plano de Correcao Priorizado

| # | Bug | Prioridade | Esforco | Acao | Status |
|---|-----|------------|---------|------|--------|
| 1 | BUG-001 | P0 | Alto | Criar pagina /connect para convites | ✅ FEITO |
| 2 | BUG-002 | P1 | Medio | Alterar signup para nao criar org automatica | Pendente |
| 3 | BUG-005 | P1 | Medio | Redirecionar signup para onboarding | Pendente |
| 4 | BUG-003 | P2 | Baixo | Unificar componentes de onboarding | Pendente |
| 5 | BUG-004 | P2 | Baixo | Padronizar cookie httpOnly | Pendente |
| 6 | BUG-006 | P3 | Baixo | Adicionar tratamento de race condition | Pendente |
| 7 | UX-001 | P3 | Baixo | Adicionar loading no reenviar | Pendente |
| 8 | UX-002 | P3 | Baixo | Traduzir nome da org | Pendente |

---

## Changelog

| Data | Alteracao |
|------|-----------|
| 2025-12-22 | Documento criado com analise completa |
| 2025-12-22 | **BUG-001 CORRIGIDO**: Criada pagina `/connect` para aceitar convites - fluxo completo com validacao, usuario existente e novo usuario |
