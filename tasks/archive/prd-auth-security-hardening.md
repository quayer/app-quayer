# PRD: Auth Security Hardening

## Introduction

Fortalecer a segurança do sistema de autenticação do Quayer com 4 melhorias incrementais: proteção CSRF nos formulários sensíveis, rate-limiting no envio de OTP via WhatsApp, cleanup automático de device sessions revogadas, e alertas de geolocalização por IP em logins suspeitos. Todas são melhorias sobre o auth existente (~3.800 linhas), sem substituir nenhum componente.

## Goals

- Prevenir ataques CSRF em mutations sensíveis (auth, delete, config)
- Impedir abuso do envio de OTP via WhatsApp (brute force / spam de mensagens)
- Manter a tabela `DeviceSession` limpa, removendo registros revogados após 30 dias
- Alertar sobre logins de localizações geográficas incomuns, com nível configurável por organização

---

## User Stories

### US-001: CSRF Token — Geração e validação server-side

**Description:** As a developer, I want to generate and validate CSRF tokens server-side so that mutations are protected against cross-site request forgery.

**Acceptance Criteria:**
- [ ] Criar utility `src/lib/auth/csrf.ts` com funções `generateCsrfToken()` e `validateCsrfToken(token)`
- [ ] Token gerado com `crypto.randomBytes(32).toString('hex')`
- [ ] Token armazenado em cookie httpOnly `csrf_token` (SameSite=Strict, Secure=true em prod)
- [ ] Validação compara header `X-CSRF-Token` com o cookie
- [ ] Token rotacionado a cada nova session (login/refresh)
- [ ] Typecheck passes (`npx tsc --noEmit`)

### US-002: CSRF Token — Procedure de validação no Igniter

**Description:** As a developer, I want a reusable Igniter procedure that validates CSRF tokens so that I can protect any mutation endpoint.

**Acceptance Criteria:**
- [ ] Criar `csrfProcedure()` em `src/server/features/auth/procedures/csrf.procedure.ts`
- [ ] Procedure extrai token do header `X-CSRF-Token` e compara com cookie
- [ ] Retorna `403 Forbidden` com mensagem clara se token inválido/ausente
- [ ] Procedure é composável com `authProcedure()` (pode usar ambos: `use: [authProcedure(), csrfProcedure()]`)
- [ ] Typecheck passes

### US-003: CSRF Token — Integração no client (React)

**Description:** As a user, I want my forms to work seamlessly with CSRF protection so that I don't notice any difference in the UX.

**Acceptance Criteria:**
- [ ] Hook `useCsrfToken()` em `src/client/hooks/use-csrf-token.ts` que lê o token do cookie e inclui no header das requests
- [ ] Configurar o client Igniter/TanStack Query para enviar `X-CSRF-Token` automaticamente em todas as mutations
- [ ] Endpoint `GET /api/v1/auth/csrf` retorna novo token (para SPA refresh)
- [ ] Forms de login, register, OTP, delete org, e settings continuam funcionando normalmente
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: CSRF — Aplicar nos endpoints sensíveis

**Description:** As a developer, I want CSRF validation applied to all sensitive mutation endpoints so that the app is protected.

**Acceptance Criteria:**
- [ ] `csrfProcedure()` adicionado nos seguintes controllers:
  - Auth: login, register, verify-otp, magic-link, change-password, delete-account
  - Admin: delete organization, update settings, revoke sessions
  - Config: update AI settings, update email settings, manage API keys
- [ ] Endpoints de leitura (queries) NÃO têm CSRF (apenas mutations)
- [ ] API keys externas (header `X-API-Key`) bypass CSRF (são stateless)
- [ ] Typecheck passes
- [ ] Testar manualmente: request sem CSRF token retorna 403

---

### US-005: Rate-limit no WhatsApp OTP — Backend

**Description:** As a developer, I want to rate-limit OTP sending via WhatsApp so that bad actors cannot spam phone numbers with messages.

**Acceptance Criteria:**
- [ ] Criar rate limiter em `src/lib/rate-limit/otp-rate-limit.ts`
- [ ] Limite por número de telefone: máximo 3 envios por 15 minutos
- [ ] Limite por IP do client: máximo 5 envios por hora
- [ ] Storage: Redis (chaves com TTL automático, pattern `otp:phone:{number}` e `otp:ip:{ip}`)
- [ ] Retornar `429 Too Many Requests` com header `Retry-After` (segundos restantes)
- [ ] Mensagem de erro user-friendly: "Muitas tentativas. Tente novamente em X minutos."
- [ ] Typecheck passes

