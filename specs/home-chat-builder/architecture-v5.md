# Arquitetura Final — Quayer Builder (v5.3)

> **Status:** Aprovada, enxuta, pronta pra `/plan`
> **Data:** 2026-04-08
> **Substitui:** v1, v2, v3, v4, v5, v5.1, v5.2 (consolidadas)
> **Referências:**
> - [`route-migration-plan.md`](./route-migration-plan.md) — mapeamento backup das 63 rotas atuais
> - Inspiração: Claude Artifacts + v0.dev + Cursor Composer

---

## 0. Changelog v5.2 → v5.3 (corte de 60% de tamanho)

**Decisões novas do founder:**
- ✅ Só 1 tipo de projeto no v1: **Agente IA**. Templates/ferramentas são recursos inline.
- ✅ Tasks panel **dinâmico** (Builder AI decide), não checklist fixo
- ✅ **Sticky versioning** (Opção C) para conversas ativas
- ✅ Builder AI multi-modelo: Claude Sonnet, GPT-4, Gemini Pro (via Vercel AI SDK)
- ✅ Versões lineares, **só do system prompt**
- ✅ Auto-summary do estado do projeto (economia de tokens)
- ✅ Reuso de `/compartilhar/[token]` existente para QR codes
- ✅ `/admin/*` preservado integralmente
- ✅ CRM (`/contatos`, `/conversas`) disabled, backend preservado

**Removido da v5.2 (desnecessário pro MVP):**
- ❌ 7 tipos de projeto detalhados (só 1 no v1, resto vira apêndice)
- ❌ Canary rollout 10→50→100 (deploy é atômico + sticky versioning)
- ❌ Tasks panel pré-definido com 8 etapas fixas
- ❌ Onboarding elaborado com 3 passos
- ❌ Seções mobile/a11y detalhadas (viram princípios + spec de /plan)
- ❌ Automação IG/Flow/Tracking detalhadas (vão pra roadmap)
- ❌ Multi-agente guardrail como feature v1 (vai pra v2)

---

## 1. Princípios não-negociáveis

1. **Claude Artifacts é o norte** — chat esquerda + preview direita, sempre visível
2. **Reusar antes de criar** — 80% do backend já existe (`ai-module/ai-agents`, `communication/*`)
3. **Builder AI é um agente Quayer** — ironia elegante: Quayer constrói agentes via um agente
4. **Projetos vs Recursos** — só coisas terminais são projetos; templates/tools são recursos inline
5. **Tasks dinâmicas** — Builder decide o que fazer, nada de checklist fixo
6. **Versões lineares só de prompt** — simples, sem branching, sem snapshot total
7. **Sticky versioning** — conversas ativas ficam na versão antiga até terminarem
8. **Context auto-summary** — custo LLM linear, não quadrático
9. **Deploy atômico** — sem canary, sem conversa zumbi; rollback simples
10. **Feature flag com sunset** — `NEXT_PUBLIC_BUILDER` tem data pra morrer
11. **Mobile-first, A11y WCAG AA** — não são afterthought (specs no /plan)
12. **CRM off, Admin preservado** — decisões do founder, documentadas
13. **LGPD + DPA antes de prod** — compliance não negociável em advocacia

---

## 2. Mental model (1 diagrama)

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   HOME (/)                                                   │
│   "O que você quer criar hoje?"                              │
│                                                              │
│            ↓ prompt do usuário                               │
│                                                              │
│   /projetos/[id]  ← layout split                             │
│                                                              │
│   ┌──────────────────┐  ┌────────────────────────┐          │
│   │ 💬 CHAT           │  │ 🤖 PROJETO (preview)   │          │
│   │                  │  │                        │          │
│   │ (Builder AI fala │  │ Tabs internas:         │          │
│   │  e executa tools)│  │ [Overview] [Prompt]    │          │
│   │                  │  │ [Playground] [Deploy]  │          │
│   │ Tasks (dinâmicas)│  │ [Analytics] [Mais ▾]   │          │
│   └──────────────────┘  └────────────────────────┘          │
│                                                              │
│            ↓ publicar                                        │
│                                                              │
│   Agente rodando em produção, atendendo no WhatsApp          │
│                                                              │
└──────────────────────────────────────────────────────────────┘

  ▼                                                      ▲
  │                                                      │
  └─── Sidebar: + Novo | Projetos | Configurações ──────┘
