# Skill: Auth / Device Sessions

## Responsabilidade
Listagem e revogacao de sessoes de dispositivo do usuario autenticado.
As sessoes sao gravadas automaticamente em todo login via `registerDeviceSession` em `_shared/helpers.ts`.

## Actions (endpoints)

| Action | Method | Path | File |
|---|---|---|---|
| `list` | GET | `/api/v1/device-sessions/` | `list.routes.ts` |
| `revoke` | POST | `/api/v1/device-sessions/revoke` | `revoke.routes.ts` |
| `revokeAll` | POST | `/api/v1/device-sessions/revoke-all` | `revoke.routes.ts` |

## Arquivos do subdominio

- `device-sessions.controller.ts` — composer (~25 LoC, so agrega as routes)
- `list.routes.ts` — `list` (query GET)
- `revoke.routes.ts` — `revoke` + `revokeAll` (mutations POST)
- `device-sessions.skill.md` — este arquivo

## Helpers `_shared/` consumidos

| Helper | Usado em |
|---|---|
| `createAuditLog` | revoke.routes (revoke, revokeAll) |
| `registerDeviceSession` | NAO consumido aqui — chamado pelos login flows; cria as rows que este subdominio lista/revoga |

## Procedures aplicadas

| Procedure | Onde |
|---|---|
| `authProcedure({ required: true })` | todas as actions |
| `csrfProcedure()` | apenas mutations (revoke, revokeAll) |

## Tabela Prisma
`DeviceSession` — campos: `id, userId, deviceName, ipAddress, userAgent, location, countryCode, lastActiveAt, isRevoked, revokedAt, createdAt`.
Relacionada a `User` via `userId` (onDelete: Cascade).

## Contrato de resposta (envelope Igniter)

```ts
// GET /device-sessions/
{ data: DeviceSession[] }

// POST /device-sessions/revoke
{ data: { message: 'Device session revoked' | 'Already revoked' } }

// POST /device-sessions/revoke-all
{ data: { revokedCount: number } }

// Erros
{ error: string }  // status 401 (sem auth) | 404 (IDOR/not found)
```

## Garantias de seguranca

1. **IDOR-guard em `revoke`** — `findFirst({ where: { id, userId } })` antes do update. Se a sessao nao pertencer ao requester, retorna 404 generico (nao revela existencia).
2. **CSRF obrigatorio em mutations** — frontend deve usar `apiFetch` (injeta header CSRF), nao `fetch` cru.
3. **Idempotencia em `revoke`** — re-revogar uma sessao ja revogada retorna success sem side-effect.
4. **Audit log em todas as mutations** — `auth.device_session.revoke` e `auth.device_session.revoke_all`.

## Limitacao atual (importante)
A revogacao e UI-only: o JWT (`accessToken` cookie) continua valido ate a expiracao natural (~15min).
Para invalidacao imediata seria necessario:
1. Adicionar coluna `deviceSessionId` em `RefreshToken` (migration).
2. Atualizar `_shared/helpers.ts::registerDeviceSession` para retornar `id` e propaga-lo na criacao do `RefreshToken` em `_shared/finalize-login.ts`.
3. Aqui no `revoke`: revogar tambem o `RefreshToken` correspondente.

## Como mexer
1. Ler este arquivo + o route file do endpoint alvo.
2. Adicionar endpoint: criar novo `*.routes.ts` ou expandir existente, depois adicionar `...newRoutes` no controller composer.
3. NAO alterar `path` ou `name` do controller (contrato com frontend em `src/app/conta/conta-client.tsx`).
4. Rodar `npx tsc --noEmit && npx vitest run test/unit/auth/device-sessions.test.ts`.
5. NAO mexer em `_shared/helpers.ts::registerDeviceSession` — usado pelos login flows.

## Frontend consumidor
`src/app/conta/conta-client.tsx` (aba Seguranca) — usa `apiFetch` (CSRF auto).
