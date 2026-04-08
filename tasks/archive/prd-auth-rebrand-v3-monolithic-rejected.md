# PRD: Auth Rebrand v3 + Cleanup + Pipeline de Testes Brutal

**Versão:** 1.0
**Data:** 2026-04-08
**Autor:** Gabriel (founder) + Claude Code
**Escopo:** Release focada — rebrand visual das páginas de autenticação, limpeza de código legado, reestrutura modular `.claude/`, pipeline de testes em 5 camadas × 3 ambientes.
**Branch sugerida:** `feat/auth-rebrand-v3`

---

## 1. Introduction / Overview

Esta release aplica a nova identidade visual **Quayer Design System v3** nas páginas de autenticação (`src/app/(auth)/*`), remove rotas duplicadas e legadas (passcode substituiu passwords), e estabelece um pipeline de testes robusto em 5 camadas que roda em localhost, homologação e produção — para que **toda nova release** possa ser validada end-to-end sem risco de regressão.

**Problema que resolve:**
- Páginas de auth atuais estão desalinhadas com a nova marca (logo, cores, tipografia)
- Existem rotas mortas no projeto (`/register`, `/forgot-password`, `/reset-password/[token]`, magic-link) que confundem e aumentam superfície de ataque
- Estrutura de skills `.claude/` não cobre as páginas de auth
- Não existe processo claro de validação por release em múltiplos ambientes
- Código de auth hoje não está modularizado de forma que permita trocar a UI sem impacto no backend

**Abordagem faseada:** nesta release **apenas `(auth)/*`** recebe o novo DS. Dashboard, admin e landing virão em releases subsequentes após validação do DS v3 em produção.

---

## 2. Goals

- Migrar 100% das páginas de `(auth)/*` para o DS v3 ([quayer-ds-v3.html](quayer-ds-v3.html))
- Adicionar imagem lateral em `/login` e `/signup` usando [imagem/Gemini_Generated_Image_ua01asua01asua01.png](imagem/Gemini_Generated_Image_ua01asua01asua01.png) (sem texto sobreposto)
- Remover rotas não utilizadas: `/register`, `/forgot-password`, `/reset-password/[token]`, `/login/verify-magic`, `/signup/verify-magic`
- Criar backup limpo via git (tag + branch `backup/auth-v2`) sem poluir repo com arquivos `.backup`
- Modularizar componentes de auth: 1 componente = 1 responsabilidade, trocáveis sem afetar lógica de backend
- Criar 3 skills novas em `.claude/skills/`: `auth-pages.md`, `testing-pipeline.md`, `release-checklist.md`
- Atualizar `CLAUDE.md` refletindo nova estrutura
- Documentar jornada completa do usuário em `docs/auth/USER_JOURNEY.md` e `docs/auth/AUTH_FLOW.md`
- Implementar pipeline de testes em 5 camadas rodando em local + homol + prod (prod = smoke read-only)
- Zero regressão no fluxo de auth atual (passcode OTP deve continuar funcionando)
- Code review obrigatório em cada PR desta release (via skill `code-reviewer`)

---

## 3. User Stories

### **FASE 0 — Preparação e backup**

#### US-001: Criar backup da versão atual via git
**Description:** Como dev, preciso preservar a versão atual de `(auth)/*` antes de refatorar, para poder voltar qualquer característica que queira reutilizar.

**Acceptance Criteria:**
- [ ] Branch `backup/auth-v2` criada a partir do HEAD atual de `ralph/auth-platform-hardening`
- [ ] Tag `pre-rebrand-v3` anotada apontando para o último commit antes do rebrand
- [ ] Branch e tag pushadas para origin
- [ ] Comando documentado em `docs/auth/BACKUP_RESTORE.md` mostrando como reverter arquivos específicos: `git checkout backup/auth-v2 -- src/app/\(auth\)/login/page.tsx`
- [ ] README do backup lista quais componentes do v2 têm valor de referência (ex: validações Zod, fluxo OTP)

#### US-002: Mover imagem oficial de login para `public/`
**Description:** Como dev, preciso que a imagem da marca esteja acessível pelo Next.js via `/images/auth/hero.png`.

