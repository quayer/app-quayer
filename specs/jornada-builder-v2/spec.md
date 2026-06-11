---
Criado: 2026-06-10
Atualizado: 2026-06-11
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
11. Como **founder/agência montando o agente para um cliente** (ou dono que está no computador com o celular do negócio em outra mão), quero enviar um link para OUTRA PESSOA concluir a conexão — quem está com o celular da empresa escaneia o QR do WhatsApp de lá; o profissional (dentista/advogado/barbeiro) autoriza a própria agenda de onde estiver — para concluir o lançamento sem depender de estar com o aparelho ou a conta na minha frente.

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
- **FR-11** Ativar "Agenda" deve conduzir a conexão do calendário na mesma superfície, e a confirmação só deve ocorrer quando a conexão existir de fato ou o usuário pular explicitamente — nunca confirmar sem conectar. A conexão oferece **dois caminhos lado a lado**: "Conectar minha agenda" (abre a autorização do Google na hora) OU "Enviar link para o profissional" (link delegável — FR-34), para que o profissional conecte a agenda DELE de onde estiver enquanto o card aguarda com verificação honesta.
- **FR-22** A confirmação do card composto de revisão (persona + serviços + horários) deve validar **por seção** e retornar erros granulares por seção (`{ errors: { persona?, services?, hours? } }`); erro em uma seção nunca descarta o estado local das seções válidas — o usuário corrige só o que falhou.
- **FR-23** Proposta capturada da conversa que chegar **depois** de o card correspondente já estar montado não deve re-prefillar nem sobrescrever o que o usuário digitou: o card observa a chegada da proposta e a oferece como ação explícita por campo (chip "Usar sugestão").

**Fase 3 — Testar:**
- **FR-12** O ambiente de teste (conversa simulada) deve ser apresentado ao usuário como etapa da jornada assim que o agente proposto existir, antes da escolha de modo de ativação e da conexão do canal.
- **FR-13** O teste deve usar o mesmo conhecimento e capacidades que o agente publicado terá (sem alucinar sobre conteúdo já ingerido; ciente do catálogo de fotos).
- **FR-14** O modo de ativação deve ter padrão "responder todas as mensagens" e ser apresentado como ajuste opcional na fase de lançamento; a configuração de contatos em silêncio deve viver DENTRO do ajuste de ativação (aparece só no modo "todos exceto bloqueados", com opção de preencher depois).

**Fase 4 — Lançar:**
- **FR-15** A conexão do canal (ex.: QR do WhatsApp) deve ser uma etapa determinística da jornada — apresentada, verificada (conectou ou não) e re-apresentável — sem depender de a IA decidir mostrá-la. O QR aparece na tela com um bloco de **compartilhamento em destaque** (FR-34) para quando o número fica com outra pessoa.
- **FR-16** Após a publicação, o sistema deve apresentar "próximos passos" (testar do próprio celular, onde acompanhar conversas, como pausar/ajustar).
- **FR-24** A escolha de canal deve começar por um **card de plataforma** ("Onde seu agente vai atender?") na fase Lançar, antes da conexão: multi-select com 💬 **WhatsApp** ("Onde seus clientes já falam com você") e 📸 **Instagram** ("Responde DMs do seu perfil automaticamente"), com o hint "Pode marcar os dois — o mesmo agente atende ambos." A copy do nível 1 não pode conter jargão técnico (sem "QR", "API", "Cloud").
- **FR-25** Se WhatsApp for marcado, um **segundo nível** apresenta o modo de conexão: **"Conectar meu WhatsApp"** ⭐ Recomendado e pré-selecionado ("Escaneie um QR code com o WhatsApp do seu negócio — pronto em 2 minutos, sem burocracia.") versus **"WhatsApp oficial da Meta"** com badge avançado ("Para empresas com número verificado na Meta. Mais robusto para alto volume — exige conta WhatsApp Business API."). Benefício antes da tecnologia em toda a copy. Instagram **não tem** segundo nível (segue o caminho oficial existente de credenciais).
- **FR-26** O agente deve poder atender WhatsApp e Instagram **simultaneamente**: a publicação mantém um deployment ativo **por canal** — conectar/trocar um canal pausa apenas o deployment da mesma conexão, nunca os dos outros canais. *(Entrega na Onda 5b; até lá a seleção dupla fica desabilitada com aviso honesto, coerente com FR-20.)*
- **FR-27** A verificação automática de conexão (polling do QR) deve ter **teto**: para após 10 minutos; a UI mostra "Ainda esperando?" com botão que re-arma a verificação.
- **FR-28** Quando o bloqueio de chave de IA (BYOK) estiver ativo na fase Lançar, o chat deve mostrar um **card guiado** de configuração de chave ("cole sua chave OpenAI — veja onde pegar", com link para a configuração) em vez de apenas um aviso.

