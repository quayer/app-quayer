---
Criado: 2026-06-10
Atualizado: 2026-06-10
Revisar em: ao iniciar o /plan desta spec, ou mudança nos cards/step-engine do Builder
Relacionados:
  - src/server/ai-module/builder/state/next-pending-step.ts
  - src/client/components/projetos/chat/cards/card-registry.tsx
  - docs/builder/CARDS_REVIEW_2026-06.md
---

# Spec — Jornada Builder v2: "Configure por exceção"

## 1. Resumo executivo

Redesenhar a jornada de criação de agentes do Builder de um trilho de 15 etapas com decisões duplicadas para uma experiência de 4 fases onde a IA monta o agente a partir de 2-3 perguntas e o usuário só ajusta o que discorda — com uma superfície única de Capacidades, cards reativos à conversa e interface que se revela progressivamente.

## 2. Problema & Motivação

**Dor (comprovada por auditoria de código + teste E2E em 2026-06-10):**

- A jornada atual tem **15 etapas sequenciais** com pelo menos **12 pontos de atrito ou conflito** documentados (`docs/builder/CARDS_REVIEW_2026-06.md` e memória `jornada-builder-ux-review`):
  - Decisões duplicadas em superfícies que não se reconciliam: handoff é decidido no card de handoff E no card de ferramentas; preços idem; agendamento tem 3 superfícies sem ponte. Isso produz **agentes publicados quebrados** (ex.: modo roleta sem a capacidade de transferir habilitada; catálogo de preços cadastrado que o agente publicado não consegue ler).
  - O usuário **re-digita o que já informou**: tom de voz respondido em texto livre é descartado; o card de persona abre vazio; o nome do negócio é pedido 3 vezes.
  - Quem **não tem site** não consegue informar endereço/descrição do negócio (só existem via aceite de fontes).
  - Etapas obrigatórias aparecem cedo demais (modo de ativação antes de o usuário sequer testar o agente) e recursos importantes nunca são descobertos (Playground, base de conhecimento manual, mídias).
  - O painel lateral nasce com 7 abas (5 travadas), o progresso é calculado por 4 modelos que se contradizem, e botões prometem ações que não acontecem ("Ajustar" envia "Pular este passo"; "Conectar agenda" confirma sem conectar).
- **Por que agora:** o produto é 100% focado no Builder (CLAUDE.md); os bugs de costura estão em homol; cada onda nova de cards (A→D) aumentou a fragmentação. Continuar adicionando cards sobre o modelo atual amplia o problema.
- **Impacto esperado (mensurável):**
  - Taxa de conclusão da jornada (projeto criado → agente publicado) — hoje não medida; meta: instrumentar e elevar.
  - Tempo até o primeiro teste no Playground (meta: < 5 minutos da primeira mensagem).
  - Zero estados inconsistentes "decisão A contradiz decisão B" por construção (as capacidades derivam das decisões, não são re-decididas).
  - Redução de perguntas obrigatórias de ~12 para 2-3.

## 3. Usuários afetados

| Persona | Papel | Como é afetada |
|---|---|---|
| **Dono de negócio leigo** (persona primária: dono de barbearia, corretor, advogado solo) | `admin` da org | Vive a jornada inteira; hoje abandona ou publica agente mal configurado |
| **Founder/agência** que monta agentes para clientes | `admin`/`master` | Quer velocidade: poucas perguntas, defaults bons, ajuste fino depois |
| **Membro da equipe** (recebe handoff/roleta) | `user` membro de departamento | Afetado indiretamente: handoff mal configurado = conversa perdida |
| **Lead final no WhatsApp** | externo | Afetado indiretamente: agente publicado sem capacidade de transferir/agendar/falar preço |

## 4. User Stories