**Acceptance Criteria:**
- [ ] Arquivo [imagem/Gemini_Generated_Image_ua01asua01asua01.png](imagem/Gemini_Generated_Image_ua01asua01asua01.png) copiado para `public/images/auth/login-hero.png`
- [ ] Criado `public/images/auth/login-hero.webp` otimizado (< 150KB) via sharp ou equivalente
- [ ] Metadados (largura/altura) documentados em `docs/auth/ASSETS.md`
- [ ] Pasta `imagem/` não é apagada (só copiada) — mantém fonte original

---

### **FASE 1 — Design System v3 como código**

#### US-003: Extrair tokens do DS v3 para CSS variables globais
**Description:** Como dev, preciso que as variáveis CSS do DS v3 estejam disponíveis em todo o app via `globals.css`, para poder aplicá-las nas páginas de auth.

**Acceptance Criteria:**
- [ ] Todos os tokens `--p-*` (primitivos) e `--color-*`, `--space-*`, `--radius-*`, `--text-*` do [quayer-ds-v3.html](quayer-ds-v3.html) copiados para `src/app/globals.css` dentro de `:root`
- [ ] Tokens do tema dark (atual) mantidos como default
- [ ] Fontes `DM Sans` e `DM Mono` importadas via `next/font/google` em `src/app/layout.tsx`
- [ ] Tailwind config estendido com os tokens semânticos: `bg-brand`, `text-primary`, `border-default` etc.
- [ ] Typecheck + lint passam
- [ ] Verify in browser using dev-browser skill (abrir qualquer página e inspecionar computed styles)

#### US-004: Criar componentes primitivos do DS v3
**Description:** Como dev, preciso de componentes React reutilizáveis alinhados ao DS v3 para montar as páginas de auth.

**Acceptance Criteria:**
- [ ] `src/client/components/ds/button.tsx` — variantes `primary | secondary | ghost`, estados `default | hover | disabled | loading`
- [ ] `src/client/components/ds/input.tsx` — com `:focus-visible`, label, helper text, erro
- [ ] `src/client/components/ds/otp-input.tsx` — 6 dígitos, auto-advance, paste handler
- [ ] `src/client/components/ds/logo.tsx` — SVG inline com gradient oficial `--gradient-icon`
- [ ] `src/client/components/ds/card.tsx` — surface elevated com border subtle
- [ ] `src/client/components/ds/toast.tsx` — com botão dismiss
- [ ] Todos componentes tipados, sem `any`
- [ ] Storybook ou página `/dev/ds-showcase` para inspeção visual (rota só em `NODE_ENV=development`)
- [ ] Unit tests (Vitest + RTL) para cada componente cobrindo estados principais
- [ ] Typecheck + lint passam
- [ ] Verify in browser using dev-browser skill

#### US-005: Criar layout compartilhado `AuthShell` com imagem lateral
**Description:** Como usuário, quero ver a imagem da marca ao lado do formulário de login para reforçar identidade visual.

**Acceptance Criteria:**
- [ ] `src/client/components/auth/auth-shell.tsx` aceita `children` (lado esquerdo = formulário)
- [ ] Lado direito exibe `/images/auth/login-hero.webp` via `next/image` com `fill` e `object-cover`
- [ ] **Sem texto algum sobreposto à imagem** (removido o texto "Sua inteligência artificial...")
- [ ] Em mobile (< 768px), imagem lateral some, formulário ocupa 100% da largura
- [ ] `src/app/(auth)/layout.tsx` atualizado para usar `AuthShell`
- [ ] Typecheck + lint passam
- [ ] Verify in browser using dev-browser skill em desktop (1440px) e mobile (375px)

---

### **FASE 2 — Limpeza de rotas legadas**

#### US-006: Auditar e confirmar rotas não utilizadas
**Description:** Como dev, antes de deletar rotas, preciso confirmar via grep + análise de middleware que não há referências vivas.

**Acceptance Criteria:**
- [ ] Relatório em `docs/auth/CLEANUP_AUDIT.md` listando para cada rota candidata:
  - `/register` — referências encontradas em: [lista de arquivos]
  - `/forgot-password` — idem
  - `/reset-password/[token]` — idem
  - `/login/verify-magic` — idem
  - `/signup/verify-magic` — idem
