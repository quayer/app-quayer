---
Criado: 2026-05-11
Atualizado: 2026-05-11
Revisar em: quando comecar implementacao (gate de decisao GO/NO-GO definido abaixo) — caso contrario, releitura trimestral
Relacionados:
  - .claude/skills/quayer-builder.md
  - docs/builder/BUILDER_AGENT_ARCHITECTURE.md
  - docs/builder/BUILDER_USER_JOURNEY.md
  - docs/strategy/README.md
  - src/server/ai-module/builder/
---

# Roadmap: Canal API-First (MCP Server + CLI)

> **Status:** NAO INICIADO. Doc de visao + backlog. Codigo fonte nao existe — pasta `packages/` foi removida em 2026-05-11 por estar vazia (so `node_modules/` orfao de uma tentativa anterior, fora do git).

## TL;DR

O Quayer Builder tem **dois canais de distribuicao** planejados:

| Canal | Persona | Onde roda | Status |
|---|---|---|---|
| **UI no app.quayer.com** (`/projetos/[id]`) | AGENCIA, INFLUENCER | Browser, meta-agente embutido | ✅ Vivo |
| **MCP server + CLI no npm** | DEV | Claude Code/Cursor do usuario + terminal | ❌ Nao construido |

Este doc cobre o canal **API-first** (segunda linha). A motivacao estrategica esta em [../strategy/README.md](../strategy/README.md) — persona DEV nao usa UI, prefere terminal/MCP.

---

## Por que isso importa (nao e capricho tecnico)

1. **LLM e do usuario.** Quando o dev usa o Claude Code dele para conversar com o MCP `quayer`, a inferencia LLM roda na assinatura Claude Pro/Max **dele**, nao na nossa. Quayer so cobra plataforma (DB, broker WhatsApp, runtime do agente em producao). **Margem bruta sobe.**
2. **Canal de aquisicao pra dev.** Quem instala MCP do npm e fala "essa ferramenta e foda" no Twitter/Bluesky e o dev de agencia. Esses sao os que viram revendedores white-label depois.
3. **Encaixa com `.claude/skills/quayer-builder.md`.** A skill ja descreve workflows assumindo as tools MCP. Sem o servidor, a skill e ficcao.
4. **Diferencial vs concorrente.** Maioria dos builders de agente (Voiceflow, Botpress, Manychat) sao **UI-only**. Ter canal MCP/CLI nos posiciona como ferramenta de dev, nao ferramenta no-code.

---

## O que precisa ser construido

### Workspace npm (raiz)

- `packages/mcp-server/` — servidor MCP publicavel
- `packages/cli/` — comando `quayer` publicavel
- `packages/shared/` — tipos + cliente HTTP da API Quayer (compartilhado entre os dois)
- Setup: npm workspaces (ja temos `package.json` raiz, basta declarar `workspaces`)
- Build: `tsup` ou `tsc` direto (sem turbo por enquanto — overkill pra 3 pacotes)

### `@quayer/mcp-server`

**O que e:** servidor MCP (Model Context Protocol) que o Claude Code do usuario carrega. Expoe tools que batem na API publica do Quayer.

**Auth:**
- Usuario gera API key na UI (`/conta` ou `/api-keys`)
- API key vai em env var `QUAYER_API_KEY` ou flag `--api-key`
- Server valida via endpoint `auth.validateApiKey` (existe? checar antes — provavelmente precisa criar)

**Tools que a skill assume existirem** (extrair de [.claude/skills/quayer-builder.md](../../.claude/skills/quayer-builder.md)):

| Tool MCP | Endpoint Igniter equivalente | Status backend |
|---|---|---|
| `validate_api_key` | precisa criar em `core/api-keys` | ❓ verificar |
| `builder_list_projects` | `ai-module/builder/projects` list | ✅ existe |
| `create_agent` | builder projects create | ✅ existe (chama-se diferente, mapear) |
| `get_agent` | builder projects get | ✅ existe |
| `list_agents` | builder projects list | ✅ existe |
| `deploy_agent` | builder/deploy | ✅ existe |
| `list_prompt_versions` | builder/prompts | ✅ existe |
| `create_prompt_version` | builder/prompts | ✅ existe |
| `activate_prompt_version` | builder/prompts | ✅ existe |
| `diff_prompt_versions` | precisa criar | ❌ falta |
| `rollback_prompt_version` | builder/prompts | ✅ existe |
| `toggle_builtin_tool` | builder/tools | ✅ existe |
| `list_connections` | communication/services? | ❓ verificar |
| `create_connection` | communication/services | ❓ verificar |
| `connect_connection` | retorna QR WhatsApp | ❓ verificar |
| `builder_test_link` | precisa criar | ❌ falta |

**Resources que a skill assume:**
- `quayer://org/overview` — plano, conexoes, limites (precisa criar endpoint composto)

**Stack:**
- `@modelcontextprotocol/sdk` (oficial Anthropic)
- `zod` para schemas de input das tools
- `zod-to-json-schema` para gerar schema MCP a partir do zod (era o motivo dos `node_modules` orfaos)
- HTTP client: `undici` ou `fetch` nativo

**Distribuicao:**
- `npm publish` em `@quayer/mcp-server`
- Documentar instalacao: `npx @quayer/mcp-server` ou config em `mcp_config.json` do Claude Code

### `@quayer/cli`

**O que e:** wrapper de terminal pra quem prefere comando direto em vez de chat-via-MCP.