1. Como **dono de negócio leigo**, quero responder no máximo 2-3 perguntas (o que o agente faz e se tenho site/Instagram) e ver a IA montar o agente inteiro com sugestões prontas, para não precisar entender de "persona", "ativação" ou "ferramentas".
2. Como **dono de negócio sem site**, quero informar endereço e descrição do meu negócio direto na conversa, para que meu agente saiba responder "onde fica?" mesmo sem nenhuma fonte ingerida.
3. Como **dono de negócio**, quero que tudo que eu disser no chat ("atendo das 18h às 23h", "tom descontraído") seja aproveitado automaticamente — confirmando num card já preenchido — para nunca digitar a mesma informação duas vezes.
4. Como **dono de negócio**, quero uma única tela de "Capacidades" com interruptores simples (transferir para humano, agenda, preços, integrações), cada um abrindo sua configuração só quando ativado, para entender de relance o que meu agente sabe fazer.
5. Como **dono de negócio que quer a IA trabalhando sozinha**, quero deixar "transferir para humano" desligado e publicar mesmo assim, para que o agente responda tudo sem passar bastão.
6. Como **dono de negócio**, quero testar o agente numa conversa simulada ANTES de decidir modo de ativação e conectar o WhatsApp, para ajustar com segurança antes de clientes reais verem.
7. Como **founder/agência**, quero que a base de conhecimento esteja sempre ativa e que capacidades óbvias se liguem sozinhas (fotos quando há catálogo, preços quando cadastrei tabela), para não esquecer nenhum interruptor e publicar agente capenga.
8. Como **dono de negócio**, quero corrigir qualquer decisão já confirmada (preço, horário, persona) reabrindo a configuração correspondente a partir do resumo, para não ficar travado com um dado errado.
9. Como **dono de negócio**, quero que a interface comece simples (só a conversa) e revele as áreas (visão geral, teste, publicação) conforme elas fazem sentido, para não me perder em abas bloqueadas.
10. Como **dono de negócio**, quero saber o que fazer depois de publicar (testar do meu celular, ver as conversas chegando), para ter confiança de que está funcionando.

## 5. Requisitos Funcionais

**Fase 1 — Conhecer (conversa):**
- **FR-01** A jornada deve exigir no máximo 3 entradas obrigatórias do usuário antes de a IA montar uma proposta completa de agente: objetivo do negócio/agente, fonte (site/Instagram) OU identidade mínima (nome do negócio + endereço/descrição), e nada mais.
- **FR-02** Quando o usuário informar dados de qualquer domínio em texto livre (tom, horários, serviços, preços, endereço…), o sistema deve capturá-los como **proposta** e apresentá-los para confirmação em superfície já preenchida — nunca descartar e nunca pedir o mesmo dado duas vezes.
- **FR-03** Usuário sem site/Instagram deve ter caminho equivalente para informar identidade do negócio (nome, endereço, descrição) na própria conversa.
- **FR-04** O nome do projeto exibido na navegação deve ser um nome curto e legível do negócio/agente, nunca a primeira linha bruta do prompt.

**Fase 2 — Revisar (proposta montada):**
- **FR-05** Após a fase 1, o sistema deve apresentar o agente proposto consolidado (persona com nome/tom/saudação sugeridos, serviços, horários) com todos os campos pré-preenchidos e editáveis por exceção.
- **FR-06** Deve existir uma superfície única de **Capacidades** listando cada capacidade do agente como interruptor com configuração embutida (expande ao ativar). Capacidades mínimas: transferir para humano, agenda, preços, envio de fotos, integrações.
- **FR-07** A base de conhecimento deve estar **sempre ativa** (não é interruptor); a superfície de Capacidades deve dar acesso à gestão de fontes (sites, textos/FAQ, documentos) — tornando o conhecimento manual descobrível na jornada.
- **FR-08** "Transferir para humano" deve ser **opt-in** (desligado por padrão). Ao ativar, a configuração (destino: você / rodízio / departamento; membros; mensagem de abertura) abre na mesma superfície. O comportamento padrão ao transferir é **pausar a IA**; "avisar sem pausar" é opção avançada.
- **FR-09** As capacidades técnicas do agente publicado devem ser **derivadas deterministicamente** das decisões do usuário (transferência ativada → capacidade de transferir; tabela de preços com itens → capacidade de consultar preços; agenda conectada → capacidades de calendário; catálogo com fotos → envio de mídia). Não deve existir uma segunda superfície onde o usuário re-decide capacidades já decididas.
- **FR-10** Deve ser impossível, por construção, publicar um agente em estado contraditório (ex.: modo rodízio sem capacidade de transferir; política "não falar preços" com capacidade de enviar preços ativa).
- **FR-11** Ativar "Agenda" deve conduzir a conexão do calendário na mesma superfície, e a confirmação só deve ocorrer quando a conexão existir de fato ou o usuário pular explicitamente — nunca confirmar sem conectar.