- [ ] Confirmação de que sistema atual usa apenas OTP passcode (sem password)
- [ ] Verificação no middleware.ts de que nenhuma dessas rotas está no matcher
- [ ] Verificação de que não há emails transacionais apontando para `/reset-password` ou `/verify-magic`
- [ ] Aprovação explícita do founder antes de prosseguir para US-007

#### US-007: Remover rotas legadas do projeto
**Description:** Como dev, preciso deletar fisicamente as pastas e arquivos de rotas confirmadas como mortas.

**Acceptance Criteria:**
- [ ] `src/app/(auth)/register/` deletada
- [ ] `src/app/(auth)/forgot-password/` deletada
- [ ] `src/app/(auth)/reset-password/` deletada (inclui `[token]`)
- [ ] `src/app/(auth)/login/verify-magic/` deletada (page + client component)
- [ ] `src/app/(auth)/signup/verify-magic/` deletada
- [ ] Componentes órfãos em `src/client/components/auth/` que só eram usados por essas rotas também removidos
- [ ] Endpoints de API relacionados (ex: `POST /api/v1/auth/forgot-password`) removidos do controller
- [ ] Redirects adicionados no `next.config.js`: `/register → /signup`, `/forgot-password → /login`
- [ ] `grep -r "forgot-password\|reset-password\|verify-magic\|/register"` retorna zero resultados no `src/`
- [ ] Typecheck + build passam
- [ ] Verify in browser using dev-browser skill (rotas antigas redirecionam corretamente)

---

### **FASE 3 — Refazer páginas de auth com DS v3**

#### US-008: Redesenhar `/login` com DS v3
**Description:** Como usuário, quero ver a tela de login com a nova identidade visual Quayer.

**Acceptance Criteria:**
- [ ] `src/app/(auth)/login/page.tsx` usa `AuthShell` + componentes DS
- [ ] Formulário: campo email + botão "Enviar código" (primary)
- [ ] Link "Não tem conta? Criar" aponta para `/signup`
- [ ] Logo Quayer v3 no topo do formulário
- [ ] Estados: idle, loading, error (com toast)
- [ ] Submissão chama `api.auth.requestOtp.mutate({ email })` (endpoint existente, sem mudança)
- [ ] Redireciona para `/login/verify?email=...` em caso de sucesso
- [ ] Typecheck + lint passam
- [ ] Verify in browser using dev-browser skill

#### US-009: Redesenhar `/login/verify` (OTP) com DS v3
**Description:** Como usuário, quero inserir o código OTP recebido por email na nova UI.

**Acceptance Criteria:**
- [ ] `src/app/(auth)/login/verify/page.tsx` usa `AuthShell` + `OtpInput`
- [ ] Campo OTP com 6 dígitos, auto-advance, paste detection
- [ ] Botão "Reenviar código" com cooldown de 60s (visível no UI)
- [ ] Link "Voltar" retorna para `/login`
- [ ] Mensagem de erro clara para OTP inválido/expirado
- [ ] Redireciona para `/` (dashboard) em sucesso, ou `/onboarding` se usuário novo
- [ ] Typecheck + lint passam
- [ ] Verify in browser using dev-browser skill

#### US-010: Redesenhar `/signup` com DS v3
**Description:** Como novo usuário, quero criar minha conta na nova UI.

**Acceptance Criteria:**
- [ ] `src/app/(auth)/signup/page.tsx` usa `AuthShell` + DS
- [ ] Formulário: email + nome + aceitar termos (checkbox)
- [ ] Validação Zod no client antes de submit
- [ ] Link "Já tem conta? Entrar" aponta para `/login`
- [ ] Submissão chama endpoint existente de signup (sem alteração backend)
- [ ] Redireciona para `/signup/verify?email=...`
- [ ] Typecheck + lint passam
- [ ] Verify in browser using dev-browser skill

#### US-011: Redesenhar `/signup/verify` (OTP) com DS v3
**Description:** Como novo usuário, quero confirmar meu email via OTP na nova UI.