**Transversais:**
- **FR-17** Toda decisão confirmada deve ser **revisável**: a partir do resumo/visão geral, "ajustar X" reabre a superfície de X pré-preenchida com o valor atual (nunca uma ação genérica de "pular").
- **FR-18** Deve existir UMA única fonte de progresso/prontidão exibida ao usuário; todas as superfícies (conversa, painel, publicação) leem a mesma fonte e nunca se contradizem.
- **FR-19** A interface deve se revelar progressivamente: a jornada começa com a conversa em foco; áreas adicionais (visão geral, teste, publicação) aparecem quando se tornam acionáveis — sem abas visíveis porém bloqueadas.
- **FR-20** Botões/ações nunca devem prometer o que não fazem: ações de pular só existem em etapas puláveis; ações de ajustar ajustam; estados desabilitados explicam o porquê.
- **FR-21** Elementos órfãos ou redundantes do modelo atual (cards sem caminho de render, superfícies duplicadas de identidade, modelos paralelos de progresso) devem ser removidos ou unificados — sem código morto.
- **FR-29** Confirmações que são apenas liga/desliga de capacidade (toggles da superfície de Capacidades) devem persistir **sem turno de IA**: resposta imediata, com uma linha de sistema local no chat ("✓ Preços ativados"). Cards da jornada continuam com confirmação conversacional da IA.
- **FR-30** Fase/etapa concluída **nunca regride** para pendente. Em especial: WhatsApp conectado uma vez permanece concluído mesmo que a conexão caia depois — a queda vira **aviso** (banner/Atividade), nunca passo reaberto.
- **FR-31** O resumo de pré-publicação em projetos v2 deve refletir a jornada v2: lista as **fases** e as **capacidades ativas** — não as seções fixas da v1 (que assumem preços/transferência obrigatórios).
- **FR-32** A revelação progressiva (FR-19) deve ser **animada em nível sutil**: o chat desliza para a esquerda e o painel entra da direita com fade; o conteúdo da Visão geral monta em cascata (~100ms de stagger); a aba recém-liberada (Testar/Publicar) recebe um pulso de destaque único. Deve respeitar `prefers-reduced-motion` (sem animações quando ativo).
- **FR-33** Drafts v1 sem atividade por **90 dias** devem ser arquivados (mecanismo de arquivamento existente); o gate de convergência/sunset da v1 conta apenas drafts v1 **ativos**.
- **FR-34** As conexões externas da jornada (WhatsApp/QR e Agenda/Google) devem ser **delegáveis por link**: além do caminho direto na própria tela, o usuário pode **copiar** ou **enviar por WhatsApp** (wa.me com texto pré-pronto) um link público-por-token para OUTRA PESSOA concluir a conexão de onde estiver — quem tem o celular da empresa escaneia o QR; o profissional autoriza a própria agenda. O caminho direto permanece visível (o share é um bloco "ou" em destaque, não substitui o QR/a autorização); a validade do link é exibida com ação de gerar novamente ("válido por 15 min" no WhatsApp; "válido por 7 dias" na agenda — TTLs dos mecanismos existentes); e a conclusão remota é detectada pelo builder sem reload, pela mesma verificação do caminho direto — o dono nunca precisa sair da jornada.

## 6. Requisitos Não-Funcionais

