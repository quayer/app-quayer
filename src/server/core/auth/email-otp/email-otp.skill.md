# Skill: Auth / Email OTP

## Responsabilidade
Fluxos baseados em codigo por email: verificacao de email, signup e login passwordless.

## Actions (endpoints)
| Action | Path | File |
|---|---|---|
| `verifyEmail` | POST /verify-email | `verify-email.routes.ts` |
| `signupOTP` | POST /signup-otp | `signup.routes.ts` |
| `verifySignupOTP` | POST /verify-signup-otp | `signup.routes.ts` |
| `loginOTP` | POST /login-otp | `login.routes.ts` |
| `verifyLoginOTP` | POST /verify-login-otp | `login.routes.ts` |

## Arquivos do subdomínio
- `email-otp.controller.ts` — composer (~33 LoC, so agrega as routes)
- `verify-email.routes.ts` — verifyEmail
- `signup.routes.ts` — signupOTP + verifySignupOTP
- `login.routes.ts` — loginOTP + verifyLoginOTP (inclui helper `sendSignupOtpForUnknownUser`)

## Helpers `_shared/` consumidos
| Helper | Usado em |
|---|---|
| `issueSession()` | verify-email.routes, signup.routes |
| `check2faAndIssueChallenge()` | login.routes (verifyLoginOTP) |
| `finalizeLogin()` | login.routes (verifyLoginOTP) |
| `getClientIdentifier`, `createAuditLog`, `autoJoinByVerifiedDomain` | todos os routes |
| `isProduction`, `appBaseUrl`, `dashboardUrl` | signup.routes, login.routes |

## Tabelas Prisma
User, TempUser, VerificationCode, RefreshToken, DeviceSession, VerifiedDomain (autoJoin)

## Como mexer
1. Ler este arquivo + o route file do endpoint alvo.
2. Nao tocar em `_shared/` sem motivo explicito — so consumir os helpers.
3. Para adicionar/alterar endpoint: editar o route file e atualizar `auth.schemas.ts`.
4. Rodar `npx tsc --noEmit` e `npx eslint src/server/core/auth/email-otp/`.
5. Nao alterar action names nem paths (contrato externo `api.auth.*`).
6. Nao alterar `email-otp.controller.ts` — so adicionar imports de novos route files.
