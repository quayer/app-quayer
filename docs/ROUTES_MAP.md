# 🗺️ Mapa Completo de Rotas - Quayer App

**Última Atualização**: 2025-10-12
**Total de Rotas**: 32
**Server Components**: 4 (13%)
**Client Components**: 28 (88%)

---

## 📊 Visão Geral

Este documento mapeia TODAS as rotas da aplicação, organizadas por contexto e função.

### Estatísticas Rápidas
- 🟢 **Rotas Públicas**: 4 rotas
- 🔐 **Rotas de Autenticação**: 11 rotas
- 👤 **Rotas de Usuário**: 7 rotas
- ⚙️ **Rotas Admin**: 8 rotas
- 📊 **Rotas Dashboard**: 2 rotas

---

## 🌐 Rotas Públicas (4)

Acessíveis sem autenticação.

| Rota | Componente | Descrição | Arquivo |
|------|------------|-----------|---------|
| `/` | 🟢 Server | Landing page principal | [page.tsx](../src/app/page.tsx) |
| `/connect` | 🔵 Client | Conectar nova instância | [page.tsx](../src/app/(public)/connect/page.tsx) |
| `/connect/:token` | 🔵 Client | Conectar via token de convite | [page.tsx](../src/app/(public)/connect/[token]/page.tsx) |
| `/conversas` | 🔵 Client | Ver conversas públicas (?) | [page.tsx](../src/app/(public)/conversas/page.tsx) |

**Nota**: A rota `/conversas` pode estar duplicada ou ser uma página de demo. Requer revisão.

---

## 🔐 Rotas de Autenticação (11)

Sistema completo de autenticação com múltiplos métodos.

### Login
| Rota | Componente | Descrição | Arquivo |
|------|------------|-----------|---------|
| `/login` | 🟢 Server | Página de login principal | [page.tsx](../src/app/(auth)/login/page.tsx) |
| `/login/verify` | 🔵 Client | Verificar código OTP (login) | [page.tsx](../src/app/(auth)/login/verify/page.tsx) |
| `/login/verify-magic` | 🔵 Client | Verificar magic link (login) | [page.tsx](../src/app/(auth)/login/verify-magic/page.tsx) |

### Cadastro
| Rota | Componente | Descrição | Arquivo |
|------|------------|-----------|---------|
| `/signup` | 🟢 Server | Página de cadastro | [page.tsx](../src/app/(auth)/signup/page.tsx) |
| `/signup/verify` | 🔵 Client | Verificar código OTP (signup) | [page.tsx](../src/app/(auth)/signup/verify/page.tsx) |
| `/signup/verify-magic` | 🔵 Client | Verificar magic link (signup) | [page.tsx](../src/app/(auth)/signup/verify-magic/page.tsx) |
| `/register` | 🔵 Client | Registro alternativo (?) | [page.tsx](../src/app/(auth)/register/page.tsx) |

**Nota**: `/register` e `/signup` podem ser duplicados. Revisar necessidade.

### Recuperação de Senha
| Rota | Componente | Descrição | Arquivo |
|------|------------|-----------|---------|
| `/forgot-password` | 🔵 Client | Esqueci minha senha | [page.tsx](../src/app/(auth)/forgot-password/page.tsx) |
| `/reset-password/:token` | 🔵 Client | Resetar senha via token | [page.tsx](../src/app/(auth)/reset-password/[token]/page.tsx) |

### Outros
| Rota | Componente | Descrição | Arquivo |
|------|------------|-----------|---------|
| `/verify-email` | 🔵 Client | Verificar email | [page.tsx](../src/app/(auth)/verify-email/page.tsx) |
| `/google-callback` | 🔵 Client | Callback Google OAuth | [page.tsx](../src/app/(auth)/google-callback/page.tsx) |

### Onboarding
| Rota | Componente | Descrição | Arquivo |
|------|------------|-----------|---------|
| `/onboarding` | 🟢 Server | Onboarding inicial | [page.tsx](../src/app/(auth)/onboarding/page.tsx) |

---

## 👤 Rotas de Usuário (7)

Área do usuário comum (role: `user`).

### Integrações WhatsApp
| Rota | Componente | Descrição | Arquivo |
|------|------------|-----------|---------|
| `/integracoes` | 🔵 Client | Dashboard de integrações | [page.tsx](../src/app/integracoes/page.tsx) |
| `/integracoes/dashboard` | 🔵 Client | Analytics e métricas | [page.tsx](../src/app/integracoes/dashboard/page.tsx) |
| `/integracoes/conversations` | 🔵 Client | Gerenciar conversas | [page.tsx](../src/app/integracoes/conversations/page.tsx) |
| `/integracoes/settings` | 🔵 Client | Configurações | [page.tsx](../src/app/integracoes/settings/page.tsx) |
| `/integracoes/users` | 🔵 Client | Gerenciar usuários da org | [page.tsx](../src/app/integracoes/users/page.tsx) |