```

- **Chat** é onde o Builder AI conversa com o user pra coletar info e criar/editar o projeto
- **Preview** é onde o user vê o projeto tomando forma, clicável, editável
- **Tabs** são o workspace do projeto depois de criado — sempre visíveis, contexto sempre acessível

---

## 3. Projetos vs Recursos

### 🎯 Projetos (terminais, têm workspace próprio)

Só entram no sidebar como items clicáveis. Só 1 tipo no v1:

| Tipo | Fase | Backend |
|---|---|---|
| 🤖 **Agente IA** | **v1** (MVP) | ✅ `ai-module/ai-agents` existe |
| 📢 Campanha WhatsApp | v1.5 | ✅ `communication/campaigns` existe |
| 📸 Automação Instagram | v2+ | ❌ Portar do ORAYON |
| 🎯 Tracking Meta | v2+ | ❌ Greenfield |
| 📱 Flow WhatsApp | v2+ | ❌ Meta Flows API |
| 👥 Grupos | v3+ (futuro separado) | ❌ Greenfield |

### 🧱 Recursos (inline, reutilizáveis)

**Não aparecem no sidebar.** São criados **dentro do projeto** pelo Builder AI quando necessário:

| Recurso | Onde é criado | Onde vive |
|---|---|---|
| 💬 Template de mensagem | Chat do Builder, quando precisa ("cria template de boas-vindas") | Tab "Templates" do projeto |
| 🛠️ Ferramenta custom | Chat do Builder ("conecta com API X") | Tab "Tools" do projeto |
| 🏷️ Etiqueta/tag | Chat do Builder ("cria tag Urgente") | Tab "Etiquetas" do projeto |
| 📞 Resposta rápida | Chat do Builder | Vira template tipo "quick-reply" |

**Vantagem:** zero páginas novas pra criar, zero overhead cognitivo. User nunca sai do projeto.

**Trade-off:** um template criado no Projeto A não aparece facilmente disponível pra Projeto B. Solução: v1.5 adiciona `/recursos/templates` como biblioteca reusável. No v1, escopo é por projeto.

---

## 4. Builder AI — o agente meta

### O insight fundamental

> **O Builder é um agente Quayer, rodando em `ai-module/ai-agents` como qualquer outro agente.**

Isso significa:
- **Zero infra nova pro Builder** — reusa runtime, tool calling, provider abstraction
- Testável como qualquer outro agente (playground, versions, analytics)
- Upgradeável trocando o prompt do Builder (não precisa deploy de código)
- Substituível por modelo diferente (Claude ↔ GPT-4 ↔ Gemini) sem tocar no app

### Configuração do Builder

```
Tipo: ai_agent
Visibilidade: INTERNAL (não aparece na lista de projetos do usuário)
Modelo: configurável (Claude Sonnet padrão, fallback GPT-4, fallback Gemini)
Prompt: ver seção 4.1 abaixo
Tools: ver seção 4.2 abaixo
```

### 4.1 System prompt do Builder (esboço inicial — refinar no dev)

```
Você é o Builder do Quayer, uma plataforma de automação WhatsApp.

Sua missão: ajudar o usuário (advogado, contador, corretor, founder)
a criar agentes de IA conversacionais para responder no WhatsApp da
empresa dele.

Contexto do produto:
- Quayer opera em canais de comunicação (WhatsApp primário, Instagram futuro)
- Usuários são não-técnicos, preferem linguagem natural a formulários
- Cada agente criado tem: nome, prompt, modelo, tools, instância WhatsApp
- Deploy é atômico (uma versão em produção por vez)

Suas ferramentas:
- search_web(query) — pesquisa prompts/best practices
- generate_prompt_anatomy(brief) — gera prompt estruturado pra nicho
- create_agent(config) — cria agente via ai-module/ai-agents
- update_agent_prompt(agentId, newPrompt) — edita prompt (gera v2, v3, ...)
- list_whatsapp_instances(orgId) — lista instâncias disponíveis
- create_whatsapp_instance(orgId) — dispara flow de QR code
- attach_tool(agentId, toolKey) — conecta tool ao agente (transfer_to_human, etc)
- create_tag(agentId, name, color) — cria etiqueta pro agente
- create_template(agentId, content) — cria template de mensagem
- summarize_project_state(projectId) — retorna snapshot atual do projeto

