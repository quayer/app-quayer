# CUTOVER — Quayer → oRPC (projeto Caravela)

Data: 2026-07-21 · Branch: `spike/orpc-messages` · Base: `ab20ecc`

Commits do cutover (nesta ordem):

| Commit | Passo | Conteúdo |
|---|---|---|
| `ef34697` | 1 | Catch-all `/api/v1` roteando para o oRPC (exceto 4 SSE); mount de teste `/api/orpc` aposentado |
| `0d42539` | 2 | Client oRPC tipado (`src/orpc/client.ts` + contrato) e migração dos call-sites do front |
| (este) | 4 | Este relatório |

---

## 1. O que mudou

### Passo 1 — catch-all `/api/v1`

- **`src/app/api/v1/[[...all]]/route.ts`** — reescrito. Agora TODA a superfície
  `/api/v1/*` é servida pelo handler oRPC (`OpenAPIHandler`, prefixo `/api/v1`),
  EXCETO as 4 rotas SSE (abaixo), que continuam delegadas ao adapter Igniter
  (`nextRouteHandlerAdapter(AppRouter)`). O roteamento decide por
  método + pathname e repassa o `Request` CRU (body/headers intocados — o
  handler escolhido consome o stream original). O wrapper `withApiLogger`
  continua envolvendo os dois caminhos (paridade de logging).
- **`src/orpc/serve.ts`** (novo) — handler HTTP compartilhado (produção +
  testes), extraído do antigo mount de teste. Exporta `handleOrpcRequest`
  (usado pelo catch-all) e `GET/POST/PUT/PATCH/DELETE` (usados pelas suites
  `*.orpc.test.ts`, que agora exercitam o prefixo real `/api/v1`).
- **`src/app/api/orpc/[[...rest]]/route.ts`** — REMOVIDO (o caminho antigo
  `/api/orpc/*` responde 404 por ausência de rota — a opção simples).
- Rotas Next dedicadas fora do catch-all (`/api/v1/files/*`, webhooks,
  `/api/v1/calendar/connect/.../oauth/*`, `/api/v1/instances/share/*`,
  `/api/v1/knowledge/upload`, `/api/v1/canais/connect/*`) — INTOCADAS.

### As 4 rotas SSE que FICAM no Igniter (constante `SSE_ROUTES_IGNITER`)

Definidas em `src/app/api/v1/[[...all]]/route.ts` — TEMPORÁRIO até a fase 4
(porte dos streams; depois o Igniter é aposentado):

1. `GET  /api/v1/logs/stream` (logs-sse.controller)
2. `POST /api/v1/builder/projects/:id/playground/stream` (builder.playgroundStream)
3. `POST /api/v1/builder/projects/:id/chat/message` (builder.sendMessage)
4. `POST /api/v1/builder/projects/:id/cards/:cardKey/submit` (builder.submitCard — SSE no ACK conversational)

### Passo 2 — client do front

- **`src/orpc/client.ts`** (novo) — client tipado (`client` imperativo + `orpc`
  TanStack utils) via `OpenAPILink`. O runtime usa o **contrato minificado**
  `src/orpc/contract.json` (novo, comitado), gerado por
  **`npm run orpc:contract`** (`scripts/generate-orpc-contract.ts`, novo) —
  a tipagem vem de `import type` do router (apagada na compilação), então
  **zero código de servidor no bundle do browser**. Regenerar o contrato
  sempre que um `.route()` mudar nos `*.orpc.ts`.
- O client injeta `x-csrf-token` do cookie em toda request (o client Igniter
  não injetava; os fetch crus que já mandavam o header continuam iguais).
- Os **fetch crus (~29 call-sites)** NÃO mudaram — URLs e wire idênticos
  (envelope `{ data, error }` preservado byte a byte pelos handlers `ok()`).

#### Call-sites migrados (de `api.*` de `@/igniter.client` para o client oRPC)

