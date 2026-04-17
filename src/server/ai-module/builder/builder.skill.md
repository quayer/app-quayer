# Skill — Builder IA (Módulo)

Arquitetura do meta-agente **Builder IA** que permite a um usuário descrever em linguagem natural um agente WhatsApp e receber a infraestrutura provisionada (ai-agent + prompt + tools + instância + conexão).

---

## Responsabilidade

**Design-time apenas.** Este módulo NÃO executa mensagens de usuários finais em produção. Ele:

- Conversa com o humano que está construindo um agente
- Usa tools para criar/atualizar `AIAgentConfig`, `AgentPromptVersion`, `Instance`, `Connection`
- Mantém o projeto no ciclo `DRAFT → ACTIVE → ARCHIVED`
- Publica versões para runtime

Quem **executa** o agente em produção é `ai-module/ai-agents/agent-runtime.service.ts`, consumido via `communication/messages` (ingress do WhatsApp).

---

## Relações entre módulos

```
[usuário WhatsApp] → communication/messages → ai-agents/agent-runtime → AIAgentConfig (runtime)
                                                        ↑
                                    (mesma tabela, outras colunas são design)
                                                        ↓
[builder humano]  → builder/chat  → Builder meta-agent  → tools/* → cria/atualiza config
```

O Builder **reutiliza** `processAgentMessageStream` do `ai-agents` para falar com o próprio LLM. A distinção entre "Builder conversando" e "agente atendendo cliente" é o `AIAgentConfig.name === BUILDER_RESERVED_NAME` (veja `builder.constants.ts`).

---

## Estrutura de diretório

```
ai-module/builder/
├── builder.controller.ts       → 4 actions (list, create, publish, sendChatMessage SSE)
├── builder.schemas.ts          → Zod input/output
├── builder.constants.ts        → BUILDER_RESERVED_NAME, limites
├── repositories/               → BuilderProject + Conversation + Messages
├── services/                   → context-budget, context-summary
├── prompts/                    → system prompt + placeholder de skills
├── tools/                      → 11 tools invocáveis pelo meta-agente
├── catalog/                    → official-tools.ts (catálogo do AGENTE GERADO, ≠ tools/)
├── skills/                     → skill-loader + .skill.md injetados no prompt
├── templates/                  → prompt-anatomy (estrutura pedagógica)
├── validators/                 → validações de input humano (nome, prompt, etc.)
└── scripts/                    → register-builder-agent (seed)
```

---

## Invariantes

1. **`BuilderProject.type` sempre preenchido.** Hoje só `WHATSAPP_AGENT`. É o discriminador que vai abrir Phase 2.
2. **Todo query filtra por `organizationId`.** O repo `builder-project.repository.ts` encapsula essa regra — nunca bypassar.
3. **Sticky versioning (US-029).** Publicar nova versão NÃO afeta conversas ativas. O runtime resolve `AgentPromptVersion` por sessão, não por "latest published". Ver `ai-agents/agent-runtime.service.ts`.
4. **1:1 `BuilderProject ↔ BuilderProjectConversation`.** Criados na mesma transação (`createWithInitialMessage`).
5. **Synthetic session IDs.** O chat do Builder usa `conversation.id` como `sessionId` e `'builder-internal'` como `connectionId` — o runtime tolera (retorna `[]` em `buildConversationContext`).

---

## Evolução — Phase 1 → Phase 2

**Phase 1 (hoje):** WhatsApp-only. Toolset fixo em `tools/index.ts`. Single target.

**Phase 2 (planejado):** `builder/targets/<kind>/` plugin architecture. Cada target declara:
- Toolset próprio (ex: `targets/email/tools/`)
- Prompt anatomy específico
- Validators de publicação
- Hooks de deploy (ex: `email` provisiona SendGrid em vez de `Instance`)

O discriminador `BuilderProject.type` vira a chave de resolução do plugin.

---

## Armadilhas

- **Cache de skills.** `_cachedSkillsSummary` é in-process. Em dev (hot reload) pode ficar stale — reiniciar o servidor se `.skill.md` mudou e não está aparecendo.
- **Context-budget compaction.** `shouldCompact` + `compactMessages` são chamados em cada turno. Se estourarem `ContextBudgetExhaustedError`, o usuário é forçado a criar novo projeto. Monitorar custo do LLM de compaction — é chamada extra por turno longo.
- **UUID validation.** O controller valida `projectId` com regex antes de consultar o DB (`UUID_REGEX`). Não remover — inputs do path param chegam crus.
- **Tools vs Catalog.** `tools/` = o que o Builder usa. `catalog/official-tools.ts` = o que o agente **gerado** vai ter disponível em runtime. Confundir os dois quebra o modelo mental do time.

---

## Referências rápidas

- Controller: `src/server/ai-module/builder/builder.controller.ts`
- Tools: `src/server/ai-module/builder/tools/index.ts` (11 tools)
- System prompt: `src/server/ai-module/builder/prompts/whatsapp-agent-system-prompt.ts`
- Runtime consumidor: `src/server/ai-module/ai-agents/agent-runtime.service.ts`
