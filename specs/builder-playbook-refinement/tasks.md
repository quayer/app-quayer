---
Criado: 2026-06-12
Atualizado: 2026-06-12
Revisar em: ao iniciar cada onda
Relacionados:
  - specs/builder-playbook-refinement/spec.md
  - specs/builder-playbook-refinement/plan.md
---

# Tasks - Builder Playbook & Refining Loop

## Checklist de cobertura

- [x] Blueprint antes do prompt: T01-T10
- [x] Card de roteiro: T11-T15
- [x] Prompt gerado a partir do blueprint: T16-T20
- [x] Recibos e formatacao dinamica: T21-T26
- [x] Refining Loop multiagente: T27-T39
- [x] Ferramentas/integracoes no refinement: T40-T47
- [x] Observabilidade e bloqueio de publicacao: T48-T54
- [x] Testes: T55-T64

## Onda 1 - Conversation Blueprint

- [ ] **T01** - Adicionar schemas puros de `ConversationBlueprint`
  - Arquivo: `src/server/ai-module/builder/playbook/blueprint.schema.ts`
  - Fazer: definir `BlueprintStage`, `BlueprintQuestion`, `BlueprintVariable`, `BlueprintToolTrigger`, `BlueprintObjectionRule`.
  - Criterio: Zod strict; exportar tipos inferidos.

- [ ] **T02** - Adicionar namespace `conversationBlueprint` ao BuilderState
  - Arquivo: `src/server/ai-module/builder/cards/builder-state.ts`
  - Fazer: campo opcional, sem nova confirmation ainda.
  - Criterio: states legados parseiam sem quebrar.

- [ ] **T03** - Criar helpers puros de blueprint
  - Arquivo: `src/server/ai-module/builder/playbook/blueprint-helpers.ts`
  - Fazer: normalizar perguntas, dedupe, validar uma pergunta por vez, detectar variavel sem pergunta.
  - Criterio: unit tests.

- [ ] **T04** - Criar sub-agent `playbook-designer`
  - Arquivos: `src/server/ai-module/builder/sub-agents/playbook-designer/*`
  - Fazer: gerar JSON de blueprint a partir de objetivo, nicho, fonte, escopo e capacidades.
  - Criterio: parse robusto; nunca retorna prompt markdown.

- [ ] **T05** - Criar tool `generate_conversation_blueprint`
  - Arquivo: `src/server/ai-module/builder/tools/generate-conversation-blueprint.tool.ts`
  - Fazer: chamar sub-agent, validar, gravar proposta no builderState.
  - Criterio: org-scoped; sem confirmar automaticamente.

- [ ] **T06** - Registrar tool no toolset do Builder
  - Arquivo: `src/server/ai-module/builder/tools/index.ts`
  - Fazer: expor tool para o orquestrador.
  - Criterio: tool aparece apenas para Builder.

- [ ] **T07** - Atualizar system prompt do Builder
  - Arquivo: `src/server/ai-module/builder/prompts/whatsapp-agent-system-prompt.ts`
  - Fazer: inserir regra: antes de `generate_prompt_anatomy`, gerar/aprovar blueprint em projetos v2.
  - Criterio: nao quebrar fallback legado.

- [ ] **T08** - Criar validador de blueprint
  - Arquivo: `src/server/ai-module/builder/validators/blueprint.ts`
  - Fazer: bloquear blueprint sem perguntas, sem criterio de sucesso, com pergunta multipla ou tool trigger sem dados obrigatorios.
  - Criterio: warnings/fails estruturados.

- [ ] **T09** - Adicionar `builderStateToPromptWriterContext` com blueprint
  - Arquivo: `src/server/ai-module/builder/sub-agents/prompt-writer/builder-context.ts`
  - Fazer: projetar blueprint aprovado para o writer.
  - Criterio: prompt writer recebe etapas/perguntas/tool triggers.

- [ ] **T10** - Fixtures de nichos iniciais
  - Arquivo: `src/server/ai-module/builder/playbook/niche-blueprint-fixtures.ts`
  - Fazer: imobiliario, B2B, servico local, saude, delivery.
  - Criterio: usados como fallback quando LLM falhar.