**Acceptance Criteria:**
- [ ] `src/app/(auth)/signup/verify/page.tsx` usa `AuthShell` + `OtpInput`
- [ ] Mesmo padrão visual do `/login/verify`
- [ ] Em sucesso, redireciona para `/onboarding`
- [ ] Typecheck + lint passam
- [ ] Verify in browser using dev-browser skill

#### US-012: Redesenhar `/verify-email` com DS v3
**Description:** Como usuário, quero ver a tela de verificação de email (link clicado do email) no novo DS.

**Acceptance Criteria:**
- [ ] `src/app/(auth)/verify-email/page.tsx` usa `AuthShell` + DS
- [ ] Estados: loading, success, error (token inválido/expirado)
- [ ] Botão "Voltar ao login" em caso de erro
- [ ] Typecheck + lint passam
- [ ] Verify in browser using dev-browser skill

#### US-013: Redesenhar `/onboarding` com DS v3
**Description:** Como novo usuário, quero completar meu onboarding (criar organização) na nova UI.

**Acceptance Criteria:**
- [ ] `src/app/(auth)/onboarding/page.tsx` usa DS v3 (pode não usar `AuthShell` se for multi-step)
- [ ] Steps visuais claros (progress indicator do DS v3)
- [ ] Campos: nome da organização, slug, setor
- [ ] Submissão cria org e redireciona para `/`
- [ ] Typecheck + lint passam
- [ ] Verify in browser using dev-browser skill

#### US-014: Redesenhar `/google-callback` com DS v3
**Description:** Como usuário logando via Google, quero ver uma tela de loading consistente com o DS v3.

**Acceptance Criteria:**
- [ ] `src/app/(auth)/google-callback/page.tsx` exibe spinner + logo Quayer v3
- [ ] Mensagem "Conectando sua conta Google..."
- [ ] Em erro, exibe mensagem clara + botão "Tentar novamente"
- [ ] Typecheck + lint passam
- [ ] Verify in browser using dev-browser skill

---

### **FASE 4 — Skills e documentação `.claude/`**

#### US-015: Criar skill `auth-pages.md`
**Description:** Como Claude Code, preciso de uma skill dedicada às páginas de auth do frontend.

**Acceptance Criteria:**
- [ ] Arquivo `.claude/skills/auth-pages.md` criado
- [ ] Cobre: rotas ativas, componentes DS usados, fluxo OTP, convenções de naming, como adicionar novo step
- [ ] Separado do `auth.md` existente (que fica responsável pelo backend: JWT, sessions, procedures)
- [ ] Exemplos de código para: criar nova página de auth, adicionar novo campo, integrar com endpoint Igniter
- [ ] Referencia `docs/auth/USER_JOURNEY.md` e `docs/auth/AUTH_FLOW.md`

#### US-016: Criar skill `testing-pipeline.md`
**Description:** Como dev, preciso de uma skill que documente as 5 camadas de teste e quando usar cada uma.

**Acceptance Criteria:**
- [ ] Arquivo `.claude/skills/testing-pipeline.md` criado
- [ ] Cobre as 5 camadas: Static Analysis, Unit Backend, Unit React, API Integration, E2E
- [ ] Explica quando usar cada camada + comando para rodar
- [ ] Documenta ambientes: local, homol, prod (com limitações do prod = read-only)
- [ ] Exemplos de cada tipo de teste com código real do projeto
- [ ] Integra com skills existentes: `ui-visual-validator`, `accessibility-expert`, `performance-engineer`

#### US-017: Criar skill `release-checklist.md`
**Description:** Como dev, preciso de checklist obrigatório antes de qualquer release para evitar regressão.

**Acceptance Criteria:**
- [ ] Arquivo `.claude/skills/release-checklist.md` criado
- [ ] Checklist com: typecheck, lint, unit tests, API integration tests, E2E local, smoke homol, smoke prod, code review aprovado, changelog atualizado, backup tag criada
- [ ] Referencia comando `npm run test:all` que roda tudo
- [ ] Inclui critério de rollback: como reverter se smoke prod falhar

#### US-018: Reestruturar e atualizar `CLAUDE.md`
**Description:** Como Claude Code, preciso que `CLAUDE.md` reflita a nova estrutura modular.

