# PRD 03: Auth Rebrand v3 (DS v3 + Feature Flag)

**Versão:** 1.0
**Data:** 2026-04-08
**Release:** 3 de 3 (ver [prd-auth-releases-index.md](prd-auth-releases-index.md))
**Branch:** `feat/auth-rebrand-v3`
**Pré-requisitos:**
- Release 1 (testing pipeline) em produção
- Release 2 (cleanup) em produção
- Baselines atualizadas após Release 2

---

## 1. Introdução

Aplicar a nova identidade visual [quayer-ds-v3.html](../quayer-ds-v3.html) nas páginas de autenticação restantes (pós-cleanup), usando feature flag `NEXT_PUBLIC_AUTH_V3` para rollout gradual e rollback instantâneo. O escopo é **apenas `src/app/(auth)/*`** — dashboard, admin e landing ficam para futuras releases.

**Princípios:**
- Feature flag obrigatória (não git backup)
- Rollout gradual por % de usuários
- Critério objetivo de rollback baseado nas baselines
- Zero mudança no backend de auth

---

## 2. Goals

- Componentes do DS v3 criados como biblioteca reutilizável (`src/client/components/ds/`)
- Páginas de `(auth)/*` renderizam v2 OU v3 baseado em flag
- Imagem lateral sem texto em `/login` e `/signup`
- Rollout: 0% → 10% → 50% → 100% com validação em cada etapa
- Documentação de jornada do usuário e fluxo técnico
- Auditoria de acessibilidade WCAG AA aprovada
- Métricas pós-rollout comparadas às baselines da Release 1

---

## 3. User Stories

### **FASE A — Infraestrutura do DS v3**

#### US-301: Feature flag `NEXT_PUBLIC_AUTH_V3`
**Description:** Como dev, preciso de um mecanismo para alternar entre v2 e v3 sem redeploy.

**Acceptance Criteria:**
- [ ] Flag `NEXT_PUBLIC_AUTH_V3` definida com valores: `off` | `percentage:N` | `on`
- [ ] Helper `isAuthV3Enabled(userId?: string)` em `src/lib/feature-flags/auth-v3.ts`
  - `off` → sempre false
  - `percentage:N` → hash determinístico do userId (ou cookieId para anônimos) % 100 < N
  - `on` → sempre true
- [ ] Cookie `auth-v3-override` permite QA forçar v3 em suas sessões
- [ ] Unit tests validando distribuição do hash (N=10 deve dar ~10% em amostra grande)
- [ ] Documentado em `docs/auth/FEATURE_FLAGS.md`

#### US-302: Mover imagem oficial para public
**Description:** Imagem da marca precisa estar acessível via Next.js.

**Acceptance Criteria:**
- [ ] `imagem/Gemini_Generated_Image_ua01asua01asua01.png` copiada para `public/images/auth/login-hero.png`
- [ ] Versão WebP otimizada (< 150KB) em `public/images/auth/login-hero.webp`
- [ ] Metadados (dimensões, LQIP blur placeholder) documentados em `docs/auth/ASSETS.md`
- [ ] Pasta `imagem/` preservada

#### US-303: Extrair tokens do DS v3 para CSS + Tailwind
**Description:** Tokens do design system disponíveis globalmente.

**Acceptance Criteria:**
- [ ] Tokens `--p-*`, `--color-*`, `--space-*`, `--radius-*`, `--text-*` de [quayer-ds-v3.html](../quayer-ds-v3.html) copiados para `src/app/globals.css`
- [ ] **Escopo condicional:** aplicados apenas quando `<html data-auth-v3="true">` — layout de auth seta esse atributo baseado na flag
- [ ] `tailwind.config.ts` estendido com os tokens semânticos
- [ ] Fontes `DM Sans` + `DM Mono` via `next/font/google` importadas só no layout de auth (não global)
- [ ] Typecheck + lint passam
- [ ] Verify in browser using dev-browser skill

#### US-304: Componentes DS v3 primitivos
**Description:** Biblioteca de componentes base.

