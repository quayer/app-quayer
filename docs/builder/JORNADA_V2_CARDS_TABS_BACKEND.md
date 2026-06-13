---
Criado: 2026-06-13
Atualizado: 2026-06-13
Revisar em: quando mudar tab-registry, card-registry, journey-v2.ts, o prompt-writer ou prepare-agent-call.ts
Relacionados:
  - src/client/components/projetos/chat/cards/card-registry.tsx
  - src/client/components/projetos/preview/tab-registry.tsx
  - src/server/ai-module/builder/state/journey-v2.ts
  - src/server/ai-module/builder/templates/prompt-section-checklist.ts
  - src/server/ai-module/builder/tools/index.ts
  - src/server/ai-module/ai-agents/runtime/prepare-agent-call.ts
---

# Jornada Builder v2: Cards, Tabs e Backend

## 0. Os dois agentes (orquestrador vs runtime)

O nome confunde, mas são **dois agentes distintos**:

| Nome(s) | É | Atende | Onde no código |
| --- | --- | --- | --- |
| **Orquestrador** = meta-agente = "Builder" | o construtor | **você** (chat do builder) | `src/server/ai-module/builder/` |
| **Agente runtime** = agente do cliente = `AIAgentConfig` | o agente publicado | **seus clientes** (WhatsApp) | `src/server/ai-module/ai-agents/` |

Os dois rodam no **MESMO motor** (`prepare-agent-call.ts` → `processAgentMessageStream`). Muda só qual config é carregada:
- nome === `BUILDER_RESERVED_NAME` → injeta o **toolset do Builder** + o system prompt do orquestrador (`whatsapp-agent-system-prompt.ts`) — `prepare-agent-call.ts:306-325`.
- `AIAgentConfig` do cliente → injeta o **prompt gerado** (10 seções) + as tools materializadas no deploy.

```
VOCÊ → ORQUESTRADOR (coleta, gera roteiro, gera prompt, create_agent, publish_agent)
                     → cria AGENTE RUNTIME (AIAgentConfig publicado)
SEUS CLIENTES → falam no WhatsApp → AGENTE RUNTIME responde
```

## Cards

### Cards principais da jornada

| Card | Papel |
| --- | --- |
| `business_identity` | Coleta dados do negocio quando o usuario nao cola site/Instagram. |
| `source_progress` | Mostra a leitura de fonte, proposta extraida e aceite humano. |
| `conversation_blueprint` | Gera, revisa e aprova o roteiro da conversa antes do prompt final. |
| `agent_review` | Revisao consolidada: voz, escopo, horarios, handoff e aprovacao de criacao. |
| `test_drive` | Gate leve para testar o agente ou publicar sem testar. |
| `refinement` | Roda avaliadores antes de liberar publicacao. |
| `activation_mode` | Define quando o agente responde. |
| `channel_platform` | Escolhe onde o agente atende: WhatsApp, Instagram ou ambos. |
| `whatsapp_connect` | Conexao WhatsApp, por QR ou Cloud API. |
| `instagram_connect` | Conexao Instagram via caminho oficial Meta. |
| `preview_summary` | Revisao final antes de publicar. |
| `published_next_steps` | Card terminal pos-publicacao com proximos passos. |

### Cards auxiliares e legados

| Card | Papel |
| --- | --- |
| `agent_persona` | Persona do agente no fluxo legado/fallback. |
| `services` | Escopo do atendimento no fluxo legado/fallback. |
| `business_hours` | Horario da equipe humana no fluxo legado/fallback. |
| `pricing` | Regras e tabela de precos. |
| `handoff` | Passagem para humano, roleta/departamentos e roteiro de qualificacao. |
| `calendar_connect` | Conexao de agenda. |
| `silenced_contacts` | Contatos que o agente nao deve responder automaticamente. |
| `agent_approval` | Aprovacao legada/fallback de criacao do agente. |
| `quick_reply_chips` | Respostas rapidas, sem sentinel de jornada. |

### Payloads especiais aceitos pelo backend

| Payload | Papel |
| --- | --- |
| `tool_selection` | Seleciona capacidades/ferramentas. |
| `channel` | Selecao legada de canal. |
| `knowledge` | Ack leve do passo opcional de conhecimento. |
| `media` | Ack leve do passo opcional de midia. |
| `integration_proposal` | Confirma proposta de integracao. |
| `integration_credentials` | Recebe credenciais de integracao; nao grava segredo no `builderState`. |

