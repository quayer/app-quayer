# Skill: Auth / procedures

## Responsabilidade
Procedures Igniter.js reutilizáveis em `use: [...]` nos handlers de auth (e em qualquer outro módulo que importar).

## Arquivos
- `auth.procedure.ts` — `authProcedure({ required? })`, `adminProcedure()`. Valida JWT do cookie/header e injeta `ctx.auth.session.user`.
- `api-key.procedure.ts` — autenticação via API key (X-API-Key header). Para integrações server-to-server.
- `csrf.procedure.ts` — `csrfProcedure()`. Valida double-submit CSRF token em mutations sensíveis.
- `turnstile.procedure.ts` — `turnstileProcedure()`. Valida Cloudflare Turnstile no body (`cf-turnstile-response`).
- `rate-limit.procedure.ts` — `rateLimitProcedure({ limiter, prefix?, identifierFn? })`. Bloqueia com 429 se limiter exceder.

## Composição típica
```ts
use: [
  rateLimitProcedure({ limiter: authRateLimiter }),
  turnstileProcedure(),
  csrfProcedure(),
  authProcedure({ required: true }),
]
```

## Invariantes
- Procedures retornam `Response` para abortar (status 401/403/429) ou objeto para estender contexto
- `rateLimitProcedure` falha closed em produção (`failClosedInProduction: true` no limiter)
- `turnstileProcedure` falha open se `TURNSTILE_SECRET_KEY` ausente (dev)

## Como mexer
1. Procedures ficam neste diretório, controllers consomem com `use: [...]`.
2. Para procedure stateful (com options), crie factory que retorna `igniter.procedure(...)`.
3. Validar com `npx tsc --noEmit -p tsconfig.json`.
