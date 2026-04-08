# PRD: Limpeza do Repositório + Esteira de Testes Automatizados

## Introdução

O repositório acumulou ~31.500 linhas de testes não-funcionais, scripts duplicados, arquivos gitignored não removidos, e documentação obsoleta. A pasta `test/` será deletada por completo e recriada do zero com uma estrutura limpa e sustentável. O objetivo é ter uma esteira de testes confiável que rode no CI/CD (GitHub Actions) a cada PR.

**Diagnóstico atual (do estado investigado):**
- `test/` tem 93 arquivos, 31.500 linhas, mas 13 testes com `.skip()`, 1 arquivo `.skip`, configs duplicadas
- `vitest.config.ts` ≡ `vitest.config.integration.ts` (arquivos idênticos)
- `src/test/example.test.ts` = `expect(true).toBe(true)` (inútil)
- `test-results/` e `playwright-report/` com dados de 2026-02-16 (desatualizados)
- `ci.yml` com permissão corrompida — precisa ser recriado
- Raiz com arquivos gitignored presentes: `UsersgabriAppDataLocalTempinit.sql`, build caches, logs
- Arquivos tracked obsoletos: `AGENT.md`, `IMPLEMENTATION_STATUS.md`, `INFRASTRUCTURE_COMPLETE.md`, `docker-compose.prod.yml`, `docker-compose.yml`, `eslintrc.json`

---

## Goals

- Repositório limpo: zero arquivos obsoletos, gitignored presentes, ou duplicados
- Estrutura de testes clara: `test/unit/`, `test/api/`, `test/e2e/` com propósito bem definido
- CI/CD funcional: lint → typecheck → unit → build em cada PR
- E2E opcional no CI: só roda quando label `e2e` é adicionada ao PR
- `npm test` funciona sem surpresas — testa o que diz que testa

---

## User Stories

### US-001: Deletar arquivos gitignored e lixo da raiz
**Descrição:** Como desenvolvedor, quero que a raiz do projeto não tenha arquivos temporários, logs e caches do sistema.

**Acceptance Criteria:**
- [ ] `UsersgabriAppDataLocalTempinit.sql` deletado
- [ ] `*.tsbuildinfo` deletados (build caches TypeScript)
- [ ] `build.log`, `test-output.log`, `test-results-unit.log` deletados (se existirem)
- [ ] `playwright-report/` deletada (conteúdo desatualizado)
- [ ] `test-results/` deletada (conteúdo desatualizado)
- [ ] `git status` não mostra arquivos que deveriam estar no .gitignore

---

### US-002: Deletar arquivos tracked obsoletos
**Descrição:** Como desenvolvedor, quero remover via `git rm` documentos e configs duplicados que não são mais usados.

**Acceptance Criteria:**
- [ ] `AGENT.md` removido do repositório (`git rm`)
- [ ] `IMPLEMENTATION_STATUS.md` removido (se existir na raiz)
- [ ] `INFRASTRUCTURE_COMPLETE.md` removido (se existir na raiz)
- [ ] `docker-compose.prod.yml` e `docker-compose.yml` removidos (apenas `docker-compose.quayer.yml` mantido)
- [ ] `.eslintrc.json` removido (duplicado de `eslint.config.mjs`)
- [ ] `src/test/example.test.ts` removido (teste trivial inútil)
- [ ] `test/dashboard.test.tsx.skip` removido
- [ ] Commit com todos os `git rm` agrupados

---

### US-003: Deletar pasta test/ completa e recriar estrutura
**Descrição:** Como desenvolvedor, quero começar do zero com uma estrutura de testes limpa e bem definida.

**Acceptance Criteria:**
- [ ] Pasta `test/` atual deletada completamente
- [ ] Nova estrutura criada:
  ```
  test/
  ├── unit/          # Vitest — funções puras, utils, validators
  ├── api/           # Vitest — endpoints HTTP com servidor real
  └── e2e/           # Playwright — fluxos de browser
  ```
- [ ] `test/unit/example.test.ts` com 1 teste real (ex: função de utils do projeto)
- [ ] `test/api/health.test.ts` com 1 teste que chama `GET /api/health`
- [ ] `test/e2e/auth.spec.ts` com 1 teste que acessa a página de login
- [ ] Todos os 3 testes passam localmente

---

### US-004: Refatorar configurações Vitest
**Descrição:** Como desenvolvedor, quero uma única config Vitest clara que cubra unit e api tests.

**Acceptance Criteria:**
- [ ] `vitest.config.integration.ts` deletado
- [ ] `vitest.config.ts` atualizado para incluir `test/{unit,api}/**/*.test.ts`
- [ ] `setupFiles` configurado (ao menos array vazio explícito com comentário)
- [ ] `npm run test` roda apenas `test/unit/` + `test/api/` (rápido, sem browser)
- [ ] `npm run test:e2e` roda apenas `test/e2e/` via Playwright
- [ ] `npx tsc --noEmit` passa sem erros

---

### US-005: Limpar scripts de test no package.json
**Descrição:** Como desenvolvedor, quero scripts de teste com nomes claros e sem duplicações.