## Onda 1 - Card Roteiro da Conversa

- [ ] **T11** - Payload schema `conversation_blueprint`
  - Arquivo: `src/server/ai-module/builder/cards/card-submit.schemas.ts`
  - Fazer: submit com blueprint editado e action `approve`.
  - Criterio: discriminated union reconhece card.

- [ ] **T12** - Handler de submit do blueprint
  - Arquivo: `src/server/ai-module/builder/cards/handlers/apply-card-submit.ts`
  - Fazer: validar, salvar como approved, emitir ACK.
  - Criterio: nao sobrescreve edicoes com proposta tardia.

- [ ] **T13** - Componente `ConversationBlueprintCard`
  - Arquivo: `src/client/components/projetos/chat/cards/conversation-blueprint-card.tsx`
  - Fazer: renderizar etapas, perguntas, variaveis, regras de pulo e acoes.
  - Criterio: responsivo; sem card dentro de card.

- [ ] **T14** - Registrar card no registry
  - Arquivo: `src/client/components/projetos/chat/cards/card-registry.tsx`
  - Fazer: mapear cardKey.
  - Criterio: card aparece quando step ativo.

- [ ] **T15** - Recibo de blueprint aprovado
  - Arquivo: handler ou builder ACK existente
  - Fazer: mensagem curta: quantidade de perguntas, gatilhos, ferramentas.
  - Criterio: card nao some sem contexto.

## Onda 1 - Prompt a partir do blueprint

- [ ] **T16** - Atualizar input do `promptWriterInputSchema`
  - Arquivo: `src/server/ai-module/builder/sub-agents/prompt-writer/prompt-writer.sub-agent.ts`
  - Fazer: aceitar blueprint estruturado.
  - Criterio: tsc verde.

- [ ] **T17** - Atualizar prompt do `PromptWriter`
  - Arquivo: `src/server/ai-module/builder/sub-agents/prompt-writer/prompt-writer.prompt.ts`
  - Fazer: instruir a preservar etapas/perguntas/regras de pulo/tool triggers.
  - Criterio: prompt gerado contem roteiro aprovado.

- [ ] **T18** - Atualizar `generate_prompt_anatomy`
  - Arquivo: `src/server/ai-module/builder/tools/generate-prompt-anatomy.tool.ts`
  - Fazer: carregar blueprint do builderState e passar ao writer.
  - Criterio: se blueprint aprovado existe, writer usa; se nao existe, fallback legado.

- [ ] **T19** - Validador de preservacao do blueprint
  - Arquivo: `src/server/ai-module/builder/validators/blueprint-preservation.ts`
  - Fazer: checar perguntas, variaveis, fim, tool triggers e dont rules no prompt final.
  - Criterio: falha se prompt ignora roteiro.

- [ ] **T20** - Testes do writer com blueprint
  - Arquivo: testes ao lado do prompt writer
  - Fazer: fixture imobiliario e B2B.
  - Criterio: sem regressao nas 10 secoes atuais.

## Onda 2 - UI blocks, chips e recibos

- [ ] **T21** - Definir tipos `AssistantUiBlock`
  - Arquivo: `src/client/components/projetos/chat/ui-blocks/types.ts`
  - Fazer: text, bullets, choices, receipt, carousel, card_ref.
  - Criterio: tipos exportados sem acoplar ao server.

- [ ] **T22** - Adaptar choices para `quick_reply_chips`
  - Arquivo: renderer do chat/tool-call ou helper novo
  - Fazer: usar chips para opcoes dinamicas por nicho.
  - Criterio: pergunta de objetivo nao lista opcoes como texto solto.

- [ ] **T23** - Criar componente de recibo compacto
  - Arquivo: `src/client/components/projetos/chat/cards/receipt-card.tsx`
  - Fazer: mostrar confirmacoes curtas.
  - Criterio: sem ocupar metade do chat.

- [ ] **T24** - Aplicar recibo em `agent_review`
  - Arquivo: handler/card correspondente
  - Fazer: apos confirmar, resumir voz, escopo, equipe.
  - Criterio: usuario sabe o que aprovou.

