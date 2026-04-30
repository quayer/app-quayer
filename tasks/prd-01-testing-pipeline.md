# PRD 01: Testing Pipeline (5 Camadas × 3 Ambientes)

**Versão:** 1.0
**Data:** 2026-04-08
**Release:** 1 de 3 (ver [prd-auth-releases-index.md](prd-auth-releases-index.md))
**Branch:** `feat/testing-pipeline`
**Pré-requisitos bloqueantes:** PR-1, PR-2, PR-3, PR-4, PR-5 do índice

---

## 1. Introdução

Estabelecer uma rede de segurança de testes automatizados em 5 camadas, rodando em 3 ambientes (localhost, homologação, produção), **contra o código de auth ATUAL, sem qualquer mudança funcional**. Esta release é a fundação para as duas seguintes (cleanup e rebrand) — sem ela, não há como garantir ausência de regressão.

**O que NÃO muda:** nenhuma linha de código de auth, nenhuma rota, nenhum componente visual. Só adiciona ferramental de teste e CI.

---

## 2. Goals

- Pipeline de 5 camadas funcionando com **testes reais contra o auth atual**
- Baselines quantitativas de produção documentadas em `docs/auth/BASELINES.md`
- CI bloqueando merge em falha de qualquer camada
- Monitoramento sintético em produção (read-only, sem backdoor de auth)
- Skills `.claude/skills/testing-pipeline.md` e `release-checklist.md` criadas
- Tempo total de `npm run test:all` documentado (não forçado a < 5min — medir e aceitar o real)

---

## 3. User Stories

### US-101: Capturar baselines de produção (PR-5)
**Description:** Como engenheiro, preciso dos números atuais de performance e conversão para definir o critério objetivo de "não regrediu" nas próximas releases.

**Acceptance Criteria:**
- [ ] `docs/auth/BASELINES.md` criado com snapshot datado contendo:
  - p50/p95/p99 de TTFB e LCP para `/login`, `/signup`, `/login/verify`, `/signup/verify` (30 dias)
  - Taxa de conversão signup→onboarding completo (30 dias)
  - Taxa de sucesso de OTP (verificados/enviados, 30 dias)
  - Error rate de `/api/v1/auth/*` (30 dias)
  - Volume médio diário de requests em cada rota `(auth)/*`
- [ ] Fonte de cada número documentada (Vercel Analytics, SQL query, log aggregator)
- [ ] Queries SQL usadas salvas em `docs/auth/baseline-queries.sql`

### US-102: Vitest + TypeScript strict configurado
**Description:** Como dev, preciso de Vitest rodando com os path aliases do projeto e tipagem estrita.

**Acceptance Criteria:**
- [ ] `vitest.config.ts` na raiz com alias `@/` resolvendo para `src/`
- [ ] `test/` como diretório de testes (separado de `src/`)
- [ ] `npm run test:unit` executa Vitest sobre `test/unit/**/*.test.ts`
- [ ] TypeScript strict herdado de `tsconfig.json` (sem `any` nos testes)
- [ ] Configuração documentada em `docs/auth/TESTING_SETUP.md`

### US-103: Camada 1 — Static Analysis em pre-commit e CI
**Description:** Como dev, quero que typecheck + lint rodem automaticamente antes de commits irem para branch remota.

**Acceptance Criteria:**
- [ ] Husky + lint-staged configurados no `package.json`
- [ ] Pre-commit hook roda `tsc --noEmit` + `eslint` apenas nos arquivos staged
- [ ] GitHub Action `.github/workflows/static.yml` roda em cada PR: typecheck full + lint full
- [ ] Failure bloqueia merge (branch protection rule documentada em `docs/CI_RULES.md`)
- [ ] Tempo de execução medido e documentado

### US-104: Camada 2 — Unit tests backend (Vitest)
**Description:** Como dev, quero cobertura de testes unitários para a lógica pura de auth existente, sem tocar no código de produção.