## Tabs

Tabs atuais do painel:

| Tab | Quando aparece na Jornada v2 |
| --- | --- |
| `Visao geral` | A partir da fase Revisar. |
| `Prompt` | Quando ja existe agente. |
| `Conhecimento` | A partir da fase Revisar. |
| `Midias` | A partir da fase Revisar. |
| `Testar` | Quando ja existe agente. |
| `Atividade` | Depois que o agente esta publicado. |
| `Publicar` | Quando o gate compartilhado de deploy permite abrir. |
| `Config` | Quando ja existe agente. |
| `Avancado` | Quando ja existe agente. |

Na Jornada v2, tabs nao acionaveis sao filtradas, nao apenas travadas. A ideia e reduzir ruido: o usuario nao ve `Config`, `Avancado`, `Prompt` ou `Testar` antes de haver agente real.

## Jornada do Usuario

### 1. Conhecer

Objetivo: entender o que o agente deve resolver e qual e o negocio.

Passos principais:

1. `objective`: usuario descreve o objetivo.
2. `business_identity`: usuario conta sobre o negocio se nao colou fonte.
3. `source_ingestion`: se colar site/Instagram, o card `source_progress` assume o slot ativo ate terminar a leitura.

Ao aceitar uma fonte, o backend grava dados propostos como contexto real do agente: nome do negocio, servicos, diferenciais, descricao e endereco quando existirem.

### 2. Revisar

Objetivo: transformar o contexto em contrato de comportamento antes do prompt.

Passos principais:

1. `conversation_blueprint`: gera e aprova o roteiro da conversa.
2. `agent_review`: revisa pacote final e autoriza criacao do agente.
3. `knowledge`: opcional, base de conhecimento.
4. `media`: opcional, midias/catalogo.

Regra importante: se a fonte indicar conflito critico, como `100% vendido` ou `esgotado`, o card de roteiro deve pedir a estrategia antes de gerar/aprovar. Opcoes atuais:

- Lista de interesse.
- Confirmar com consultor.
- Tenho disponibilidade.

Essa decisao entra nas regras negativas do blueprint aprovado para impedir promessa errada no prompt final.

### 3. Testar

Objetivo: validar antes de publicar.

Passos principais:

1. `test_drive`: usuario testa no playground ou escolhe publicar sem testar.
2. `refinement`: roda avaliadores de roteiro, perguntas, ferramentas, conhecimento, seguranca e UX.

O refinamento e gate forte antes da publicacao. Se houver bloqueador critico, nao deve publicar.

### 4. Lancar

Objetivo: configurar canal e publicar.

Passos principais:

1. `activation`: define quando o agente responde.
2. `channel_platform`: escolhe WhatsApp, Instagram ou ambos.
3. `whatsapp_connect`: aparece se WhatsApp foi escolhido.
4. `instagram_connect`: aparece se Instagram foi escolhido.
5. `summary`: revisao final.
6. `published_next_steps`: aparece depois da publicacao.

## Backend: Criacao do Prompt e do Agente

### Fonte de verdade

O backend nao deve gerar prompt a partir de texto solto da conversa. A fonte de verdade e o `builderState`, que acumula:

- objetivo do projeto;
- identidade do negocio;
- fonte aceita;
- persona;
- servicos;
- horarios;
- handoff;
- ativacao;
- ferramentas selecionadas;
- `conversationBlueprint` aprovado;
- refinamento.

### Geracao do roteiro

`conversation_blueprint` pode chamar a geracao de roteiro.

O backend:

1. monta `PlaybookDesignerInput` a partir do `builderState`;
2. infere vertical/nicho quando possivel;
3. injeta limites conhecidos, como nao perguntar telefone no WhatsApp;
4. bloqueia geracao sem decisao se a fonte indicar `100% vendido`/`esgotado`;
5. chama `playbookDesignerSubAgent`;
6. normaliza e valida o blueprint;
7. grava `conversationBlueprint.status = "proposed"`.

A aprovacao humana grava:

- `conversationBlueprint.status = "approved"`;
- `approvedAt`;
- regras de limite vindas da decisao contextual.