**Acceptance Criteria:**
- [ ] Scripts finais apenas:
  ```json
  "test":              "vitest run",
  "test:watch":        "vitest",
  "test:coverage":     "vitest run --coverage",
  "test:unit":         "vitest run test/unit",
  "test:api":          "vitest run test/api",
  "test:e2e":          "playwright test",
  "test:e2e:ui":       "playwright test --ui",
  "test:e2e:headed":   "playwright test --headed",
  "test:e2e:debug":    "playwright test --debug",
  "test:ci":           "npm run lint && npx tsc --noEmit && npm run test && npm run build"
  ```
- [ ] Todos os scripts `test:real:*`, `test:massive`, `test:admin:*`, `test:uazapi` removidos
- [ ] `npm run test:ci` completa sem erros

---

### US-006: Atualizar playwright.config.ts
**Descrição:** Como desenvolvedor, quero que o Playwright esteja configurado para rodar testes de forma determinística.

**Acceptance Criteria:**
- [ ] `testDir: './test/e2e'` (aponta apenas para e2e, não root test/)
- [ ] `webServer` configurado para iniciar `next dev` automaticamente (com `reuseExistingServer: true`)
- [ ] `fullyParallel: false` mantido
- [ ] `retries: 2` em CI, `0` em local
- [ ] `reporter: process.env.CI ? 'github' : 'list'`
- [ ] Apenas `chromium` como project
- [ ] `npx playwright test` roda sem servidor manual

---

### US-007: Criar/recriar ci.yml funcional
**Descrição:** Como desenvolvedor, quero que cada PR passe por uma esteira automática de qualidade.

**Acceptance Criteria:**
- [ ] `.github/workflows/ci.yml` recriado com os stages:
  1. **lint** — `npm run lint`
  2. **typecheck** — `npx tsc --noEmit`
  3. **unit** — `npm run test` (vitest, rápido)
  4. **build** — `npm run build`
- [ ] E2E roda apenas quando PR tem label `e2e` (usando `if: contains(github.event.pull_request.labels.*.name, 'e2e')`)
- [ ] Cache de `node_modules` configurado (actions/cache com chave baseada em `package-lock.json`)
- [ ] Node.js 20, Ubuntu latest
- [ ] Passa no PR atual antes de merge

---

### US-008: Atualizar .gitignore
**Descrição:** Como desenvolvedor, quero que o .gitignore previna que lixo entre no repo no futuro.

**Acceptance Criteria:**
- [ ] `test-results/` no .gitignore
- [ ] `playwright-report/` no .gitignore
- [ ] `*.tsbuildinfo` no .gitignore
- [ ] `*.log` no .gitignore
- [ ] `UsersgabriAppDataLocalTemp*` ou `Usersgabri*` no .gitignore
- [ ] `git status` limpo após rodar testes localmente

---

## Functional Requirements

- FR-1: `npm test` roda apenas testes sem browser (< 30 segundos)
- FR-2: `npm run test:e2e` roda testes de browser com Playwright
- FR-3: `npm run test:ci` deve funcionar em ambiente sem display (headless)
- FR-4: CI executa em < 5 minutos para o fluxo sem E2E
- FR-5: Nenhum arquivo de lixo (logs, caches, resultados) deve ser rastreado pelo git
- FR-6: `npx tsc --noEmit` deve passar sem erros após a limpeza
- FR-7: A pasta `test/` deve ter no máximo 3 subpastas: `unit/`, `api/`, `e2e/`

---

## Non-Goals

- Não reescrever lógica de negócio para facilitar testes
- Não criar testes para 100% de cobertura — objetivo é estrutura funcional
- Não migrar testes existentes (deletar tudo e começar do zero)
- Não configurar Firebase, Sentry, ou outros serviços de monitoramento no CI
- Não configurar E2E em paralelo (apenas sequential para estabilidade)
- Não adicionar Firefox ou Safari ao Playwright (só Chromium)

---

## Technical Considerations

- `ci.yml` tem bug de permissão — será deletado e recriado do zero
- `webServer` no Playwright usa `next dev` (porta 3000) com `reuseExistingServer: true`
- Para testes de API funcionarem, o `next dev` precisa estar rodando (ou usar `webServer`)
- Variáveis de ambiente necessárias para CI: `DATABASE_URL` (pode ser SQLite para testes), `NEXTAUTH_SECRET`
- Considerar usar `DATABASE_URL=file:./test.db` com SQLite para testes unitários e de API

---

## Success Metrics

- `npm run test:ci` executa do início ao fim sem erros em nova máquina
- CI passa em 100% dos PRs após a limpeza
- `git status` limpo após `npm test` + `npm run test:e2e`
- Estrutura de testes compreensível por novo desenvolvedor sem documentação adicional
- Tempo de CI < 5 minutos (excluindo E2E)

---

## Open Questions

- O `ci.yml` atual tem conteúdo válido que vale preservar? (permissão corrompida — precisa ser lido via git show)
- A variável `DATABASE_URL` para CI deve usar PostgreSQL (via Docker service no Actions) ou SQLite?
- Existe `.env.test` ou `.env.ci` com variáveis de teste? Ou usar `dotenv-test`?
- O `webServer` do Playwright deve usar `next dev` ou `next start` (precisa `next build` antes)?