**Acceptance Criteria:**
- [ ] Testes em `test/unit/auth/` cobrindo:
  - Geração e validação de OTP (`src/lib/auth/otp.ts` se existir, senão equivalente)
  - Assinatura e verificação de JWT
  - Procedure `authProcedure()` com mocks de context
  - Validação de schema Zod dos endpoints de auth
- [ ] **Coverage é medido, não forçado a um número arbitrário.** Documentar coverage atual em `docs/auth/COVERAGE.md` como baseline
- [ ] `npm run test:unit` executa só essa camada
- [ ] Roda em CI

### US-105: Camada 3 — Unit tests React (Vitest + Testing Library)
**Description:** Como dev, quero testar os componentes de auth atuais para ter baseline antes do rebrand.

**Acceptance Criteria:**
- [ ] `@testing-library/react` + `@testing-library/user-event` + `happy-dom` instalados
- [ ] Testes em `test/unit/react/auth/` cobrindo renderização e interações de:
  - `LoginOtpForm`
  - `SignupOtpForm`
  - `VerifyEmailForm`
  - `TwoFactorChallenge`
- [ ] Mocks de API via `vi.mock('@/igniter.client')` — padrão documentado em `docs/auth/TESTING_PATTERNS.md`
- [ ] `npm run test:react` executa só essa camada
- [ ] Roda em CI

### US-106: Camada 4 — API Integration (Vitest + fetch + banco de teste)
**Description:** Como dev, quero validar endpoints de auth contra um servidor Next real com banco isolado.

**Acceptance Criteria:**
- [ ] Docker Compose `compose.test.yml` sobe Postgres em porta dedicada
- [ ] Script `test/api/setup.ts` roda migrations e seeds antes de cada suite
- [ ] **Estratégia de isolamento:** cada teste dentro de transaction com rollback ao final (documentar em `docs/auth/TESTING_PATTERNS.md`)
- [ ] Seeds mínimos em `prisma/seeds/test/` — apenas dados necessários para auth funcionar (não o schema inteiro)
- [ ] Testes em `test/integration/auth/` cobrindo endpoints existentes:
  - `POST /api/v1/auth/otp/request`
  - `POST /api/v1/auth/otp/verify`
  - `POST /api/v1/auth/signup`
  - Fluxo Google OAuth (se ativo — validar primeiro)
- [ ] **Contract tests:** snapshot do payload de request/response de cada endpoint salvo em `test/integration/auth/__snapshots__/`. Quebra de contrato = teste falha
- [ ] `npm run test:api` executa só essa camada
- [ ] CI sobe serviço Postgres e roda essa camada

### US-107: Camada 5 — E2E Playwright
**Description:** Como dev, quero validar a jornada completa de auth num browser real contra os 3 ambientes.

**Acceptance Criteria:**
- [ ] Playwright instalado e configurado
- [ ] `playwright.config.ts` com 3 projects: `local`, `homol`, `prod` — cada um com `baseURL` distinta
- [ ] Testes em `test/e2e/auth/`:
  - `login-otp-happy-path.spec.ts` — login completo, OTP capturado via Mailhog (local/homol) ou API interna de teste (prod excluído desse teste)
  - `signup-flow.spec.ts` — idem para signup
  - `redirects.spec.ts` — validação dos redirects atuais do middleware
- [ ] Screenshots + traces salvos em artifacts do CI em caso de falha
- [ ] `npm run test:e2e` executa local por padrão
- [ ] `npm run test:e2e -- --project=homol` roda contra homol
- [ ] **`prod` NÃO roda E2E completo** — apenas smoke read-only (ver US-109)

### US-108: Contract tests frontend ↔ backend
**Description:** Como dev, quero garantir que mudanças no payload de endpoints quebrem testes, não o frontend em runtime.

**Acceptance Criteria:**
- [ ] Para cada endpoint usado pelo frontend de auth, existe um contract test que:
  1. Faz request real contra o servidor
  2. Valida response contra um schema Zod importado do mesmo lugar que o frontend usa
  3. Compara snapshot do shape (campo novo = warning, campo removido = erro)