- **NFR-01 Multi-tenant:** toda leitura/escrita de estado da jornada permanece escopada por `organizationId` (regra dura existente do projeto).
- **NFR-02 LGPD:** telefones de contatos (silenciados, membros de equipe) tratados como dado pessoal: mascarados em logs/telemetria; consentimento implícito restrito ao escopo da org.
- **NFR-03 Compatibilidade:** projetos em andamento criados na jornada v1 devem continuar funcionais (concluíveis na v1 ou migráveis sem perda de decisões já confirmadas).
- **NFR-04 Observabilidade:** instrumentar funil por fase (criou → propôs → revisou → testou → conectou → publicou) com eventos por etapa, para medir o impacto declarado na seção 2.
- **NFR-05 Performance percebida:** a proposta montada da fase 2 deve aparecer sem espera adicional perceptível além do turno de IA normal; pré-preenchimentos não podem adicionar latência visível aos cards.
- **NFR-06 Resiliência:** falhas de serviços auxiliares (busca web, extração de fotos, conexão de agenda) degradam com aviso honesto ao usuário — nunca confirmação falsa, nunca estado silenciosamente inconsistente.
- **NFR-07 Simplicidade como requisito:** nenhuma fase pode apresentar ao usuário leigo mais decisões simultâneas que o necessário (heurística: máx. 1 decisão obrigatória por superfície; jargão técnico proibido em copy voltada ao leigo).
- **NFR-08 Kill-switch operacional:** deve existir um kill-switch (env `BUILDER_V2_FORCE_RENDER_V1`) que degrada o **render** de projetos v2 para o engine v1 **sem tocar o estado persistido** (sentinels compatíveis; steps v2 sem equivalente ficam ocultos) — reversível a qualquer momento, sem migração.
- **NFR-09 Testes determinísticos:** os testes E2E da jornada v2 rodam com provider de LLM **mock** (injeção test-only, impossível de ativar em produção); LLM real apenas no smoke de homol.
- **NFR-10 Retenção de telemetria:** eventos do funil (`builder_journey_events`) são purgados após **180 dias** (rotina recorrente no worker).

## 7. Fora de escopo

- **Integration Builder** (criar integrações novas tipo RD Station via agente investigador com busca de documentação e validação de credenciais) — é um épico próprio, dependente desta spec mas separado.
- Mudanças no **runtime** dos agentes publicados (tools de execução, webhook, FSM de outbound). *Exceção pontual (FR-26/Onda 5b): a semântica de attach/deployments por conexão e a validação da resolução inbound por connection — necessárias para multi-canal simultâneo; tools de execução e FSM permanecem intocados.*
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
- [ ] WhatsApp delegável: o card mostra o QR E o bloco "O número fica com outra pessoa?"; o link copiado/enviado abre a página pública e OUTRA pessoa conclui o scan de outro aparelho; o builder autodetecta a conexão sem reload; "Gerar novamente" renova QR e validade do link juntos (15 min exibidos).
- [ ] Agenda delegável: "Enviar link para o profissional" conecta o calendário DO PROFISSIONAL sem o dono sair do builder; o card fica em "aguardando o profissional conectar…" e só confirma com conexão verificada (validade de 7 dias exibida; nunca confirmação falsa).
- [ ] "Ajustar" qualquer seção do resumo reabre a configuração correspondente preenchida com o valor atual.
- [ ] Um único número/checklist de progresso em toda a UI; impossível ver dois estados contraditórios.
- [ ] A primeira tela do projeto mostra apenas a conversa; áreas adicionais aparecem conforme acionáveis; nenhuma aba visível-porém-bloqueada.
- [ ] Pós-publicação apresenta próximos passos acionáveis.
- [ ] Funil instrumentado com eventos por fase.
- [ ] Card de plataforma aparece na fase Lançar antes da conexão; copy do nível 1 sem jargão; marcar WhatsApp abre o nível 2 com "Conectar meu WhatsApp" pré-selecionado; marcar Instagram segue direto para credenciais (sem nível 2).
- [ ] *(Onda 5b)* Marcar os dois canais publica o agente atendendo WhatsApp E Instagram ao mesmo tempo (1 deployment ativo por canal); conectar/trocar um canal não derruba o outro — verificável ponta a ponta.
- [ ] Toggle de Capacidade persiste sem turno de IA e o chat mostra a linha de sistema local; cards da jornada mantêm a confirmação conversacional.
- [ ] Nenhum passo concluído reaparece como pendente; derrubar a conexão do WhatsApp gera aviso (banner/Atividade), não reabre o passo.
- [ ] Resumo de pré-publicação em projeto v2 lista fases + capacidades ativas (sem as seções fixas da v1).
- [ ] Erro em uma seção do card de revisão retorna erro granular daquela seção e preserva o que foi digitado nas demais.
- [ ] Proposta que chega com o card já aberto não sobrescreve digitação; chip "Usar sugestão" disponível por campo.
- [ ] Polling do QR para aos 10 minutos; "Ainda esperando?" re-arma a verificação.
- [ ] Bloqueio BYOK na fase Lançar mostra o card guiado de chave com link para a configuração.
- [ ] Revelação progressiva animada em nível sutil; com `prefers-reduced-motion`, sem animações.
- [ ] Kill-switch ligado: projeto v2 renderiza no engine v1 sem perda de estado; desligado: volta à v2.
- [ ] Suíte E2E v2 verde com LLM mock; nenhum teste E2E v2 depende de LLM real.
- [ ] Eventos de funil com mais de 180 dias são purgados automaticamente.
- [ ] Draft v1 inativo há 90 dias é arquivado; o gate de convergência conta só drafts v1 ativos.