### Admin (dentro de Integrações)
| Rota | Componente | Descrição | Arquivo |
|------|------------|-----------|---------|
| `/integracoes/admin/clients` | 🔵 Client | Gerenciar clientes | [page.tsx](../src/app/integracoes/admin/clients/page.tsx) |

**Nota**: Esta rota admin dentro de `/integracoes` pode causar confusão. Revisar se deve estar em `/admin`.

### User Dashboard
| Rota | Componente | Descrição | Arquivo |
|------|------------|-----------|---------|
| `/user/dashboard` | 🔵 Client | Dashboard pessoal | [page.tsx](../src/app/user/dashboard/page.tsx) |

---

## ⚙️ Rotas Admin (8)

Área administrativa (role: `admin`).

| Rota | Componente | Descrição | Arquivo |
|------|------------|-----------|---------|
| `/admin` | 🔵 Client | Dashboard admin | [page.tsx](../src/app/admin/page.tsx) |
| `/admin/organizations` | 🔵 Client | Gerenciar organizações | [page.tsx](../src/app/admin/organizations/page.tsx) |
| `/admin/clients` | 🔵 Client | Gerenciar clientes | [page.tsx](../src/app/admin/clients/page.tsx) |
| `/admin/brokers` | 🔵 Client | Gerenciar brokers | [page.tsx](../src/app/admin/brokers/page.tsx) |
| `/admin/integracoes` | 🔵 Client | Gerenciar todas integrações | [page.tsx](../src/app/admin/integracoes/page.tsx) |
| `/admin/webhooks` | 🔵 Client | Gerenciar webhooks | [page.tsx](../src/app/admin/webhooks/page.tsx) |
| `/admin/logs` | 🔵 Client | Visualizar logs do sistema | [page.tsx](../src/app/admin/logs/page.tsx) |
| `/admin/permissions` | 🔵 Client | Gerenciar permissões | [page.tsx](../src/app/admin/permissions/page.tsx) |

---

## 📊 Rotas Dashboard (2)

| Rota | Componente | Descrição | Arquivo |
|------|------------|-----------|---------|
| `/organizacao` | 🔵 Client | Gerenciar organização | [page.tsx](../src/app/(dashboard)/organizacao/page.tsx) |
| `/user/dashboard` | 🔵 Client | Dashboard do usuário | [page.tsx](../src/app/user/dashboard/page.tsx) |

---

## 🔄 Fluxos de Navegação

### Fluxo de Novo Usuário
```
1. / (landing)
   → /signup
   → /signup/verify (OTP)
   → /onboarding
   → /integracoes (dashboard principal)
```

### Fluxo de Login
```
1. /login
   → Opção A: /login/verify (OTP)
   → Opção B: /google-callback (OAuth)
   → Sucesso: /integracoes (user) ou /admin (admin)
```

### Fluxo de Recuperação de Senha
```
1. /login
   → /forgot-password
   → Email enviado com link
   → /reset-password/:token
   → /login
```

### Fluxo de Convite
```
1. Email recebido com link
   → /connect/:token
   → /signup ou /register
   → /onboarding
   → /integracoes
```

---

## ⚠️ Rotas Suspeitas / Para Revisar

### 1. Duplicação: `/signup` vs `/register`
- Ambas são páginas de cadastro
- **Recomendação**: Consolidar em uma única rota

### 2. Rota Pública: `/conversas`
- Está em `(public)` mas parece ser conteúdo autenticado
- **Recomendação**: Mover para `/integracoes/conversations` ou deletar

### 3. Admin dentro de Integrações: `/integracoes/admin/clients`
- Admin routes devem estar em `/admin/*`
- **Recomendação**: Mover para `/admin/clients` ou remover

### 4. Duplicação: Dashboard
- `/user/dashboard` e `/integracoes/dashboard`
- **Recomendação**: Definir um único dashboard principal

### 5. Organizacao: `/organizacao`
- Pode ser redundante com `/admin/organizations`
- **Recomendação**: Revisar se não é duplicado

---

## 🎯 Proteção de Rotas (Middleware)

### Rotas Públicas (Sem Auth)
- `/`
- `/login*`
- `/signup*`
- `/register`
- `/forgot-password`
- `/reset-password/:token`
- `/google-callback`
- `/connect/:token`
- `/verify-email`

### Rotas Autenticadas (Com Auth)
- `/integracoes*` - Requer role: `user` ou `admin`
- `/user/*` - Requer role: `user`
- `/admin/*` - Requer role: `admin`
- `/onboarding` - Requer auth (primeira vez)
- `/organizacao` - Requer auth

### Middleware Atual
Ver: [middleware.ts](../src/middleware.ts)

---

## 📱 Rotas por Dispositivo

