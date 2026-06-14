---
Criado: 2026-06-13
Atualizado: 2026-06-13
Revisar em: antes de iniciar a proxima rodada de implementacao
Relacionados:
  - specs/jornada-builder-v2/backlog-simples.md
  - specs/jornada-builder-v2/mission-first-v3.md
  - specs/builder-proatividade/spec.md
  - specs/builder-proatividade/tasks.md
  - specs/integration-builder/plan.md
---

# Plano de Execucao — Tarefas Faltantes do Builder

> Objetivo: transformar a auditoria do `backlog-simples.md` em uma fila pratica de execucao.
> A jornada mission-first, capacidades, playbooks, integracoes MVP e parte do follow-up ja existem.
> Este plano cobre o que falta para fechar produto de ponta a ponta.

## Estado atual resumido

**Pronto ou bem encaminhado:**

- Jornada mission-first: `build_mode`, `mission`, `diagnosis`, `qualification`, `restrictions` e `conversation_blueprint`.
- Capacidades contextualizadas com recomendador backend e Playbook Engine.
- UI de Capacidades com Mensagens proativas e aviso de janela 24h.
- Integration Builder MVP: RD Station, generic webhook, pesquisa de docs, credenciais, teste e ativacao.
- Runtime parcial de proatividade: modelos Prisma, `create_followup`, fila BullMQ e worker de envio.
- Refinamento interno com cenarios e auditores.
- Documentacao LLM corrigindo a nomenclatura LiteLLM / pacote `ai`.

**Principais lacunas:**

- Toggle `builderState.proactive` ainda nao materializa capacidade no deploy.
- Cancelamento por resposta inbound e opt-out existem como plano/funcoes, mas ainda precisam entrar no fluxo real inbound.
- Fora da janela 24h, envio proativo bloqueia; falta suporte a template aprovado.
- Lembretes de agenda e datas importantes ainda nao tem motor completo.
- Pesquisa Tavily no modo Pesquisa precisa ficar mais deterministica como etapa de produto.
- Integracao pesquisada fora do catalogo ainda executa via `generic-webhook`; falta sintetizar `requestSpec` proprio com seguranca.
- Promptfoo/Langfuse ainda sao net-new; existe refinamento interno, mas nao observabilidade/evals externas.

## Fase 0 — Revalidacao rapida antes de codar

### 0.1 Atualizar status real das tasks de proatividade

**Problema:** `specs/builder-proatividade/tasks.md` ainda marca itens como pendentes mesmo quando parte do codigo ja existe.

**Fazer:**

- Marcar como parcialmente executados ou quebrar:
  - schema/migration;
  - `create_followup`;
  - fila/worker;
  - gates puros;
  - worker de envio.
- Separar explicitamente o que falta:
  - hook inbound;
  - opt-out inbound;
  - materializacao no deploy;
  - template WhatsApp;
  - E2E/homol.

**Criterio de aceite:**

- O arquivo de tasks nao induz reimplementacao de codigo existente.
- Cada task restante aponta para arquivo alvo e teste esperado.

### 0.2 Rodar baseline tecnico

**Fazer:**

- `npx vitest run` nos testes focados de builder/proatividade/integracoes.
- `npx tsc --noEmit`, se o repo estiver em estado compilavel.
- Registrar se ha falha preexistente.

**Criterio de aceite:**

- Temos uma linha de base antes de mexer nos pontos de runtime.

## Fase 1 — Fechar Follow-up Simples de ponta a ponta

Prioridade maxima. E o menor recorte de valor real: SDR retoma lead parado com seguranca.

### 1.1 Derivar `create_followup` no deploy quando proatividade estiver ativa

**Hoje:** o card salva `builderState.proactive`, mas o deploy nao garante `create_followup` em `AIAgentConfig.enabledTools`.

**Fazer:**

- Adicionar derivacao pura em `deploy/enabled-tools-derivation.pure.ts`:
  - se `proactive.followUp === true`, garantir `create_followup`;
  - se nenhum preset proativo ativo, remover `create_followup` apenas quando ele foi derivado pela proatividade, sem apagar tool custom/manual indevida.