### US-006: Rate-limit no WhatsApp OTP — Integração no auth controller

**Description:** As a developer, I want the rate limiter integrated in the OTP sending flow so that it blocks excessive requests before calling UAZAPI.

**Acceptance Criteria:**
- [ ] Rate-limit check executado ANTES de chamar `sendWhatsAppOTP()` em `auth.controller.ts`
- [ ] Se rate-limited, NÃO envia mensagem WhatsApp (economiza cota da UAZAPI)
- [ ] Log de warning quando rate-limit é atingido (incluir IP e phone para auditoria)
- [ ] Rate-limit NÃO se aplica a admins do sistema (role === 'admin')
- [ ] Typecheck passes

### US-007: Rate-limit no WhatsApp OTP — Feedback no frontend

**Description:** As a user, I want clear feedback when I've sent too many OTP requests so that I know to wait.

**Acceptance Criteria:**
- [ ] Form de OTP mostra mensagem de erro com countdown: "Tente novamente em X:XX"
- [ ] Botão "Reenviar código" desabilitado durante o cooldown
- [ ] Timer baseado no header `Retry-After` da resposta 429
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-008: Cleanup de DeviceSessions — BullMQ repeatable job

**Description:** As a developer, I want a scheduled job that cleans up old revoked device sessions so that the database stays lean.

**Acceptance Criteria:**
- [ ] Criar job `device-session-cleanup` registrado no BullMQ via Igniter jobs adapter
- [ ] Job roda como repeatable: a cada 24 horas (cron: `0 3 * * *` — 3am)
- [ ] Deleta registros de `DeviceSession` onde `isRevoked = true` AND `revokedAt < now() - 30 days`
- [ ] Deleta registros de `DeviceSession` onde `lastActiveAt < now() - 90 days` (sessions abandonadas)
- [ ] Log do total de registros deletados em cada execução
- [ ] Typecheck passes

### US-009: Cleanup de DeviceSessions — Registro e monitoramento

**Description:** As a developer, I want the cleanup job to be visible in the admin dashboard so that admins can verify it's running.

**Acceptance Criteria:**
- [ ] Job aparece na listagem de system info (`/admin/settings`)
- [ ] Mostrar: última execução, próxima execução, total deletados na última run
- [ ] Se job falhar, log de error com stack trace (sem retry infinito — max 3 retries)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-010: IP Geolocation — Serviço de lookup

**Description:** As a developer, I want an IP geolocation service so that I can determine the country of login requests.

**Acceptance Criteria:**
- [ ] Criar `src/lib/geocoding/ip-geolocation.ts`
- [ ] Usar API gratuita (ip-api.com ou ipinfo.io free tier — 1000 req/dia)
- [ ] Cache resultado no Redis por 24h (chave `geo:ip:{ip}`, evita re-lookup)
- [ ] Retornar: `{ country: string, countryCode: string, city?: string, region?: string }`
- [ ] Fallback gracioso: se API falhar, retornar `{ country: 'Unknown', countryCode: 'XX' }` (NÃO bloquear login)
- [ ] IPs privados (127.0.0.1, 10.x, 192.168.x) retornam `{ country: 'Local', countryCode: 'LO' }` sem API call
- [ ] Typecheck passes

### US-011: IP Geolocation — Configuração por organização

**Description:** As an admin, I want to configure how my organization responds to logins from unusual locations so that I can balance security with convenience.

**Acceptance Criteria:**
- [ ] Adicionar campo `geoAlertMode` no model `Organization` do Prisma:
  - `'off'` — sem verificação (default)
  - `'notify'` — apenas notifica admin no painel
  - `'email'` — notifica admin + envia email ao usuário
  - `'block'` — bloqueia login + notifica + exige OTP extra
- [ ] Migration Prisma gerada e aplicada
- [ ] UI de configuração em `/admin/settings` (Security section)
- [ ] Default para orgs existentes: `'off'` (não breaking)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-012: IP Geolocation — Detecção e resposta no login

**Description:** As a system, I want to detect when a user logs in from a new country and respond according to the org's configuration.

**Acceptance Criteria:**
- [ ] No login bem-sucedido, comparar país do IP atual com países dos últimos 5 `DeviceSession` do usuário
- [ ] Se país é novo (nunca visto antes para este usuário):
  - `geoAlertMode = 'off'`: nada acontece
  - `geoAlertMode = 'notify'`: criar `Notification` para admins da org com país/IP/timestamp
  - `geoAlertMode = 'email'`: notificar admins + enviar email ao usuário: "Novo login detectado de [País]"
  - `geoAlertMode = 'block'`: rejeitar login com `403`, mensagem: "Login bloqueado por política de segurança. Contate o administrador."