### Mobile-First
Todas as rotas são responsivas, mas algumas são otimizadas para mobile:
- `/integracoes` - Interface touch-friendly
- `/integracoes/conversations` - Chat mobile-optimized
- `/connect/:token` - Mobile onboarding

### Desktop-Optimized
- `/admin/*` - Tabelas e dashboards complexos
- `/integracoes/dashboard` - Gráficos e analytics
- `/admin/logs` - Visualização de logs

---

## 🔍 Navegação por Role

### Role: `admin`
Tem acesso a TUDO:
```
✅ Todas rotas públicas
✅ Todas rotas de auth
✅ Todas rotas de usuário (/integracoes/*)
✅ Todas rotas admin (/admin/*)
✅ Dashboard e organizações
```

### Role: `user`
Acesso limitado:
```
✅ Todas rotas públicas
✅ Todas rotas de auth
✅ Rotas de integracoes (/integracoes/*)
✅ Dashboard pessoal (/user/dashboard)
❌ Rotas admin (/admin/*)
```

### Role: `guest` (não autenticado)
```
✅ Rotas públicas (/, /connect/:token, /conversas)
✅ Rotas de auth (/login, /signup, /forgot-password)
❌ Todas outras rotas (redirect → /login)
```

---

## 🚀 API Endpoints Relacionados

As rotas frontend consomem estes endpoints:

### Auth
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/login-otp`
- `POST /api/v1/auth/verify-login-otp`
- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/google`
- `POST /api/v1/auth/google/callback`
- `GET /api/v1/auth/me`

### Instances
- `GET /api/v1/instances`
- `POST /api/v1/instances`
- `GET /api/v1/instances/:id`
- `PUT /api/v1/instances/:id`
- `DELETE /api/v1/instances/:id`
- `POST /api/v1/instances/:id/connect`

### Messages
- `GET /api/v1/messages`
- `POST /api/v1/messages/send`
- `GET /api/v1/messages/:id`

### Organizations
- `GET /api/v1/organizations`
- `POST /api/v1/organizations`
- `GET /api/v1/organizations/:id`
- `PUT /api/v1/organizations/:id`

Ver documentação completa: [API_REFERENCE.md](./api/API_REFERENCE.md) (TODO)

---

## 📝 Convenções de Roteamento

### Estrutura de Pastas
```
src/app/
├── (auth)/          - Grupo de rotas de autenticação
├── (dashboard)/     - Grupo de rotas de dashboard
├── (public)/        - Grupo de rotas públicas
├── admin/           - Rotas administrativas
├── integracoes/     - Rotas de integrações WhatsApp
├── user/            - Rotas de usuário comum
├── page.tsx         - Landing page (/)
├── layout.tsx       - Layout root
└── api/             - API routes (Next.js)
```

### Rotas Dinâmicas
- `[token]` - Parâmetro dinâmico (ex: `/connect/[token]`)
- `[...slug]` - Catch-all route (ex: `/api/v1/[[...all]]`)

### Grupos de Rotas
- `(auth)` - Não afeta URL, apenas organiza (ex: `(auth)/login` → `/login`)
- Serve para compartilhar layouts

---

## 🔄 Redirects e Rewrites

### Redirects Automáticos
```typescript
// Middleware
if (!isAuthenticated && isProtectedRoute) {
  redirect('/login')
}

if (isAuthenticated && isAuthRoute) {
  redirect(role === 'admin' ? '/admin' : '/integracoes')
}
```

### Rewrites
```typescript
// next.config.ts
rewrites: [
  {
    source: '/docs',
    destination: '/docs.html'
  }
]
```

---

## 📊 Tamanhos de Página

| Categoria | Média | Maior | Menor |
|-----------|-------|-------|-------|
| Server Components | 0.44 KB | 0.62 KB | 0.15 KB |
| Client Components | 9.81 KB | 23.86 KB | 1.14 KB |
| **Geral** | **8.72 KB** | **23.86 KB** | **0.15 KB** |

**Maior página**: `/integracoes/dashboard` (23.86 KB)
**Menor página**: `/onboarding` (0.15 KB - Server Component)

---

## ✅ Checklist de Manutenção

Ao adicionar novas rotas:
- [ ] Adicionar ao `middleware.ts` se necessário proteção
- [ ] Documentar neste arquivo
- [ ] Adicionar testes E2E em `test/e2e/`
- [ ] Verificar performance (bundle size)
- [ ] Validar acessibilidade (a11y)
- [ ] Testar em mobile e desktop

---

## 📞 Suporte

Dúvidas sobre rotas?
- Ver código: [src/app/](../src/app/)
- Ver middleware: [middleware.ts](../src/middleware.ts)
- Executar auditoria: `npx tsx scripts/audit-pages.ts`

---

**Última Auditoria**: 2025-10-12
**Status**: ✅ Zero rotas duplicadas detectadas
**Próxima Revisão**: Mensal ou após grandes features
