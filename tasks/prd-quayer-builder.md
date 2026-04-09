# PRD: Quayer Builder (MVP v1)

> **Versão:** 1.1 (+ refactor de design global)
> **Data:** 2026-04-08
> **Status:** Draft — aguardando aprovação pra `/plan`
> **Fontes:**
> - [`specs/home-chat-builder/architecture-v5.md`](../specs/home-chat-builder/architecture-v5.md) — arquitetura completa v5.3
> - [`specs/home-chat-builder/route-migration-plan.md`](../specs/home-chat-builder/route-migration-plan.md) — mapeamento das 63 rotas atuais
> - [`quayer-ds-v3.html`](../quayer-ds-v3.html) — fonte de verdade dos tokens de design + logo
> - `src/app/(auth)/**` — **páginas de referência** (padrão visual aplicado em Releases 1-3) — toda página refatorada DEVE seguir o padrão visual dessas

---

## 1. Introduction / Overview

Este PRD cobre **2 trabalhos interligados que entregam juntos**:

### 1.1 — Quayer Builder (feature nova)

Interface conversacional pra criação de agentes de IA que atendem no WhatsApp. Substitui o fluxo atual baseado em formulários (`/integracoes/agents/new` e subpáginas) por um **chat com preview lado-a-lado**, inspirado em Claude Artifacts + v0.dev + Cursor Composer.

### 1.2 — Design System v3 aplicado em todo o app (refactor)