- [ ] Documentado em `docs/auth/CONTRACT_TESTING.md`

### US-109: Monitoramento sintético em produção (decisão PR-2)
**Description:** Como dev, quero alertas quando produção tem comportamento anômalo no fluxo de auth, sem criar backdoor.

**Acceptance Criteria:**
- [ ] **Decisão registrada** entre as opções: Checkly | Datadog Synthetics | GitHub Actions cron | UptimeRobot
- [ ] Monitor sintético cobre apenas rotas públicas: `GET /login`, `GET /signup`, `GET /`, `GET /api/v1/health`
- [ ] Verifica: status 200, LCP < budget definido em US-101 × 1.2, presença de elementos-chave (logo, form)
- [ ] **NÃO** faz login real. **NÃO** usa credenciais. **NÃO** usa OTP fixo.
- [ ] Alerta via webhook (destino definido em PR-2) em 3 falhas consecutivas
- [ ] Documentado em `docs/auth/SYNTHETIC_MONITORING.md`
- [ ] Dashboard público ou link de status compartilhado com founder

### US-110: Script `npm run test:all` com tempo real medido
**Description:** Como dev, quero um único comando que roda todas as camadas e reporta o tempo real.

**Acceptance Criteria:**
- [ ] Script no `package.json`: `test:all` executa em sequência: lint → typecheck → test:unit → test:react → test:api → test:e2e
- [ ] Falha em qualquer camada interrompe execução e reporta qual falhou
- [ ] Tempo total de cada camada e total geral impresso ao final
- [ ] **Tempo real documentado em `docs/auth/TEST_TIMINGS.md`** — não há SLA arbitrário, só transparência
- [ ] Se tempo > 10min, documentar estratégia de paralelização em `docs/auth/TESTING_PERFORMANCE.md`

### US-111: Smoke em homologação após deploy
**Description:** Como dev, quero que cada deploy em homol dispare E2E full automaticamente.

**Acceptance Criteria:**
- [ ] GitHub Action `.github/workflows/smoke-homol.yml` disparada por `deployment_status` event em homol
- [ ] Executa `npm run test:e2e -- --project=homol`
- [ ] Usa conta de teste dedicada (credenciais em GitHub Secrets, documentar nome)
- [ ] Mailhog/serviço de email de teste configurado em homol (pré-requisito PR-1)
- [ ] Falha dispara notificação via webhook

### US-112: Smoke em produção após deploy (read-only)
**Description:** Como dev, quero validação automática pós-deploy em prod sem tocar em dados reais.

**Acceptance Criteria:**
- [ ] GitHub Action `.github/workflows/smoke-prod.yml` disparada por `deployment_status` event em prod
- [ ] Executa apenas o monitor sintético da US-109 uma vez + validação de headers de segurança
- [ ] **Não faz login, não submete forms, não cria contas**
- [ ] Falha em 2 runs consecutivos dispara alerta + registra incidente
- [ ] Documentado como primeiro passo do rollback plan (PR-3)

### US-113: Skill `testing-pipeline.md`
**Description:** Como Claude Code, preciso de skill documentando as 5 camadas e quando usar cada uma.

**Acceptance Criteria:**
- [ ] `.claude/skills/testing-pipeline.md` criada
- [ ] Seções: quando usar cada camada, comandos, padrões de mock, troubleshooting comum
- [ ] Exemplos com código real do projeto (não genérico)
- [ ] Referencia `docs/auth/TESTING_PATTERNS.md` e `docs/auth/TESTING_SETUP.md`

### US-114: Skill `release-checklist.md`
**Description:** Como dev, preciso de checklist obrigatório antes de qualquer release.

**Acceptance Criteria:**
- [ ] `.claude/skills/release-checklist.md` criada
- [ ] Checklist inclui: pipeline verde em CI, smoke homol passou, baselines comparadas, rollback plan validado, PR revisado por **humano** (não apenas LLM), changelog atualizado
- [ ] Gate de rollback documentado: critérios objetivos + responsável + comando
- [ ] Template de post-mortem em caso de rollback acionado