- Consumir essa derivacao no deploy, provavelmente em `materialize-team.handler.ts` ou handler dedicado.
- Cobrir com unit tests.

**Criterio de aceite:**

- Agente publicado com Follow-up ativo tem `enabledTools` contendo `create_followup`.
- Agente sem Follow-up nao recebe a tool por acidente.
- Tools custom/desconhecidas seguem preservadas.

### 1.2 Criar `materialize_proactive` na saga de deploy

**Hoje:** existem modelos `ScheduledAutomation`, mas a selecao do Builder nao cria regra de automacao.

**Fazer:**

- Criar handler de deploy `materialize-proactive.handler.ts`.
- Ler `builderState.proactive`.
- Para `followUp`, criar/atualizar `ScheduledAutomation` com trigger `lead_idle`.
- Se desligado, pausar/desativar regra existente do projeto.
- Registrar no contrato/orquestrador de deploy.

**Criterio de aceite:**

- Deploy com `followUp: true` cria ou atualiza uma regra `ScheduledAutomation`.
- Deploy com follow-up desligado pausa regra anterior.
- Operacao idempotente.

### 1.3 Ligar cancelamento no inbound real

**Hoje:** `cancelPendingProactiveOnInbound` existe e tem teste, mas nao esta plugado no webhook inbound.

**Fazer:**

- Localizar o ponto em que uma mensagem inbound ja tem `organizationId` e `contactPhone` resolvidos.
- Chamar `cancelPendingProactiveOnInbound(database, { organizationId, contactPhone })`.
- Garantir fail-open: erro no cancelamento nao pode quebrar resposta ao cliente.

**Criterio de aceite:**

- Quando cliente responde, `ScheduledMessage` pendente com `cancelIfCustomerReplies=true` vira `cancelled`.
- Mensagens com `cancelIfCustomerReplies=false` permanecem pendentes.
- Teste unitario/integracao cobre o hook no inbound.

### 1.4 Implementar opt-out inbound

**Fazer:**

- Detectar palavras/frases como:
  - `parar`;
  - `nao quero`;
  - `não quero`;
  - `remover`;
  - `cancelar mensagens`.
- Criar/upsert em `ContactOptOut`.
- Cancelar pendentes do contato.
- Respeitar texto normal para nao criar falso positivo grosseiro.

**Criterio de aceite:**

- Mensagem inbound de opt-out cria `ContactOptOut`.
- Worker bloqueia envio com reason `opted_out`.
- Pendentes sao canceladas.

### 1.5 Auditar e expor historico minimo

**Fazer:**

- Garantir que cada `ScheduledMessage` tenha status, motivo, horario, sessionId e reason legiveis.
- Criar leitura simples para o painel ou reaproveitar Activity/RuntimeDecision.
- Mostrar pelo menos: agendado, enviado, cancelado, falhou e motivo.

**Criterio de aceite:**

- Usuario consegue ver por que uma mensagem proativa foi enviada ou bloqueada.

### 1.6 E2E/homol do follow-up

**Cenario minimo:**

- Criador ativa Follow-up.
- Publica agente.
- Lead conversa e para.
- Agente agenda follow-up.
- Se lead responder antes, follow-up cancela.
- Se lead pediu opt-out, envio bloqueia.

## Fase 2 — Compliance WhatsApp fora da janela 24h

### 2.1 Modelar template aprovado

**Fazer:**

- Decidir storage minimo para templates aprovados por org/conexao.
- Campos recomendados:
  - `organizationId`;
  - `connectionId`;
  - `providerTemplateName`;
  - `language`;
  - `status`;
  - `category`;
  - `variables`.

**Criterio de aceite:**

- Runtime consegue consultar se existe template aprovado para envio proativo.

### 2.2 Implementar envio via template/HSM no sender

**Fazer:**

- Adicionar metodo `sendTemplate` no transporte UAZapi.
- No worker, se `needsTemplate === true`, usar template aprovado.
- Se nao houver template, cancelar com motivo claro.

**Criterio de aceite:**