**Comandos minimos:**

```bash
quayer auth login                  # OAuth device flow -> guarda token em ~/.quayer/config.json
quayer auth status                 # mostra usuario logado + org ativa
quayer org list                    # lista orgs do usuario
quayer org use <id>                # troca org ativa

quayer agent list
quayer agent create --file ./agent.yaml
quayer agent get <id>
quayer agent deploy <id> --connection <id> --mode CHAT
quayer agent rollback <id>

quayer connection list
quayer connection create --type uazapi --name "WhatsApp Principal"
quayer connection qr <id>          # mostra QR no terminal (ascii)

quayer logs tail <agentId>         # stream de logs em real-time (usa logs-sse)
```

**Stack:**
- `commander` ou `clipanion` para parsing de CLI
- `ink` (React no terminal) se quiser UI tipo prompt interativo. Comecar simples sem ink.
- Reusa `@quayer/shared` pra cliente HTTP e tipos

**Distribuicao:**
- `npm publish` em `@quayer/cli`
- Bin: `quayer`
- Instalacao recomendada: `npm i -g @quayer/cli` ou `npx @quayer/cli`

### `@quayer/shared`

- Tipos TS gerados a partir dos schemas Zod do `igniter.schema.ts` (precisa pipeline de export)
- Cliente HTTP com retry/auth
- Helper de leitura de config (`~/.quayer/config.json`)

---

## Gaps no backend antes de comecar

Algumas tools da skill nao tem endpoint correspondente hoje. Antes de comecar o MCP/CLI:

1. **API keys publicas com escopo.** Conferir se `core/api-keys` ja tem CRUD + validacao + escopo (so leitura, builder admin, etc.). Se nao, criar.
2. **`auth.validateApiKey` action.** Endpoint leve que valida key e retorna `{ userId, orgId, scopes }`.
3. **`diff_prompt_versions` action.** Comparacao server-side de duas versoes de prompt (alternativa: fazer no client).
4. **`builder_test_link` action.** Gerar link de teste de agente (provavelmente magic-link curto). Existe algo parecido em deploy? Conferir.
5. **`quayer://org/overview` resource.** Endpoint composto: plano + conexoes + limites + contagem de agentes em um payload so. Hoje precisa de 3-4 chamadas.

---

## Ordem sugerida de entrega

**Fase 0 — Decisao GO/NO-GO** (1 dia)
- Reuniao curta: ainda queremos esse canal? Persona DEV e prioridade Q3 2026?
- Se NAO: deletar este doc e a skill `quayer-builder.md` (ou marcar a skill como UI-only)
- Se SIM: seguir

**Fase 1 — Backend gaps** (3-5 dias)
- Endpoints `validateApiKey`, `diff_prompt_versions`, `org/overview`, `builder_test_link`
- API keys com escopo se ainda nao existir
- Testes de integracao das novas actions

**Fase 2 — `@quayer/shared`** (1 dia)
- Tipos compartilhados + cliente HTTP minimo

**Fase 3 — `@quayer/mcp-server` MVP** (3 dias)
- Tools essenciais: `validate_api_key`, `list_agents`, `create_agent`, `deploy_agent`
- Publicar `0.1.0` no npm com flag `experimental`
- Testar end-to-end com Claude Code real

**Fase 4 — `@quayer/cli` MVP** (3 dias)
- `auth login`, `agent list`, `agent create`, `agent deploy`
- Publicar `0.1.0` no npm

**Fase 5 — Tools completas + docs** (1 semana)
- Resto das tools MCP + comandos CLI
- Doc em `quayer.com/docs/cli` e `/docs/mcp`
- Anuncio + tutorial no Twitter/Bluesky

**Total estimado:** ~3 semanas dev focado.

---

## Riscos / pontos abertos

- **API key management UX.** Usuario tem que gerar key, copiar, configurar env, lembrar de rotacionar. Friccao real. Considerar OAuth device flow no CLI (login no browser, token salvo local) — mais friendly mas mais codigo.
- **Versionamento das tools.** Se mudarmos schema de uma tool, MCP server antigo quebra Claude Code do usuario. Pensar em versionar tools (`create_agent_v2`) ou usar feature negotiation.
- **Quota/rate limit.** API key abrir o backend pra automacao = risco de abuso. Precisa rate limit por key.
- **Skills vs tools.** A skill `.claude/skills/quayer-builder.md` ja existe e descreve workflow. Quando MCP server for publicado, faz sentido essa skill ser **distribuida junto** com o MCP server (gancho `skills add @quayer/mcp-server`) para o usuario ter os dois automaticamente.

---

## O que **nao** entra neste roadmap

- Nao e admin UI. Operacoes admin continuam via Claude Code + Prisma MCP + SQL (ver `docs/deprecated/ADMIN_SURFACE_REMOVED.md`).
- Nao e webhook/integracao externa generica. Isso e canal **especifico** do produto Builder.
- Nao e SDK para apps de cliente final. SDK pra runtime de agente e outra historia.

---

## Decisao pendente do founder

Antes de qualquer commit de codigo neste canal, responder:

1. **Persona DEV e prioridade Q3 2026?** Se nao, este doc fica em standby.
2. **Distribuir no npm publico** ou em registro privado (Verdaccio/GitHub Packages) ate validar?
3. **`@quayer/*` no npm e seu?** Reservar nome antes que alguem faca squat.
