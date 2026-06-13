---
Criado: 2026-06-13
Atualizado: 2026-06-13
Revisar em: ao iniciar o /plan desta extensão, ou mudança no Playbook Engine / step-engine do Builder
Relacionados:
  - specs/jornada-builder-v2/spec.md
  - src/server/ai-module/builder/state/journey-v2.ts
  - src/server/ai-module/builder/playbook/niche-blueprint-fixtures.ts
  - src/server/ai-module/builder/sub-agents/niche-researcher/niche-researcher.prompt.ts
  - docs/builder/JOURNEY_V2_FUNNEL.md
---

# Spec (addendum v3) — Jornada Builder: "Missão primeiro" + Playbook Engine

> Extensão **aditiva** sobre `spec.md` (Jornada v2 "Configure por exceção"). Mantém todos os FRs v2;
> adiciona a camada de **missão** que orquestra a fase Revisar e transforma o Builder de *gerador de
> prompt* em **consultor de construção de agentes**. Numeração de FR continua de onde a v2 parou (FR-37+).

## 1. Resumo executivo

A jornada v2 é **consciente do nicho** (infere imobiliário/saúde/B2B/delivery) mas **cega à missão** do
agente — um SDR, um Closer e uma Secretária para o mesmo negócio recebem o mesmo tratamento, e o card
"Roteiro da conversa" aparece como uma tela em branco ("Gerar roteiro") antes de o usuário decidir qual
trabalho comercial o agente vai cumprir. Esta extensão introduz: (a) um card de **Missão** cedo na jornada
(o resultado comercial), (b) um **Playbook Engine** que resolve a estratégia por baixo
(`negócio + objetivo + canal + risco + tools`) sem expor metodologia, (c) o roteiro renomeado para **Plano
de atendimento** como *consequência* da missão, e (d) **três modos de construção** (Recomendado / Pesquisa /
Livre) inspirados no padrão Plan/Build do Lovable.

## 2. Problema & Motivação

**Dor (teste real em 2026-06-13 — SDR para o empreendimento Vibra Butantã):** o Builder leu o site, detectou
"100% vendido", mas pulou direto para "Gere uma sugestão de roteiro" — antes de o usuário decidir a missão.
O roteiro existe corretamente no backend (`conversation_blueprint`); o erro é **expô-lo cedo demais e em
linguagem técnica**. Falta a pergunta anterior: *"qual resultado você quer que esse agente gere?"*

**Posicionamento (North Star):** a tecnologia de "criar agente com prompt + RAG + tools + workflow +
playground + API" é **commodity** (Langflow, Dify, Flowise, n8n, Coze, OpenAI Agent Builder). A Quayer não
vende canvas de IA — vende *"descreva seu negócio e eu monto o agente certo para vender, qualificar, atender,
agendar ou transferir, sem você entender prompt/RAG/tools/workflow"*. O diferencial é **UX + abstração de
negócio + profundidade no canal (WhatsApp/Instagram)**.

**Moat (instrumentar desde já):** a abstração é o *wedge de aquisição* (copiável); o que **compõe moat** é a
**biblioteca de playbooks que aprende** (quais missões convertem, via `BuilderJourneyEvent` +
`AgentRuntimeDecision`), a **profundidade de canal** e o **loop de resultado** (o agente roda no canal e
reporta). Por isso o `AgentStrategy` carrega `successCriteria` mapeado a eventos de funil desde o v3.0.

## 3. Requisitos Funcionais

**Fase Conhecer — Missão e Modo:**
- **FR-37 (Missão de primeira classe):** após objetivo + fonte, a jornada deve apresentar um card **"Missão
  do agente"** com 3-5 opções contextualizadas ao negócio (bundles nomeados, framados por resultado) + opção
  "montar do zero", com uma **recomendada** derivada do objetivo + fonte + risco. A missão é capturada
  **antes** do Plano de atendimento.