**Acceptance Criteria:**
- [ ] Seção "Skills por Domínio" atualizada com as 3 skills novas
- [ ] Tabela de módulo → skill atualizada: `(auth)/*` → `auth-pages.md`
- [ ] Nova seção "Release Process" apontando para `release-checklist.md`
- [ ] Nova seção "Testing" apontando para `testing-pipeline.md`
- [ ] Remove referências a rotas deletadas (register, forgot-password etc)

#### US-019: Auditar e limpar skills legadas em `.claude/`
**Description:** Como dev, preciso remover skills/protocolos duplicados ou obsoletos.

**Acceptance Criteria:**
- [ ] Revisão de cada arquivo em `.claude/skills/` — lista em `docs/CLEANUP_SKILLS.md`
- [ ] Marcar como `KEEP`, `UPDATE` ou `DELETE`
- [ ] Executar deletions após aprovação do founder
- [ ] Validar que `auth.md` (backend) e `auth-pages.md` (frontend) não têm sobreposição

---

### **FASE 5 — Documentação de jornada e fluxo**

#### US-020: Documentar jornada completa do usuário
**Description:** Como PM/dev, preciso de diagrama claro da jornada de auth do usuário.

**Acceptance Criteria:**
- [ ] Arquivo `docs/auth/USER_JOURNEY.md` criado
- [ ] Cobre 4 jornadas principais:
  1. Novo usuário (signup → OTP → onboarding → dashboard)
  2. Usuário existente (login → OTP → dashboard)
  3. Google OAuth (login google → callback → dashboard)
  4. Usuário sem org ativa (login → seleção de org ou onboarding)
- [ ] Cada jornada tem fluxograma Mermaid
- [ ] Cada step lista: rota, componente, endpoint chamado, estados possíveis (loading/error/success), próxima tela

#### US-021: Documentar fluxo técnico de autenticação
**Description:** Como dev, preciso de documento explicando como auth funciona por baixo dos panos.

**Acceptance Criteria:**
- [ ] Arquivo `docs/auth/AUTH_FLOW.md` criado
- [ ] Cobre: geração de OTP, envio por email, validação, criação de session, JWT, cookie, middleware, refresh
- [ ] Diagrama sequencial (Mermaid sequenceDiagram) do fluxo OTP completo
- [ ] Lista de endpoints usados com payload esperado
- [ ] Seção "Troubleshooting" com problemas comuns

---

### **FASE 6 — Pipeline de testes brutal (5 camadas)**

#### US-022: Camada 1 — Static Analysis obrigatório
**Description:** Como dev, quero que TypeScript + ESLint rodem em pre-commit e CI para pegar erros antes de subir.

**Acceptance Criteria:**
- [ ] Script `npm run lint` cobre `src/` + `test/`
- [ ] Script `npm run typecheck` roda `tsc --noEmit`
- [ ] Husky pre-commit hook executando ambos nos arquivos staged (via lint-staged)
- [ ] GitHub Action `.github/workflows/static.yml` rodando em cada PR
- [ ] Falha em qualquer erro — zero warnings no código novo de auth

#### US-023: Camada 2 — Unit tests backend (Vitest)
**Description:** Como dev, quero testar lógica pura de auth sem subir servidor.

**Acceptance Criteria:**
- [ ] Vitest configurado em `vitest.config.ts` com path aliases
- [ ] Testes para: geração de OTP (`src/lib/auth/otp.ts`), validação JWT, procedure de auth
- [ ] Mínimo 5 testes cobrindo caminho feliz + 3 erros esperados
- [ ] Coverage > 80% nos arquivos `src/lib/auth/*`
- [ ] Script `npm run test:unit` dedicado
- [ ] Roda em CI

#### US-024: Camada 3 — Unit tests React (Vitest + RTL)
**Description:** Como dev, quero testar componentes DS e páginas de auth isoladamente.

**Acceptance Criteria:**
- [ ] `@testing-library/react` + `jsdom` configurados
- [ ] Testes para componentes DS criados em US-004 (button, input, otp-input)
- [ ] Testes para páginas: `/login` renderiza form, submit chama mutation, erro exibe toast
- [ ] Mock de `api.*` via MSW ou vitest mocks
- [ ] Script `npm run test:react` dedicado
- [ ] Roda em CI