### Geracao do prompt

`generate_prompt_anatomy` so deve rodar depois do blueprint aprovado em Jornada v2.

O backend:

1. le a conversa do projeto com escopo de organizacao;
2. parseia `builderState`;
3. exige `conversationBlueprint.status === "approved"`;
4. transforma `builderState` em contexto do `promptWriterSubAgent`;
5. inclui o `ConversationBlueprint` aprovado no bloco de contexto;
6. chama o `promptWriterSubAgent`;
7. valida com `validatorSubAgent`;
8. valida preservacao do blueprint no prompt;
9. tenta uma correcao automatica se falhar;
10. retorna prompt, secoes, tentativas e resultado final de validacao.

Essa ferramenta nao grava no banco. Ela gera e valida.

### Anatomia do prompt gerado (10 secoes + 2 opcionais)

Fonte unica: `templates/prompt-section-checklist.ts` (consumida pelo writer, pelo validador de anatomia e pelo parser de secoes — uma lista, tres consumidores, nunca divergem). O `prompt-writer` emite estas **10 secoes obrigatorias**, nesta ordem:

1. **# Papel** — quem o agente e ("Voce e...") + o que ele NAO faz (2-4 frases).
2. **# Objetivo** — objetivo principal + criterio de sucesso.
3. **# Tom de voz** — estilo + obrigatoriamente `Exemplo bom:`, `Exemplo ruim:` e `Linguagem proibida:`.
4. **# Comunicacao** — limites operacionais: "Uma pergunta por vez", "no maximo 3 linhas", "Retry progressivo".
5. **# Ferramentas** — lista `- nome_da_tool: quando usar` (so as habilitadas; se nenhuma, diz que responde so com conhecimento proprio).
6. **# Regras criticas** — 3-6 itens SEMPRE/NUNCA (ao menos um de cada).
7. **# Fluxo de atendimento** — etapas numeradas (3-6). **E aqui que o blueprint aprovado e preservado.**
8. **# Gatilhos e fallback** — sinais esperados (aceite, fora do escopo) + protocolo de fallback.
9. **# Limitacoes** — o que o agente NAO responde/faz.
10. **# Encerramento** — condicao de fim explicita para CADA desfecho, terminando com "FIM".

**2 secoes opcionais (so avisam, nao bloqueiam):** "# Horario da equipe" (quando ha transferencia humana; aceita variaveis tipo `$now.hour`/`$now.weekday`) e "Resumo de handoff" (nome/interesse/objetivo antes de transferir).

**Injetado fora das 10:** bloco **# Identidade** (disclosure) injetado no `create_agent` via `injectDisclosureIntoPrompt`. O prompt final fica salvo em `AIAgentConfig.systemPrompt` e versionado em `BuilderPromptVersion`.

### Revisao e autorizacao de criacao

`agent_review` consolida a revisao final.

O backend:

1. valida secoes obrigatorias do card;
2. aplica persona, servicos e horarios;
3. limpa propostas capturadas que viraram estado real;
4. deriva `proposal.name` e `proposal.description`;
5. marca `confirmations.agentApproved = true`;
6. opcionalmente grava disclosure de identidade no metadata do projeto;
7. invalida refinamento antigo, se existir.

### Criacao do agente

`create_agent` cria o agente real.

O backend:

1. verifica se o projeto existe na organizacao correta;
2. bloqueia se o projeto ja tem agente;
3. procura uma base RAG existente do projeto;
4. injeta disclosure de identidade no prompt se foi configurado;
5. cria `AIAgentConfig`;
6. grava `systemPrompt`;
7. grava `enabledTools`;
8. conecta RAG quando existe;
9. cria `BuilderPromptVersion` versao 1;
10. grava `BuilderProject.aiAgentId`;
11. emite evento `agent_created`;
12. invalida refinamento anterior.

Depois disso, as tabs dependentes de agente (`Prompt`, `Testar`, `Config`, `Avancado`) podem aparecer.

## Runtime: o que e injetado POR CIMA do prompt salvo

Isto e a conversa REAL do agente publicado com o cliente final (nao o design-time do Builder). Fonte: `ai-agents/runtime/prepare-agent-call.ts`. O `systemPrompt` final e montado concatenando blocos dinamicos sobre o `AIAgentConfig.systemPrompt` salvo — todos fail-open (falha de um bloco nunca derruba o agente):