Refatorar visualmente TODAS as páginas existentes (`/configuracoes/*` e `/admin/*`) pra seguirem o **mesmo padrão visual da auth login v3**, com:
- **Tokens do `quayer-ds-v3.html`** (cores amber, bg preto #000, DM Sans, radius, spacing, shadows)
- **Logo nova** do `quayer-ds-v3.html` (Q-bolt + wordmark Quayer em DM Sans black)
- **Componentes shadcn restylizados** pra combinar com v3 (inputs dark, botões amber, cards bg-surface)
- **Consistência visual total** — user clica no login e depois no admin e sente que é o mesmo produto

**O problema que resolve:**
- **Problema 1 (Builder):** criar agente exige navegar por múltiplas telas de formulário (alta fricção pra user não-técnico)
- **Problema 2 (Design):** app tem 2 visuais hoje — auth tem v3 (bonito, dark, amber), mas `/admin/*`, `/configuracoes/*`, `/integracoes/*` têm visual legacy (branco, cinza, inconsistente). User logado vê quebra de experiência.

**O que o Builder faz:**
- Home pós-login vira uma tela com prompt central: "O que você quer criar hoje?"
- Usuário digita em linguagem natural: *"agente de captação de leads pra advocacia trabalhista"*
- Um **Builder AI** (agente Quayer especializado) conversa com o user, coleta dados faltantes, gera o prompt do sistema, conecta WhatsApp via QR code inline, configura ferramentas padrão, e cria o agente via endpoints existentes do `ai-module/ai-agents`.
- Resultado: agente funcional em 5-10 minutos, sem abrir nenhum formulário.
- Workspace do projeto mostra chat + preview + tabs (Overview, Prompt, Playground, Deploy).
- Publicação em produção é atômica, com sticky versioning (conversas ativas seguem versão antiga até terminar).

**O que o refactor de design faz:**
- Migra tokens CSS do DS v3 (hoje scopados em `[data-auth-v3="true"]`) pra escopo global (`:root`)
- Refatora **visualmente** todas as páginas de `/configuracoes/*` (14 sub-rotas) pra usar tokens v3 + layout padrão auth
- Refatora **visualmente** todas as páginas de `/admin/*` (13 sub-rotas) pra usar tokens v3 + layout padrão auth
- Aplica **nova logo** (Q-bolt + wordmark) em toda navegação/headers
- Zero regressão: páginas de auth existentes continuam funcionando idênticas

**O que mantém funcional (sem refactor visual no v1):**
- Backend `ai-module/ai-agents` (runtime, tools builtins, providers LLM) — 100% reutilizado
- Auth (Releases 1-3 já rebranded v3) — intocado
- WhatsApp instances, share links, Chatwoot integration — funcionais, visual recebe refactor v3

**O que fica fora do visual refactor no v1:**
- Páginas públicas `(public)/*` (landing, pricing, docs) — spec separado de marketing
- Páginas `(auth)/*` — já foram rebranded em Releases 1-3

**O que desliga no v1 (backend preservado):**
- CRM (`/contatos`, leads, opportunities, tasks)
- Inbox humano (`/conversas`)

---

## 2. Goals

### Goals do Builder (feature nova)
1. **Reduzir TTFA (time to first agent):** criar primeiro agente em < 10 minutos desde o primeiro login, sem abrir formulário
2. **Aumentar taxa de ativação:** % de usuários que criam 1+ agente nos primeiros 7 dias
3. **Eliminar fricção de iteração:** editar prompt via chat em linguagem natural deve ser ≤ 3 cliques
4. **Preservar trabalho existente:** reutilizar 100% do backend `ai-module/ai-agents`; zero duplicação
5. **Sticky versioning funcional:** conversas ativas nunca quebram por deploy de nova versão
6. **Multi-provider LLM com fallback:** Claude Sonnet padrão, fallback automático pra GPT-4/Gemini em caso de indisponibilidade

### Goals do refactor de design v3
7. **Unificar visual do app:** toda página logada (configurações, admin, builder, projetos) compartilha o mesmo visual da login v3 — tokens + logo + layout
8. **Zero regressão visual nas páginas auth** (Releases 1-3) — tokens migrando pra `:root` não quebra o que já funciona
9. **Logo nova em toda navegação:** substituir a logo antiga pelo Q-bolt + wordmark do `quayer-ds-v3.html` em todos os headers, sidebars, loading states
10. **Consistência de componentes shadcn:** todo Button, Input, Card, Dialog, DropdownMenu, Tooltip etc usado nas páginas refatoradas segue o padrão v3 (dark, amber accents, DM Sans)
11. **Tokens globais:** remover scoping `[data-auth-v3]`, tornar tokens acessíveis em qualquer rota
12. **Apenas (public)/* fica fora do refactor v1** — páginas públicas de marketing têm spec próprio futuro

---

## 3. User Stories

### Fase A — Foundation (Backend + Schema)

#### US-001: Schema novo — tabela `projects`
**Description:** Como desenvolvedor, preciso de uma tabela `projects` polimórfica pra armazenar projetos (inicialmente só agentes) com relação 1:1 pro agente do `ai-module/ai-agents`.

**Acceptance Criteria:**
- [ ] Criar migration Prisma adicionando modelo `Project` com campos: `id`, `organizationId`, `userId`, `type` (enum só `'ai_agent'` no v1), `name`, `status` (enum `draft|production|paused|archived`), `aiAgentId` (FK nullable), `createdAt`, `updatedAt`, `archivedAt`
- [ ] Índices: `(organizationId, type, status)`, `(userId, updatedAt desc)`, `(archivedAt) where null`
- [ ] Relation 1:1 com `AIAgentConfig` via `aiAgentId` (nullable)
- [ ] Migration roda sem erros em DB limpo
- [ ] Typecheck passes

#### US-002: Schema novo — tabelas `project_conversations` e `project_messages`
**Description:** Como desenvolvedor, preciso de tabelas pra persistir a conversa do Builder AI com o user, com context auto-summary.

**Acceptance Criteria:**
- [ ] Modelo `ProjectConversation`: `id`, `projectId` (unique — 1:1 com Project), `organizationId`, `userId`, `stateSummary` (text, atualizado após cada turno), `lastMessageAt`, `createdAt`
- [ ] Modelo `ProjectMessage`: `id`, `conversationId`, `role` (enum `user|assistant|tool|system_banner`), `content` (text), `toolCalls` (jsonb nullable), `metadata` (jsonb — tokens, modelo, latency), `createdAt`
- [ ] Índice `(conversationId, createdAt)` em messages
- [ ] Migration roda sem erros
- [ ] Typecheck passes

#### US-003: Schema novo — tabela `prompt_versions`
**Description:** Como desenvolvedor, preciso de versionamento linear do system prompt (v1, v2, v3...) ligado diretamente ao agente.

**Acceptance Criteria:**
- [ ] Modelo `PromptVersion`: `id`, `aiAgentId` (FK), `versionNumber` (int, auto-increment por agente), `content` (text — system prompt), `description` (text opcional — ex: "tom mais formal"), `createdBy` (enum `chat|manual`), `publishedAt` (nullable), `publishedBy` (nullable), `createdAt`
- [ ] Constraint: `(aiAgentId, versionNumber)` unique
- [ ] Método `getNextVersionNumber(agentId)` na repository
- [ ] Migration roda sem erros
- [ ] Typecheck passes

#### US-004: Schema migration — `pinnedAgentVersion` em `whatsapp_conversations`
**Description:** Como desenvolvedor, preciso adicionar campo `pinnedAgentVersion` na tabela de conversas WhatsApp pra implementar sticky versioning.

**Acceptance Criteria:**
- [ ] Ler schema atual de `whatsapp_conversations` (ou equivalente no `communication/` module) e identificar tabela correta
- [ ] Adicionar coluna `pinnedAgentVersion` (int nullable) via migration
- [ ] Index em `(pinnedAgentVersion)` pra query rápida
- [ ] Migration backfill preenche com versão atual de produção pra conversas existentes
- [ ] Migration é reversível (down migration preserva dados)
- [ ] Typecheck passes

#### US-005: Endpoint `POST /api/v1/projetos/novo`
**Description:** Como user no frontend, preciso de um endpoint que cria um novo projeto + conversation a partir de um prompt inicial.

**Acceptance Criteria:**
- [ ] Endpoint via Igniter.js controller em `src/server/ai-module/builder/builder.controller.ts` (módulo novo)
- [ ] Body schema Zod: `{ prompt: string (min 3, max 2000), type: 'ai_agent' }`
- [ ] Cria `Project` com status `draft`, sem agente ainda (vai ser criado pelo Builder AI)
- [ ] Cria `ProjectConversation` 1:1 com o Project
- [ ] Cria primeira `ProjectMessage` com role `user` e o prompt inicial
- [ ] Usa `authProcedure({ required: true })`
- [ ] Filtra por `organizationId` do user
- [ ] Retorna `{ projectId, conversationId }`
- [ ] Unit test cobre: prompt válido, prompt muito curto, sem org ativa
- [ ] Typecheck passes

#### US-006: Endpoint streaming `POST /api/v1/projetos/[id]/chat/message`
**Description:** Como frontend, preciso de um endpoint que envia nova mensagem do user pro Builder AI e streameia a resposta.

**Acceptance Criteria:**
- [ ] Endpoint Igniter.js streaming response
- [ ] Body schema Zod: `{ content: string }`
- [ ] Valida `projectId` pertence à `organizationId` do user
- [ ] Chama `agent-runtime.service.ts` do `ai-module/ai-agents` com o Builder AI configurado
- [ ] Builder AI recebe: `stateSummary` + últimas 10 mensagens + mensagem nova
- [ ] Tool calls do Builder são executados via `ai-module` runtime
- [ ] Response streaming: cada chunk aparece conforme LLM gera
- [ ] Após turno, atualiza `stateSummary` em `project_conversations`
- [ ] Unit test cobre fluxo básico
- [ ] Typecheck passes

#### US-007: Endpoint `POST /api/v1/projetos/[id]/publish`
**Description:** Como user, preciso publicar uma versão do agente em produção.

**Acceptance Criteria:**
- [ ] Endpoint Igniter.js mutation
- [ ] Body schema Zod: `{ promptVersionId: string }`
- [ ] Valida que versão pertence ao projeto
- [ ] Atualiza `ai_agent_configs.currentPromptVersionId`
- [ ] Atualiza `projects.status` = `production`
- [ ] Atualiza `prompt_versions.publishedAt` e `publishedBy`
- [ ] **Não** mexe em conversas ativas (sticky versioning cuida)
- [ ] Retorna `{ version, publishedAt }`
- [ ] Unit test cobre publish válido + publish de versão de outro projeto (deve falhar)
- [ ] Typecheck passes

---

### Fase B — Builder AI (agente meta)

#### US-008: Builder AI — config inicial no `ai-module/ai-agents`
**Description:** Como desenvolvedor, preciso registrar o Builder AI como um agente especial no `ai-module/ai-agents` com prompt e tools específicos.

**Acceptance Criteria:**
- [ ] Seed script cria registro em `ai_agent_configs` com `type='builder'` (adicionar enum) e `visibility='internal'` (não aparece na lista de projetos)
- [ ] System prompt inicial em `src/server/ai-module/builder/prompts/builder-system-prompt.ts` — ver architecture-v5.md seção 4.1 como base
- [ ] Config aponta pros tools wrappers (US-009 a US-015)
- [ ] Provider padrão: Claude Sonnet 4.5 via `@ai-sdk/anthropic`
- [ ] Documentação inline explicando que o Builder É um agente Quayer
- [ ] Typecheck passes

#### US-009: Tool wrapper `create_agent`
**Description:** Como Builder AI, preciso de uma ferramenta que cria um agente regular via endpoint existente do `ai-module/ai-agents`.

**Acceptance Criteria:**
- [ ] Tool handler em `src/server/ai-module/builder/tools/create-agent.tool.ts`
- [ ] Parâmetros Zod: `{ projectId, name, initialPrompt, modelProvider, instanceId (opcional) }`
- [ ] Chama `aiAgents.create.mutate()` (endpoint existente)
- [ ] Linka o novo agente ao `project.aiAgentId`
- [ ] Cria primeira `PromptVersion` com `initialPrompt`
- [ ] Retorna `{ agentId, versionNumber: 1 }`
- [ ] Unit test mocka `aiAgents.create` e valida wiring
- [ ] Typecheck passes

#### US-010: Tool wrapper `update_agent_prompt`
**Description:** Como Builder AI, preciso editar o prompt de um agente, criando nova versão linear.

**Acceptance Criteria:**
- [ ] Tool handler em `src/server/ai-module/builder/tools/update-agent-prompt.tool.ts`
- [ ] Parâmetros Zod: `{ agentId, newPrompt, description (opcional) }`
- [ ] Cria nova `PromptVersion` com `versionNumber` = último + 1
- [ ] NÃO publica automaticamente (fica como draft)
- [ ] Retorna `{ versionNumber, description }`
- [ ] Unit test cobre: primeira versão, versão 5, agente inexistente
- [ ] Typecheck passes

#### US-011: Tool wrapper `list_whatsapp_instances`
**Description:** Como Builder AI, preciso listar instâncias WhatsApp disponíveis na org do user.

**Acceptance Criteria:**
- [ ] Tool handler em `src/server/ai-module/builder/tools/list-instances.tool.ts`
- [ ] Chama `instances.list.query()` do `communication/instances`
- [ ] Filtra por `organizationId` do context
- [ ] Retorna array: `[{ id, name, phoneNumber, status }]`
- [ ] Status possíveis: `connected`, `disconnected`, `qr_pending`
- [ ] Unit test cobre org com 0, 1, N instâncias
- [ ] Typecheck passes

#### US-012: Tool wrapper `create_whatsapp_instance` (com QR inline)
**Description:** Como Builder AI, preciso disparar criação de nova instância WhatsApp e retornar QR code pra user escanear.

**Acceptance Criteria:**
- [ ] Tool handler em `src/server/ai-module/builder/tools/create-instance.tool.ts`
- [ ] Parâmetros Zod: `{ name: string }`
- [ ] Chama `instances.create.mutate()` do `communication/instances`
- [ ] Chama `instances.getQrCode.query()` pra obter QR base64
- [ ] Gera share link via `/compartilhar/[token]` (rota pública existente)
- [ ] Retorna `{ instanceId, qrCodeBase64, shareLink, expiresIn }`
- [ ] Frontend renderiza QR code inline no chat
- [ ] Unit test mocka chamadas e valida wiring
- [ ] Typecheck passes

#### US-013: Tool wrapper `attach_tool_to_agent`
**Description:** Como Builder AI, preciso conectar uma builtin tool (ex: transfer_to_human) ao agente criado.

**Acceptance Criteria:**
- [ ] Tool handler em `src/server/ai-module/builder/tools/attach-tool.tool.ts`
- [ ] Parâmetros Zod: `{ agentId, toolKey }`
- [ ] Valida que `toolKey` existe nos builtins (`transfer_to_human | pause_session | notify_team | schedule_callback | create_lead | search_contacts`)
- [ ] Cria registro em `agent_tools` table
- [ ] Retorna `{ attached: true, toolKey }`
- [ ] Unit test cobre tool válida, tool inválida, duplicação
- [ ] Typecheck passes

#### US-014: Tool wrapper `search_web` (integração externa)
**Description:** Como Builder AI, preciso pesquisar na web pra trazer contexto pra geração de prompts.

**Acceptance Criteria:**
- [ ] Tool handler em `src/server/ai-module/builder/tools/search-web.tool.ts`
- [ ] Provider: Tavily API (mais barato e bom pra research) — confirmar no /plan
- [ ] Parâmetros Zod: `{ query: string, maxResults: number default 3 }`
- [ ] API key via env var `TAVILY_API_KEY`
- [ ] Retorna `[{ title, url, snippet }]`
- [ ] Rate limit por org (max 20 calls/dia no v1)
- [ ] Unit test mocka Tavily e valida wiring
- [ ] Typecheck passes

#### US-015: Tool wrapper `generate_prompt_anatomy`
**Description:** Como Builder AI, preciso gerar um prompt estruturado baseado em um brief (nicho, caso de uso).

**Acceptance Criteria:**
- [ ] Tool handler em `src/server/ai-module/builder/tools/generate-prompt-anatomy.tool.ts`
- [ ] Parâmetros Zod: `{ brief: string, nicho: enum('advocacia'|'contabilidade'|'seguros'|'outro'), objetivo: string }`
- [ ] Template base em `src/server/ai-module/builder/templates/prompt-anatomy.ts` com estrutura: `[Papel] + [Objetivo] + [Regras] + [Limitações] + [Formato de resposta]`
- [ ] Sub-chamada ao LLM pra preencher o template com contexto do nicho
- [ ] Retorna `{ prompt: string (markdown) }`
- [ ] Unit test cobre 3 nichos diferentes
- [ ] Typecheck passes

#### US-016: Context auto-summary service
**Description:** Como Builder AI, preciso de um serviço que atualiza o `stateSummary` do project_conversation após cada turno pra economizar tokens.

**Acceptance Criteria:**
- [ ] Serviço em `src/server/ai-module/builder/services/context-summary.service.ts`
- [ ] Método `updateSummary(conversationId)`:
  1. Busca state atual do projeto (nome, prompt, tools, instância, status)
  2. Gera summary conciso (~500 tokens) via sub-chamada LLM
  3. Salva em `project_conversations.stateSummary`
- [ ] Chamado após cada turno que gera mudança de estado
- [ ] Unit test mocka LLM e valida update
- [ ] Typecheck passes

---

### Fase C — Design Tokens v3 Global

#### US-017: Migrar tokens de `[data-auth-v3]` pra global
**Description:** Como desenvolvedor, preciso migrar os tokens do DS v3 que hoje estão scopados em `[data-auth-v3="true"]` pra escopo global (`:root` ou `html`), pra que toda a app use os mesmos tokens.

**Acceptance Criteria:**
- [ ] Ler `quayer-ds-v3.html` e identificar todos os CSS custom properties
- [ ] Em `src/app/globals.css`:
  - Mover todos os tokens `--color-*`, `--space-*`, `--radius-*`, `--text-*`, `--font-*`, `--shadow-*` de dentro de `[data-auth-v3="true"]` pra `:root` ou `html`
  - Manter backward compat: `[data-auth-v3="true"]` continua funcionando (tokens ficam herdados)
- [ ] Atualizar `tailwind.config.ts` se necessário (variables ja referenciadas via `var(--...)`)
- [ ] Testar visual regression nas páginas `(auth)/*` existentes (não devem mudar visualmente)
- [ ] Remover atributo `data-auth-v3="true"` do `(auth)/layout.tsx` (não é mais necessário)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill (testar /login, /signup, /verify-email)

#### US-018: Aplicar tokens v3 em `/` e `/projetos/*`
**Description:** Como user, quero que as novas páginas do Builder (home e projetos) sigam o mesmo visual da auth v3 (amber brand, bg preto, DM Sans).

**Acceptance Criteria:**
- [ ] Home page (`/`) herda os tokens globais automaticamente
- [ ] Páginas `/projetos` e `/projetos/[id]` também
- [ ] Sidebar novo usa tokens v3 (background, text, borders)
- [ ] Smoke test: abrir home, projetos, workspace em browser e verificar que cores/fonts batem com login v3
- [ ] Nenhum bleeding de tokens pro admin (admin pode ou não receber v3 — ver US-019)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-019: Aplicar tokens v3 em `/admin/*` e `/configuracoes/*`
**Description:** Como user, quero visual consistente v3 em todo o app, incluindo admin e configurações.

**Acceptance Criteria:**
- [ ] Rotas `/admin/*` herdam tokens globais (deve funcionar automaticamente com US-017)
- [ ] Rotas `/configuracoes/*` (nova raiz) usam tokens v3
- [ ] Verificar que tabelas/forms/modals existentes em admin não quebraram visualmente
- [ ] Se houver contraste ruim ou quebra visual, documentar em issue separado pra refactor
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill (abrir `/admin` e navegar pelas sub-seções)

---

### Fase D — Frontend Home & Workspace

#### US-020: Sidebar novo minimalista
**Description:** Como user, quero uma sidebar simples com apenas: "+ Novo projeto", "Meus Projetos" (lista), "Configurações", "Admin" (se super).

**Acceptance Criteria:**
- [ ] Componente `src/client/components/layout/builder-sidebar.tsx`
- [ ] Itens:
  - Botão destacado "+ Novo projeto" com atalho ⌘K
  - Seção "MEUS PROJETOS" com lista dos 5-7 mais recentes + "ver todos"
  - Separador
  - Link "Configurações"
  - Link "Admin" (só se `user.role === 'super_admin'`)
- [ ] Responsivo: drawer em mobile (< 768px), fixo em desktop (≥ 1024px)
- [ ] Usa tokens v3 globais
- [ ] Acessibilidade: ARIA nav, keyboard navigation (Tab entre items, Enter ativa)
- [ ] Unit test render
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill (desktop + mobile viewport)

#### US-021: Home page `/`
**Description:** Como user novo logado, quero uma tela com prompt central perguntando "O que você quer criar hoje?" e grid dos meus projetos recentes abaixo.

**Acceptance Criteria:**
- [ ] Rota `src/app/page.tsx` (substitui redirect atual)
- [ ] Componente `src/client/components/home/home-page.tsx`
- [ ] Layout:
  - Header: logo Quayer v3 + perfil
  - Seção central: texto grande "O que você quer criar hoje?" + textarea grande com placeholder "ex: agente de captação de leads pra advocacia..."
  - Templates rápidos (chips): `[🤖 Agente de vendas]`, `[🤖 Suporte]`, `[🤖 Captação]`
  - Seção "Continue de onde parou": grid com 3-6 cards dos projetos mais recentes
  - Link "Ver todas criações →" pra `/projetos`
- [ ] Empty state: se zero projetos, mostra mensagem educativa "Você ainda não criou nada. Escolha um template acima ou descreva o que quer construir"
- [ ] Submit do textarea: `POST /api/v1/projetos/novo` → redirect pra `/projetos/[id]`
- [ ] Loading state com spinner durante submit
- [ ] Error state: se falhar, mostra toast com retry
- [ ] Mobile-first (breakpoints 375, 768, 1024)
- [ ] Usa tokens v3 globais
- [ ] Unit test render + click handlers
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-022: Página de lista `/projetos`
**Description:** Como user, quero ver todos os meus projetos numa página com filtros (status) e busca.

**Acceptance Criteria:**
- [ ] Rota `src/app/projetos/page.tsx`
- [ ] Componente `src/client/components/projetos/projetos-list.tsx`
- [ ] Layout: header + grid de cards
- [ ] Cada card mostra: nome, status badge (🟢 ativo / 🟡 draft / 🔴 pausado / ⚫ arquivado), última atualização, métrica principal (conversas/dia se ativo)
- [ ] Filtro por status (tabs: Todos | Ativos | Drafts | Arquivados)
- [ ] Busca por nome (client-side se < 50 projetos, server-side se ≥)
- [ ] Grouping automático por status (Produção > Drafts > Pausados > Arquivados)
- [ ] Click no card → `/projetos/[id]`
- [ ] Empty state por filtro ("Nenhum projeto ativo ainda")
- [ ] Mobile layout (1 coluna em <768px, 3 colunas em ≥1024px)
- [ ] Usa tokens v3 globais
- [ ] Unit test
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-023: Workspace `/projetos/[id]` — shell layout
**Description:** Como user, quero abrir um projeto numa tela com chat à esquerda e preview à direita, com tabs no topo do preview.

**Acceptance Criteria:**
- [ ] Rota `src/app/projetos/[id]/page.tsx`
- [ ] Componente `src/client/components/projetos/workspace.tsx`
- [ ] Layout desktop (≥1024px): split 50/50 entre `<ChatPanel>` (esquerda) e `<PreviewPanel>` (direita)
- [ ] Layout mobile (<768px): toggle entre chat e preview via botões no header (`💬 Chat` | `🤖 Agente`)
- [ ] Header sticky com: back arrow → `/projetos`, nome do projeto editável inline, status badge, menu ⋯ (ações: arquivar, duplicar, renomear)
- [ ] Loading state: skeleton do layout enquanto carrega dados
- [ ] Error state: se projeto não existe ou não pertence à org, mostra 404 com link voltar
- [ ] URL params: `?tab=overview|prompt|playground|deploy` controla tab ativa no preview
- [ ] Usa tokens v3 globais
- [ ] Unit test
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill (testar desktop, tablet, mobile)

#### US-024: `<ChatPanel>` com streaming
**Description:** Como user, quero um chat à esquerda onde converso com o Builder AI, com stream de tokens em tempo real.

**Acceptance Criteria:**
- [ ] Componente `src/client/components/projetos/chat-panel.tsx`
- [ ] Usa Vercel AI SDK (`useChat` hook) apontando pro endpoint US-006
- [ ] Mensagens renderizadas: user (bolha direita), assistant (bolha esquerda), tool calls (collapsible cards estilo Cursor)
- [ ] Input multi-line no rodapé com botão send + atalho `⌘+Enter`
- [ ] Streaming: tokens aparecem progressivamente
- [ ] Auto-scroll pro final quando nova mensagem chega
- [ ] Scroll manual preserva posição se user rolou pra cima
- [ ] Tool calls mostram: nome da tool, parâmetros (collapsible), resultado (após execução)
- [ ] Error handling: se backend retornar erro, mostra mensagem inline com botão "Tentar novamente"
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill (criar um agente end-to-end)

#### US-025: `<PreviewPanel>` polimórfico + tab Overview do agente
**Description:** Como user, quero ver o agente sendo construído no painel direito, com aba Overview mostrando resumo + ações rápidas.

**Acceptance Criteria:**
- [ ] Componente `src/client/components/projetos/preview-panel.tsx`
- [ ] Renderiza tabs dependendo de `project.type` (só `ai_agent` no v1)
- [ ] Tabs pra ai_agent: `Overview | Prompt | Playground | Deploy`
- [ ] Tab **Overview** mostra:
  - Nome do agente, descrição
  - Status badge grande
  - Métricas resumidas (placeholder se draft: "Agente ainda não publicado")
  - Ações rápidas: `[💬 Continuar no chat]`, `[🎮 Testar no playground]`, `[🚀 Publicar]`
- [ ] Empty state se agente não foi criado ainda: mostra placeholder "Aguardando Builder criar o agente..."
- [ ] Usa tokens v3
- [ ] Unit test
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-026: Tab Prompt do agente (editor manual)
**Description:** Como user, quero editar o system prompt do agente manualmente via formulário (alternativa ao chat).

**Acceptance Criteria:**
- [ ] Tab `Prompt` mostra textarea grande com `<Editor>` (monaco ou CodeMirror ou textarea estilizada)
- [ ] Carrega conteúdo da versão atual via `prompt_versions` (última)
- [ ] Auto-save com debounce de 2s → cria nova versão automaticamente (draft)
- [ ] Indicator "salvando..." / "✓ salvo há 1s"
- [ ] Botão "Salvar checkpoint v5" — cria versão explícita com descrição
- [ ] Botão "Continuar no chat" volta pro chat preservando contexto
- [ ] Lista de versões anteriores abaixo do editor (linha do tempo clicável)
- [ ] Clicar em versão antiga: abre modal com diff + opção de rollback
- [ ] Usa tokens v3
- [ ] Unit test cobre salvar e carregar
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-027: Tab Playground (reusa existente)
**Description:** Como user, quero testar o agente no playground dentro do workspace, reusando o que já existe em `/integracoes/agents/[id]/playground`.

**Acceptance Criteria:**
- [ ] Tab `Playground` carrega o componente existente `playground-client.tsx` do `ai-module/ai-agents`
- [ ] Ajuste: playground atual roda em rota própria; refatorar pra componente reutilizável que recebe `agentId` como prop
- [ ] Manter funcionalidade atual: conversa manual, ver respostas, reset
- [ ] Funciona dentro do shell do workspace (não quebra layout)
- [ ] Usa tokens v3 (pode requerer pequeno refactor visual)
- [ ] Unit test existe já no playground antigo — garantir que não quebra
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-028: Tab Deploy
**Description:** Como user, quero ver o estado de deploy do agente, publicar nova versão, e fazer rollback.

**Acceptance Criteria:**
- [ ] Tab `Deploy` mostra:
  - Estado atual: "Produção: v3 (publicada há 5 dias)" + "Draft: v4 (não publicado)"
  - Diff v3 → v4 colapsível
  - Botão grande "Publicar v4" (desabilitado se não há draft)
  - Seção "Histórico" com lista de versões publicadas + rollback por versão
- [ ] Publicar v4:
  1. Modal de confirmação: "Publicar v4? Conversas em andamento continuam com v3 até terminar."
  2. Chama `POST /api/v1/projetos/[id]/publish`
  3. Toast de sucesso
  4. Atualiza UI (Produção: v4)
- [ ] Rollback pra versão anterior: modal de confirmação + publica versão antiga
- [ ] Usa tokens v3
- [ ] Unit test cobre publish + rollback
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### Fase E — Sticky Versioning (runtime)

#### US-029: Runtime usa `pinnedAgentVersion` ao processar mensagem
**Description:** Como sistema, quando uma mensagem chega do cliente final no WhatsApp, preciso usar a versão pinned da conversa (se existir) ou a atual produção.

**Acceptance Criteria:**
- [ ] Editar `agent-runtime.service.ts` do `ai-module/ai-agents`
- [ ] Método `processMessage(conversationId, message)`:
  1. Buscar conversa em `whatsapp_conversations`
  2. Se `pinnedAgentVersion` é null: usar `agent.currentPromptVersionId`, preencher pinnedAgentVersion na conversa
  3. Se não null: usar `pinnedAgentVersion`
  4. Buscar PromptVersion correspondente
  5. Usar esse prompt pro LLM call
- [ ] Unit test cobre: conversa nova, conversa existente com pin, conversa existente sem pin (edge case)
- [ ] Typecheck passes

#### US-030: Job BullMQ expira pins de conversas silenciadas
**Description:** Como sistema, preciso de um job que roda periodicamente pra liberar o pin de conversas que ficaram silenciadas > 24h.

**Acceptance Criteria:**
- [ ] Job em `src/server/communication/jobs/expire-conversation-pins.job.ts`
- [ ] Usa BullMQ repeatable (1x por hora)
- [ ] Query: `UPDATE whatsapp_conversations SET pinnedAgentVersion = NULL WHERE lastMessageAt < NOW() - INTERVAL '24 hours' AND pinnedAgentVersion IS NOT NULL`
- [ ] Loga número de conversas expiradas
- [ ] Unit test simula cenários com mocks de data
- [ ] Typecheck passes

---

### Fase F — Mobile + A11y

#### US-031: Mobile layout — home + sidebar drawer
**Description:** Como user mobile, quero navegar pelo Builder com layout otimizado pra 375px.

**Acceptance Criteria:**
- [ ] Home: layout single-column, prompt textarea ocupa full width, templates em scroll horizontal
- [ ] Sidebar: drawer slide-in via hamburger icon (top-left)
- [ ] Bottom nav sticky com ícones: `🏠 Home | 📂 Projetos | ⚙️ Config`
- [ ] Touch targets ≥ 44x44px
- [ ] Tap highlight suprimido onde apropriado
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill (viewport 375x667)

#### US-032: Mobile layout — workspace com toggle
**Description:** Como user mobile, quero alternar entre chat e preview no workspace via botões no header.

**Acceptance Criteria:**
- [ ] Em `/projetos/[id]` mobile, header tem 2 botões toggle: `💬 Chat` | `🤖 Agente`
- [ ] Default: `💬 Chat` ativo (fullscreen no mobile)
- [ ] Toggle pra `🤖 Agente`: esconde chat, mostra preview fullscreen
- [ ] Bottom sheet alternativa: swipe up do botão agente pra abrir preview como sheet (opcional — avaliar no /plan)
- [ ] Tabs do preview viram horizontal scroll em mobile
- [ ] Touch gestures não conflitam com scroll do chat
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill (viewport mobile)

#### US-033: Accessibility WCAG AA — ARIA + keyboard
**Description:** Como user de screen reader ou só teclado, quero navegar todo o Builder sem mouse.

**Acceptance Criteria:**
- [ ] Todos componentes novos têm ARIA roles e labels corretos:
  - Sidebar: `role="navigation" aria-label="Menu principal"`
  - Chat: `role="log" aria-live="polite"` pro container de mensagens
  - Tabs: `role="tablist" role="tab" aria-selected`
  - Forms: `aria-required`, `aria-invalid`, `aria-describedby` pra erros
  - Modals: `role="dialog" aria-modal="true"` + focus trap
- [ ] Keyboard nav funcional: Tab/Shift+Tab entre focáveis, Enter ativa, Esc fecha modais, arrows navegam tabs
- [ ] Focus visible ring (tokens v3) em todos elementos focáveis
- [ ] Skip link no topo: "Pular pra conteúdo principal"
- [ ] Auditar com `@axe-core/playwright` no E2E — zero violações critical/serious
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill (navegar só com teclado)

---

### Fase G — Migration & Cleanup

#### US-034: Redirects 308 das rotas antigas
**Description:** Como user com bookmark antigo, quero ser redirecionado automaticamente pras novas rotas.

**Acceptance Criteria:**
- [ ] Editar `src/middleware.ts` ou criar `next.config.ts` redirects:
  - `/integracoes/agents` → `/projetos?type=ai_agent`
  - `/integracoes/agents/:id` → `/projetos/:id`
  - `/integracoes/agents/:id/playground` → `/projetos/:id?tab=playground`
  - `/integracoes/settings/organization` → `/configuracoes/organizacao`
  - `/integracoes/settings/roles` → `/configuracoes/roles`
  - `/integracoes/settings/billing` → `/configuracoes/billing`
  - `/integracoes/settings/invoices` → `/configuracoes/billing/faturas`
  - `/integracoes/settings/scim` → `/configuracoes/scim`
  - `/integracoes/settings/domains` → `/configuracoes/dominios`
  - `/integracoes/settings/templates` → `/projetos?type=ai_agent` (templates são inline no v1)
  - `/integracoes/users` → `/configuracoes/membros`
  - `/integracoes/[instanceId]/settings` → `/configuracoes/canais/whatsapp/[id]`
  - `/integracoes/sessions` → `/configuracoes/canais/whatsapp/[id]?tab=sessoes`
  - `/integracoes` → `/configuracoes/canais/whatsapp`
  - `/organizacao` → `/configuracoes/organizacao`
  - `/user/seguranca` → `/configuracoes/perfil/seguranca`
  - `/ferramentas/chatwoot` → `/configuracoes/integracoes/chatwoot`
  - `/ferramentas/webhooks` → `/configuracoes/webhooks`
  - `/integracoes/admin/clients` → `/admin/organizations`
- [ ] Todos são 308 (permanent redirect, preserva método HTTP)
- [ ] Teste E2E verifica 5 redirects críticos
- [ ] Typecheck passes

#### US-035: Desligar CRM do sidebar (feature flag)
**Description:** Como user, não quero ver itens de CRM (contatos, conversas) na navegação do v1.

**Acceptance Criteria:**
- [ ] Feature flag `FEATURE_CRM_ENABLED` (env var) — default `false`
- [ ] Sidebar não renderiza links pra `/contatos` ou `/conversas` se flag off
- [ ] Rotas `/contatos`, `/contatos/[id]`, `/conversas`, `/conversas/[sessionId]` continuam acessíveis via URL direta (não 404) — backend preservado
- [ ] Tabs/menus dentro de outras páginas também condicionam à flag
- [ ] Doc no README: "Pra reativar CRM, setar `FEATURE_CRM_ENABLED=true`"
- [ ] Typecheck passes

#### US-036: Deletar rotas legacy (register, forgot, reset)
**Description:** Como manutenção do código, preciso deletar as 3 rotas órfãs do Release 2 Phase D.

**Acceptance Criteria:**
- [ ] Deletar `src/app/(auth)/register/page.tsx` (e layout/children)
- [ ] Deletar `src/app/(auth)/forgot-password/page.tsx`
- [ ] Deletar `src/app/(auth)/reset-password/[token]/page.tsx`
- [ ] Adicionar redirects 308: `/register → /signup`, `/forgot-password → /login`, `/reset-password/[token] → /login`
- [ ] Atualizar `docs/auth/CLEANUP_AUDIT.md` marcando Phase D concluída
- [ ] Nenhuma referência quebrada (grep garante)
- [ ] Typecheck passes

#### US-037: Mover `/ferramentas/*` pra `/configuracoes/*`
**Description:** Como parte da reorganização, preciso mover páginas de integrações e webhooks pra nova home.

**Acceptance Criteria:**
- [ ] Criar `src/app/configuracoes/integracoes/chatwoot/page.tsx` — copia de `src/app/ferramentas/chatwoot/page.tsx`
- [ ] Criar `src/app/configuracoes/webhooks/page.tsx` — copia de `src/app/ferramentas/webhooks/page.tsx`
- [ ] Respostas rápidas viram inline no workspace do agente (não tem página standalone no v1)
- [ ] Deletar `src/app/ferramentas/` após copiar
- [ ] Atualizar links internos no código
- [ ] Aplicar tokens v3
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### Fase H — Feature Flag + Rollout

#### US-038: Feature flag `NEXT_PUBLIC_HOME_BUILDER`
**Description:** Como time, preciso controlar o rollout do Builder via flag.

**Acceptance Criteria:**
- [ ] Helper `src/lib/feature-flags/home-builder.ts` com função `isBuilderEnabled(userId?, overrideCookie?)`:
  - Lê `NEXT_PUBLIC_HOME_BUILDER` env var: `off` | `percentage:N` | `on`
  - Cookie override `builder-override=on|off` pra QA
  - Distribuição determinística via hash(userId) % 100 < N
- [ ] `src/app/page.tsx` (home) verifica flag:
  - Se off: redireciona pra `/integracoes` (comportamento antigo)
  - Se on: renderiza nova home do Builder
- [ ] Sidebar verifica flag pra decidir se mostra nova navegação ou velha
- [ ] Unit test cobre: off, on, percentage:50 (distribuição), override cookie
- [ ] Documentar em `docs/auth/FEATURE_FLAGS.md` (já existe de Release 3)
- [ ] Typecheck passes

#### US-039: Rollout plan + monitoring
**Description:** Como ops, preciso de um plano de rollout gradual + métricas pra acompanhar.

**Acceptance Criteria:**
- [ ] Criar `docs/builder/ROLLOUT_PLAN.md` com:
  - Fase 1: flag on apenas pra founder (cookie override)
  - Fase 2: flag `percentage:10` — 10% dos users
  - Fase 3: flag `percentage:50` — 50%
  - Fase 4: flag `on` — 100%
  - Critérios pra avançar cada fase: taxa de erro < 1%, latência p95 < 5s, NPS ≥ 4/5
  - Rollback: reverter pra `off` se taxa de erro > 5% ou queda de conversão > 20%
- [ ] Eventos de analytics (PostHog/Mixpanel) instrumentados:
  - `builder.project.created`
  - `builder.project.published`
  - `builder.chat.message_sent`
  - `builder.tool.called` (nome da tool)
  - `builder.error` (tipo)
- [ ] Dashboard interno (ou query SQL documentada) pra monitorar métricas
- [ ] Typecheck passes

---

### Fase I — Testes

#### US-040: Unit tests — Builder tools
**Description:** Como dev, preciso de cobertura de testes nos tool wrappers do Builder AI.

**Acceptance Criteria:**
- [ ] Cada tool wrapper em `src/server/ai-module/builder/tools/` tem unit test em `test/unit/builder/tools/`
- [ ] Mocks dos endpoints internos chamados (aiAgents, instances)
- [ ] Cenários: sucesso, falha de validação, erro de backend
- [ ] Coverage mínimo 80% das linhas dos tools
- [ ] Testes rodam via `npm run test:unit`
- [ ] Typecheck passes

#### US-041: E2E happy path — criar agente end-to-end
**Description:** Como dev, preciso de E2E que simula user criando um agente do zero.

**Acceptance Criteria:**
- [ ] Playwright test em `test/e2e/builder/create-agent.spec.ts`
- [ ] Fluxo:
  1. Login (user de teste)
  2. Acessar `/` com flag on (cookie override)
  3. Digitar prompt no textarea
  4. Submit → redirect pra `/projetos/[id]`
  5. Verificar chat carregou com primeira resposta do Builder (mockar LLM pra determinismo)
  6. Responder perguntas do Builder via quick-reply chips
  7. Verificar QR code inline (mockar instância WA)
  8. Verificar criação do agente no preview
  9. Clicar em "Publicar" → modal → confirmar
  10. Verificar status = production
- [ ] LLM mockado via fixtures (não hit OpenAI/Anthropic nos testes)
- [ ] Rodar em CI com `npm run test:e2e`
- [ ] Typecheck passes

#### US-042: E2E mobile — workspace responsivo
**Description:** Como dev, preciso validar que o workspace funciona em viewport mobile.

**Acceptance Criteria:**
- [ ] Playwright test em `test/e2e/builder/workspace-mobile.spec.ts`
- [ ] Usa `test.use({ viewport: { width: 375, height: 667 } })`
- [ ] Verifica: toggle chat/agente funciona, sidebar drawer abre, touch targets ≥ 44px
- [ ] Typecheck passes

#### US-043: A11y audit com axe-core
**Description:** Como dev, preciso de audit automatizado de acessibilidade nas páginas novas.

**Acceptance Criteria:**
- [ ] Playwright + `@axe-core/playwright` em `test/e2e/builder/a11y.spec.ts`
- [ ] Testa páginas: `/`, `/projetos`, `/projetos/[id]` (cada tab)
- [ ] Falha se encontrar violações `critical` ou `serious`
- [ ] Warnings `moderate` viram TODOs (não bloqueiam)
- [ ] Typecheck passes

---

### Fase J — Refactor Visual `/configuracoes/*` (padrão auth v3)

> **Princípio:** cada story DEVE usar `(auth)/*` existente como referência visual. Ou seja: bg `var(--color-bg)` preto, text `var(--color-fg)` branco, fonts DM Sans/Mono, amber accents, tokens de radius/shadow, **logo nova do `quayer-ds-v3.html`**.
>
> **Before/After obrigatório:** cada story requer screenshots antes/depois comparadas no PR pra garantir consistência com login v3.

#### US-044: Shell layout `/configuracoes/*` em padrão v3
**Description:** Como user, quero que a raiz `/configuracoes` tenha um shell consistente com o app v3: sidebar lateral de sub-seções, header com breadcrumb, conteúdo principal com tokens v3.

**Acceptance Criteria:**
- [ ] Criar `src/app/configuracoes/layout.tsx` com shell wrapper
- [ ] Layout interno: sidebar secundária à esquerda (lista de sub-seções), conteúdo à direita
- [ ] Header sticky com breadcrumb "Configurações › [sub-seção]"
- [ ] Background `var(--color-bg)` (preto), text `var(--color-fg)` (branco)
- [ ] Logo Q-bolt + wordmark "Quayer" do `quayer-ds-v3.html` no header principal
- [ ] Sidebar secundária usa tokens v3 (bg-surface, borders, hover amber)
- [ ] Empty state educativo na raiz `/configuracoes` apresentando as sub-seções
- [ ] Mobile (<768px): sidebar vira drawer, conteúdo fullscreen
- [ ] A11y: ARIA landmarks `nav` + `main`
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-045: Refactor `/configuracoes/organizacao` pra v3
**Description:** Como admin da org, quero editar os dados da minha organização numa tela com visual v3 (dark, amber, DM Sans).

**Acceptance Criteria:**
- [ ] Migrar `/integracoes/settings/organization` → `/configuracoes/organizacao`
- [ ] Form: nome, logo upload, timezone, tipo (PF/PJ), CNPJ
- [ ] Inputs shadcn com variant v3 (bg-surface, border-subtle, focus ring amber)
- [ ] Botões variant primary amber pra ações primárias
- [ ] Cards com radius + shadow tokens
- [ ] Mensagens success/error com variant v3
- [ ] Preserva funcionalidade atual (edição, salvamento, validação Zod)
- [ ] Redirect 308 da rota antiga
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-046: Refactor `/configuracoes/membros` pra v3
**Description:** Como admin, quero ver e gerenciar membros da org em tabela com visual v3.

**Acceptance Criteria:**
- [ ] Migrar `/integracoes/users` → `/configuracoes/membros`
- [ ] Tabela: avatar, nome, email, role, status, ações (editar, remover, reenviar convite)
- [ ] Botão "Convidar membro" variant amber
- [ ] Modal de convite com form (email + role + mensagem opcional)
- [ ] Empty state se zero membros
- [ ] Filtro por role + busca por nome/email
- [ ] Tabela com tokens v3 (bg-surface headers, row hover, divisors)
- [ ] Redirect 308 da rota antiga
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-047: Refactor `/configuracoes/roles` pra v3
**Description:** Como admin, quero gerenciar roles RBAC customizadas em visual v3.

**Acceptance Criteria:**
- [ ] Migrar `/integracoes/settings/roles` → `/configuracoes/roles`
- [ ] Lista de roles com contagem de membros + permissões
- [ ] Modal de criação/edição com checkboxes de permissões agrupadas
- [ ] Lock nas roles builtin (admin, member)
- [ ] Visual v3 completo
- [ ] Redirect 308 da rota antiga
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-048: Refactor `/configuracoes/scim` e `/configuracoes/dominios` pra v3
**Description:** Como admin enterprise, quero configurar SCIM provisioning e domínios verificados em visual v3.

**Acceptance Criteria:**
- [ ] Migrar `/integracoes/settings/scim` → `/configuracoes/scim`
- [ ] Migrar `/integracoes/settings/domains` → `/configuracoes/dominios`
- [ ] SCIM: endpoint URL, token gerado (com copy button), teste de conexão
- [ ] Domínios: lista + verificação DNS (TXT records) + status badges v3
- [ ] Redirects 308 das rotas antigas
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-049: Refactor `/configuracoes/billing` + `/faturas` pra v3
**Description:** Como admin financeiro, quero ver plano, método de pagamento e histórico de faturas em visual v3.

**Acceptance Criteria:**
- [ ] Migrar `/integracoes/settings/billing` → `/configuracoes/billing`
- [ ] Migrar `/integracoes/settings/invoices` → `/configuracoes/billing/faturas`
- [ ] Card do plano atual com CTA upgrade/downgrade (amber)
- [ ] Método de pagamento editável
- [ ] Tabela de faturas com download (tokens v3)
- [ ] Status badges semânticos (paga=green, pendente=amber, atrasada=red)
- [ ] Redirects 308
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-050: Refactor `/configuracoes/canais/whatsapp` (lista instâncias) pra v3
**Description:** Como user, quero ver minhas instâncias WhatsApp conectadas em visual v3.

**Acceptance Criteria:**
- [ ] Migrar `/integracoes` (root) → `/configuracoes/canais/whatsapp`
- [ ] Grid de cards: nome, número, status, métricas
- [ ] Cards com tokens v3 (bg-surface, radius, shadow, border hover)
- [ ] CTA "+ Nova instância" variant amber
- [ ] Status badges (🟢/🔴/🟡)
- [ ] Empty state educativo
- [ ] Redirect 308
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-051: Refactor `/configuracoes/canais/whatsapp/[id]` (settings + QR + sessões) pra v3
**Description:** Como user, quero gerenciar uma instância WhatsApp específica em visual v3.

**Acceptance Criteria:**
- [ ] Migrar `/integracoes/[instanceId]/settings` → `/configuracoes/canais/whatsapp/[id]`
- [ ] Tabs internas: Config, QR Code, Sessões, Webhooks
- [ ] Tab Config: form com dados (visual v3)
- [ ] Tab QR Code: QR centralizado, timer de expiração, botão regenerar (padrão v3 do auth)
- [ ] Tab Sessões (migrar `/integracoes/sessions`): tabela de sessões ativas + ações
- [ ] Tab Webhooks: eventos webhook específicos dessa instância
- [ ] Redirects 308
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-052: Refactor `/configuracoes/integracoes/chatwoot` pra v3
**Description:** Como user, quero configurar integração Chatwoot em visual v3.

**Acceptance Criteria:**
- [ ] Migrar `/ferramentas/chatwoot` → `/configuracoes/integracoes/chatwoot`
- [ ] Form: URL instância, access token, account ID, teste de conexão
- [ ] Status conexão em destaque (badge v3)
- [ ] Sync logs (últimas 10 sincronizações) em tabela v3
- [ ] Redirect 308
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-053: Refactor `/configuracoes/webhooks` pra v3
**Description:** Como dev/admin, quero gerenciar webhooks de saída em visual v3.

**Acceptance Criteria:**
- [ ] Migrar `/ferramentas/webhooks` → `/configuracoes/webhooks`
- [ ] Lista: URL, eventos subscritos, status, última execução
- [ ] Modal de criação/edição com validação de URL
- [ ] Editor de eventos (checkboxes agrupados)
- [ ] Test runner inline (dispara webhook teste)
- [ ] Logs de execução (últimas 20) em tabela v3
- [ ] Redirect 308
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-054: Refactor `/configuracoes/perfil/seguranca` pra v3
**Description:** Como user, quero gerenciar meu 2FA, WebAuthn e dispositivos em visual v3.

**Acceptance Criteria:**
- [ ] Migrar `/user/seguranca` → `/configuracoes/perfil/seguranca`
- [ ] Seções: 2FA (TOTP), Passkeys (WebAuthn), Dispositivos logados
- [ ] 2FA: QR code setup + input validação + recovery codes (visual v3)
- [ ] Passkeys: lista + botão "Adicionar passkey" (trigger WebAuthn)
- [ ] Dispositivos: sessões ativas com IP/device + botão "encerrar"
- [ ] Visual v3 completo
- [ ] Redirect 308
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-055: Visual regression tests pra `/configuracoes/*`
**Description:** Como dev, preciso garantir que o refactor não quebrou nada visualmente.

**Acceptance Criteria:**
- [ ] Playwright test em `test/e2e/visual/configuracoes.spec.ts`
- [ ] Screenshots de cada sub-página em 3 viewports (375, 768, 1440)
- [ ] Comparação com baseline (primeira execução define baseline)
- [ ] Falha se diff > 5% em regiões críticas (headers, cards, buttons)
- [ ] Gera report HTML com diffs visíveis
- [ ] Typecheck passes

---

### Fase K — Refactor Visual `/admin/*` (padrão auth v3)

> **Princípio:** mesmo da Fase J — seguir `(auth)/*` como referência. Admin é usado por super admin, mas consistência importa (founder transita entre user e admin).

#### US-056: Shell layout `/admin/*` em padrão v3
**Description:** Como super admin, quero que a raiz `/admin` tenha um shell consistente com o app v3.

**Acceptance Criteria:**
- [ ] Refatorar `src/app/admin/layout.tsx` pra shell v3
- [ ] Sidebar secundária lista as 13 sub-rotas de admin
- [ ] Header sticky com breadcrumb "Admin › [sub-seção]"
- [ ] Background preto, text branco, logo Q-bolt
- [ ] Badge "Super Admin" destacado no header (visual v3)
- [ ] Mobile: drawer
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-057: Refactor `/admin` dashboard pra v3
**Description:** Como super admin, quero um dashboard com métricas globais em visual v3.

**Acceptance Criteria:**
- [ ] Cards de métricas: total orgs, total users, MRR, agentes ativos, mensagens processadas
- [ ] Gráficos (linha/barra) com tokens v3 (cores amber, bg preto)
- [ ] Lista de eventos recentes (signup, deploy, etc)
- [ ] Visual v3 (cards, tabelas)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-058: Refactor `/admin/organizations` pra v3
**Description:** Como super admin, quero gerenciar todas as orgs em visual v3.

**Acceptance Criteria:**
- [ ] Tabela: nome, plano, users, status, criada em, ações
- [ ] Busca + filtros (plano, status, data)
- [ ] Row click → detalhes da org
- [ ] Visual v3 (tabela dark, badges, buttons)
- [ ] Merge com ex-`/integracoes/admin/clients` (redirect 308)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-059: Refactor `/admin/invitations` + `/admin/sessions` pra v3
**Description:** Como super admin, quero ver convites pendentes e sessões JWT ativas em visual v3.

**Acceptance Criteria:**
- [ ] `/admin/invitations`: lista com ações (revogar, reenviar)
- [ ] `/admin/sessions`: tabela de JWTs ativos com ações (revogar, ver detalhes)
- [ ] Visual v3 em ambos
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-060: Refactor `/admin/security` (Central de Segurança) pra v3
**Description:** Como super admin, quero acesso à Central de Segurança em visual v3 preservando features hardening recentes.

**Acceptance Criteria:**
- [ ] Manter 100% das features atuais (alertas, IP rules, WAF config, audit trail)
- [ ] Reskin visual completo pra v3 (cards, badges, charts)
- [ ] Cores semânticas (🔴 crítico, 🟡 warning, 🟢 ok) mapeadas pros tokens v3
- [ ] Zero regressão funcional (smoke test)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-061: Refactor `/admin/audit` pra v3
**Description:** Como super admin, quero ver audit log em visual v3.

**Acceptance Criteria:**
- [ ] Tabela de eventos com filtros (tipo, user, org, data range)
- [ ] Detalhes expandíveis por linha
- [ ] Export CSV
- [ ] Visual v3 (tabela dark, filters panel)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-062: Refactor `/admin/notificacoes` pra v3
**Description:** Como super admin, quero gerenciar notificações sistema em visual v3.

**Acceptance Criteria:**
- [ ] Lista de templates de notificação
- [ ] Editor com preview live
- [ ] Histórico de envios
- [ ] Visual v3
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-063: Refactor `/admin/integracoes` pra v3
**Description:** Como super admin, quero ver integrações globais da plataforma em visual v3.

**Acceptance Criteria:**
- [ ] Grid de integrações disponíveis (Chatwoot, Stripe, SendGrid, SMTP, etc)
- [ ] Status global de cada
- [ ] Config global (não por org)
- [ ] Visual v3
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-064: Refactor `/admin/settings` pra v3
**Description:** Como super admin, quero gerenciar configurações da plataforma em visual v3.

**Acceptance Criteria:**
- [ ] Seções: general, email (SMTP), auth (OAuth providers), rate limits, feature flags
- [ ] Visual v3 (forms, cards, tabs)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-065: Refactor `/admin/billing`, `/subscriptions`, `/invoices` pra v3
**Description:** Como super admin financeiro, quero ver receita agregada, assinaturas e faturas emitidas em visual v3.

**Acceptance Criteria:**
- [ ] `/admin/billing`: MRR, ARR, churn, LTV — dashboard com charts v3
- [ ] `/admin/subscriptions`: tabela de assinaturas ativas/canceladas/pendentes
- [ ] `/admin/invoices`: tabela de todas as faturas emitidas
- [ ] Export financeiro (CSV/XLSX)
- [ ] Visual v3 completo
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

#### US-066: Visual regression tests pra `/admin/*`
**Description:** Como dev, preciso garantir que o refactor do admin não quebrou features críticas.

**Acceptance Criteria:**
- [ ] Playwright test em `test/e2e/visual/admin.spec.ts`
- [ ] Screenshots das 13 sub-páginas em viewport 1440 (admin é desktop-first)
- [ ] Comparação com baseline
- [ ] E2E funcional: executar 3 fluxos chave (criar org, revogar sessão, ver audit log) pra garantir que visual refactor não quebrou backend
- [ ] Typecheck passes

---

## 4. Functional Requirements

- **FR-01:** O sistema DEVE apresentar uma home `/` com campo de texto grande pra user descrever o que quer criar.
- **FR-02:** O sistema DEVE criar um `Project` com `status=draft` ao receber o primeiro prompt, e redirecionar pra `/projetos/[id]`.
- **FR-03:** O sistema DEVE fornecer um chat persistente (via endpoint streaming) pra conversa entre user e Builder AI.
- **FR-04:** O Builder AI DEVE ser um agente registrado em `ai-module/ai-agents` com prompt especializado e tools wrappers.
- **FR-05:** O Builder AI DEVE usar Claude Sonnet 4.5 como provider padrão, com fallback automático pra GPT-4 e Gemini Pro em caso de indisponibilidade.
- **FR-06:** O Builder AI DEVE ter tools pra: criar agente, atualizar prompt, listar instâncias WhatsApp, criar instância WhatsApp (com QR code inline), conectar tools builtins ao agente, pesquisar na web, gerar anatomia de prompt.
- **FR-07:** O sistema DEVE mostrar o prompt gerado pelo Builder ANTES de criar o agente, permitindo que user edite, aceite, ou peça regeneração.
- **FR-08:** O sistema DEVE manter context summary do projeto atualizado automaticamente, enviando pro LLM apenas: summary + últimas 10 mensagens (economia de tokens).
- **FR-09:** O sistema DEVE gerar `pinnedAgentVersion` ao iniciar nova conversa WhatsApp e respeitar essa versão até a conversa ficar silenciada por 24h.
- **FR-10:** O sistema DEVE executar um job BullMQ recorrente (1x/hora) pra expirar pins de conversas silenciadas.
- **FR-11:** O sistema DEVE permitir publicar versões do agente de forma atômica, com rollback pra versão anterior via UI.
- **FR-12:** O sistema DEVE versionar o system prompt linearmente (v1, v2, v3), com descrição humana obrigatória em checkpoints manuais.
- **FR-13:** O sistema DEVE migrar os tokens CSS do DS v3 (hoje em `[data-auth-v3="true"]`) pra escopo global (`:root`), aplicando em todas as novas páginas sem quebrar as páginas auth existentes.
- **FR-14:** O sistema DEVE apresentar sidebar com apenas 4 items: `+ Novo projeto`, `Meus Projetos`, `Configurações`, `Admin` (condicional).
- **FR-15:** O sistema DEVE desligar CRM e inbox do sidebar via feature flag `FEATURE_CRM_ENABLED` (default off), preservando backend.
- **FR-16:** O sistema DEVE aplicar 308 redirects em todas as 18 rotas antigas (conforme `route-migration-plan.md`) pra não quebrar bookmarks.
- **FR-17:** O sistema DEVE controlar a visibilidade do Builder via feature flag `NEXT_PUBLIC_HOME_BUILDER` com rollout gradual (0% → 10% → 50% → 100%).
- **FR-18:** O sistema DEVE ter layouts mobile funcionais em 375px, com bottom nav e toggle chat/preview no workspace.
- **FR-19:** O sistema DEVE passar auditoria WCAG AA (zero violações `critical` ou `serious` do axe-core) nas páginas novas.
- **FR-20:** O sistema DEVE reusar 100% do backend `ai-module/ai-agents` (agentes criados pelo Builder usam o runtime existente).

### FRs adicionais do refactor de design v3

- **FR-21:** O sistema DEVE refatorar visualmente **todas as 14 sub-rotas de `/configuracoes/*`** seguindo o padrão visual das páginas `(auth)/*` existentes (tokens v3, logo nova, layout consistente).
- **FR-22:** O sistema DEVE refatorar visualmente **todas as 13 sub-rotas de `/admin/*`** seguindo o mesmo padrão v3, preservando 100% das features funcionais atuais (incluindo Central de Segurança recém-hardened).
- **FR-23:** O sistema DEVE usar a **logo nova do `quayer-ds-v3.html`** (Q-bolt + wordmark Quayer em DM Sans black) em todos os headers, sidebars, loading states, e empty states das páginas refatoradas. Nenhuma ocorrência da logo antiga deve permanecer nas páginas refatoradas.
- **FR-24:** O sistema DEVE manter componentes shadcn (Button, Input, Card, Dialog, DropdownMenu, Tooltip, Table, Badge, etc) consistentes com o padrão v3 (variants dark, amber accents, DM Sans), sem divergência entre páginas refatoradas e páginas `(auth)/*` existentes.
- **FR-25:** O sistema DEVE passar **visual regression tests** (screenshots baseline vs refactor) pra cada sub-rota de `/configuracoes/*` e `/admin/*` — falha se diff > 5% em regiões críticas após refactor.
- **FR-26:** O sistema DEVE manter **zero regressão funcional** nas páginas refatoradas — todo fluxo atual (criar org, convidar membro, revogar sessão, ver audit log, etc) continua funcionando identicamente.

---

## 5. Non-Goals (Out of Scope) — v1 MVP

### O Builder NÃO vai criar no v1 (vai pro backlog):
- ❌ Campanhas WhatsApp (disparo em massa) — v1.5
- ❌ Templates de mensagem como tipo standalone — inline no agente no v1
- ❌ Ferramentas custom como tipo standalone — inline no agente no v1
- ❌ Automações Instagram — v2+ (greenfield, portar do ORAYON)
- ❌ Tracking WhatsApp Meta (CAPI) — v2+
- ❌ Flow WhatsApp (micro-apps) — v2+
- ❌ Grupos WhatsApp — v3+ (spec separado)

### O Builder NÃO vai ter no v1:
- ❌ Multi-agente guardrail pattern (apenas agente singular)
- ❌ Canary rollout por percentual de conversas (sticky versioning resolve)
- ❌ Onboarding elaborado com tour em vídeo (empty state educativo basta)
- ❌ BYOK (bring your own key) — apenas enterprise e admin-liberado no v1
- ❌ Command palette expandido (só ⌘K pra "Novo projeto" no v1)
- ❌ Auto-testing de agente via LLM-to-LLM (reusa playground manual existente)
- ❌ Compartilhamento público de projetos entre orgs
- ❌ Colaboração em tempo real (CRDT, multi-cursor)
- ❌ Fine-tuning de modelos
- ❌ Marketplace de templates
- ❌ Suporte in-app (Intercom, help center) — backlog

### O que o refactor de design v3 NÃO faz no v1:
- ❌ **Páginas públicas `(public)/*`** (landing, pricing, privacidade, termos, docs, connect, compartilhar) — visual marketing tem spec próprio futuro
- ❌ **Rotas `(auth)/*`** — já rebranded v3 nas Releases 1-3, intocadas (apenas migração de tokens de scope global é aplicada, sem quebra visual)
- ❌ **Redesenho UX de features admin** — admin recebe **reskin visual**, não redesenho funcional (features preservadas 100%)
- ❌ **Componentes novos não-usados nas páginas refatoradas** — focar no que tá nas 27 sub-rotas (14 config + 13 admin)
- ❌ **Dark/Light mode toggle** — v3 é dark-only no v1
- ❌ **Animações custom elaboradas** — usar transições padrão dos tokens (`--duration-fast`, `--ease-*`)

### O que NÃO muda (backend + features):
- ❌ Backend de `ai-module/ai-agents` — zero refactor (só wrapper novo)
- ❌ Backend `crm/*` — preservado (UI apenas disabled via feature flag)
- ❌ Features funcionais das páginas admin — 100% preservadas (Central de Segurança, Audit, Billing)
- ❌ Backend de `/configuracoes/*` — reaproveitado dos endpoints existentes (só muda a UI)

---

## 6. Design Considerations

### Design tokens v3 — migração global

**Estado atual:**
- Tokens (cores amber, bg preto, DM Sans, radius, spacing) vivem em `src/app/globals.css` dentro de `[data-auth-v3="true"] { ... }`
- Apenas páginas `(auth)/*` setam esse atributo no `<html>` via layout

**Mudança necessária (US-017):**
- Mover tokens pra `:root` ou `html` (escopo global)
- Remover `data-auth-v3` attribute do layout auth (não é mais necessário)
- Todas as páginas do app herdam tokens automaticamente
- Zero regressão visual nas páginas auth existentes

**Tokens a preservar (fonte: `quayer-ds-v3.html`):**
- Cores: `--color-primary` (amber), `--color-bg`, `--color-fg`, `--color-muted`, `--color-accent`, etc.
- Tipografia: `--font-sans` (DM Sans), `--font-mono` (DM Mono)
- Espaçamento: `--space-*` (escala modular)
- Radius: `--radius-sm`, `--radius-md`, `--radius-lg`
- Shadow: `--shadow-sm`, `--shadow-md`
- Motion: `--duration-fast`, `--ease-*`

### Componentes a reusar
- `src/client/components/ui/*` (shadcn) — Button, Input, Dialog, DropdownMenu, etc.
- `src/client/components/ds/*` (DS v3 criados em Release 3) — caso existam primitives novos
- `src/client/components/auth/*` — referência visual de como tokens v3 ficam aplicados

### Componentes a criar (Builder)
- `src/client/components/layout/builder-sidebar.tsx`
- `src/client/components/home/home-page.tsx`
- `src/client/components/projetos/projetos-list.tsx`
- `src/client/components/projetos/workspace.tsx`
- `src/client/components/projetos/chat-panel.tsx`
- `src/client/components/projetos/preview-panel.tsx`
- `src/client/components/projetos/tabs/overview-tab.tsx`
- `src/client/components/projetos/tabs/prompt-tab.tsx`
- `src/client/components/projetos/tabs/playground-tab.tsx`
- `src/client/components/projetos/tabs/deploy-tab.tsx`

### Componentes a criar (refactor v3)
- `src/client/components/layout/app-shell.tsx` — shell compartilhado `/configuracoes/*` e `/admin/*` com sidebar secundária + header + breadcrumb
- `src/client/components/layout/brand-logo.tsx` — Logo Q-bolt + wordmark (reusável, baseado no que já existe em `(auth)/*`)
- `src/client/components/ui/data-table-v3.tsx` — wrapper do shadcn Table com estilos v3 (headers bg-surface, row hover, divisors) — evita copiar os mesmos classes em cada refactor
- `src/client/components/ui/empty-state-v3.tsx` — empty state reusável com ilustração + CTA amber
- `src/client/components/ui/status-badge.tsx` — badge com cores semânticas mapeadas pros tokens v3 (🟢 success, 🟡 warning, 🔴 error, ⚫ neutral)

### Padrão visual de cada página refatorada

Toda página em `/configuracoes/*` e `/admin/*` deve seguir:

1. **Background:** `var(--color-bg)` (preto `#000`) — igual `(auth)/*`
2. **Text primário:** `var(--color-fg)` (branco)
3. **Text secundário:** `var(--color-fg-muted)` (white/60%)
4. **Font family:** `var(--font-sans)` (DM Sans) pro texto, `var(--font-mono)` (DM Mono) pra códigos
5. **Accent color:** `var(--color-primary)` (amber) pros CTAs, links hover, focus rings
6. **Surfaces:** `var(--color-bg-surface)` (elevated dark) pros cards, modals, dropdowns
7. **Borders:** `var(--color-border)` (white/10%) pros dividers, table rows
8. **Radius:** `var(--radius-md)` (default) ou `--radius-lg` pra cards maiores
9. **Shadows:** `var(--shadow-sm)` ou `--shadow-md` pra elevation
10. **Spacing:** `var(--space-*)` (escala modular, não valores literais)
11. **Logo:** componente `<BrandLogo />` (Q-bolt + wordmark), sempre no header principal
12. **Buttons primários:** bg amber, text dark, variant `primary` do shadcn Button restylizado
13. **Buttons secundários:** bg transparent, border subtle, variant `outline`
14. **Buttons destrutivos:** bg red semântico, variant `destructive`

### Inspiração visual
- **Claude Artifacts:** chat à esquerda, artefato à direita (pro Builder)
- **v0.dev:** workspace com tabs (pro project workspace)
- **Cursor Composer:** tool calls colapsáveis no chat
- **Lovable:** quick-reply chips em conversas
- **`src/app/(auth)/login`:** **fonte de verdade** pro visual v3 aplicado em páginas normais (cores, spacing, logo, componentes)

### Mobile
- **375px (mobile portrait):** bottom nav sticky, drawer sidebar, toggle chat/preview no workspace
- **768px (tablet):** split 40/60 no workspace, sidebar fixa estreita
- **1024px+ (desktop):** split 50/50, sidebar fixa larga
- **Configurações e Admin em mobile:** sidebar secundária vira drawer, conteúdo fullscreen

### A11y (WCAG AA)
- Contraste ≥ 4.5:1 pra texto, 3:1 pra UI (tokens v3 já foram auditados, usar eles)
- Focus visible com ring amber em tudo focável
- ARIA roles + labels corretos
- Keyboard navigation completa
- Screen reader announcements pra streaming do chat
- Skip links nas páginas refatoradas

---

## 7. Technical Considerations

### Reuso do codebase (mapeado)
| Módulo | Uso no Builder |
|---|---|
| `src/server/ai-module/ai-agents/*` | **Base do Builder** — Builder é um agente registrado aqui |
| `src/server/ai-module/ai-agents/agent-runtime.service.ts` | Runtime compartilhado entre Builder e agentes criados |
| `src/server/ai-module/ai-agents/tools/builtin-tools.ts` | Tools builtins (transfer, pause, notify) expostas pros agentes criados |
| `src/server/communication/instances/*` | Tool wrapper `create_whatsapp_instance` chama esses endpoints |
| `src/app/compartilhar/[token]` | Share link público reusado pra QR code de onboarding |
| `src/server/core/auth/*` | `authProcedure` + session + RBAC |
| `src/server/services/database.ts` | Prisma client (adicionar models novos) |
| `src/server/services/jobs.ts` | BullMQ pra job de expirar pins |

### Novo código (estimativa)
- Módulo novo: `src/server/ai-module/builder/` (~1500 LOC)
  - `builder.controller.ts`, `builder.schemas.ts`, `builder.procedure.ts`
  - `tools/` (8 wrappers × ~100 LOC)
  - `services/context-summary.service.ts`
  - `prompts/builder-system-prompt.ts`
  - `templates/prompt-anatomy.ts`
- Frontend novo: `src/client/components/projetos/` e `/home/` e `/layout/` (~2500 LOC)
- Rotas novas: `src/app/page.tsx` (reescrever), `src/app/projetos/*`, `src/app/configuracoes/*`

### Dependências novas
- `@ai-sdk/anthropic` — provider Anthropic (Vercel AI SDK)
- `@ai-sdk/openai` — provider OpenAI (fallback)
- `@ai-sdk/google` — provider Gemini (fallback)
- `@tavily/core` ou equivalente — pra tool `search_web`
- `@axe-core/playwright` — pra testes A11y (já pode existir do Release 1)

### Integration points
- **Vercel AI SDK:** usa `streamText()` + `tool()` pra multi-provider + tool calling
- **Igniter.js:** endpoints seguem padrão existente (controller → action → handler)
- **Prisma:** novos schemas + migration (aprovação obrigatória do founder)
- **Middleware `src/middleware.ts`:** adicionar redirects 308 + verificar feature flag pra home

### Performance
- Streaming do LLM reduz TTFB percebido (< 500ms pra primeiro token)
- Auto-summary mantém contexto compacto (~3000 tokens/turno max)
- Lazy loading de tabs do workspace (Overview default, outros sob demanda)
- Prisma queries otimizadas com índices compostos

### Segurança
- Todos os endpoints Igniter com `authProcedure({ required: true })`
- Filtro por `organizationId` em todas as queries
- Tool `search_web` com rate limit por org (max 20 calls/dia v1)
- System prompt do Builder com guardrails contra prompt injection
- Validação Zod em todas as entradas
- CSRF via existing auth middleware

### LLM cost monitoring (sem BYOK no v1)
- Cada turno do Builder loga: tokens in, tokens out, provider usado, custo estimado
- Dashboard interno (ou query SQL) pra ver gasto por org
- Alert se uma org gastar > $50/dia no v1 (rate limit automático)

---

## 8. Success Metrics

### Ativação do Builder (primeiras 48h pós-login)
- **TTFA (Time To First Agent):** mediana < 10 minutos; p95 < 30 minutos
- **Taxa de conclusão:** ≥ 60% dos users que entram no Builder terminam criando um agente
- **Taxa de drop-off:** < 40% abandonam antes de completar

### Qualidade Builder
- **Taxa de erro:** < 1% de requests ao endpoint do chat retornam erro 5xx
- **Latência p95 do streaming:** < 3s até primeiro token
- **Zero violações A11y críticas:** axe-core passa clean em CI
- **Zero regressão visual nas páginas auth:** visual tests passam

### Reuso
- **Backend reutilizado:** ≥ 80% do código do `ai-module/ai-agents` (medido via LOC)
- **Zero duplicação:** nenhum endpoint de criação de agente reimplementado

### Consistência visual (refactor v3)
- **100% das 27 sub-rotas refatoradas** (14 de `/configuracoes/*` + 13 de `/admin/*`) passam em visual regression tests
- **Zero regressão funcional:** smoke tests E2E das features críticas do admin (criar org, revogar sessão, audit log) passam após refactor
- **Consistência de logo:** zero ocorrência da logo antiga nas páginas refatoradas (grep verifica)
- **Consistência de tokens:** zero hardcoded colors (`bg-white`, `text-gray-*`) nas páginas refatoradas — todas usam `var(--color-*)`
- **Bundle size:** aumento máximo de 10% no JS bundle após refactor (monitorar via `@next/bundle-analyzer`)
- **Lighthouse accessibility score:** ≥ 95 em todas as páginas refatoradas

### Rollback criteria
- Se taxa de erro > 5% em 1h → flag volta pra `off` automaticamente
- Se TTFA mediana > 30 minutos → investigar antes de avançar rollout
- Se conversão (signup → first agent) cair > 20% vs. baseline → pausar rollout

---

## 9. Open Questions

### Q1 — Compliance LGPD + DPA (Q5 original, não respondida)
O Builder envia mensagens de prompts pros providers LLM (Anthropic/OpenAI/Google) — todos americanos.

**Opções:**
- **A.** Review jurídico bloqueia o dev (espera advogado)
- **B.** Review em paralelo ao dev (pode liberar pra prod depois)
- **C.** Dev completa, bloqueia apenas o rollout em prod com clientes reais
- **D.** Documentar risco, deferir (não recomendado em advocacia)

**Default assumido:** C — dev OK sem compliance, prod precisa review antes.

**Ação:** founder deve contatar advogado LGPD essa semana.

### Q2 — Search provider pro tool `search_web`
**Opções:** Tavily (focado em AI research), Brave Search API, Perplexity, Google Custom Search, Serper.

**Default assumido:** Tavily (mais barato pra research AI-focused). Confirmar no `/plan`.

### Q3 — Editor de prompt na Tab Prompt
**Opções:** textarea estilizada, CodeMirror 6, Monaco.

**Default assumido:** textarea estilizada com syntax highlighting leve (menor bundle). Monaco se precisar de feature avançada futuro.

### Q4 — Helper `builderAiConfig` pra env vars
Precisamos de env vars pra:
- `BUILDER_AI_PROVIDER_CHAIN=claude,gpt4,gemini`
- `BUILDER_AI_MODEL_CLAUDE=claude-sonnet-4-5`
- `BUILDER_AI_MODEL_OPENAI=gpt-4o`
- `BUILDER_AI_MODEL_GEMINI=gemini-2.5-pro`
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`
- `TAVILY_API_KEY`

**Ação:** validar valores antes de dev começar.

### Q5 — Playground tab reusa componente existente?
Atualmente `/integracoes/agents/[id]/playground` tem página própria. Vira componente reutilizável?

**Default assumido:** sim, refatorar `playground-client.tsx` pra componente standalone que aceita `agentId` como prop. Audit técnico pode revelar complicações.

### Q6 — BYOK enterprise — gating
**Decisão do founder (4C):** "BYOK só pra enterprise ou liberado pelo admin"

**Ação:** definir no `/plan` como enterprise é identificado:
- Plano de assinatura?
- Flag manual por org em `/admin/organizations/[id]`?
- Tier-based?

Default assumido: flag por org, admin liberado explicitamente. Sem UI no v1, apenas via admin.

---

## 10. Dependencies

- ✅ Releases 1-3 (auth v3) completas
- ✅ `ai-module/ai-agents` funcional com runtime
- ✅ `communication/instances` funcional com QR code
- ✅ `compartilhar/[token]` rota pública funcional
- ⚠️ Audit técnico do `ai-module/ai-agents` (2 dias, antes do dev começar)
- ⚠️ Review LGPD (em paralelo, bloqueia prod rollout)
- ⚠️ Decisões Q2-Q6 (pode rodar junto com auditoria)

---

## 11. Referências

- [Architecture v5.3](../specs/home-chat-builder/architecture-v5.md) — arquitetura completa
- [Route Migration Plan](../specs/home-chat-builder/route-migration-plan.md) — mapeamento das 63 rotas atuais
- [quayer-ds-v3.html](../quayer-ds-v3.html) — fonte dos tokens de design
- [MEMORY.md](../.claude/projects/.../memory/MEMORY.md) — business model + constraints
- [CLAUDE.md](../CLAUDE.md) — ordem de implementação obrigatória
- `docs/auth/FEATURE_FLAGS.md` — padrão de feature flag estabelecido em Release 3
- `docs/auth/BASELINES.md` — métricas baseline pra comparação
- ORAYON (referência futura pra automações IG) — fora do escopo v1

---

## 12. Checklist final antes do `/plan`

- [x] User stories pequenas e atômicas (43 stories)
- [x] Cada FR numerado e testável
- [x] Non-goals explícitos
- [x] Design tokens v3 global como FR
- [x] Mobile + A11y como stories dedicadas
- [x] Reuso do backend mapeado
- [x] Feature flag + rollout plan
- [x] Migration de rotas (redirects 308)
- [x] Testes unit + E2E + A11y
- [x] Open questions documentadas
- [x] **Fase J (refactor `/configuracoes/*`) adicionada — 13 stories + visual regression**
- [x] **Fase K (refactor `/admin/*`) adicionada — 11 stories + visual regression**
- [x] **FRs 21-26 cobrem refactor de design e consistência visual**
- [x] **Logo nova do `quayer-ds-v3.html` obrigatória em toda página refatorada**
- [x] **Padrão de `(auth)/*` como fonte de verdade pro visual v3**
- [x] Salvo em `tasks/prd-quayer-builder.md`

---

## 13. Cronograma revisado (com refactor de design)

### Estimativa realista por fase

| Fase | Descrição | Dias úteis |
|---|---|---|
| **Auditoria** | Audit técnico `ai-module/ai-agents` | 2 |
| **Foundation (A)** | Schemas + endpoints core | 5 |
| **Builder AI (B)** | Prompt + 7 tools wrappers + context summary | 3 |
| **Design Tokens Global (C)** | Migrar tokens + criar shared components v3 | 3 |
| **Frontend Builder (D)** | Home + lista + workspace + 4 tabs | 7 |
| **Sticky Versioning (E)** | Runtime + job BullMQ | 1 |
| **Mobile + A11y (F)** | Layouts responsivos + WCAG AA | 3 |
| **Migration & Cleanup (G)** | Redirects + CRM disable + delete legacy | 2 |
| **Feature Flag + Rollout (H)** | Gating + monitoring | 1 |
| **Testes Builder (I)** | Unit + E2E + A11y | 4 |
| **Refactor `/configuracoes/*` (J)** | 13 stories × ~1 dia + visual regression | 9 |
| **Refactor `/admin/*` (K)** | 11 stories × ~1 dia + visual regression | 8 |
| **Buffer pra bugs + ajustes** | 15% do total | 7 |
| **TOTAL** | | **~55 dias úteis = 11 semanas** |

### Com paralelização (multi-agent + 2 devs ou 1 dev + multi-agent)

- Fases A, B, C em paralelo (backend + shared components): -5 dias
- Fases D, J, K em paralelo (frontend Builder vs refactor): -10 dias
- Fases F, I rodam junto (testes enquanto finaliza UI): -2 dias
- **Total paralelizado: ~38 dias úteis ≈ 7-8 semanas**

### Com multi-agent brutal (Ralph style, waves paralelas)

- Foundation + Builder AI: 1 wave (2 agents) — 3 dias
- Frontend Builder (D): 1 wave (4 agents paralelos por tab/área) — 4 dias
- Refactor J (configurações): 2 waves (6 agents simultâneos) — 5 dias
- Refactor K (admin): 2 waves (6 agents simultâneos) — 4 dias
- Testes + rollout: 3 dias
- **Total ralph-mode: ~19 dias úteis ≈ 4 semanas**

**Recomendação realista:** planejar pra **8 semanas** (paralelização moderada com buffer), expectativa otimista de **4-5 semanas** com multi-agent agressivo.

---

**Próximo passo:** aprovação do founder → `/plan` → breakdown técnico com schemas/endpoints/stories pra multi-agents executarem em waves paralelas.