#### US-025: Camada 4 — API Integration tests (Vitest + fetch real)
**Description:** Como dev, quero validar endpoints REST contra servidor rodando de verdade.

**Acceptance Criteria:**
- [ ] Setup em `test/api/` com helper que sobe servidor Next em porta de teste
- [ ] Testes para `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify`
- [ ] Usa banco de teste isolado (`DATABASE_URL` de teste) com seeds
- [ ] Cleanup automático entre testes
- [ ] Script `npm run test:api` dedicado
- [ ] Roda em CI com serviço Postgres do GitHub Actions

#### US-026: Camada 5 — E2E Playwright (fluxo real no browser)
**Description:** Como dev, quero validar a jornada completa de auth num browser real.

**Acceptance Criteria:**
- [ ] Playwright configurado em `playwright.config.ts` com 3 projects: `local`, `homol`, `prod`
- [ ] Testes E2E:
  - `test/e2e/auth/login-otp.spec.ts` — login completo com OTP interceptado
  - `test/e2e/auth/signup-flow.spec.ts` — signup → OTP → onboarding → dashboard
  - `test/e2e/auth/redirects.spec.ts` — `/register → /signup`, `/forgot-password → /login`
- [ ] OTP interceptado via Mailhog (local/homol) ou API de teste (prod = OTP fixo para conta de smoke)
- [ ] Screenshots + traces salvos em falha
- [ ] Script `npm run test:e2e` dedicado
- [ ] Roda em CI em paralelo (3 workers)

#### US-027: Testes em homologação e produção
**Description:** Como dev, quero que o pipeline rode smoke tests em homol e prod automaticamente após cada deploy.

**Acceptance Criteria:**
- [ ] GitHub Action `.github/workflows/smoke-homol.yml` disparada após deploy em homol
- [ ] GitHub Action `.github/workflows/smoke-prod.yml` disparada após deploy em prod
- [ ] Smoke prod é **read-only**: apenas navega, não submete formulários, não cria contas
- [ ] Smoke homol roda E2E completo usando conta de teste dedicada
- [ ] Falha no smoke prod dispara alerta (webhook Discord ou email)
- [ ] Documentado em `docs/auth/TESTING_ENVIRONMENTS.md`

#### US-028: Comando único `npm run test:all`
**Description:** Como dev, quero rodar todas as camadas com um comando antes de abrir PR.

**Acceptance Criteria:**
- [ ] Script `npm run test:all` no package.json executa em sequência: lint → typecheck → test:unit → test:react → test:api → test:e2e
- [ ] Em caso de falha, para imediatamente e reporta a camada que falhou
- [ ] Tempo total < 5 minutos em máquina padrão
- [ ] Documentado em `release-checklist.md`

---

### **FASE 7 — Code review e release**

#### US-029: Executar code review via skill `code-reviewer`
**Description:** Como dev, quero que o código da release passe por review estruturado antes de merge.

**Acceptance Criteria:**
- [ ] Invocar skill `code-reviewer` contra o diff da branch `feat/auth-rebrand-v3`
- [ ] Focar em: modularização (componentes 1 responsabilidade), sem `any`, Zod em inputs, sem regressão no backend
- [ ] Resolver todos os findings `critical` e `high`
- [ ] Documentar `medium`/`low` em issue separada se não forem resolvidos agora

#### US-030: Auditoria de acessibilidade WCAG AA
**Description:** Como usuário com deficiência, quero que as páginas de auth sejam acessíveis.

**Acceptance Criteria:**
- [ ] Invocar skill `accessibility-expert` contra `/login`, `/signup`, `/login/verify`
- [ ] Contraste AA em todos os elementos (DS v3 já garante isso por design, mas validar)
- [ ] Navegação por teclado funciona (Tab, Enter, Esc)
- [ ] Screen reader anuncia labels e erros corretamente
- [ ] Sem violações críticas reportadas pelo axe-core

#### US-031: Changelog e release notes
**Description:** Como dev, quero documentar o que mudou para comunicar ao time e usuários.

**Acceptance Criteria:**
- [ ] `CHANGELOG.md` atualizado com seção `[Unreleased] → Auth Rebrand v3`
- [ ] Lista: páginas atualizadas, rotas removidas, skills criadas, pipeline de testes
- [ ] Breaking changes destacados (redirects de rotas legadas)
- [ ] Screenshots before/after anexados no PR

