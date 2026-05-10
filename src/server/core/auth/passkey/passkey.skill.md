# Skill: Auth / Passkey / WebAuthn

## Responsabilidade
Registro e login via WebAuthn/Passkey com ramo conditional UI.

## Actions (endpoints)
passkeyRegisterOptions, passkeyRegisterVerify, passkeyList, passkeyDelete,
passkeyLoginOptions, passkeyLoginVerify,
passkeyConditionalChallenge, passkeyConditionalVerify

## Arquivos do subdomínio
- `passkey.controller.ts`   — composer (~25 LoC); não contém lógica de negócio
- `passkey.shared.ts`       — `getWebAuthnConfig()`, schemas Zod WebAuthn
- `register.routes.ts`      — registro de passkey (requer sessão + CSRF)
- `login.routes.ts`         — login com email explícito; usa `finalizeLogin` + `check2faAndIssueChallenge`
- `conditional.routes.ts`   — conditional UI (sem email); usa `finalizeLogin` + `check2faAndIssueChallenge`

## Shared helpers usados
- `_shared/finalize-login.ts`   → `finalizeLogin({ user, request, response, method, auditEvents })`
- `_shared/two-factor-gate.ts`  → `check2faAndIssueChallenge(user, request, method)`
- `_shared/issue-session.ts`    → emissão de JWT + cookies (via finalizeLogin)
- `_shared/helpers.ts`          → `createAuditLog`, `getClientIdentifier`, `registerDeviceSession`

## Tabelas Prisma
`PasskeyCredential`, `PasskeyChallenge`, `User`, `RefreshToken`, `DeviceSession`, `AuditLog`

## Invariantes
- rpID via env (`RP_ID`); falha em produção se ausente
- Challenge é single-use: deletado imediatamente após verificação
- `credentialId` deve ser único por usuário
- Passkey é apenas 1º fator; se `twoFactorEnabled`, emite `challengeId` antes da sessão

## Como mexer
1. Ler este arquivo + o arquivo de rota relevante.
2. Para lógica de sessão/audit, ver `_shared/finalize-login.ts`.
3. Para gate de 2FA, ver `_shared/two-factor-gate.ts`.
4. Não alterar action names, paths nem shape de response.
5. Rodar `npx tsc --noEmit` após qualquer mudança.