**Acceptance Criteria:**
- [ ] `src/client/components/ds/` criado com:
  - `button.tsx` (variants: primary/secondary/ghost, states: default/hover/disabled/loading)
  - `input.tsx` (label, helper, error, `:focus-visible`)
  - `otp-input.tsx` (6 dígitos, auto-advance, paste)
  - `logo.tsx` (SVG inline com gradient `--gradient-icon`)
  - `card.tsx`
  - `toast.tsx` (com dismiss)
- [ ] Cada componente tem **unit test React** (Release 1, US-105 padrão)
- [ ] Storybook **OU** rota `/dev/ds-showcase` — decisão registrada, escolher **Storybook** se o projeto já tiver suporte; senão rota dev
- [ ] Tipagem estrita, zero `any`
- [ ] Typecheck + lint passam
- [ ] Verify in browser using dev-browser skill

#### US-305: `AuthShell` com imagem lateral
**Description:** Layout compartilhado que inclui imagem à direita.

**Acceptance Criteria:**
- [ ] `src/client/components/auth/auth-shell.tsx` criado, renderiza children (form) à esquerda
- [ ] Lado direito: `next/image` com `fill` + `object-cover` apontando para `/images/auth/login-hero.webp`
- [ ] **Zero texto sobre imagem** (nada do "Sua inteligência artificial...")
- [ ] Responsivo: imagem some em `< 768px`
- [ ] Renderizado apenas quando flag v3 ativa; senão usa layout v2 atual
- [ ] Test React cobrindo render com e sem imagem
- [ ] Verify in browser using dev-browser skill (1440px e 375px)

### **FASE B — Páginas v3 (atrás da flag)**

#### US-306: `/login` v3
**Description:** Tela de login com DS v3, renderizada quando flag ativa.

**Acceptance Criteria:**
- [ ] `src/app/(auth)/login/page.tsx` verifica `isAuthV3Enabled()` no server component
- [ ] Se ativo: renderiza novo componente `<LoginFormV3 />` dentro de `<AuthShell />`
- [ ] Se inativo: renderiza código atual sem mudança
- [ ] Form chama os **mesmos endpoints** que v2 (`api.auth.requestOtp.mutate`)
- [ ] Contract test (Release 1) garante que payload não mudou
- [ ] Unit test React do `LoginFormV3`
- [ ] Integration test do fluxo completo com flag forçada
- [ ] Typecheck + lint + `test:all` verdes
- [ ] Verify in browser using dev-browser skill

#### US-307: `/login/verify` v3
**Acceptance Criteria:**
- [ ] Mesmo padrão de dual-render (flag)
- [ ] Usa `OtpInput` do DS
- [ ] Cooldown de reenvio visível (60s)
- [ ] Endpoints inalterados, contract test garante
- [ ] Tests + verify browser

#### US-308: `/signup` v3
**Acceptance Criteria:**
- [ ] Dual-render por flag
- [ ] Form com email + nome + checkbox de termos (Zod no client)
- [ ] Endpoints inalterados
- [ ] Tests + verify browser

#### US-309: `/signup/verify` v3
**Acceptance Criteria:**
- [ ] Dual-render por flag, padrão idêntico ao `/login/verify`
- [ ] Tests + verify browser

#### US-310: `/verify-email` v3
**Acceptance Criteria:**
- [ ] Dual-render por flag
- [ ] Estados: loading/success/error
- [ ] Tests + verify browser

#### US-311: `/onboarding` v3
**Acceptance Criteria:**
- [ ] Dual-render por flag
- [ ] Multi-step com progress indicator do DS
- [ ] Endpoints inalterados
- [ ] Tests + verify browser

#### US-312: `/google-callback` v3 (se ainda em uso)
**Description:** Validar primeiro se Google OAuth está ativo antes de investir em redesign.

**Acceptance Criteria:**
- [ ] Auditoria preliminar: Google OAuth está ativo em prod? Há logs de uso?
- [ ] **Se sim:** dual-render com spinner + logo v3
- [ ] **Se não:** mover para Release 2 (cleanup) em vez de redesign

### **FASE C — Documentação**