- **FR-38 (Missão é UMA decisão):** não deve existir um card de "Playbook" separado. O playbook/framework é
  resolvido por baixo (FR-40) e reaparece materializado em linguagem de negócio dentro do Plano de
  atendimento, com ação **"trocar abordagem"**. Modelo interno da missão: *função primária + add-ons*
  (bundles são presets dessa combinação).
- **FR-39 (Três modos de construção):** no início, a jornada deve oferecer um card **"Como quer construir?"**
  com **Recomendado** (pré-selecionado; usa objetivo + site + tools e propõe agora), **Pesquisa** (pesquisa
  mercado/concorrentes/frameworks antes de propor) e **Livre** (o usuário fala "faz assim" em linguagem
  natural e o Builder adapta cards/regras/tools/plano). O modo escolhido é persistido em `builderState`.

**Playbook Engine:**
- **FR-40 (Playbook Engine / Agent Strategy Library):** deve existir uma camada que resolve, a partir de
  `(businessType, objective, channel, risk, tools)`, um `AgentStrategy` tipado com `role`, `framework`
  (interno), `requiredFields`, `recommendedTools`, `guardrails`, `handoffSummary`, `exampleConversations` e
  `successCriteria`. A resolução parte de uma **biblioteca curada** + **fallback genérico** (nunca erro).
