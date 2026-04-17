# Skill — Builder Tools (Interface LLM)

Tools invocáveis pelo **meta-agente Builder IA**. É a interface que traduz "quero que o agente tenha X" em chamadas de Prisma/serviços reais.

---

## Inventário (11 tools)

Registrados em `tools/index.ts` via `buildBuilderToolset(ctx)`:

| Nome (snake_case) | Factory | O que faz |
|---|---|---|
| `create_agent` | `create-agent.tool.ts` | Cria `AIAgentConfig` + `AgentPromptVersion` inicial, seta `BuilderProject.aiAgentId` |
| `update_agent_prompt` | `update-agent-prompt.tool.ts` | Cria nova `BuilderPromptVersion` com prompt iterado |
| `list_whatsapp_instances` | `list-instances.tool.ts` | Lista `Instance` da org — pro Builder sugerir reuso |
| `create_whatsapp_instance` | `create-instance.tool.ts` | Cria nova `Instance` UAZ (status PENDING até QR ser lido) |
| `attach_tool_to_agent` | `attach-tool.tool.ts` | Liga tool do catálogo ao agente (ver `catalog/official-tools.ts`) |
| `search_web` | `search-web.tool.ts` | Busca na web (auxílio para research durante design) |
| `generate_prompt_anatomy` | `generate-prompt-anatomy.tool.ts` | Estrutura o prompt seguindo template pedagógico |
| `publish_agent` | `publish-agent.tool.ts` | Dispara deploy saga (ver deploy.skill.md) |
| `get_agent_status` | `get-agent-status.tool.ts` | Lê estado atual (versão ativa, instance, connection) |
| `run_playground_test` | `run-playground-test.tool.ts` | Roda mensagem de teste contra o agente em sandbox |
| `create_custom_tool` | `create-custom-tool.tool.ts` | Cria tool customizada (JSON schema + handler) para o agente |

---

## BuilderToolExecutionContext

Toda tool recebe (injected uma vez por turno):

```typescript
interface BuilderToolExecutionContext {
  projectId: string
  organizationId: string
  userId: string
}
```

Isso garante que **nenhuma tool pode vazar entre tenants** — a camada de autorização já filtrou no controller.

---

## `tools/` vs `catalog/official-tools.ts` — diferença crítica

| Diretório | Quem usa | Quando |
|---|---|---|
| `builder/tools/` | **Meta-agente Builder** | Design-time — construindo o agente |
| `builder/catalog/official-tools.ts` | **Agente gerado** (runtime) | Runtime — atendendo cliente WhatsApp |

Exemplo concreto:

- Usuário diz: "quero que o agente consulte horário da barbearia"
- Meta-agente chama `attach_tool_to_agent({ toolId: 'check_business_hours' })` (isso é uma tool de `builder/tools/`)
- A `attach_tool_to_agent` lê do **catálogo** (`catalog/official-tools.ts`) a definição de `check_business_hours` e anexa ao agente
- Em runtime, quando um cliente WhatsApp pergunta "que horas vocês abrem?", o agente invoca `check_business_hours` (tool do catálogo, não do builder)

**Confundir os dois** leva a bugs como: adicionar tool ao builder esperando que o agente final a tenha. Não funciona.

---

## Como adicionar uma tool nova (Builder)

1. **Criar arquivo** `tools/minha-tool.tool.ts` exportando `export function minhaToolTool(ctx)`
2. **Registrar** em `tools/index.ts`:
   ```typescript
   import { minhaToolTool } from './minha-tool.tool'
   // dentro de buildBuilderToolset:
   minha_tool: minhaToolTool(ctx),
   ```
3. **Documentar** no system prompt (`prompts/whatsapp-agent-system-prompt.ts`) — o LLM precisa saber que existe
4. **Card visual** no frontend — `src/client/components/projetos/chat/tool-cards/minha-tool.tsx` para renderizar o `tool-result`
5. **Teste** — ao menos uma asserção que ela é carregada em `buildBuilderToolset`

---

## Como adicionar uma tool nova (Catálogo — runtime)

Diferente. Editar `catalog/official-tools.ts` adicionando `{ id, name, schema, handler }`. O agente gerado vai recebê-la via `attach_tool_to_agent`.

---

## Referências

- Barrel: `src/server/ai-module/builder/tools/index.ts`
- Context type: `src/server/ai-module/builder/tools/create-agent.tool.ts` (`BuilderToolExecutionContext`)
- Catálogo runtime: `src/server/ai-module/builder/catalog/official-tools.ts`
- System prompt: `src/server/ai-module/builder/prompts/whatsapp-agent-system-prompt.ts`