- [ ] **T25** - Aplicar recibo em `source_progress`
  - Arquivo: `source-progress-card` + handler
  - Fazer: resumo de informacoes e fotos aceitas.
  - Criterio: nao duplicar lista gigante.

- [ ] **T26** - Carrossel compacto de fotos em fontes
  - Arquivo: `source-progress-card` e componentes de imagens
  - Fazer: trocar lista longa por carrossel/preview compacto.
  - Criterio: 18 imagens nao tornam o chat gigante.

## Onda 3 - Refining MVP

- [ ] **T27** - Schema de refinement no BuilderState
  - Arquivo: `builder-state.ts`
  - Fazer: namespace opcional `refinement`.
  - Criterio: states legados ok.

- [ ] **T28** - Sub-agent `scenario-generator`
  - Arquivo: `src/server/ai-module/builder/sub-agents/scenario-generator/*`
  - Fazer: gerar cenarios por blueprint.
  - Criterio: minimo 6 cenarios por agente.

- [ ] **T29** - Runner de preview conversacional
  - Arquivo: `src/server/ai-module/builder/refinement/conversation-runner.ts`
  - Fazer: executar cenarios contra prompt/preview.
  - Criterio: retorna transcript + toolCalls simulados/reais quando houver.

- [ ] **T30** - Auditor de roteiro
  - Arquivo: `src/server/ai-module/builder/refinement/auditors/route-auditor.ts`
  - Fazer: comparar transcript com etapas do blueprint.
  - Criterio: detecta etapa pulada.

- [ ] **T31** - Auditor de perguntas
  - Arquivo: `src/server/ai-module/builder/refinement/auditors/question-auditor.ts`
  - Fazer: detectar multiplas perguntas, repeticao e pergunta que deveria pular.
  - Criterio: unit tests.

- [ ] **T32** - Auditor de seguranca/compliance
  - Arquivo: `src/server/ai-module/builder/refinement/auditors/safety-auditor.ts`
  - Fazer: reaproveitar blacklist/journey validators + transcript.
  - Criterio: falhas criticas estruturadas.

- [ ] **T33** - Orquestrador `runRefinement`
  - Arquivo: `src/server/ai-module/builder/refinement/run-refinement.ts`
  - Fazer: scenario -> runner -> auditors -> aggregate.
  - Criterio: never throws; falha parcial vira warning/fail.

- [ ] **T34** - Tool `run_agent_refinement`
  - Arquivo: `src/server/ai-module/builder/tools/run-agent-refinement.tool.ts`
  - Fazer: disparar Refining Loop pelo Builder.
  - Criterio: grava status incremental.

- [ ] **T35** - UI da fase "Refinando"
  - Arquivo: novo card/componente no workspace
  - Fazer: mostrar checks por area e progresso.
  - Criterio: sem logs tecnicos.

- [ ] **T36** - Bloqueio de publicacao por fail critical
  - Arquivo: readiness/blockers
  - Fazer: adicionar blocker tipado quando refinement falhar criticamente.
  - Criterio: publicar fica indisponivel.

- [ ] **T37** - Autocorrecao simples de prompt
  - Arquivo: refinement/autofix
  - Fazer: aplicar ajustes autoFixable via prompt writer/edit section.
  - Criterio: uma rodada maxima no MVP.

- [ ] **T38** - Segunda rodada curta
  - Arquivo: refinement orchestrator
  - Fazer: revalidar apenas checks que falharam apos autofix.
  - Criterio: evita falso "corrigido".

- [ ] **T39** - Resumo final ao usuario
  - Arquivo: Builder prompt/tool ACK
  - Fazer: "corrigi X; passou Y; precisa decidir Z".
  - Criterio: linguagem leiga.

## Onda 4 - Ferramentas e integracoes no Refining

- [ ] **T40** - Expandir blueprint com `toolTriggers`
  - Arquivo: blueprint schema
  - Fazer: dados obrigatorios, momento de chamada, fallback.
  - Criterio: prompt writer recebe.