- **FR-41 (Frameworks internos):** metodologias (BANT/SPIN/MEDDIC/triagem/appointment) **nunca** aparecem na
  UI. A tela mostra apenas linguagem de negócio ("Qualificar interesse", "Entender orçamento", "Confirmar
  próximo passo").
- **FR-42 (Plano como consequência):** o "Plano de atendimento" (renomeação do `conversation_blueprint`) deve
  ser gerado a partir de missão + playbook + capacidades + qualificação + restrições, reposicionado **depois**
  desses passos. O botão "Gerar roteiro" em branco é eliminado — o plano chega pronto para revisão/edição.
- **FR-43 (Capacidades = passo explícito + ponto de entrada de ferramentas):** estende FR-09. **Capacidades é
  um passo** (decisão do founder 2026-06-13), pré-marcado pela missão, e é **onde o usuário pede ferramentas/
  integrações**. A configuração detalhada das capacidades built-in (preço, equipe, agenda) só surge para a
  capacidade acesa; a lista de tools do runtime continua **derivada** das decisões. A Capacidade é a **única
  superfície de intenção** — não há segunda superfície re-decidindo o mesmo (FR-09 preservado).
- **FR-44 (Qualificação/Restrições dinâmicas):** **Critérios de qualificação** surge como card apenas em
  missões que qualificam (SDR/pré-venda). **Restrições comerciais** surge apenas com risco detectado (ex.:
  "100% vendido") ou nicho regulado. A decisão de "esgotado" migra do card de roteiro
  (`conversation-blueprint-card.tsx`) para o card de Restrições, em contexto.
- **FR-45 (Poda dinâmica por missão):** o conjunto de cards exibidos é **podado pela missão** (configure por
  exceção estendido). Passos não exigidos pela missão não aparecem (ex.: "tirar dúvidas" não mostra
  Qualificação/Restrições; "secretária" mostra agenda, pula qualificação).

**Modo Pesquisa:**
- **FR-46 (Diagnóstico):** no Modo Pesquisa, antes da Missão, o sistema deve apresentar um card de
  **Diagnóstico** (negócio, objetivo detectado, produto principal, risco, canais prováveis, ferramentas
  úteis) derivado do `niche-researcher` + fonte, seguido das **Missões recomendadas**.
- **FR-47 (Degradação graciosa do Modo Pesquisa):** quando a infra de research (Apify/Tavily) não existir
  (hoje em homol — memória `quayer-apify-tavily-env-status`), o Modo Pesquisa deve cair para o Recomendado
  ("pesquisa lite" só com a fonte), com aviso honesto — nunca falhar nem travar a jornada (coerente com NFR-06).

**Moat / Posicionamento:**
- **FR-48 (Instrumentação do funil de missão):** a escolha de missão deve emitir o evento de funil
  **`mission_selected`** (metadata tipado com `role/businessType/objective/framework`, sem PII — NFR-02); o
  `AgentStrategy.successCriteria` deve ser mapeável aos eventos de funil existentes para o loop de resultado.
- **FR-49 (Guardrail de copy — linguagem de negócio):** toda copy voltada ao usuário deve usar linguagem de
  resultado comercial; termos de canvas/IA ("prompt", "RAG", "tool", "workflow", "framework", "BANT/SPIN/
  MEDDIC") são proibidos na UI do leigo (estende NFR-07).

**Ferramentas personalizadas (Integration Builder):**
- **FR-50 (Criar ferramenta personalizada via Capacidades):** a criação de ferramenta/integração personalizada
  **reusa o Integration Builder** e segue três momentos: (1) **pedir** na Capacidades (pré-agente) — provedor
  conhecido ou "Outra" (dispara o investigador via Tavily); (2) **construir + testar** (proposta → credenciais
  cifradas → teste obrigatório), possível pré-agente, ficando `validated`; (3) **ativar** só após existir
  `aiAgentId` (gate em `integration-lifecycle.routes.ts`). É **opcional e não-gating** (sem `StepId`/
  `ConfirmationKey` novos). A v3 adiciona o entry **pré-agente** a partir da Capacidades (hoje o entry é
  pós-agente no AdvancedTab); compartilha a infra de research do investigador → degrada como o Modo Pesquisa.

**Recomendador de capacidades (lógica de *seed* do FR-43 — backlog #4/#5):**
- **FR-51 (Recomendador de capacidades):** deve existir uma função backend **pura**
  `recommendAgentCapabilities(builderState, insumos)` que retorna `[{ id, kind: 'recommended' | 'optional',
  reason, requires[], risk, initialConfig }]` derivada de missão (FR-37) + objetivo + nicho inferido + risco
  detectado + insumos de `getCapabilities` (customTools, calendarConnected, contagens). É a inteligência de
  pré-marcação que o FR-43 prevê, executada no backend (o front não carrega regra de negócio). **Read-only:**
  NUNCA escreve `AIAgentConfig.enabledTools` nem dispara a saga. Cada `id` referencia uma capacidade/tool válida
  do catálogo (`official-tools.ts`). **Fonte das recomendações por missão = os gatilhos do Blueprint Engine já
  existentes** — `BlueprintSchema.toolTriggers[]` (`{capability, toolKey?, when, requiredVariables[], fallback?}`)
  + `handoffTriggers[]` + `successCriteria[]` em `playbook/blueprint.schema.ts`, resolvidos via `blueprint-helpers.ts`
  — **evoluindo** para `AgentStrategy.recommendedTools` *quando* o Playbook Engine (FR-40) for construído.
  ⚠️ `AgentStrategy.recommendedTools` **NÃO existe hoje** (é vocabulário de design da v3, não código) — não
  referenciá-lo como campo atual. A inferência de nicho/risco deve ser **extraída** para um módulo puro
  compartilhado (`playbook/niche-inference.pure.ts`): hoje `inferKnownVertical`/`inferNiche`/`soldOutLimit` são
  **privados** em `designer-input.ts` (só `hasSoldOutSourceSignal` é exportado).
- **FR-52 (Capacidades renderiza recomendações — sem segunda superfície):** a superfície de **Capacidades**
  (FR-43/FR-06) deve **renderizar** as recomendações de FR-51 (recomendadas com badge "Sugerido para seu nicho",
  opcionais abaixo; `reason` em linguagem de negócio — FR-49). Aceitar uma recomendação **não grava a tool**:
  roteia para o card de domínio existente (handoff/pricing/calendar via submit silencioso FR-29) OU escreve
  `selectedCapabilityKeys`/`mission.addons` — o mesmo caminho dos toggles da Overview (FR-09 preservado). O
  `initialConfig` é **prefill** do card de domínio (oferecido via chip "Usar sugestão" — FR-23), nunca decisão
  silenciosa. `requires[]` reflete os mesmos pré-requisitos da derivação (ex.: agenda real exige conexão — FR-11)
  para nunca recomendar estado impossível (FR-10). 🚫 PROIBIDO recriar um catálogo de checkboxes re-oferecendo
  handoff/agenda/preços como toggles independentes (foi o bug que esvaziou `propose-tool-selection`).

**Revisão final orientada a negócio (backlog #22):**
- **FR-53 (Revisão de negócio):** o card `agent_review` (FR-05, evoluído na §5) deve apresentar, em linguagem de
  negócio, um retrato **somente-leitura** do agente antes de publicar: missão (FR-37), capacidades ativas
  (derivadas — FR-09), critérios de qualificação (se a missão qualifica — FR-44), restrições comerciais (se houver
  risco/regulação — FR-44), **automações proativas ativas** (se a capacidade F1/FR-PRO-01 estiver ligada),
  ferramentas/integrações anexadas, e "o que o agente nunca pode prometer". Reusa as funções puras
  `derive*ToolChanges` (fonte única). Zero re-decisão. **Ordem de ondas:** a versão base não depende do proativo;
  a sub-seção "automações ativas" é **adendo pós-FR-PRO-01** (a revisão é Onda 3, F1 é Onda 4 — declarar a
  dependência).

**Pesquisa estratégica (backlog #8):**
- **FR-54 (Tavily como motor primário — decisão registrada):** o motor de pesquisa do Builder (Modo Pesquisa
  FR-39/FR-46, investigador de integrações FR-50, enriquecimento de playbooks) é o **Tavily** (cliente já
  existente em `sub-agents/niche-researcher/tavily-client.ts`, cache Redis 1h, degradação fail-open). Leitura
  profunda de páginas (Firecrawl/Crawlee) fica como opção **futura**. Item de **decisão/doc** — a infra primária
  já existe; FR-47/NFR-06 cobrem a degradação.

**Proatividade — F1 (design-time, in-scope da v3 — backlog #14-18 parcial):**
- **FR-PRO-01 (Capacidade "Mensagens proativas" — recomenda + persiste):** Capacidades (FR-43) deve oferecer uma
  capacidade **opt-in** "Mensagens proativas / Automações" com 3 presets em linguagem de negócio: **Follow-up de
  lead parado**, **Lembretes de agenda** e **Datas importantes**. Desligada por padrão; recomendada por FR-51 para
  missões SDR/closer/cobrança/pós-venda. F1 apenas **recomenda + persiste** a metadata da automação no
  `builderState` (aditivo, zero migration) e a expõe na revisão (FR-53). **Nenhum envio em F1** (envio é runtime —
  épico próprio). **Aviso de compliance em design-time (#19):** ao ligar uma automação proativa, o Builder deve
  **alertar** que envios fora da janela de 24h do WhatsApp exigirão template aprovado (educação preventiva),
  independente de o runtime existir.
- → **FR-PRO-02..FR-PRO-07 (envio proativo + compliance WhatsApp) são RUNTIME** e vivem no épico próprio
  [`specs/builder-proatividade/spec.md`](builder-proatividade/spec.md) (ver NFR-14). Não pertencem a esta addendum.

**P2 — Observabilidade & nomenclatura (backlog #23/#24):**
- **FR-P2-01 (Evals/observabilidade):** após a jornada mission-first estabilizar, avaliar **Promptfoo**
  (evals/red-team) e **Langfuse** (tracing) — ambos **net-new** (não existem no repo). O **LiteLLM já é o gateway**
  roteado pelo provider factory quando configurado (**não** é greenfield) — manter. Investigação/prioridade futura;
  não bloqueia este ciclo.
- **FR-P2-02 (Nomenclatura da arquitetura LLM):** doc — front-end não fala com LLM; backend usa os primitives do
  pacote `ai`; o provider factory roteia via LiteLLM quando configurado. Evitar escrever "usamos Vercel" como
  plataforma.

## 4. Requisitos Não-Funcionais

- **NFR-11 (Anti-explosão da biblioteca):** a Playbook Library começa **curada** (~5 playbooks, partindo das
  fixtures de `niche-blueprint-fixtures.ts`) com **fallback genérico**; combinações sem playbook dedicado
  degradam para o fallback, nunca erro. Cresce sob demanda.
- **NFR-12 (Compat v2):** a camada de missão é **aditiva** sobre a v2 (novos sentinels em `confirmations`,
  novos `StepId`), atrás da mesma chave de rollout; um projeto v2 sem missão continua funcional (o engine
  trata missão ausente como o caminho v2 atual). O kill-switch `BUILDER_V2_FORCE_RENDER_V1` (NFR-08) continua
  válido.

- **NFR-13 (Recomendador puro e aditivo):** `recommendAgentCapabilities` é uma função **pura** (zero IO, zero
  `any`, client-safe), espelhando `deploy/enabled-tools-derivation.pure.ts`. Vive ACIMA da derivação e AO LADO de
  `getCapabilities` — NUNCA dentro do pipeline `derive*→reconcile→enabledTools`. Exposta sem fetch extra (campo
  `recommendations` no envelope de `GET /capabilities` — NFR-05). Missão ausente = recomendações de fallback (nunca
  erro — coerente com NFR-11).
- **NFR-14 (Proativo é expansão de escopo declarada — épico de runtime faseado):** as mensagens proativas
  (FR-PRO-02..07) são **runtime** e EXPANDEM o que `spec.md §7` exclui (tools de execução, FSM de outbound).
  Tratadas como **épico próprio faseado** em [`specs/builder-proatividade/`](builder-proatividade/spec.md): F1
  (recomenda+persiste, design-time, FR-PRO-01) é in-scope da v3; **F2** (follow-up simples), **F3** (lembretes de
  agenda), **F4** (datas importantes) são runtime, reusando BullMQ + `sendAgentResponse` + a proposta de
  FSM-outbound-durável.
- **NFR-15 (Compliance proativa por construção — LGPD/anti-abuso):** nenhum envio proativo sem **opt-in** explícito
  por contato; **opt-out** irreversível por palavra-chave; gates de supressão (humano assumiu / sessão encerrada /
  IA pausada) verificados ANTES de cada envio; **motivo** de cada envio auditável (com superfície de leitura);
  telefones mascarados (NFR-02). Falha de qualquer gate = **não-envio fail-safe** (nunca envio em estado ambíguo).

## 5. Jornada final (cards × fases)

| # | Card | Fase | Status |
|---|---|---|---|
| 1 | Objetivo | Conhecer | v2 |
| 2 | Modo de construção (Recomendado / Pesquisa / Livre) | Conhecer | 🆕 FR-39 |
| 3 | Fonte do negócio (+ Diagnóstico se Modo Pesquisa) | Conhecer | v2 / 🆕 FR-46 |
| 4 | Missão do agente (playbook resolvido por baixo) | Conhecer | 🆕 FR-37/38 |
| 5 | Capacidades (passo; pré-marcada; pede ferramentas/integrações) | Revisar | evoluído FR-43 |
| 6 | Critérios de qualificação | Revisar | 🆕 condicional FR-44 |
| 7 | Restrições comerciais | Revisar | reposicionado FR-44 |
| 8 | Plano de atendimento (= `conversation_blueprint`) | Revisar | renomeado FR-42 |
| 9 | Revisão do agente (= `agent_review`, absorve persona) | Revisar | evoluído |
| 10-14 | Teste · Refinamento · Ativação · Canal/Conexão · Próximos passos | Testar/Lançar | v2 |

**Poda dinâmica:** SDR c/ risco → 4,5,6,7,8,9 · Suporte → 4,5,8,9 · Secretária → 4,5(+agenda),8,9.

## 6. Critérios de aceitação

- [ ] No fluxo do Vibra Butantã, o card **Missão** aparece **antes** do Plano de atendimento; a decisão de
      "100% vendido" aparece em **Restrições**, não no card de roteiro.
- [ ] Escolher uma missão resolve um `AgentStrategy` (biblioteca ou fallback) e **pré-marca** as Capacidades;
      as tools derivadas do runtime batem com a missão (verificável ponta a ponta).
- [ ] Nenhum card de "Playbook" separado é mostrado; a abordagem aparece dentro do Plano com "trocar abordagem".
- [ ] Nenhuma metodologia (BANT/SPIN/MEDDIC) nem jargão de canvas aparece na UI do leigo.
- [ ] Poda dinâmica: "tirar dúvidas" **não** mostra Qualificação/Restrições; "secretária" mostra agenda e pula
      qualificação.
- [ ] Os 3 modos funcionam: Recomendado propõe direto; Pesquisa mostra Diagnóstico → Missões; Livre adapta por
      linguagem natural.
- [ ] Sem Apify/Tavily, o Modo Pesquisa **degrada** para Recomendado/lite com aviso — sem falha nem trava.
- [ ] Escolher a missão emite `mission_selected` com metadata tipado (sem PII); o funil consegue agregar por
      `role/objective`.
- [ ] Projeto v2 **sem** missão continua funcional (compat NFR-12); kill-switch v1 segue degradando o render.

## 7. Decisões registradas (2026-06-13, sessão de design com o founder)

1. **Missão é UMA decisão** (playbook interno, materializado no Plano com "trocar abordagem") — não há card de
   Playbook separado. *(escolha do founder; resolve a redundância Missão×Playbook)*
2. **Missão = bundles nomeados + "montar do zero"**, modelo interno *função primária + add-ons*.
3. **Qualificação/Restrições = surfacing dinâmico** por missão/risco (não cards fixos).
4. **Três modos (Recomendado/Pesquisa/Livre) entram juntos no v3.0**, com degradação graciosa do Pesquisa.
   *(escolha do founder; ciente do custo da infra de research)*
5. **Frameworks internos, linguagem de negócio na tela** (FR-41/FR-49).
6. **Instrumentar `successCriteria`→funil desde o v3.0** (moat de dado começa a acumular no lançamento).
7. **Capacidades é um passo explícito** e o **ponto de entrada de ferramentas personalizadas** (Integration
   Builder); a missão pré-marca as capacidades. *(escolha do founder; sobrepõe a proposta inicial de "sem passo")*
8. **Backlog 2026-06-13 integrado** (`backlog-simples.md`): o recomendador de capacidades (#4/#5) é a *lógica de
   seed* do FR-43 (FR-51/52, sem segunda superfície — FR-09 preservado); revisão de negócio (#22 → FR-53); Tavily
   primário (#8 → FR-54); proatividade F1 (#14-18 → FR-PRO-01, design-time) com o **envio runtime (F2-F4) + compliance
   (#19/#20) num épico próprio** ([`builder-proatividade/`](builder-proatividade/spec.md), NFR-14); P2 evals/doc
   (#23/#24 → FR-P2-01/02). *(validado por workflow multi-agente com verificação adversarial — correções de âncora
   aplicadas: fonte = `blueprint.toolTriggers`, não `AgentStrategy.recommendedTools`; `niche-inference` extraído;
   gate de supressão extraído de `canDispatchAgent`; hook inbound em `process-inbound.ts`.)*

## 8. Fora de escopo (além do que a v2 já exclui)

- Treinar/afinar a biblioteca de playbooks com ML sobre os dados do funil — o v3.0 apenas **instrumenta** o
  loop; a otimização data-driven é épico futuro.
- Novos frameworks de venda além de BANT-lite/SPIN/MEDDIC/triagem/appointment no lançamento.
- Provisionamento de infra de research (Apify/Tavily) em prod — tratado como tarefa de infra na Onda 4, não
  como requisito de produto desta spec.
- **Envio proativo de runtime (follow-up/lembretes/datas) + compliance WhatsApp (24h/template/opt-out/anti-spam)**
  — FR-PRO-02..07 vivem no épico próprio [`specs/builder-proatividade/spec.md`](builder-proatividade/spec.md)
  (NFR-14). Só a F1 (FR-PRO-01, recomenda+persiste, design-time) é in-scope desta addendum.