## 9. Perguntas em aberto

> **Decisões registradas em 2026-06-10** (aprovação "aplicar todas as melhorias"; defaults escolhidos pelo time técnico, reversíveis no /plan):
>
> 1. **Transferir para humano:** default DESLIGADO em todos os nichos; em nichos regulados (advocacia, saúde) a IA **propõe ligado** na fase de revisão (proposta confirmável — coerente com "configure por exceção").
> 2. **Gate de teste:** recomendado com escape — o fluxo conduz ao teste antes de publicar, mas existe "Publicar sem testar" explícito.
> 3. **Horários:** ficam no card de revisão da fase 2, pré-preenchidos com default "sempre aberto" (editável).
> 4. **Migração v1:** projetos em andamento concluem na v1; projetos novos nascem na v2 (chave de rollout). Sem migração de estado no MVP.

> **Decisões registradas em 2026-06-11** (revisão com o founder):
>
> 5. **Canal em 2 níveis (FR-24/FR-25):** a escolha de canal começa pelo card de plataforma multi-select (WhatsApp/Instagram) na fase Lançar; nível 2 só para WhatsApp (QR ⭐ recomendado/pré-selecionado vs Cloud API com badge avançado); Instagram sem nível 2. Copy: zero jargão no nível 1; benefício antes da tecnologia.
> 6. **Multi-canal simultâneo (FR-26):** aprovado como **Onda 5b** própria — exige mudar a semântica do attach (pausa por conexão, não por agente) + validação do runtime inbound + E2E de 2 canais. A Onda 5 entrega WhatsApp (QR/Cloud) e Instagram individuais; a 5b libera "os dois".
> 7. **11 mitigações da revisão sênior — todas aceitas:** silent-submit para toggles (FR-29), monotonicidade com sentinel-espelho (FR-30), resumo v2-aware (FR-31), sunset desbloqueável por arquivamento (FR-33), kill-switch de render (NFR-08), validação granular do agent_review (FR-22), proposta tardia com chip "Usar sugestão" (FR-23), E2E determinístico com LLM mock (NFR-09), polling com teto (FR-27), retenção de 180 dias do funil (NFR-10) e gate de revalidação de âncoras no início de toda onda (registrado no plano, §10).
> 8. **BYOK guiado (FR-28)** e **animação da revelação em nível sutil (FR-32)** aprovados.
> 9. **Confirmados sem mudança (defaults do plano):** nomes das fases na UI = "Conhecer / Revisar / Testar / Lançar" (resolve a pendente de naming); "jeito de falar" mantém as 3 opções na revisão; "avisar sem pausar" permanece como opção avançada dentro de transferência; Capacidades como seção da Visão geral (não tab); "Publicar sem testar" visível.
> 10. **Gate de plano para capacidades:** permanece como hoje — o gate fica na publicação (blocker `byok` existente), agora com o card guiado de chave (FR-28) em vez de aviso seco.
> 11. **Conexão delegável por link (FR-34) — delta do founder 2026-06-11:** aprovado para os DOIS fluxos. Nenhum mecanismo novo de token: o WhatsApp reusa o shareLink público-por-token existente (`/compartilhar/<token>`, TTL 15 min renovável, já devolvido pelo provision); a Agenda reusa o connect-link existente (`/conectar-agenda/<token>`, TTL 7 dias). Entrega = UI dos dois shares + E2E do fluxo delegado (plano §3.6/§4.1/§4.3/§5, Ondas 4 e 5).

Sem pendentes abertas: as antigas pendentes 5-8 foram resolvidas pelas decisões 9 e 10 acima.

---

**Próximo passo sugerido:** rodar `/break specs/jornada-builder-v2` sobre o plano atualizado (delta 2026-06-11 integrado: canal em 2 níveis + Onda 5b, 11 mitigações, BYOK guiado, animação da revelação, conexão delegável por link nos dois fluxos — FR-34).