- [ ] **T41** - Auditor de ferramentas
  - Arquivo: `refinement/auditors/tool-auditor.ts`
  - Fazer: detectar chamada ausente, cedo demais, parametro faltante, tool nao ativa.
  - Criterio: fixtures RD Station/webhook.

- [ ] **T42** - Integrar com `integration-builder`
  - Arquivo: builder integrations/refinement seam
  - Fazer: ler integracoes ativas/validadas como capacidades.
  - Criterio: integracao draft nao conta como disponivel.

- [ ] **T43** - Cenario automatico para cada ferramenta ativa
  - Arquivo: scenario generator
  - Fazer: se ha tool trigger, gerar pelo menos um cenario que deveria chama-la.
  - Criterio: tool sem cenario vira warning.

- [ ] **T44** - Validar falha de ferramenta
  - Arquivo: runner/auditor
  - Fazer: simular/avaliar resposta quando tool falha.
  - Criterio: lead nao ve erro tecnico.

- [ ] **T45** - Mostrar capacidades no card de roteiro
  - Arquivo: `ConversationBlueprintCard`
  - Fazer: "o agente usara X quando Y".
  - Criterio: usuario entende o uso da ferramenta.

- [ ] **T46** - Blocker de ferramenta prometida e nao ativa
  - Arquivo: readiness/refinement
  - Fazer: se prompt/blueprint promete tool nao ativa, bloquear publicacao.
  - Criterio: sem agente prometendo RD Station sem integracao validada.

- [ ] **T47** - Testes de ferramenta no Refining
  - Arquivo: tests refinement
  - Fazer: fixtures com tool correta, ausente e parametros faltantes.
  - Criterio: todos verdes.

## Onda 5 - Auditores finais e historico

- [ ] **T48** - Auditor de conhecimento
  - Arquivo: `refinement/auditors/knowledge-auditor.ts`
  - Fazer: detectar dado inventado ou nao confirmado.
  - Criterio: usa fontes/propostas aceitas.

- [ ] **T49** - Auditor de UX/copy
  - Arquivo: `refinement/auditors/ux-copy-auditor.ts`
  - Fazer: tamanho, clareza, tom, ausencia de bloco gigante.
  - Criterio: warning quando mensagens passam limite.

- [ ] **T50** - Eventos de observabilidade
  - Arquivo: journey events/analytics
  - Fazer: eventos listados no plan.
  - Criterio: emitidos em dev.

- [ ] **T51** - Historico duravel de runs, se necessario
  - Arquivo: Prisma + repository
  - Fazer: criar tabelas apenas se JSONB nao bastar.
  - Criterio: decisao documentada antes de migration.

- [ ] **T52** - UI de detalhes do Refining
  - Arquivo: workspace overview/publish
  - Fazer: expandir check para evidencia curta e recomendacao.
  - Criterio: sem expor prompt interno por padrao.

- [ ] **T53** - Reabrir card certo a partir de falha
  - Arquivo: refinement UI/handlers
  - Fazer: falha de preco abre pricing; falha de ferramenta abre integracao; falha de pergunta abre roteiro.
  - Criterio: usuario nao fica perdido.

- [ ] **T54** - Score final e politica de publicacao
  - Arquivo: readiness
  - Fazer: definir minimo e severidades bloqueantes.
  - Criterio: alinhado com talks.md.

## Testes

- [ ] **T55** - Unit: blueprint schema e helpers
- [ ] **T56** - Unit: playbook designer parse/fallback
- [ ] **T57** - Unit: card submit `conversation_blueprint`
- [ ] **T58** - React: `ConversationBlueprintCard`
- [ ] **T59** - Unit: prompt writer preserva blueprint
- [ ] **T60** - Unit: route/question/safety auditors
- [ ] **T61** - Unit: tool auditor
- [ ] **T62** - Integration: runRefinement com LLM mock
- [ ] **T63** - E2E mock: SDR imobiliario passa por roteiro -> prompt -> refinando -> publicar
- [ ] **T64** - Regression: jornada v1/legado nao exige blueprint