---

## 4. Functional Requirements

- **FR-1:** Todas as páginas em `src/app/(auth)/*` devem usar exclusivamente componentes DS v3 e tokens CSS definidos em `globals.css`.
- **FR-2:** A imagem `/images/auth/login-hero.webp` deve aparecer no lado direito de `/login` e `/signup` em viewports ≥ 768px, sem qualquer texto sobreposto.
- **FR-3:** As rotas `/register`, `/forgot-password`, `/reset-password/[token]`, `/login/verify-magic`, `/signup/verify-magic` devem retornar redirect 308 para rotas válidas (`/signup`, `/login`).
- **FR-4:** O sistema deve expor `npm run test:all` que roda as 5 camadas de teste em sequência.
- **FR-5:** CI deve bloquear merge se qualquer camada de teste falhar.
- **FR-6:** Deploy em produção deve disparar smoke tests automaticamente; falha dispara alerta.
- **FR-7:** Branch `backup/auth-v2` e tag `pre-rebrand-v3` devem existir no repo remoto antes de qualquer deleção de código.
- **FR-8:** Nenhum componente de auth pode ter mais de 200 linhas (forçar modularização).
- **FR-9:** Nenhum arquivo novo pode conter `any` — TypeScript strict obrigatório.
- **FR-10:** Toda mutation de auth deve validar input com Zod no backend.
- **FR-11:** Skills `.claude/skills/auth-pages.md`, `testing-pipeline.md`, `release-checklist.md` devem existir e ser referenciadas em `CLAUDE.md`.
- **FR-12:** Documentação em `docs/auth/` deve conter: `USER_JOURNEY.md`, `AUTH_FLOW.md`, `BACKUP_RESTORE.md`, `CLEANUP_AUDIT.md`, `ASSETS.md`, `TESTING_ENVIRONMENTS.md`.

---

## 5. Non-Goals (Out of Scope)

- ❌ **Rebrand do dashboard / admin / landing** — fica para releases subsequentes após validação do DS v3 em produção (abordagem faseada).
- ❌ **Alteração no backend de auth** (procedures, JWT, sessions, endpoints) — apenas frontend muda. Os endpoints existentes devem continuar funcionando exatamente como hoje.
- ❌ **Migrar para NextAuth / outro provider** — continua usando o sistema OTP passcode atual do Quayer.
- ❌ **Adicionar novos providers OAuth** além do Google existente.
- ❌ **Reimplementar o fluxo de convites (invitations)** — fora do escopo desta release.
- ❌ **Internacionalização (i18n)** das páginas de auth — continua em pt-BR only.
- ❌ **Refatorar estrutura de pastas do `src/server/core/auth`** — backend fica intocado.
- ❌ **Testes de carga / stress testing** — apenas 5 camadas funcionais.
- ❌ **Monitoramento APM (Datadog, Sentry)** — fora do escopo (pode ser nova PRD).

---

## 6. Design Considerations

- **Fonte da verdade visual:** [quayer-ds-v3.html](quayer-ds-v3.html) no root do projeto. Qualquer dúvida sobre cor, espaçamento, tamanho, consultar esse arquivo.
- **Tipografia:** DM Sans (body) + DM Mono (código/OTP) — importar via `next/font/google`.
- **Tema:** Dark only (DS v3 declara `color-scheme: dark`). Tema claro fica para depois.
- **Modularização do `AuthShell`:** deve ser composável. Páginas que não precisam da imagem lateral (ex: onboarding multi-step) podem usar um layout alternativo.
- **Mobile first:** componentes DS devem funcionar em 375px mínimo. Imagem lateral esconde abaixo de 768px.
- **Accessibility:** usar `:focus-visible` (não `:focus`), sem `!important`, sem `pointer-events: none` em disabled (tooltip-safe). DS v3 já segue isso.
- **Preservar o que é bom do v2:** ao refazer, aproveitar validações Zod e handlers de OTP que já funcionam — copiar lógica, trocar UI.

---

## 7. Technical Considerations