- Fora da janela 24h nao envia texto livre.
- Com template aprovado, envia pelo caminho correto.
- Sem template, cancela e registra motivo.

### 2.3 UX de aviso e configuracao

**Fazer:**

- No card de Mensagens proativas, manter aviso atual.
- Adicionar estado quando nao ha template aprovado.
- CTA para configurar/conectar template quando aplicavel.

**Criterio de aceite:**

- Usuario entende antes de publicar que follow-up fora da janela exige template.

## Fase 3 — Lembretes de agenda

### 3.1 Definir fonte de eventos de agenda

**Fazer:**

- Mapear fontes existentes:
  - Google Calendar tools;
  - `schedule_appointment` fallback;
  - `create_event`;
  - campos em `ChatSession.customFields`.
- Escolher fonte canonica para F3.

**Criterio de aceite:**

- Lembrete so e criado quando existe data/hora confiavel.

### 3.2 Criar automacoes `appointment_before` e `appointment_after`

**Fazer:**

- Estender `materialize_proactive` para `reminders`.
- Criar regras `ScheduledAutomation` com timing padrao:
  - 24h antes;
  - 2h antes;
  - opcional pos-atendimento.

**Criterio de aceite:**

- Deploy com `reminders: true` cria regras de lembrete.

### 3.3 Worker cron-scan

**Fazer:**

- Criar worker que varre eventos futuros e materializa `ScheduledMessage`.
- Garantir idempotencia para nao duplicar lembretes.
- Cancelar/remarcar se evento mudar.

**Criterio de aceite:**

- Visita/consulta marcada gera lembrete uma unica vez.
- Mudanca/cancelamento de horario nao deixa lembrete velho pendente.

### 3.4 Reconfirmacao condicional

**Fazer:**

- Se o cliente nao confirma ate X, acao secundaria:
  - reconfirmar;
  - sugerir reagendamento;
  - transferir para humano.

**Criterio de aceite:**

- Fluxo cobre "cliente nao confirmou" sem spam.

## Fase 4 — Datas importantes

### 4.1 Decidir storage da data

**Problema:** nao ha modelo `Contact` completo. Data importante sem fonte confiavel vira risco.

**Decisao necessaria:**

- Novo `Contact` leve?
- Campo em memoria/sessao?
- Fonte externa via CRM/planilha/integracao?

**Criterio de aceite:**

- Nenhuma automacao de data roda sem proveniencia confiavel.

### 4.2 Triggers de data

**Fazer:**

- Implementar:
  - `birthday`;
  - `renewal_due`;
  - `custom_date`.
- Guardar fonte da data.
- Mostrar a fonte na revisao/historico.

**Criterio de aceite:**

- Aniversario/renovacao so agenda quando a data foi coletada ou sincronizada com origem confiavel.

## Fase 5 — Pesquisa estrategica com Tavily

### 5.1 Tornar Modo Pesquisa deterministico

**Hoje:** Tavily existe como ferramenta/sub-agente, mas o Modo Pesquisa precisa ser uma etapa previsivel de produto.

**Fazer:**

- Quando `buildMode === 'pesquisa'`, executar ou acionar explicitamente pesquisa de nicho.
- Persistir resultado estruturado em `builderState` ou `capturedProposals`.
- O card `diagnosis` deve mostrar:
  - negocio detectado;
  - riscos;
  - boas praticas;
  - concorrentes/referencias, quando houver;
  - capacidades recomendadas;
  - fontes.

**Criterio de aceite:**

- O usuario escolhe Modo Pesquisa e recebe um diagnostico com evidencias.
- Sem `TAVILY_API_KEY`, cai para pesquisa lite com aviso honesto.

### 5.2 Testes com Tavily mockado e sem chave

**Fazer:**

- Unit test para sucesso com fontes.
- Unit test para quota/sem chave.
- Unit test para degradacao sem travar jornada.

**Criterio de aceite:**

- Pesquisa nunca bloqueia criacao do agente.

## Fase 6 — Melhorar ferramentas personalizadas pesquisadas

### 6.1 Sintetizar `requestSpec` a partir da documentacao encontrada

