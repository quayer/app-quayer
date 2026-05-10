# Skill: Auth / _shared

## Responsabilidade
Helpers reutilizáveis entre os 8 subdomínios de auth: emissão de sessão, gate de 2FA, fluxo de finalização de login, e utilities (cookies, audit, device session, geo, auto-join por domínio).

## Arquivos
- `_shared/helpers.ts` — getClientIdentifier, createAuditLog, setAuthCookies, clearAuthCookies, sign2faChallenge, verify2faChallenge, registerDeviceSession, parseDeviceName, autoJoinByVerifiedDomain, challenge attempts (Redis)
- `_shared/issue-session.ts` — `issueSession(response, user, opts)`: cria access+refresh JWT, persiste refresh com tokenId correto, seta cookies
- `_shared/two-factor-gate.ts` — `check2faAndIssueChallenge(user, request, method)`: se 2FA ativo retorna challenge JSON; senão `null` (caller segue)
- `_shared/finalize-login.ts` — `finalizeLogin({ user, request, response, method, auditEvents })`: combina `registerDeviceSession + issueSession + createAuditLog(s)` em uma chamada
- `_shared/signup-gate.ts` — `isSignupEnabled()` + mensagem padrão

## Quando usar cada um
- Login pós-1º-fator-validado-sem-2FA: `finalizeLogin`
- Login com 2FA possível: `check2faAndIssueChallenge` → se null, `finalizeLogin`
- Signup (novo user + org): `issueSession` + audit logs manuais (ordem importa)
- Verify de magic link / email (só seta accessToken, sem refresh persistido): usar `signAccessToken + setAuthCookies` direto

## Invariantes
- accessToken: httpOnly, Path=/, Max-Age=900 (15min)
- refreshToken: httpOnly, Path=/api/v1/auth/refresh, Max-Age=604800 (7d), sameSite=strict
- 2FA challenge JWT: 5 minutos
- `registerDeviceSession` pode retornar `{ blocked: true }` por política `geoAlertMode=block` da org

## Como mexer
1. Leia este arquivo + os 4 helpers (~70 LoC cada).
2. Para mudar o cookie behavior, edite `setAuthCookies` em `helpers.ts` (afeta todos os subdomínios).
3. Para mudar a duração de refresh token, ajuste `issueSession.ts` (default 7d).
4. Não exponha esses helpers fora de `core/auth/`.
5. Validar com `npx tsc --noEmit -p tsconfig.json`.