1. **WhatsApp Media Guide** (se `buscar_media` habilitada) — ensina a sintaxe de tags `[url da imagem:...]`, `[video:...]`, `[audio:...]`, `[document:...]` (`:122`).
2. **## Contexto de conversa anterior** — resumo da ultima sessao FECHADA do mesmo contato (`:136`).
3. **## Perfil do cliente** — memoria vitalicia agregada do contato, fusao de todas as sessoes (`:159`).
4. **## Resumo recente da conversa** — rolling summary da sessao ATUAL, mantido em Redis (`:175`).
5. **Skills condicionais** — `.claude/skills/agent/*.md` ativadas por keyword/jornada do turno (`:188`).
6. **## Base de conhecimento (RAG)** — chunks recuperados por pgvector da query do turno (`:208`). A tool `search_knowledge` e re-consulta sob demanda; a injecao automatica acontece aqui.
7. **[SISTEMA: contexto proximo do limite]** — quando passa de 80% do budget de tokens (`:386`).
8. **Versao ativa A/B** — `getActivePrompt()` pode substituir o systemPrompt por uma `AgentPromptVersion` TESTING/ACTIVE, mapeada por hash do sessionId (`context-builders.ts`).

**Fora do prompt, mas presentes em runtime:**
- **Historico de mensagens** vai no array `messages` (podado por janela dinamica de tokens), nao no systemPrompt.
- **Horario comercial** vem no RESULTADO da tool `transfer_to_human` (`computeBusinessState`), o LLM compoe a resposta — nao ha variavel literal `$now` resolvida no prompt.
- **Bloco ROLETA** (`<!--ROLETA:start-->...<!--ROLETA:end-->`) e fixado em DEPLOY-TIME (`materialize-team.handler.ts`), com fallback de `departmentId` em runtime via `ctx.agentDepartmentId`.

**Tools do agente runtime** (`builtin-tools.ts` + `custom-tools.ts`, filtradas por `enabledTools`):
`schedule_appointment`, `send_pricing`, `create_lead`, `transfer_to_human` (unificada: queue/department/self), `check_availability`/`create_event`/`cancel_event`/`calendar_list_slots` (Google Calendar), `get_pricing`, `enrich_instagram`, `search_knowledge`, `buscar_media`, `calculator`, `think` — mais as **custom** (webhook v1 ou Integration Builder declarativa).

## Arquivos-chave

- Cards: `client/.../chat/cards/card-registry.tsx`
- Tabs: `client/.../preview/tab-registry.tsx`
- Jornada/step-engine: `builder/state/journey-v2.ts`, `builder/state/next-pending-step.ts`, `builder/state/readiness-resolver.ts`
- Estado: `builder/cards/builder-state.ts`
- Tools do Builder: `builder/tools/index.ts` (+ `create-agent.tool.ts`, `generate-conversation-blueprint.tool.ts`, `generate-prompt-anatomy.tool.ts`)
- Roteiro/prompt: `builder/sub-agents/playbook-designer/*`, `builder/sub-agents/prompt-writer/*`, `builder/validators/blueprint-preservation.ts`
- Anatomia: `builder/templates/prompt-section-checklist.ts`
- Refino: `builder/refinement/*`, `builder/refinement/refinement-gate.ts`
- Deploy: `builder/deploy/deploy-flow.orchestrator.ts`, `builder/deploy/materialize-team.handler.ts`
- Runtime: `ai-agents/runtime/prepare-agent-call.ts`, `ai-agents/tools/builtin-tools.ts`, `ai-agents/tools/custom-tools.ts`

## Critica de Produto

O desenho atual esta indo para o lado correto porque separa:

- conversa livre para intencao;
- cards para decisoes estruturadas;
- blueprint como contrato do fluxo;
- prompt como compilacao validada;
- refinamento como gate antes de publicar.

O risco principal e UX: se aparecerem muitas opcoes cedo demais, o usuario sente que caiu em um painel tecnico. A Jornada v2 deve continuar escondendo `Config`, `Avancado` e detalhes de ferramenta ate existir agente e contexto suficiente.