**Hoje:** plataforma desconhecida com docs usa proposta enriquecida, mas executa via `generic-webhook`.

**Fazer:**

- Criar sintetizador seguro:
  - endpoint;
  - metodo;
  - auth;
  - headers;
  - body;
  - campos obrigatorios;
  - exemplo de teste.
- Validar contra `requestSpecSchema`.
- Se confianca baixa, manter `generic-webhook`.

**Criterio de aceite:**

- Ferramenta pesquisada pode gerar draft executavel especifico quando a documentacao for clara.
- Nunca inventa endpoint sem fonte.
- Sempre mostra fontes no card.

### 6.2 Expandir templates curados

**Sugestao de ordem:**

1. HubSpot CRM.
2. Pipedrive.
3. Kommo.
4. Google Sheets.
5. Make/Zapier webhook.

**Criterio de aceite:**

- Plataformas comuns nao dependem de pesquisa externa para o caminho feliz.

## Fase 7 — Evals externas e observabilidade

### 7.1 Manter refinamento interno como baseline

**Fazer:**

- Garantir que o Refining Loop salve score, checks, falhas e versao do prompt.
- Mostrar resultado na revisao/publicacao.

**Criterio de aceite:**

- Usuario sabe se o agente esta pronto ou precisa ajuste.

### 7.2 Avaliar Promptfoo

**Fazer:**

- Criar POC local com 5 cenarios:
  - SDR imobiliario;
  - secretaria clinica;
  - suporte;
  - cobranca;
  - ferramenta/integracao falhando.

**Criterio de aceite:**

- Decidir se Promptfoo entra no CI ou fica ferramenta manual.

### 7.3 Avaliar Langfuse

**Fazer:**

- POC de tracing via LiteLLM ou SDK.
- Medir:
  - custo;
  - latencia;
  - prompt/version;
  - tool calls;
  - erros.

**Criterio de aceite:**

- Decisao documentada: implementar, adiar ou substituir por observabilidade propria.

## Ordem recomendada de execucao

1. Fase 0: atualizar tasks e baseline.
2. Fase 1: fechar follow-up simples ponta a ponta.
3. Fase 2: compliance WhatsApp/templates.
4. Fase 5: Modo Pesquisa deterministico.
5. Fase 6: melhorar integracoes pesquisadas.
6. Fase 3: lembretes de agenda.
7. Fase 4: datas importantes.
8. Fase 7: evals/observabilidade externa.

## Corte de MVP recomendado

Para um release pragmatico, entregar primeiro:

- Follow-up simples com `create_followup` habilitado no deploy.
- Cancel-on-inbound.
- Opt-out inbound.
- Bloqueio seguro fora da janela 24h sem template.
- Historico minimo de envios.
- Modo Pesquisa com Tavily ou degradacao lite.
- Integration Builder mantendo RD Station + generic webhook + docs com fontes.

Nao colocar no MVP inicial:

- Lembretes de agenda com reconfirmacao complexa.
- Datas importantes sem storage confiavel.
- Sintese automatica de `requestSpec` para qualquer API.
- Promptfoo/Langfuse em producao.

## Comandos de validacao sugeridos

```powershell
npx vitest run src/server/ai-module/builder/state/journey-v2.test.ts src/server/ai-module/builder/capabilities/recommend-capabilities.pure.test.ts src/server/ai-module/builder/playbook/agent-strategy.test.ts src/server/ai-module/builder/cards/handlers/apply/journey-v2.test.ts src/server/ai-module/builder/tools/propose-integration.tool.test.ts src/server/ai-module/builder/sub-agents/integration-researcher/integration-researcher.sub-agent.test.ts src/server/ai-module/builder/integrations/templates/index.test.ts src/server/ai-module/builder/integrations/request-spec.test.ts src/server/ai-module/ai-agents/tools/create-followup.tool.test.ts src/server/ai-module/ai-agents/proactive/proactive-eligibility.pure.test.ts src/server/ai-module/ai-agents/proactive/cancel-on-inbound.test.ts src/server/ai-module/ai-agents/proactive/scheduled-message-send.test.ts
```

```powershell
npx tsc --noEmit
```