### US-115: Atualizar `CLAUDE.md` com seção Testing
**Description:** Como Claude Code, preciso que o CLAUDE.md referencie o novo pipeline.

**Acceptance Criteria:**
- [ ] Nova seção "Testing Pipeline" em `CLAUDE.md` com tabela de camadas + comandos
- [ ] Nova seção "Release Process" apontando para `release-checklist.md`
- [ ] Regra clara: "nenhuma release de auth sem rodar `npm run test:all` verde"

---

## 4. Functional Requirements

- **FR-1:** Testes são escritos contra o código **atual** de auth, sem refactor.
- **FR-2:** `npm run test:all` deve rodar localmente sem depender de serviços externos além de Docker (para Postgres de teste).
- **FR-3:** CI deve bloquear merge em PRs que quebrarem qualquer camada existente (branch protection obrigatória).
- **FR-4:** Monitor sintético em produção **nunca** deve submeter formulários, fazer login real, ou possuir credenciais que dêem acesso a dados de usuários.
- **FR-5:** Contract tests devem detectar mudanças no payload de endpoints antes do deploy.
- **FR-6:** Baselines de produção (US-101) devem ser capturadas **antes** de US-102 começar — são pré-requisito para definir critério de sucesso.

---

## 5. Non-Goals

- ❌ Não reescreve, refatora ou "melhora" o código de auth atual. Só adiciona testes.
- ❌ Não cria conta de smoke com OTP fixo em prod (segurança).
- ❌ Não define SLA de tempo para `test:all` — mede e documenta o real.
- ❌ Não define coverage mínimo arbitrário — mede e documenta baseline, metas vêm depois com contexto.
- ❌ Não toca em feature flags — Release 3 que introduz.
- ❌ Não remove rotas legadas — Release 2.
- ❌ Não muda visual — Release 3.

---

## 6. Technical Considerations

- **Banco de teste:** Postgres em Docker com schema idêntico ao prod, seeds mínimos. Transaction rollback por teste.
- **Mailhog:** container local para interceptar OTPs em testes E2E local e homol.
- **Playwright em CI:** usar `playwright-action` oficial, cache de browsers.
- **Branch strategy:** `feat/testing-pipeline` criada a partir de `main` **ou** da branch resolvida em PR-4. Decisão antes de começar.
- **GitHub Secrets necessários:** `HOMOL_BASE_URL`, `HOMOL_TEST_EMAIL`, `HOMOL_TEST_PASSWORD`, `SYNTHETIC_WEBHOOK_URL`.
- **Timing realista:** não fingir 5 min. Medir honesto. Otimizar se doer.

---

## 7. Success Metrics

- ✅ Os 3 ambientes (local, homol, prod) têm cobertura de teste ativa e alertas funcionando
- ✅ Baselines documentadas e versionadas (snapshot datado)
- ✅ Pipeline verde em CI em merge para `main`
- ✅ Pelo menos 1 regressão hipotética detectada em review (ex: remover campo de response de endpoint quebra contract test)
- ✅ Contract tests cobrem 100% dos endpoints `/api/v1/auth/*` usados pelo frontend
- ✅ Smoke prod rodando em cada deploy, zero falsos positivos em 1 semana de observação

---

## 8. Open Questions

Todas movidas para o índice como PR-1 até PR-5. **Nenhuma open question pode ficar pendurada nesta release** — são bloqueantes.

---

## Definition of Done

- [ ] Todas as US de 101 a 115 concluídas
- [ ] `npm run test:all` roda verde localmente
- [ ] CI roda verde em uma PR de teste
- [ ] Baselines publicadas
- [ ] Skills criadas e `CLAUDE.md` atualizado
- [ ] Review humano aprovou o PR
- [ ] Merge em `main`
- [ ] Smoke prod rodou com sucesso pós-merge
