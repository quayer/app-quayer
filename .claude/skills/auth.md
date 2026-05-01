# Skill: Autenticação & Autorização

## Quando carregar esta skill
Ao trabalhar com login, registro, OTP, magic link, JWT, middleware, sessões, permissões.

---

## Fluxo Completo de Auth

```
1. Registro → Zod validation → createUser → createOrganization (onboarding)
2. Login → email/password → gera accessToken (15min) + refreshToken (7d) → cookie + localStorage
3. Middleware (Edge) → extrai token → verifyAccessToken → injeta headers x-user-*
4. authProcedure → valida token → extende context.auth.session.user
5. Handler → usa context.auth.session.user para lógica de negócio
```

---

## Feature: auth/

```
src/features/auth/
├── controllers/
│   └── auth.controller.ts       # Todos os endpoints de auth
├── procedures/
│   └── auth.procedure.ts        # Middleware de contexto
├── repositories/
│   └── auth.repository.ts       # Data access layer
├── auth.schemas.ts              # Zod schemas
├── auth.interfaces.ts
└── index.ts
```

---

## Endpoints (auth.controller.ts)

| Endpoint | Método | Ação |
|---|---|---|
| `/auth/register` | POST | Cadastro tradicional |
| `/auth/login` | POST | Login email+senha |
| `/auth/refresh` | POST | Renovar access token |
| `/auth/logout` | POST | Invalidar sessão |
| `/auth/me` | GET | Dados do usuário logado |
| `/auth/change-password` | POST | Alterar senha |
| `/auth/profile` | PATCH | Atualizar perfil |
| `/auth/switch-org` | POST | Trocar organização ativa |
| `/auth/forgot-password` | POST | Solicitar reset |
| `/auth/reset-password` | POST | Confirmar reset |
| `/auth/google/callback` | POST | OAuth Google |
| `/auth/send-verification` | POST | Enviar código de verificação |
| `/auth/verify-email` | POST | Verificar email com código |
| `/auth/passwordless-otp` | POST | Enviar OTP sem senha |
| `/auth/verify-passwordless-otp` | POST | Verificar OTP |
| `/auth/verify-magic-link` | POST | Verificar magic link |
| `/auth/signup-otp` | POST | Cadastro via OTP |
| `/auth/verify-signup-otp` | POST | Verificar OTP de cadastro |

---

## Schemas de Validação

```typescript
// login
loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
})

// register — senha forte obrigatória
registerSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string()
    .min(8).max(72)
    .regex(/[A-Z]/)   // uppercase
    .regex(/[a-z]/)   // lowercase
    .regex(/[0-9]/)   // número
    .regex(/[!@#$%^&*()...]/) // especial
  name: z.string().min(2).max(100).trim(),
  document: z.string().optional() // CPF (11 dígitos) ou CNPJ (14 dígitos)
  organizationName: z.string().optional()
})
```

---

## authProcedure — Como Usar

```typescript
// Proteger rota (obrigatório)
use: [authProcedure({ required: true })]

// Rota opcional (aceita anônimo)
use: [authProcedure({ required: false })]

// Acessar usuário no handler
const user = context.auth?.session?.user
if (!user) return response.unauthorized()

const userId = user.id
const userRole = user.role          // 'admin' | 'user'
const orgId = user.currentOrgId    // org ativa
```

---

## JWT Tokens

```typescript
// src/lib/auth/jwt.ts
verifyAccessToken(token: string): Promise<JWTPayload | null>
generateAccessToken(payload): Promise<string>
generateRefreshToken(userId): Promise<string>

// Payload do JWT
interface JWTPayload {
  userId: string
  email: string
  role: string              // 'admin' | 'user'
  currentOrgId: string
  organizationRole: string  // 'master' | 'manager' | 'user'
  needsOnboarding: boolean
}
```

**Arquivo edge-safe:** `src/lib/auth/jwt.ts` (compatível com middleware Edge runtime)

---

## Middleware (src/middleware.ts)

```typescript
// Rotas públicas (sem auth)
const PUBLIC_PATHS = ['/login', '/register', '/signup', '/connect', ...]

// Rotas protegidas
const PROTECTED_PATHS = ['/integracoes', '/conversas', '/admin', '/dashboard']

// Somente admin
const ADMIN_ONLY_PATHS = ['/admin']
```

**Fluxo do middleware:**
1. Extrai token de cookie (`accessToken`) ou header `Authorization: Bearer`
2. Verifica com `verifyAccessToken`
3. Redireciona para `/login?redirect=...` se inválido
4. Injeta headers para Server Components:
   - `x-user-id`
   - `x-user-email`
   - `x-user-role`
   - `x-current-org-id`
   - `x-organization-role`

---

## Roles e Permissões

```typescript
// Roles do sistema (User.role)
'admin'  // System admin — acesso total
'user'   // Usuário normal

// Roles na organização (UserOrganization.role)
'master'   // Dono da org
'manager'  // Gerente
'user'     // Membro básico

// Verificar admin no handler
import { isSystemAdmin } from '@/lib/auth/roles'
if (!isSystemAdmin(user.role)) return response.forbidden()
```

**Arquivo:** `src/lib/auth/roles.ts` e `src/lib/auth/permissions.ts`

---

## Modelos de Dados (Prisma)

```prisma
model User {
  id                  String    @id @default(uuid())
  email               String    @unique
  password            String    // bcrypt hash
  name                String
  role                String    @default("user")
  currentOrgId        String?   // org ativa
  onboardingCompleted Boolean   @default(false)
  emailVerified       DateTime?
  resetToken          String?
  resetTokenExpiry    DateTime?
  isActive            Boolean   @default(true)
}

model Session {
  id        String   @id @default(uuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
}

model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
}

model VerificationCode {
  id        String   @id @default(uuid())
  userId    String
  code      String
  type      String   // email_verification | passwordless_otp | signup_otp
  expiresAt DateTime
  used      Boolean  @default(false)
}
```

---

## Frontend — Componentes de Auth

```
src/components/auth/
├── login-form.tsx          # Formulário login padrão
├── login-otp-form.tsx      # Login via OTP
├── login-form-magic.tsx    # Magic link
├── signup-form.tsx         # Cadastro
├── signup-otp-form.tsx     # Cadastro via OTP
├── verify-email-form.tsx   # Verificação de email
├── onboarding-form.tsx     # Onboarding pós-registro
└── passkey-button.tsx      # Passkey (WebAuthn)
```

**Providers:**
- `src/lib/auth/auth-provider.tsx` — context global de auth
- `src/lib/auth/auth-context.tsx` — hook useAuth()

---

## Onboarding Flow

```
Register → needsOnboarding=true → middleware redireciona /onboarding
Onboarding → cria organização + completa perfil → onboardingCompleted=true
```

**Hooks:** `src/hooks/useOnboarding.ts`

---

## Bugs Conhecidos

- Erro 401 documentado em: `CORRECAO_ERRO_401_COMPLETO.md`
- OTP enviados registrados em: `CODIGOS_OTP_ENVIADOS.md` (histórico de debug)
- `TempUser` model usado durante cadastro OTP antes de confirmar email
