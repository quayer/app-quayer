---
Criado: 2026-06-03
Atualizado: 2026-06-03
Revisar em: quando o 1º tipo não-ai_agent entrar no roadmap ativo
Relacionados:
  - src/lib/project-type.ts
  - src/client/components/projetos/preview/tab-registry.tsx
  - prisma/schema.prisma (BuilderProjectType)
  - src/server/ai-module/builder/prompts/whatsapp-agent-system-prompt.ts
---

# Backlog — Project Types (automações, WhatsApp Flows, campanhas)

> **Status: BACKLOG / estudo.** NÃO implementar agora. Documenta a fundação que
> já existe e o que falta para o orquestrador receber projetos que **não são**
> "criar agente WhatsApp" (ex.: WhatsApp Flow, automação, campanha).

## Por que isso importa
O orquestrador (meta-agente Builder) hoje é **WhatsApp-agent-cêntrico**: o fluxo
`propose_tool_selection → generate_prompt_anatomy → create_agent → publish` assume
que o artefato final é um `AIAgentConfig`. No futuro o usuário vai pedir coisas
como *"crie um WhatsApp Flow de agendamento"* ou *"monte uma automação"* — outro
tipo de artefato, outro conjunto de tabs/tools/validação.

## ✅ O que JÁ existe (fundação)
- **`src/lib/project-type.ts`** — union `ProjectType` já contém `ai_agent | wa_campaign | ig_automation | wa_flow | ...` + metadata (label/ícone/descrição) por tipo. Só `ai_agent` está ativo.
- **`tab-registry.tsx`** — tabs já são filtradas por `visibleFor: ProjectType[]`. Adicionar um tipo = adicionar tabs com o `visibleFor` certo, sem `if/else`.
- **`prisma/schema.prisma`** — `BuilderProject.type: BuilderProjectType` (enum) já persiste o tipo (default `ai_agent`).

## ❌ O que falta (para um tipo não-ai_agent funcionar)
1. **System prompt por tipo** — hoje há 1 prompt do meta-agente (WhatsApp-cêntrico). Precisa de um prompt/uma "skill" por tipo de projeto (o que o orquestrador coleta e qual artefato gera).
2. **Toolset por tipo** — `create_agent`/`publish_agent` são de agente. Um `wa_flow` precisaria de `create_flow`/`publish_flow`; uma campanha, de `create_campaign`/segmentação. Hoje a toolset do Builder é injetada por nome reservado, não por tipo.
3. **Artefato + schema por tipo** — `AIAgentConfig` é o artefato de `ai_agent`. Outros tipos precisam do seu próprio modelo (ex.: `WhatsAppFlow`, `Campaign` — alguns já existem dormentes no schema, ver `docs/deprecated/SCHEMA_DORMANT_MODELS.md`).
4. **Tabs próprias** — ex.: campanha = "Segmentação / Mensagem / Agendamento"; flow = "Passos / Condições / Preview".
5. **Validação/compile por tipo** — os sub-agentes (prompt-writer/validator) são de prompt de agente.
6. **Roteamento de criação** — `createProject` hoje grava `type: 'ai_agent'` fixo ([crud.routes.ts]); a home precisaria deixar o usuário (ou o orquestrador) escolher/inferir o tipo.

## Caminho proposto (quando entrar no roadmap)
- **Fase 0 — type-driven orchestrator:** transformar o system prompt + toolset do meta-agente em **resolvidos por `project.type`** (registry de "builder profiles" por tipo). Pré-requisito de tudo.
- **Fase 1 — 1º tipo piloto (WhatsApp Flow):** modelo + tools (`create_flow`) + tabs + compile. Validar o registry com 2 tipos reais.
- **Fase 2 — campanhas / automações / ig_automation:** replicar o padrão por tipo.

## Risco de não preparar
Cada feature nova (tools, cards, runtime) hoje assume `ai_agent`. Quanto mais
crescer WhatsApp-cêntrico, mais caro vira o type-driven depois. **Mitigação leve
agora:** ao adicionar tools/tabs, manter o `visibleFor`/escopo por tipo já
preenchido (não hard-codar "ai_agent" implícito).