- **Branch strategy:** `feat/auth-rebrand-v3` criada a partir de `main` (não de `ralph/auth-platform-hardening`, para evitar arrastar mudanças não relacionadas). Verificar com founder antes.
- **Commits atômicos:** 1 US = 1 commit no mínimo, para permitir revert cirúrgico.
- **Dependências novas:**
  - `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`
  - `jsdom` ou `happy-dom`
  - `msw` (opcional, para mocks de API em unit tests)
  - `sharp` (para otimizar imagem WebP — provavelmente já instalado via Next)
- **Ambientes:**
  - **Local:** `DATABASE_URL` local, Mailhog para OTP, servidor em `localhost:3000`
  - **Homol:** `quayer-homol.vercel.app` (ou equivalente), banco staging, emails reais mas para domínio de teste
  - **Prod:** `app.quayer.com` (ou real), smoke read-only usando conta dedicada `smoke@quayer.com` com OTP fixo para teste
- **Feature flag (opcional):** considerar `NEXT_PUBLIC_AUTH_V3=true` se houver dúvida de rollback rápido. Decisão: **não usar flag** — backup via git é suficiente (decidido pelo founder).
- **Impacto em SEO:** páginas de auth são `noindex`, redirects 308 preservam qualquer link externo.
- **Cuidado com middleware.ts:** mudanças em `matcher` precisam aprovação explícita (conforme CLAUDE.md).

---

## 8. Success Metrics

- ✅ **100% das páginas `(auth)/*` ativas** migradas para DS v3
- ✅ **Zero rotas mortas** — `grep` confirma limpeza completa
- ✅ **Pipeline completo** rodando em local, homol, prod com `npm run test:all` < 5 min
- ✅ **Zero regressão** — login/signup funciona igual ou melhor que antes
- ✅ **Acessibilidade WCAG AA** validada via axe-core (zero violações críticas)
- ✅ **3 skills novas** em `.claude/skills/` + `CLAUDE.md` atualizado
- ✅ **6 docs novas** em `docs/auth/` (USER_JOURNEY, AUTH_FLOW, BACKUP_RESTORE, CLEANUP_AUDIT, ASSETS, TESTING_ENVIRONMENTS)
- ✅ **Code review** com zero findings críticos não resolvidos
- ✅ **Smoke prod** passando após deploy
- ✅ **Tempo de carregamento** de `/login` ≤ página atual (validar com Lighthouse)

---

## 9. Open Questions

1. **Qual ambiente de homologação usar?** Precisamos confirmar URL e credenciais. Existe `quayer-homol`?
2. **Onde rodam os smoke tests em prod?** GitHub Actions tem acesso à prod ou precisamos de runner dedicado?
3. **Conta dedicada de smoke test** — founder pode criar `smoke@quayer.com` com OTP fixo ou precisamos mockar endpoint de OTP em prod para essa conta?
4. **O `/google-callback` ainda é usado?** Validar que Google OAuth está configurado e ativo antes de redesenhar (senão entra na fase de cleanup em vez de rebrand).
5. **Emails transacionais** — eles usam algum template que referencia rotas antigas? Precisamos atualizar templates também nesta release?
6. **Performance budget** — definir LCP/FCP max para `/login` (ex: LCP < 1.2s) como critério de smoke?
7. **Rollback plan** — se prod quebrar, qual é o SLA de revert? Manual via Vercel ou automação?
8. **Testes visuais de regressão** (screenshot diff) — vale incluir nesta release ou deixa pra próxima?

---

## Execution Order (resumo)

```
FASE 0: US-001, US-002                          [Backup + assets]
FASE 1: US-003, US-004, US-005                  [DS v3 infraestrutura]
FASE 2: US-006 → aprovação → US-007             [Cleanup de rotas]
FASE 3: US-008 → US-014                         [Redesign páginas]
FASE 4: US-015 → US-019                         [Skills .claude/]
FASE 5: US-020, US-021                          [Docs]
FASE 6: US-022 → US-028                         [Testing pipeline]
FASE 7: US-029, US-030, US-031                  [Review + release]
```

Cada fase deve fechar e ser commitada antes da próxima. Cada US vira 1 commit atômico com mensagem no formato `feat(auth): US-XXX descrição curta`.