Regras:
1. Sempre mostre o prompt ANTES de criar. Nunca crie com "prompt padrão" silencioso.
2. Pergunte dados críticos uma vez. Se user pular, use defaults razoáveis.
3. Multi-model: se Claude tiver timeout, tente GPT-4. Avise user em caso de degradação.
4. Zero jargon técnico. Fale como humano.
5. Reporte progresso em cada passo ("Criando agente... Conectando...").
```

### 4.2 Tools do Builder (wrapper sobre endpoints existentes)

Cada tool é um wrapper fino sobre API existente:

```
create_agent(config):
  → POST /api/v1/ai-agents/create (endpoint ai-module existente)
  → retorna agentId

update_agent_prompt(agentId, newPrompt):
  → POST /api/v1/ai-agents/[id]/prompt-versions (cria nova versão linear)
  → retorna versionId

list_whatsapp_instances(orgId):
  → GET /api/v1/instances/list (endpoint communication/instances existente)

create_whatsapp_instance(orgId):
  → POST /api/v1/instances/create
  → GET /api/v1/instances/[id]/qr-code
  → retorna QR code image + share link (/compartilhar/[token] existente)

attach_tool(agentId, toolKey):
  → POST /api/v1/ai-agents/[id]/tools
  → toolKey = 'transfer_to_human' | 'pause_session' | 'notify_team' | etc (builtins existentes)

search_web(query):
  → integração com Tavily/Brave/Perplexity (escolher no /plan)

generate_prompt_anatomy(brief):
  → chama sub-LLM (pode ser o mesmo modelo) com template de anatomia de prompt
```

### 4.3 Multi-model support

```
Provider chain (via Vercel AI SDK):
1. Claude Sonnet 4.5   (primary — melhor tool calling)
2. GPT-4o              (fallback 1 — mais barato)
3. Gemini Pro          (fallback 2 — se Anthropic + OpenAI caírem)
```

Configurado via env var `BUILDER_AI_PROVIDER_CHAIN=claude,gpt4o,gemini`.

BYOK futuro (v1.5): cada org pode trazer própria key, override do padrão.

### 4.4 Context auto-summary

Backend mantém em `project_conversations`:

```
{
  id: uuid,
  projectId: uuid,
  stateSummary: text  // auto-generated, atualizado após cada turno
  recentMessages: text[]  // últimas 10 mensagens raw
}
```

**Cada turno do Builder recebe:**
- `stateSummary` (o que é o projeto hoje — ~500 tokens)
- `recentMessages` (últimas 10 interações — ~2000 tokens)
- **Nova mensagem do user**

**Total por turno:** ~3000 tokens input, não 50000. Custo linear, não quadrático.

**Quando `stateSummary` é atualizado?**
- Automaticamente após cada turno que resulta em mudança de estado (tool call, edit)
- Resumo feito pelo próprio Builder usando ferramenta interna `summarize_project_state`
- Gasta ~500 tokens extras, mas economiza 10x em turnos subsequentes

---

## 5. Sticky versioning (Opção C — decisão do founder)

### Problema

Quando você publica v4 do agente, tem conversas v3 ativas com clientes reais. Subir pra v4 no meio quebra contexto.

### Solução

Cada conversa do cliente final no WhatsApp tem um campo `pinnedAgentVersion`:

```
whatsapp_conversations  (tabela existente ou extender)
────────────────────
id                uuid
contactId         uuid
agentId           uuid
pinnedAgentVersion int  ← NOVO CAMPO
startedAt         timestamp
lastMessageAt     timestamp
```

### Runtime logic

```
Novo turno do contato chega:
  ↓
Encontra conversa ativa (última < 24h):
  ├── SIM: usa pinnedAgentVersion (respeita sticky)
  └── NÃO: cria nova conversa, pinnedAgentVersion = versão produção atual