**Fase 3 — Testar:**
- **FR-12** O ambiente de teste (conversa simulada) deve ser apresentado ao usuário como etapa da jornada assim que o agente proposto existir, antes da escolha de modo de ativação e da conexão do canal.
- **FR-13** O teste deve usar o mesmo conhecimento e capacidades que o agente publicado terá (sem alucinar sobre conteúdo já ingerido; ciente do catálogo de fotos).
- **FR-14** O modo de ativação deve ter padrão "responder todas as mensagens" e ser apresentado como ajuste opcional na fase de lançamento; a configuração de contatos em silêncio deve viver DENTRO do ajuste de ativação (aparece só no modo "todos exceto bloqueados", com opção de preencher depois).

**Fase 4 — Lançar:**
- **FR-15** A conexão do canal (ex.: QR do WhatsApp) deve ser uma etapa determinística da jornada — apresentada, verificada (conectou ou não) e re-apresentável — sem depender de a IA decidir mostrá-la.
- **FR-16** Após a publicação, o sistema deve apresentar "próximos passos" (testar do próprio celular, onde acompanhar conversas, como pausar/ajustar).

**Transversais:**
- **FR-17** Toda decisão confirmada deve ser **revisável**: a partir do resumo/visão geral, "ajustar X" reabre a superfície de X pré-preenchida com o valor atual (nunca uma ação genérica de "pular").
- **FR-18** Deve existir UMA única fonte de progresso/prontidão exibida ao usuário; todas as superfícies (conversa, painel, publicação) leem a mesma fonte e nunca se contradizem.
- **FR-19** A interface deve se revelar progressivamente: a jornada começa com a conversa em foco; áreas adicionais (visão geral, teste, publicação) aparecem quando se tornam acionáveis — sem abas visíveis porém bloqueadas.
- **FR-20** Botões/ações nunca devem prometer o que não fazem: ações de pular só existem em etapas puláveis; ações de ajustar ajustam; estados desabilitados explicam o porquê.
- **FR-21** Elementos órfãos ou redundantes do modelo atual (cards sem caminho de render, superfícies duplicadas de identidade, modelos paralelos de progresso) devem ser removidos ou unificados — sem código morto.

## 6. Requisitos Não-Funcionais

- **NFR-01 Multi-tenant:** toda leitura/escrita de estado da jornada permanece escopada por `organizationId` (regra dura existente do projeto).
- **NFR-02 LGPD:** telefones de contatos (silenciados, membros de equipe) tratados como dado pessoal: mascarados em logs/telemetria; consentimento implícito restrito ao escopo da org.
- **NFR-03 Compatibilidade:** projetos em andamento criados na jornada v1 devem continuar funcionais (concluíveis na v1 ou migráveis sem perda de decisões já confirmadas).
- **NFR-04 Observabilidade:** instrumentar funil por fase (criou → propôs → revisou → testou → conectou → publicou) com eventos por etapa, para medir o impacto declarado na seção 2.
- **NFR-05 Performance percebida:** a proposta montada da fase 2 deve aparecer sem espera adicional perceptível além do turno de IA normal; pré-preenchimentos não podem adicionar latência visível aos cards.
- **NFR-06 Resiliência:** falhas de serviços auxiliares (busca web, extração de fotos, conexão de agenda) degradam com aviso honesto ao usuário — nunca confirmação falsa, nunca estado silenciosamente inconsistente.
- **NFR-07 Simplicidade como requisito:** nenhuma fase pode apresentar ao usuário leigo mais decisões simultâneas que o necessário (heurística: máx. 1 decisão obrigatória por superfície; jargão técnico proibido em copy voltada ao leigo).

## 7. Fora de escopo