#### US-313: `docs/auth/USER_JOURNEY.md`
**Acceptance Criteria:**
- [ ] 4 jornadas documentadas com Mermaid (novo usuário, existente, Google, sem org ativa)
- [ ] Cada step: rota, componente, endpoint, estados, próxima tela
- [ ] Reflete o estado pós-cleanup (Release 2)

#### US-314: `docs/auth/AUTH_FLOW.md`
**Acceptance Criteria:**
- [ ] Fluxo técnico: OTP lifecycle, JWT, session, middleware, refresh
- [ ] Diagrama sequencial Mermaid
- [ ] Lista de endpoints com payloads
- [ ] Seção troubleshooting

#### US-315: Skill `.claude/skills/auth-pages.md`
**Acceptance Criteria:**
- [ ] Separado de `auth.md` (backend)
- [ ] Cobre rotas ativas, componentes DS, como adicionar nova página
- [ ] Referencia USER_JOURNEY, AUTH_FLOW, ASSETS
- [ ] Exemplos de código real

### **FASE D — Qualidade antes do rollout**

#### US-316: Auditoria WCAG AA
**Description:** Garantir acessibilidade antes de mostrar a usuários reais.

**Acceptance Criteria:**
- [ ] Invocar skill `accessibility-expert` sobre todas as páginas v3 com flag forçada
- [ ] Rodar `axe-core` em CI (adicionar ao `test:e2e`)
- [ ] **Critério de aprovação:** zero violações `critical` ou `serious` do axe-core
- [ ] Navegação por teclado testada manualmente (Tab, Enter, Esc, setas no OTP)
- [ ] Screen reader (NVDA/VoiceOver) anuncia labels e erros corretamente
- [ ] Relatório salvo em `docs/auth/A11Y_AUDIT.md`

#### US-317: Performance check contra baselines
**Description:** Comparar v3 com baseline da Release 1 antes do rollout.

**Acceptance Criteria:**
- [ ] Lighthouse rodado em homol (flag on) para `/login`, `/signup`, `/login/verify`
- [ ] Comparação com `docs/auth/BASELINES.md`:
  - LCP v3 ≤ baseline × 1.1 (10% de tolerância)
  - TTFB v3 ≤ baseline × 1.1
  - CLS v3 ≤ 0.1
- [ ] Se falhar: otimizar (image priority, fontes, code splitting) antes de prosseguir
- [ ] Resultado documentado em `docs/auth/V3_PERFORMANCE.md`

#### US-318: Code review humano
**Description:** Review obrigatório por humano antes do rollout.

**Acceptance Criteria:**
- [ ] PR revisada por **pelo menos 1 humano** (não apenas skill LLM)
- [ ] Skill `code-reviewer` pode ser usada como apoio, não substituto
- [ ] Findings `critical`/`high` resolvidos
- [ ] `medium`/`low` viram issues separadas
- [ ] Aprovação registrada no PR

### **FASE E — Rollout gradual**

#### US-319: Rollout 0% → 10%
**Description:** Primeira exposição a usuários reais.

**Acceptance Criteria:**
- [ ] Merge com flag em `off` (default)
- [ ] Deploy em prod, smoke prod verde
- [ ] Flag ajustada para `percentage:10`
- [ ] **Janela de observação: 48h**
- [ ] Métricas monitoradas vs baseline:
  - Taxa de conversão login (OTP solicitado → verificado)
  - Taxa de conversão signup
  - Error rate em `/api/v1/auth/*`
  - LCP p95
- [ ] Critério de rollback: qualquer métrica piora > 10% vs baseline → flag volta para `off` imediatamente

#### US-320: Rollout 10% → 50%
**Acceptance Criteria:**
- [ ] Só prosseguir se US-319 passou nos 48h sem alertas
- [ ] Flag ajustada para `percentage:50`
- [ ] Janela de observação: 48h
- [ ] Mesmo critério de rollback

#### US-321: Rollout 50% → 100%
**Acceptance Criteria:**
- [ ] Só prosseguir se US-320 passou
- [ ] Flag ajustada para `on`
- [ ] Janela de observação: 7 dias
- [ ] Baselines atualizadas em `docs/auth/BASELINES.md` com snapshot pós-v3