| Arquivo | Actions |
|---|---|
| `src/client/components/auth/login-form-final.tsx` | auth.loginOTP, auth.loginOTPPhone, auth.googleAuth |
| `src/client/components/auth/login-otp-form.tsx` | auth.checkMagicLinkStatus (polling), auth.loginOTP (resend) |
| `src/client/components/auth/signup-form.tsx` | auth.signupOTP, auth.loginOTPPhone, auth.googleAuth |
| `src/client/components/auth/signup-otp-form.tsx` | auth.verifySignupOTP, auth.signupOTP (resend) |
| `src/client/components/home/home-page.tsx` | builder.createProject |
| `src/client/components/projetos/list/projetos-list.tsx` | builder.rename/duplicate/archive/unarchive/deleteProject |
| `src/client/components/projetos/workspace.tsx` | builder.getReadiness + os 5 lifecycle acima |
| `src/client/components/projetos/preview/tabs/deploy/summary-step.tsx` | builder.rollbackPrompt |
| `src/client/components/projetos/preview/tabs/prompt/version-history.tsx` | builder.listVersions, builder.rollbackPrompt |
| `src/client/components/projetos/preview/tabs/media/media-tab.tsx` | builder.listProjectMedia |
| `src/client/components/projetos/preview/tabs/media/media-grid.tsx` | builder.patchMediaAsset |
| `src/client/components/projetos/preview/tabs/overview/components/capabilities-helpers.tsx` | builder.getCapabilities |
| `src/client/components/projetos/preview/tabs/overview/components/metrics-card.tsx` | builder.getMetrics |
| `src/client/components/projetos/preview/tabs/advanced/use-integrations.ts` | builder.listProjectIntegrations, listTemplates, create/updateCredentials/test/activate/pause/resume/removeIntegration |
| `src/client/components/projetos/chat/cards/calendar/connect-link-flow.tsx` | builder.connectLink, builder.status (calendar) |
| `src/client/components/projetos/chat/cards/calendar-connect-card.tsx` | builder.eventsPreview |
| `src/client/components/projetos/chat/cards/handoff-card.tsx` | builder.listConnections |
| `src/client/components/projetos/chat/cards/whatsapp-connect-qr.tsx` | builder.provisionWhatsApp, builder.refreshQr |
| `src/app/(auth)/google-callback/google-callback-v2-client.tsx` | auth.googleCallback → `postV1` (`src/lib/api/v1-client.ts`, fetch cru com envelope) |
| `src/app/(auth)/login/verify-magic/LoginVerifyMagicClient.tsx` | auth.verifyMagicLink → `postV1` |

Nenhum arquivo importa mais `@/igniter.client`. `src/igniter.client.ts` e todo
o código Igniter **NÃO foram deletados** (aposentadoria só depois do cutover em
produção). O `IgniterProvider` segue montado em
`src/client/components/providers/app-providers.tsx` (inofensivo; sai na fase 4).

#### Call-sites que dependiam do shape de ERRO do Igniter (delta documentado)

O client Igniter resolvia `{ data, error }`; o client oRPC **LANÇA**
`ORPCError` (`.message`, `.code`, `.status`, `.data`). Corpos de erro no wire
têm shape oRPC (delta já aceito no gate). Ajustes feitos:

1. `login-form-final.tsx` — catches liam `e.error.details[0].message` /
   `e.error.message` → agora `orpcErrorMessage(err)` (helper em
   `src/orpc/client.ts`) + `translateAuthError`.
2. `signup-form.tsx` — idem (2 catches) + branch `apiError` do googleAuth
   movido para o catch.
3. `signup-otp-form.tsx` — catch lia `e.error.message` (inclusive aninhado) →
   `orpcErrorMessage` + `translateAuthError`.
4. `login-otp-form.tsx` — polling `if (apiError || !data) continue` → o erro
   agora cai no catch do poll, que já re-agenda (mesma semântica).
5. `home-page.tsx` — `"error" in err` + `String(err.error)` → `err.message`,
   e detecção de sessão expirada ampliada com `code === 'UNAUTHORIZED'`.
