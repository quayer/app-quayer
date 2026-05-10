# Skill: Auth / TOTP (2FA)

## Responsabilidade
Gestao de dispositivos TOTP (Google Authenticator, Authy, etc.) e conclusao do
login em dois fatores. Divide-se em setup/consulta, desativacao e login.

## Actions (endpoints)
totpSetup, totpVerify, totpDevices, totpDisableRequest, totpDisable,
totpRegenerateCodes, twoFactorLoginVerify

## Arquivos do subdominio
- `totp.controller.ts`    — composer (~35 LoC), so importa os routes
- `setup.routes.ts`       — totpSetup + totpVerify + totpDevices
- `disable.routes.ts`     — totpDisableRequest + totpDisable + totpRegenerateCodes
- `login.routes.ts`       — twoFactorLoginVerify (emite sessao pos-2FA)
- `totp.helpers.ts`       — verifyTotpCode, replaceRecoveryCodes (internos)

## Tabelas Prisma
- `TotpDevice`            — secret criptografado, flag verified
- `RecoveryCode`          — codes hasheados, usedAt para single-use
- `VerificationCode`      — type=TOTP_DISABLE, TTL 15 min
- `RefreshToken`          — emitido pelo issueSession em login.routes

## Dependencias
- `_shared/issue-session` — issueSession(response, user, opts): emite JWT + cookies
- `_shared/helpers`       — getClientIdentifier, createAuditLog, registerDeviceSession,
                            verify2faChallenge, getChallengeAttempts,
                            incrementChallengeAttempts, clearChallengeAttempts, MAX_2FA_ATTEMPTS
- `procedures/auth`       — authProcedure (rotas de gestao exigem sessao ativa)
- `procedures/csrf`       — csrfProcedure (todas as mutations)
- `procedures/rate-limit` — rateLimitProcedure (IP-only; challengeId usa inline)
- `@/lib/auth/bcrypt`     — hashPassword, verifyPassword, generateRecoveryCodes
- `@/lib/crypto`          — encrypt/decrypt para o secret TOTP
- `@/lib/email`           — emailService para codigo de desativacao
- `otpauth`, `qrcode`     — geracao de TOTP e QR code

## Invariantes
- TOTP e segundo fator: twoFactorLoginVerify NAO exige sessao ativa (usa challenge JWT de 5 min)
- Recovery codes sao single-use: marcados com usedAt ao serem consumidos
- Challenge JWT expira em 5 min; Redis cap = MAX_2FA_ATTEMPTS (5) por challengeId
- Ao ativar 2FA (totpVerify), recovery codes sao gerados e retornados UMA UNICA VEZ
- Ao desativar (totpDisable), exige emailCode + totpCode simultaneamente
- issueSession garante tokenId no JWT igual ao id do RefreshToken no banco

## Como mexer
1. Ler este arquivo + `_shared/helpers.ts` + `_shared/issue-session.ts`.
2. Editar apenas os arquivos deste subdominio (setup/disable/login routes).
3. NAO alterar action names nem paths (clientes dependem dos nomes gerados).
4. NAO alterar shape de response (contrato publico).
5. Para adicionar rate-limit por IP: usar rateLimitProcedure em `use:[]`.
   Para rate-limit que dependa do body (ex.: challengeId), manter inline no handler.
6. Rodar `npx tsc --noEmit` e verificar saida zero antes de abrir PR.