- **Integration Builder** (criar integrações novas tipo RD Station via agente investigador com busca de documentação e validação de credenciais) — é um épico próprio, dependente desta spec mas separado.
- Mudanças no **runtime** dos agentes publicados (tools de execução, webhook, FSM de outbound).
- Novos **canais** além dos existentes (WhatsApp QR/Cloud API, Instagram).
- **Billing/planos** e gates de publicação por plano (permanecem como estão).
- Redesign **visual** (design system/tokens permanecem); esta spec trata de estrutura e fluxo.
- Migração retroativa de projetos **já publicados**.
- O canal MCP/CLI do Builder (`@quayer/mcp-server`).

## 8. Critérios de aceitação

- [ ] Usuário leigo com site: da primeira mensagem ao agente proposto respondendo no teste com no máximo 2 perguntas respondidas.
- [ ] Usuário leigo sem site: consegue informar nome, endereço e descrição do negócio pela conversa; o agente de teste responde "onde fica?" corretamente.
- [ ] Informar tom/horário/serviço em texto livre resulta em confirmação pré-preenchida; em nenhum fluxo o mesmo dado é pedido duas vezes.
- [ ] A superfície de Capacidades mostra conhecimento sempre ativo; transferir/agenda/preços desligados por padrão e configuráveis inline ao ligar.
- [ ] Com transferência DESLIGADA, o agente publica e responde sozinho; com rodízio LIGADO, o agente publicado consegue transferir (verificável de ponta a ponta).
- [ ] Tabela de preços cadastrada ⇒ agente publicado responde preços do catálogo; política "não falar preços" ⇒ agente não fala preços. Sem combinação contraditória possível.
- [ ] Agenda: impossível ficar "confirmada" sem conexão real ou pulo explícito; agenda conectada ⇒ agente de teste consegue consultar horários.
- [ ] O teste simulado é oferecido antes do modo de ativação e da conexão de canal; ativação tem default e é ajustável na fase de lançamento; contatos em silêncio vivem dentro da ativação.
- [ ] QR/conexão de canal aparece de forma determinística e re-apresentável até conectar.
- [ ] "Ajustar" qualquer seção do resumo reabre a configuração correspondente preenchida com o valor atual.
- [ ] Um único número/checklist de progresso em toda a UI; impossível ver dois estados contraditórios.
- [ ] A primeira tela do projeto mostra apenas a conversa; áreas adicionais aparecem conforme acionáveis; nenhuma aba visível-porém-bloqueada.
- [ ] Pós-publicação apresenta próximos passos acionáveis.
- [ ] Funil instrumentado com eventos por fase.

## 9. Perguntas em aberto

> **Decisões registradas em 2026-06-10** (aprovação "aplicar todas as melhorias"; defaults escolhidos pelo time técnico, reversíveis no /plan):
>
> 1. **Transferir para humano:** default DESLIGADO em todos os nichos; em nichos regulados (advocacia, saúde) a IA **propõe ligado** na fase de revisão (proposta confirmável — coerente com "configure por exceção").
> 2. **Gate de teste:** recomendado com escape — o fluxo conduz ao teste antes de publicar, mas existe "Publicar sem testar" explícito.
> 3. **Horários:** ficam no card de revisão da fase 2, pré-preenchidos com default "sempre aberto" (editável).
> 4. **Migração v1:** projetos em andamento concluem na v1; projetos novos nascem na v2 (chave de rollout). Sem migração de estado no MVP.

Pendentes (não travam o /plan):
5. **Persona "jeito de falar"** (assistente / primeira pessoa / secretária): mantém as 3 opções na revisão ou vira sugestão única da IA com ajuste avançado?
6. **Capacidade "Avisar responsável" (alertar sem pausar):** mantém como opção avançada dentro de transferência, ou sai do MVP da v2?
7. **Conexão de agenda no plano gratuito/sem BYOK:** há gate de plano para capacidades (agenda/integrações) ou tudo disponível e o gate fica só na publicação?
8. **Nome das fases na UI** (voltado a leigo): "Conhecer / Revisar / Testar / Lançar" ou outra linguagem? (marketing/produto decide.)

---

**Próximo passo sugerido:** resolver as perguntas em aberto (1, 2, 3 e 4 são as que travam arquitetura) e rodar `/plan specs/jornada-builder-v2` para o desenho técnico (step-engine como checklist, derivação de capacidades na saga, superfície de Capacidades, migração).