6. `projetos-list.tsx` — helper `errorMessage` mantinha branch `{ error }`;
   ORPCError é `instanceof Error`, então cai no primeiro branch (`.message`).
7. `media-grid.tsx` — delete inspecionava `res?.error != null` no corpo →
   agora `mutateAsync(...).catch()` (erro de API é rejeição da Promise).
8. `use-integrations.ts` — fallbacks REST lançavam `Error('mutation <status>')`;
   agora ORPCError com mensagem do handler (mais informativo; consumidores só
   exibem mensagem).

Hooks TanStack: `data` agora é o envelope de wire `{ data: P, error: null }`
(o client Igniter desembrulhava um nível) — leitores defensivos
(`readEnvelope`/`unwrap`/`unwrapReadiness`) absorveram; leitores diretos
ganharam um `.data` (`metrics-card`, `media-tab`, `version-history`,
`workspace.duplicate onSuccess`, `summary-step`/`version-history` rollback).

## 2. Resultado de build + suites (local, 2026-07-21)

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | **0 erros** (igual ao baseline pré-cutover) |
| `npm run build` (next build) | **OK** — compilou sem envs extras (tabela de rotas completa gerada) |
| `npx vitest run --config src/orpc/vitest.config.orpc.ts` | **197/197** (28 arquivos) |
| `npm run test:api` | **17/17** (3 arquivos) |
| E2E (`npm run test:e2e:smoke`) | **não rodado localmente** — o playwright.config exige servidor manual (`npm run dev`) com env real (DB/Redis); worktree só tem `.env.example`. Fica para o smoke em staging (checklist §4) |

## 3. ROLLBACK

Reverter os commits do cutover (ordem inversa), na branch `spike/orpc-messages`:

```bash
git revert <commit-deste-relatorio>   # passo 4 (opcional, só docs)
git revert 0d42539                    # passo 2 — front volta ao client Igniter
git revert ef34697                    # passo 1 — catch-all volta 100% Igniter
git push origin spike/orpc-messages
```

- Reverter SÓ o passo 2 (front) mantém o backend oRPC servindo `/api/v1` — o
  client Igniter continua funcionando por cima (wire preservado), exceto pelos
  shapes de corpo de ERRO (oRPC). Para rollback completo do wire de erro,
  reverter também `ef34697`.
- `ef34697` também moveu as suites de teste para `src/orpc/serve.ts`; o revert
  restaura o mount de teste `/api/orpc` junto.

## 4. Checklist — o que resta (humano)

- [ ] Deploy em **staging/homol** + smoke real: login (OTP email/phone, Google,
      magic link), criação de projeto, chat do builder (SSE sendMessage),
      playground stream, submit de card, `/api/v1/logs/stream`, curadoria de
      mídia, integrações, calendário, WhatsApp QR.
- [ ] Rodar `npm run test:e2e:smoke` contra homol (`--project=homol`).
- [ ] **Monitorar shape de erro no Sentry**: consumidores externos (API key) e
      qualquer código que ainda espere corpo `{ error: { message, details } }`
      do Igniter em respostas de erro — o corpo agora é
      `{ code, status, message, data }` (oRPC). Status HTTP preservados.
- [ ] Validar cookies/CSRF em produção real (o client oRPC agora injeta
      `x-csrf-token` — comportamento novo, esperado inofensivo).
- [ ] Depois de estável em produção: **fase 4** — portar os 4 SSE (remover
      `SSE_ROUTES_IGNITER`), aposentar Igniter (`src/igniter*.ts`,
      controllers `*.routes.ts` duplicados, `IgniterProvider`) e remover o
      envelope `ok()` numa passada única (decisão SPEC-CORE).
- [ ] Lembrar: `npm run orpc:contract` a cada mudança de rota nos `*.orpc.ts`
      (contrato comitado; sem regeneração o client browser fica defasado).