#### US-322: Remoção do código v2 (após 30 dias de 100%)
**Description:** Após v3 estável em prod por 30 dias, remover o dual-render.

**Acceptance Criteria:**
- [ ] 30 dias corridos de flag `on` sem rollback ou incidentes
- [ ] Aprovação explícita do founder
- [ ] Deletar branches de render v2 das páginas
- [ ] Deletar componentes v2 não mais referenciados
- [ ] Remover flag `NEXT_PUBLIC_AUTH_V3` do codebase
- [ ] Pipeline verde
- [ ] Changelog atualizado

---

## 4. Functional Requirements

- **FR-1:** Toda página de auth deve suportar dual-render v2/v3 durante o período de transição.
- **FR-2:** Flag `NEXT_PUBLIC_AUTH_V3` controla dual-render de forma determinística por usuário (hash estável).
- **FR-3:** Nenhum endpoint de backend pode ser modificado. Contract tests (Release 1) garantem.
- **FR-4:** Tokens e componentes DS v3 ficam escopados ao layout de auth (não vazam para dashboard).
- **FR-5:** Rollout só avança se métricas ficarem dentro de 10% da baseline.
- **FR-6:** Rollback deve ser instantâneo via mudança de flag, sem deploy.
- **FR-7:** Remoção do código v2 só após 30 dias de 100% estável.

---

## 5. Non-Goals

- ❌ Não rebranda dashboard, admin ou landing
- ❌ Não muda backend de auth
- ❌ Não remove rotas (Release 2 fez isso)
- ❌ Não adiciona i18n
- ❌ Não adiciona tema claro
- ❌ Não impõe regra arbitrária de "max 200 LOC por componente" — modularização é revisada caso a caso
- ❌ Não força coverage % arbitrário — usa baseline da Release 1 como referência
- ❌ Não usa LLM como único gate de code review

---

## 6. Technical Considerations

- **Flag em Server Components:** verificar que hash determinístico funciona em SSR (userId do cookie de session)
- **Cookie de override para QA:** `auth-v3-override=on` força v3 para a sessão — útil para testar sem esperar rollout
- **Bundle impact:** dual-render pode aumentar bundle de auth. Medir com `@next/bundle-analyzer` e documentar em US-317
- **Fontes DM Sans/Mono:** `next/font/google` com `subsets: ['latin']` e `display: 'swap'` para não bloquear render
- **Imagem LCP:** usar `priority` no `next/image` do hero para melhorar LCP
- **CSS isolation:** tokens v3 escopados via `[data-auth-v3="true"]` no root do layout — evita colisão com dashboard

---

## 7. Success Metrics

- ✅ Rollout 100% atingido sem rollback
- ✅ Métricas pós-v3 dentro de 10% das baselines (ou melhor)
- ✅ Zero findings `critical`/`serious` de a11y
- ✅ Bundle de auth não cresce mais de 20% vs v2
- ✅ Código v2 removido após 30 dias estáveis
- ✅ Conversion rate signup→onboarding igual ou melhor que baseline

---

## 8. Open Questions

1. **Storybook existe no projeto?** Verificar antes de US-304
2. **Sistema de feature flags** — usar env var simples ou serviço (LaunchDarkly, Unleash)?
3. **`/google-callback` ainda está em uso?** Resolver em US-312 antes de trabalhar nele

---

## Definition of Done

- [ ] Todas as US de 301 a 321 concluídas (322 é pós-release)
- [ ] Flag em 100% há pelo menos 7 dias
- [ ] Baselines atualizadas
- [ ] Zero rollback durante rollout
- [ ] A11y audit aprovado
- [ ] Performance dentro de tolerância
- [ ] Code review humano aprovado
- [ ] Changelog publicado
- [ ] Docs (USER_JOURNEY, AUTH_FLOW, ASSETS, A11Y_AUDIT, V3_PERFORMANCE, FEATURE_FLAGS) publicadas
- [ ] Skill `auth-pages.md` criada e `CLAUDE.md` atualizado
