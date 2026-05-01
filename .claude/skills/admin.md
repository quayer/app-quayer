# Skill: Painel Admin

## Quando carregar esta skill
Ao trabalhar com o painel administrativo, organizações, usuários, configurações do sistema, auditoria.

---

## Arquitetura

O admin é uma área separada acessível apenas para `role: 'admin'` (system admin).

```
src/app/admin/                 # Páginas admin (Next.js App Router)
├── layout.tsx                 # Layout com sidebar admin
├── page.tsx                   # Dashboard admin
├── integracoes/page.tsx       # Visão global de integrações
├── organizations/             # CRUD de organizações
│   ├── page.tsx
│   ├── create-organization-dialog.tsx
│   └── edit-organization-dialog.tsx
├── sessions/                  # Gerenciar sessões ativas
├── settings/                  # Configurações do sistema
├── invitations/               # Convites de usuários
├── notificacoes/              # Notificações
├── audit/                     # Log de auditoria
└── webhooks/                  # Webhooks globais
```

**Proteção:** `src/middleware.ts` bloqueia `/admin` para não-admins → redireciona `/integracoes`.

---

## Verificar Role Admin

```typescript
// No handler
import { isSystemAdmin } from '@/lib/auth/roles'

const user = context.auth?.session?.user
if (!isSystemAdmin(user.role)) {
  return response.forbidden('Apenas administradores')
}

// No middleware
if (isAdminOnlyPath && !isSystemAdmin(payload.role)) {
  return NextResponse.redirect(new URL('/integracoes', request.url))
}
```

---

## Organizations — CRUD Admin

```typescript
// src/features/organizations/controllers/organizations.controller.ts
// Endpoints: GET/POST/PATCH/DELETE /api/v1/organizations

// Criar org: somente admin OU usuário sem org (onboarding)
// Editar: somente admin
// Deletar: somente admin

// Campos importantes da org:
{
  name: string
  slug: string          // unique
  document: string      // CPF ou CNPJ — unique
  type: 'pf' | 'pj'
  maxInstances: number  // limite de instâncias WhatsApp
  maxUsers: number      // limite de usuários
  billingType: 'free' | 'basic' | 'pro'
  isActive: boolean
  businessHoursStart: string  // "09:00"
  businessHoursEnd: string    // "18:00"
  businessDays: string        // "1,2,3,4,5"
  timezone: string            // "America/Sao_Paulo"
}
```

---

## Admin — Página de Integrações

`src/app/admin/integracoes/page.tsx` — visão global de todas as organizações e suas instâncias.

- Lista todas as orgs com contagem de instâncias
- OrgSheet: slide-over com tabs
  - **Detalhes:** dados da org
  - **Instâncias:** instâncias WhatsApp da org
  - **Webhooks:** webhooks configurados (movido do sidebar)

---

## Invitations — Convites

```
src/features/invitations/         # Feature backend
src/app/admin/invitations/        # Página admin
```

Fluxo:
1. Admin cria convite com email + role + org
2. Email enviado com link único
3. Usuário clica → preenche dados → entra na org

---

## Audit Log

```
src/features/audit/               # Feature backend
src/app/admin/audit/              # Página admin
src/lib/audit/                    # Utilitários
```

```prisma
model AuditLog {
  id             String   @id @default(uuid())
  organizationId String?
  userId         String?
  action         String   // create_instance, delete_user, etc.
  resource       String   // Instance, User, Organization
  resourceId     String?
  metadata       Json?
  ipAddress      String?
  userAgent      String?
  createdAt      DateTime @default(now())
}
```

---

## System Settings

```
src/features/system-settings/    # Feature backend
src/app/admin/settings/          # Página admin
src/components/admin-settings/   # Componentes
```

Configurações globais do sistema (SMTP, limites, features flags, etc.).

---

## Sessions

```
src/features/sessions/           # Feature backend
src/app/admin/sessions/          # Visualizar/invalidar sessões
```

---

## Notifications Admin

```
src/features/notifications/      # Feature backend
src/app/admin/notificacoes/      # Gerenciar notificações
src/components/notification-center.tsx  # UI de notificações
```

---

## Multi-tenancy — Regras Admin

```
System Admin (User.role = 'admin'):
  ✅ Ver todas as organizações
  ✅ Criar/editar/deletar qualquer org
  ✅ Ver todos os usuários
  ✅ Configurações do sistema

Organization Master (UserOrganization.role = 'master'):
  ✅ Gerenciar membros da sua org
  ✅ Criar instâncias (respeitando maxInstances)
  ✅ Ver auditoria da sua org
  ❌ Ver outras orgs

Organization Manager (role = 'manager'):
  ✅ Operações do dia a dia
  ❌ Criar usuários

Organization User (role = 'user'):
  ✅ Usar o sistema
  ❌ Configurações
```

---

## Server Actions (Admin)

Algumas operações admin usam Next.js Server Actions:

```
src/app/admin/actions.ts    # Server actions do admin (se existir)
```

---

## Criar Admin (Seed)

```bash
# Criar usuário admin manualmente
node prisma/create-admin.js

# Ou via script
node scripts/db/create-admin.js
```

**Executado no startup do container** via `docker-entrypoint.sh` (idempotente).

---

## Bugs Conhecidos / Notas

- Correções admin documentadas em: `RELATORIO_CORRECOES_ADMIN.md`
- Validação manual checklist: `CHECKLIST_VALIDACAO_MANUAL_ADMIN.md`
- OrgSheet com tab Webhooks foi movida do sidebar para dentro da sheet (commit recente)