```

### Quando a conversa "expira"

- **Silêncio de 24h** do contato → conversa considerada "fechada"
- Próxima mensagem do mesmo contato → nova conversa com versão atual
- **Deploy de nova versão não mexe em conversas ativas** — só afeta novas

### Trade-off

- **Upside:** zero quebra de UX pros clientes finais; deploy seguro
- **Downside:** conversa longa pode ficar na versão antiga "pra sempre" (até o contato parar de falar)
- **Mitigação:** dashboard mostra "X conversas em v3 antigas" — user decide se quer "forçar rollover" (notify + terminate conversa)

### Implementação

- **v1:** schema pronto, sem UI de "forçar rollover" (só confia no silêncio de 24h)
- **v1.5:** tab "Versões" mostra breakdown: "v3 = 12 conversas ativas, v4 = 47 novas desde deploy"
- **v2:** botão "forçar rollover" pra casos específicos

---

## 6. Arquitetura de rotas final

### 6.1 Rotas novas (core)

| Rota | Propósito |
|---|---|
| `/` | Home com prompt central + grid de projetos recentes |
| `/projetos` | Lista de projetos com filtros |
| `/projetos/novo?prompt=...` | Cria projeto + redirect pra workspace |
| `/projetos/[id]` | Workspace: chat + preview + tabs |
| `/configuracoes/*` | Shell de settings (consolida 15+ rotas antigas) |

### 6.2 Rotas preservadas / migradas

**Ver `route-migration-plan.md`** pra mapeamento completo de **63 rotas atuais** com status keep/move/disable/delete.

**Resumo:**
- 🟢 **29 rotas preservadas** (todas públicas + auth + admin)
- 🔄 **18 rotas movidas** com redirect 308 (integrações/settings/ferramentas viram configurações)
- 🟠 **2 rotas inline** (templates, respostas rápidas viram recursos do projeto)
- 🔴 **5 rotas disabled** (CRM + inbox, backend preservado)
- ❌ **9 rotas deletadas** (legacy orphans + vazios)

### 6.3 Sidebar final

```
⚡ Quayer

┌──────────────────────────┐
│  + Novo projeto      ⌘K  │
└──────────────────────────┘

MEUS PROJETOS
🤖 Captador Silva
🤖 Suporte SaaS       draft
─── ver todos

──────────────

⚙️ Configurações
  └ Canais (WhatsApp)
  └ Integrações (Chatwoot, webhooks)
  └ Organização, Membros, Roles
  └ Billing
  └ Segurança (SCIM, domínios, 2FA)
  └ Perfil

[Admin]  (se super admin)
```

**3-4 items visíveis** na navegação principal. CRM fora. Inbox fora.

---

## 7. Jornadas MVP v1 (apenas 4)

### J1. Criar primeiro agente

```
Passo 1: User digita na home: "agente de captação advocacia trabalhista"
         → POST /projetos/novo { prompt } → redirect /projetos/[id]
         ↓
Passo 2: Chat + preview aparecem. Chat escreve:
         "Vou te ajudar. Primeiro, qual WhatsApp usar?"
         [Silva Advocacia ▾]  [+ Nova instância (QR)]
         ↓
Passo 3: User escolhe instância existente OU clica [+ Nova]
         → Se nova: Builder chama create_whatsapp_instance → mostra QR inline
         → User escaneia → webhook confirma → Builder continua
         ↓
Passo 4: Builder usa search_web + generate_prompt_anatomy
         → Mostra prompt COMPLETO no chat (formato markdown)
         → Botões: [Aceitar] [Editar] [Regenerar]
         ↓
Passo 5: User aceita
         → Builder chama create_agent + attach_tool (defaults)
         → Preview à direita renderiza o agente com status "draft"
         ↓
Passo 6: Builder: "Agente criado. Quer testar no playground?"
         [🎮 Testar] [🚀 Publicar] [Continuar configurando]
         ↓
Passo 7: User escolhe caminho
         - Testar → abre playground inline (conversa simulada)
         - Publicar → deploy atômico, status → "produção"
         - Continuar → fica em draft, user edita via chat ou manual
```

**Tarefas dinâmicas no panel:** Builder marca conforme faz. Não tem checklist fixo. Exemplo real:
```
📋 Tarefas (dinâmicas)
✓ Pesquisando best practices jurídico
✓ Gerando anatomia do prompt
✓ Validando com user
✓ Criando agente
✓ Conectando tools default (transfer_to_human, notify_team)
⏸ Aguardando ação do user
```

### J2. Retomar e refinar via chat

```
Passo 1: User clica em "Captador Silva" no sidebar
         → /projetos/[id] abre com chat + preview
         → stateSummary carregado pro Builder ter contexto
         ↓
Passo 2: User: "deixa o prompt mais formal"
         → Builder chama update_agent_prompt
         → Nova versão linear (v2)
         → Preview atualiza
         ↓
Passo 3: Se agente tá em produção, banner aparece:
         "⚠️ Você tem v2 em draft. Publicar? [Publicar] [Ver diff]"
         ↓
Passo 4: User publica → deploy atômico
         → Sticky versioning: conversas ativas ficam em v1
         → Novas conversas começam em v2
```

### J3. Editar manualmente via workspace

```
Passo 1: User abre projeto → aba "Prompt"
         → Vê editor do system prompt
         ↓
Passo 2: Edita texto diretamente
         → Auto-save (indicator "salvando...")
         → Quando sai da aba, backend cria versão
         ↓
Passo 3: Volta pro chat do Builder → banner:
         "ℹ️ Prompt foi editado manualmente. Builder sabe do novo estado."
         (stateSummary atualizado, Builder recebe contexto novo automaticamente)
```

### J4. Deploy

```
Passo 1: Aba "Deploy" do projeto
         ↓
Passo 2: Vê:
         Produção: v1 (há 3 dias)
         Draft: v2 (mudanças: prompt mais formal + nova tool)
         [Publicar v2] [Ver diff] [Descartar draft]
         ↓
Passo 3: Clica "Publicar v2" → modal:
         "Publicar v2 em produção?
          12 conversas ativas continuam em v1 até terminarem.
          Novas conversas usam v2.
          [Confirmar] [Cancelar]"
         ↓
Passo 4: Confirma → backend muda status → toast "v2 em produção"
         → Rollback disponível: [Rollback pra v1]
```

---

## 8. Data model (mínimo)

### Tabelas novas

```
projects
────────
id                uuid
organizationId    uuid
userId            uuid
type              enum ('ai_agent')  ← só 1 no v1
aiAgentId         uuid nullable (fk ai_agent_configs)  ← polimórfico, mas 1 FK no v1
name              text
status            enum ('draft', 'production', 'paused', 'archived')
createdAt/updatedAt/archivedAt

project_conversations
─────────────────────
id                uuid
projectId         uuid unique (1:1 com projects)
organizationId    uuid
userId            uuid
stateSummary      text  ← auto-generated
lastMessageAt     timestamp

project_messages
────────────────
id                uuid
conversationId    uuid
role              enum ('user', 'assistant', 'tool', 'system_banner')
content           text
toolCalls         jsonb nullable
metadata          jsonb  ← tokens in/out, model used, latency
createdAt

prompt_versions  (renomeado de project_versions — versões só de prompt)
────────────────
id                uuid
aiAgentId         uuid (fk ai_agent_configs)  ← versionamento direto no agente
versionNumber     int  ← linear (1, 2, 3...)
content           text  ← system prompt completo
description       text  ← opcional ("mais formal")
createdBy         enum ('chat', 'manual')
createdAt
publishedAt       timestamp nullable
publishedBy       uuid nullable
```

### Tabelas reutilizadas (zero mudança)

- `ai_agent_configs` (ai-module/ai-agents)
- `agent_tools` (builtins + custom)
- `agent_deployments`
- `organizations`, `users`, `memberships`
- `instances` (communication/instances)
- `message_templates`
- `labels`

### Tabela alterada (sticky versioning)

```
whatsapp_conversations  (tabela já existe)
────────────────
+ pinnedAgentVersion  int nullable  ← NOVO CAMPO
```

**Migration:** backfill com a versão atual produção de cada agente pras conversas existentes.

---

## 9. Reuso do codebase existente

| Camada | Reusar | Status |
|---|---|---|
| **Backend agente** | `src/server/ai-module/ai-agents/` | ✅ 100% — Builder usa `create_agent` como tool |
| **Agent runtime** | `agent-runtime.service.ts` | ✅ 100% — Builder **É** um agente rodando aqui |
| **Builtin tools** | `transfer_to_human`, `pause_session`, `notify_team`, etc | ✅ 100% — usadas pelos agentes criados |
| **Multi-provider LLM** | Vercel AI SDK + OpenAI/Claude/Groq | ✅ 100% — só adiciona Gemini provider |
| **WhatsApp instances** | `src/server/communication/instances/` | ✅ 100% — Builder dispara create instance + QR |
| **Share link /compartilhar/[token]** | rota pública existente | ✅ 100% — reusa pra QR code |
| **Message templates** | `src/server/communication/templates/` | ✅ 80% — inline no v1, UI standalone v1.5 |
| **Campanhas** | `src/server/communication/campaigns/` | ✅ 80% — v1.5 ativa como tipo de projeto |
| **Chatwoot** | `src/server/integration/chatwoot/` | ✅ 70% — move de /ferramentas pra /configuracoes |
| **Auth + admin + public** | Tudo intocado | ✅ 100% — 0 mudanças |

**Novo código necessário (v1):**
1. Tabelas: `projects`, `project_conversations`, `project_messages`, `prompt_versions` (+ ajuste `whatsapp_conversations`)
2. Endpoints: `POST /projetos/novo`, `POST /projetos/[id]/chat/message` (streaming), `POST /projetos/[id]/publish`
3. Tools do Builder (wrappers finos sobre endpoints existentes)
4. Frontend: `/`, `/projetos`, `/projetos/novo`, `/projetos/[id]`
5. Feature flag + redirects 308 pras rotas antigas

**Estimado:** 4-6 semanas de dev com 1 dev sênior (**não** as 2 semanas otimistas da v5.2).

---

## 10. MVP v1 — scope mínimo realista

### ✅ IN

- Home `/` com prompt central
- Criação de agente via chat (Builder AI)
- Workspace `/projetos/[id]` com 4 tabs: Overview, Prompt, Playground, Deploy
- Multi-provider LLM no Builder (Claude, GPT-4, Gemini)
- Context auto-summary
- Sticky versioning básico
- Deploy atômico
- Sidebar nova minimalista
- Redirects 308 pras rotas antigas
- CRM disabled (sidebar hidden, backend preservado)
- Feature flag `NEXT_PUBLIC_HOME_BUILDER` com data de sunset documentada
- Mobile layouts (3 breakpoints)
- A11y WCAG AA básica

### ❌ OUT (vai pra v1.5+)

- Templates como tipo de projeto standalone
- Ferramentas custom como tipo standalone
- Campanhas como tipo (v1.5)
- Automações IG/Flow/Tracking (v2+)
- Grupos WhatsApp (v3+)
- Multi-agente guardrail (v2)
- Tasks panel explícito (v1 tem log dinâmico simples do Builder)
- Canary rollout (sticky versioning cobre 90% dos casos)
- Analytics avançado com benchmarks e alertas
- Onboarding elaborado com vídeo tour
- Command palette global (v1.5)
- Inbox read-only (nunca, a menos que surja demanda)
- Suporte in-app (help center, chat de suporte)

### Cronograma realista

| Fase | Dias | Entrega |
|---|---|---|
| Auditoria técnica do `ai-module/ai-agents` atual | 2 | Mapping real do que reusar vs refactor |
| Schema + migrations + endpoints básicos | 5 | Backend foundation |
| Builder AI (prompt + tools wrappers) | 3 | Builder funcional standalone |
| Frontend `/`, `/projetos`, `/projetos/[id]` | 7 | UI completa desktop |
| Mobile responsive + touch targets | 3 | UI completa mobile |
| A11y WCAG AA (ARIA, keyboard, focus) | 2 | Passes axe-core |
| Redirects 308 + CRM disable | 2 | Migration segura |
| Feature flag + rollout prep | 1 | Pronto pra canary users |
| Testes (unit + E2E + a11y) | 4 | Pipeline verde |
| Buffer pra bugs (realidade) | 3 | — |
| **TOTAL** | **~32 dias úteis = 6-7 semanas** | **MVP v1 pronto** |

**Com multi-agent paralelo:** pode cair pra 4-5 semanas. Mas com **1 dev solo (founder), esperar 6-7 semanas honestas**.

---

## 11. Riscos residuais (senior PE check)

| Risco | Severidade | Mitigação |
|---|---|---|
| **R1** — Premissa "chat > formulário" não validada com user real | 🔴 Crítico | **Validar com 5 usuários em 1 semana ANTES do dev** |
| **R2** — Custo LLM do Builder estoura | 🟡 Sério | Auto-summary + BYOK + cost monitoring desde dia 1 |
| **R3** — LGPD/DPA com provider LLM | 🔴 Crítico | **Review jurídico antes de prod, não antes do dev** |
| **R4** — Reuso do `ai-module/ai-agents` mais complexo que 95% | 🟡 Sério | Auditoria técnica de 2 dias antes do `/plan` |
| **R5** — Prompt injection em produção | 🟡 Sério | Guardrail básico no system prompt dos agentes criados desde v1 |
| **R6** — Sticky versioning tem edge cases | 🟠 Médio | Testar exaustivamente com 3 cenários: nova, ativa, silenciada |
| **R7** — Bus factor = 1 (founder solo) | 🟡 Sério | Documentação inline extensa, commits pequenos |

**Os 2 críticos bloqueiam o início do dev:**
1. ✅ Validação com 5 usuários reais (1 semana)
2. ✅ Review LGPD (pode rodar em paralelo com validação)

---

## 12. Roadmap pós-MVP (resumido)

### v1.5 (2-3 semanas após v1 estável)
- Templates como recurso standalone (`/recursos/templates`)
- Ferramentas custom como recurso standalone
- Campanhas como tipo de projeto
- Analytics básico por projeto
- Command palette global

### v2 (1-2 meses)
- Automação Instagram (portar padrões do ORAYON)
- Multi-agente guardrail (UI + schema)
- BYOK LLM por org
- Auto-compression avançada de histórico

### v3+ (futuro)
- Tracking Meta CAPI
- Flow WhatsApp
- Grupos WhatsApp
- Reativação do CRM (se houver demanda)

---

## 13. Perguntas que ainda faltam responder

### Críticas (bloqueiam `/plan`)

**Q1** — Validação com usuários reais: founder vai conversar com 3-5 advogados/contadores/corretores nessa semana?
- Se **sim** → ótimo, /plan pode começar
- Se **não** → perigoso, mas /plan pode começar com caveat ("validação acontece em paralelo")
- Se **impossível** → pelo menos protótipo Figma + feedback de 1-2 amigos

**Q2** — Review LGPD com advogado: viável em 1 semana?
- Sem isso, agente pode ser deployed internamente mas **não pode ser usado com clientes finais reais**

**Q3** — Auditoria técnica do `ai-module/ai-agents` atual: founder topa 2 dias de dev só pra auditar antes de começar a mexer?
- Sem isso, risco de "95% reuso" virar "50% reuso" e cronograma explodir

### Médias (bom ter, não bloqueia)

**Q4** — BYOK ou Quayer hosted no v1? Recomendação: hosted com rate limit grátis (50 msgs/dia) + BYOK em v1.5
**Q5** — Pricing tier gating? Quem pode criar quantos agentes? Definir antes do rollout
**Q6** — Help center / docs pro user final: existe? Se não, quando cria?
**Q7** — Suporte in-app via chat de suporte (tipo Intercom): v1, v1.5, ou nunca?

---

## 14. Próximo passo

### Quando v5.3 estiver aprovada

1. **Semana 0 (validação paralela):**
   - Founder roda entrevistas com 5 usuários (Q1)
   - Founder contata advogado LGPD (Q2)
   - Dev faz auditoria técnica do `ai-module/ai-agents` (Q3)

2. **`/plan` dispara quando:**
   - Pelo menos Q3 concluído (auditoria técnica)
   - Q1 em andamento (validação rolando)

3. **`/plan` gera:**
   - Breakdown técnico em stories executáveis
   - Schemas Prisma explícitos
   - Endpoints Igniter detalhados
   - Testes por layer
   - Stories pra multi-agent executar em paralelo

4. **Execução:**
   - Wave 1: foundation (schemas, endpoints core, Builder AI)
   - Wave 2: frontend (home, projetos, workspace)
   - Wave 3: mobile + a11y
   - Wave 4: redirects 308, CRM disable, cleanup
   - Wave 5: testes finais, rollout prep

### Nada executado até:
- ✅ Founder aprovar esta v5.3
- ✅ Responder Q1, Q2, Q3 (pelo menos 2 de 3)
- ✅ Decidir ordem de execução (começa v1 direto ou faz validação primeiro)

---

## Anexo — Referências

- [`route-migration-plan.md`](./route-migration-plan.md) — mapeamento backup das 63 rotas atuais
- Releases 1-3 auth v3 (commits `3f12ac5`..`02f1201`) — padrão de feature flag + rollout gradual
- `src/server/ai-module/ai-agents/` — backend do agente que vai ser reusado
- `src/server/communication/instances/` — QR code + share link existentes
- ORAYON — referência pra automações IG futuras (v2+)

---

**FIM DA v5.3.**

*Este documento é a fonte de verdade. A v5.2 e anteriores estão obsoletas — não consultar.*

*Tamanho: ~850 linhas (vs v5.2 = 1800). Corte de 53%.*