- [ ] Salvar `countryCode` no `DeviceSession` (novo campo) para referência futura
- [ ] NÃO bloquear se geolocation API falhar (fail-open, não fail-close)
- [ ] Typecheck passes

### US-013: IP Geolocation — Notificação e log de auditoria

**Description:** As an admin, I want to see geolocation alerts in my notification panel and audit log so that I can investigate suspicious activity.

**Acceptance Criteria:**
- [ ] Alertas de geolocation aparecem em `/admin/notificacoes` com badge "Segurança"
- [ ] Cada alerta mostra: usuário, email, IP, país, cidade (se disponível), timestamp
- [ ] Registro no audit log (`/admin/audit`) com action `LOGIN_GEO_ALERT`
- [ ] Admin pode marcar alerta como "revisado" (dismiss)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

## Functional Requirements

- **FR-1:** CSRF token gerado com `crypto.randomBytes(32)`, armazenado em cookie httpOnly SameSite=Strict
- **FR-2:** Header `X-CSRF-Token` obrigatório em todas as mutations sensíveis (auth, delete, config)
- **FR-3:** API keys externas fazem bypass do CSRF (autenticação stateless)
- **FR-4:** Rate-limit OTP por telefone: 3 envios / 15 min (Redis TTL)
- **FR-5:** Rate-limit OTP por IP: 5 envios / hora (Redis TTL)
- **FR-6:** Resposta 429 inclui header `Retry-After` com segundos restantes
- **FR-7:** Job BullMQ `device-session-cleanup` roda diariamente às 3am
- **FR-8:** DeviceSessions revogadas há mais de 30 dias são deletadas automaticamente
- **FR-9:** DeviceSessions inativas há mais de 90 dias são deletadas automaticamente
- **FR-10:** IP geolocation com cache Redis 24h e fallback gracioso
- **FR-11:** Campo `geoAlertMode` na Organization com 4 níveis: off, notify, email, block
- **FR-12:** Login de país novo comparado com histórico de DeviceSessions do usuário
- **FR-13:** Alertas de geolocation registrados em Notifications e AuditLog

## Non-Goals (Out of Scope)

- Não implementar WAF ou firewall de aplicação
- Não fazer fingerprinting de browser (além do User-Agent já capturado)
- Não implementar MFA completo (TOTP/authenticator app) — passkeys já cobrem esse papel
- Não fazer geofencing (bloquear países inteiros) — apenas alertar por login individual
- Não migrar para auth externo (Supabase Auth, Auth0, Appwrite) — fortalecer o existente
- Não implementar CAPTCHA (pode ser adição futura)
- Não alterar o fluxo de Passkeys ou Google OAuth (já são seguros)

## Technical Considerations

- **CSRF:** Compatível com Edge Runtime (middleware.ts não faz I/O, validação fica no API layer via procedure)
- **Rate-limit Redis:** Usar `INCR` + `EXPIRE` (atomic) para contadores, não `SETEX` (race condition)
- **BullMQ:** Já instalado e configurado (`@igniter-js/adapter-bullmq`), apenas subutilizado — registrar novo job no `REGISTERED_JOBS`
- **Geolocation API:** ip-api.com é gratuito para uso não-comercial (1000 req/dia). Para produção com volume, considerar MaxMind GeoLite2 (local, sem rate-limit)
- **Migration Prisma:** Adicionar `geoAlertMode` como `String @default("off")` e `countryCode` em `DeviceSession` como `String?`
- **Ordem de implementação:** CSRF → Rate-limit OTP → Cleanup jobs → Geolocation (cada bloco é independente)

## Success Metrics

- Zero ataques CSRF em mutations protegidas (verificável por audit log)
- Redução de 100% no spam de OTP WhatsApp (rate-limit impede envios excessivos)
- Tabela DeviceSession mantém no máximo ~90 dias de dados (redução de storage)
- Admins conseguem identificar logins suspeitos em < 1 minuto via notificações

## Open Questions

- Devemos usar ip-api.com (gratuito, hosted) ou MaxMind GeoLite2 (local DB, sem rate-limit) para geolocation em produção?
- O rate-limit de OTP deve ter um painel admin para ajustar os limites por organização, ou valores fixos globais são suficientes?
- Devemos adicionar um log de todas as tentativas de login (sucesso + falha) além do audit log existente?
