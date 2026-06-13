---
Criado: 2026-06-11
Atualizado: 2026-06-11
Revisar em: ao executar qualquer pacote P0/P1 abaixo (este doc REVISA o plan.md)
Relacionados:
  - specs/builder-fontes-card-ux/plan.md
  - specs/jornada-builder-v2/plan.md
  - specs/integration-builder/plan.md
  - specs/source-ingestion-parallel/plan.md
---

# Revisão especialista dos planos — 5 lentes (Design Conversacional · Heurísticas UX · PM · Microcopy · Walkthrough)

Workflow de 5 revisores independentes leu os 4 planos + o código real. **68 issues, 38 gaps, 52 validações.** Este doc consolida o que MUDA nos planos. Onde este doc conflita com o plan.md, **este doc vence**.

## A. Correções estruturais (convergência de 3+ lentes)

### A1. Item 0 (401) está SUB-ESCOPADO — reescrever ⚠️ crítico
O interceptor "no client Igniter" **não cobre as superfícies que quebraram no teste**: chat SSE, card-submit e os polls usam `fetch` cru (5 idiomas de data-fetching coexistem — CARDS_REVIEW §5.2). Fix correto, em ordem:
1. **Refresh PROATIVO no AuthProvider** (timer ~12min, re-armado em focus/visibilitychange) = fix primário — 1 ponto cobre TODAS as superfícies, incluindo SSE e polls.
2. Wrapper `fetchWithAuthRetry` (single-flight 401→refresh→retry 1×) como backstop nas superfícies de fetch cru.
3. **UX do refresh falho** (refresh token expirado/revogado): toast leigo + redirect com `returnTo` + **preservar rascunho do composer** (localStorage).
4. **Copy leiga de erro** (ver C1): nunca "Falha ao enviar card (HTTP 401)".
5. Gate: regra dura do CLAUDE.md — release de auth só com `npm run test:all` verde + telemetria de taxa de 401/refresh-success para provar o fix em homol.

### A2. Readiness fail-open é falha de DESIGN, não só o 401 ⚠️ crítico (descoberto)
Qualquer falha transitória do readiness (rede, 500, deploy) faz `journey` ficar undefined → regime cai v2→v1 → **explosão de 9 tabs no meio da sessão** (foi isso que o founder viu). Corrigir a política, não só a causa:
- **stale-while-error**: cachear o último readiness válido; em erro, congelar o estado anterior. **Nunca rebaixar v2→v1 por falha de fetch.**
- **Loading fail-closed**: com readiness em voo (primeiro paint), renderizar skeleton da tab strip — nunca o conjunto completo v1 (hoje TODA sessão v2 tem flash de 9 tabs no load).
- Banner discreto "reconectando…" em falha persistente.

### A3. "Síntese falhou" sobe para P0-adjacente + precisa de contrato backend ⚠️ crítico
O limbo (fonte `ready` + síntese morta) acontece nos **primeiros 2-3 minutos do primeiro uso** — mata o aha sem saída. Entregar JUNTO do item 0 (é estado de UI, S). Mas:
- O botão "Tentar novamente" **não tem endpoint** — criar contrato de retry (re-enqueue idempotente da síntese por fonte, transições refletidas no poll, limite de tentativas) ANTES de shippar o botão (FR-20: botão nunca promete o que não faz).
- **Reparo conversacional**: além do estado no card, emitir **linha de sistema local no chat** (mecanismo FR-29 já existe, custo zero de LLM): "Li seu site, mas não consegui terminar de organizar as informações. Nada se perdeu — toque para eu tentar de novo." A falha tem que aparecer NO diálogo, não só numa superfície que o usuário pode não estar olhando.
- Tuning do timeout (25→40-45s e/ou síntese com precedência fora do pLimit) vem DEPOIS, guiado pela medição homol (ver A8).

### A4. "confiança N/7" é rótulo errado — reescrever o header (item 1)
N/7 é **cobertura**, não confiança — um campo extraído ERRADO conta no N. Rotular de "confiança" = miscalibração para leigo (todas as 5 lentes flagaram). Copy final (ver C2): *"Li seu site e encontrei: **nome, serviços e endereço**. Você pode completar: **horários e tom de voz** — me conte aqui no chat ou toque em Editar."* Sem fração, sem a palavra "confiança", "Não encontrei"→"Você pode completar" (com CTA inline por campo). Persistir `groundedFields` continua valendo (telemetria + derivação).

### A5. Splash do raio: CORTAR (item 9)
3 lentes: adiciona 600-900ms artificiais num produto cuja queixa nº 1 é lentidão; conflita com a FR-32 já aprovada (revelação sutil); splash de branding repetido é anti-padrão (encanta 1×, irrita N×). **Redirecionar o raio para um pico real**: celebração de "agente criado"/"publicado" (Overview já tem precedente). O gap real pré-navegação: botão da home com estado "Criando seu agente…" (hoje a home parece travada no momento de maior motivação).

### A6. Integrações: casa canônica = Capacidades (Overview) — corrigir item 10
3 docs, 2 casas. Decisão registrada: **Capacidades/Overview é a casa de ligar/gerir integrações** (FR-06 da v2; visível ao leigo como capacidade do agente). A gaveta **Avançado fica só com Prompt + Config/BYOK**. Atualizar o item 10 e o plano do Integration Builder (mount-move já previsto lá).

### A7. Métricas: nenhum plano tem — pré-requisito de QUALQUER rollout (descoberto)
`BuilderJourneyEvent` existe mas o funil não cobre fontes. Antes do 1º degrau de flag:
- **Eventos novos (aditivos ao vocabulário):** `source_ingest_started`, `source_proposed` {groundedFields, synthMs}, `source_accepted` {editedFieldsCount}, `source_synthesis_failed`, `first_production_message`.
- **North star:** % de projetos novos que chegam a `published` em D0; secundária: time-to-first-proposal p50/p95.
- **Guardrails:** taxa de timeout de síntese <5%; % ready-sem-proposed; taxa de 401 em sessão ativa; custo unitário por projeto (síntese+Tavily+embeddings+imagens — retry e timeout maior aumentam gasto).
- **Critérios de promoção por degrau** (interno→10%→50%→100%) escritos ANTES de subir.
- `editedFieldsCount` no aceite = proxy barato de qualidade da síntese (quanto o usuário corrige a IA).

### A8. Fechar o plano de paralelização (gate aberto)
A medição homol (S05) nunca rodou — e a própria paralelização criou a contenção que estourou a síntese (um plano gerou o P1 do outro). (a) Rodar a medição com os timers M4 como baseline do guardrail; (b) **S06 = won't-do** (YAGNI: ms/fonte irrelevante vs gargalo LLM); (c) registrar a lição: síntese disputa o pLimit(5) com embed+imagens.

### A9. Economia de ACKs invertida + fronteiras assíncronas mudas (conversacional)
- **Skips/acks mecânicos não merecem turno LLM**: "Agora não" hoje é um sendMessage falso ("Pular este passo por agora.") — skip não-determinístico, com latência e custo. Critério para a allowlist do silent-submit: ACK conversacional SÓ quando o turno carrega informação nova ou avança a conversa (ex.: aceite de fontes → agente resume e propõe próximo passo). Skips/dismissals → caminho silent determinístico + linha local ("Ok — fontes ficam para depois").
- **Conclusão assíncrona precisa de voz**: quando `proposed` fica pronto, emitir linha de sistema local ("Terminei de ler vibraresidencial.com.br — revise o que encontrei abaixo") + destaque one-shot no chip + `aria-live="polite"`. Hoje o card muta via poll em silêncio — se o usuário rolou/trocou de tab, a conclusão é invisível.
- **Kickoff com expectativa**: journey-rule — ao disparar a ingestão, o agente diz a duração esperada ("Vou ler seu site — leva ~1 minuto") **e ocupa a espera com um turno útil** ("Enquanto isso: como você prefere que o agente fale com seus clientes?" → alimenta capturedProposals). A espera vira progresso, não tempo morto.

### A10. Disparo da ingestão deve ser determinístico (descoberto — walkthrough)
Hoje a ingestão depende do LLM decidir chamar a tool (e "orquestrador pula cards" já foi observado no harness E2E). Se o LLM pular, o usuário espera algo que nunca começou. Fix: **detecção de URL server-side** na 1ª mensagem/criação do projeto → POST sources/ingest determinístico (rota já existe); o LLM só narra. Mesmo espírito do FR-15.

### A11. Aceitar ↔ fotos: contrato indefinido = agente publicado sem fotos (descoberto)
Aceitar a proposta e aprovar fotos são confirmações independentes; o leigo que clica Aceitar sem tocar na galeria (cenário mais provável) deixa TODAS as fotos `confirmedAt=null` → o runtime nunca envia → agente "sem fotos" em silêncio. **Decisão: Aceitar também confirma as fotos visíveis (menos as descartadas) — curadoria por EXCEÇÃO**, alinhado à filosofia. Galeria: fotos chegam pré-selecionadas pela IA; remover por foto é a exceção; 1 ação primária; count de bulk destrutivo calculado no server + Desfazer (soft-delete já existe no backend).

## B. Re-priorização consolidada (fila única cross-planos)

| Pacote | Conteúdo | Por quê primeiro |
|---|---|---|
| **P0 — Sessão & navegação nunca mentem** | A1 (refresh proativo + wrapper + UX falha + copy) · A2 (stale-while-error + skeleton tabs) · A3-UI (estado "falhou" + linha de reparo no chat + contrato backend do retry) | Sem isso, nada é testável >15min e o primeiro uso pode morrer sem saída |
| **P1a — Robustez da síntese** | Timeout 40-45s ou precedência · 1 retry por fonte · medição homol (A8) · convenção de poll FR-27 (teto+backoff+superfície de erro) | Elimina o dead-end do aha; baseline antes de tuning |
| **P1b — Instrumentação** | A7 (eventos + north star + guardrails + critérios de promoção) | Pré-requisito de rollout; valida P1a/P1c |
| **P1c — Pacote confiança do card Fontes** (1 PR coeso) | Header leigo (A4/C2) · URL relativa das fotos · copy de transparência + excluir por foto + upload manual + Aceitar-confirma-fotos (A11) · disparo determinístico (A10) · espera produtiva + narração de conclusão (A9) | É o aha do primeiro uso, protegido de ponta a ponta |
| **P2 — Polish conversacional** | Chips inline (lifecycle: só enquanto há fonte ativa; colapsam no settle; vocabulário ÚNICO com as pills; 1 poll compartilhado) · flicker (opção B server-side: cookie+pathname — lazy initializer REJEITADO por hydration mismatch) · botão sidebar (ícone **Menu** + micro-label "Menu"; chevron REJEITADO — lê como "voltar"; Ctrl+B no Windows) · VOICE_TONE.md aplicado (C) · quota copies · empty states do upload · peak-end (first_production_message + Atividade viva + celebração) · home (announcement EN fora; "Criando seu agente…") |
| **P3 — Condicionado a DADOS** | Consolidação 9→5 tabs (após v2 ≥50% + 2 semanas de funil; gatilho: % que abre Prompt/Config na 1ª sessão <10%; executar JUNTO da Onda 6 — 1 PR de tab-registry, aliases `?tab=` uma vez só; tab mantém nome "Conhecimento" com seções "O que a IA sabe"/"O que a IA pode enviar") · 1B schema rico (gatilho: taxa de aceite < alvo E campos editados específicos de domínio) |

## C. Microcopy — antes → depois (aplicar como gate de review)

**Guia de tom (criar `docs/builder/VOICE_TONE.md`):** R1 agente fala em 1ª pessoa do singular no chat/cards ("Estou lendo…", "Encontrei…"); voz neutra só fora do chat. R2 presente do indicativo, frases curtas; botão = verbo+objeto. R3 **banlist**: card, síntese, timeout, HTTP, endpoint, URL (em superfície leiga), sidebar, processar, embeddings. R4 erro = o que aconteceu + o que fazer + ação. R5 substantivo canônico: **"seu agente"** (não "sua IA").

| Onde | Antes | Depois |
|---|---|---|
| Erro de sessão | "Falha ao enviar card (HTTP 401)" | "Sua sessão expirou. Entre de novo para continuar — o que você já fez está salvo." + [Entrar de novo] |
| Header do card | (proposto) "confiança N/7 · Não encontrei: …" | "Li seu site e encontrei: **nome, serviços e endereço**. Você pode completar: **horários e tom de voz** — me conte aqui no chat ou toque em Editar." |
| Card lendo | "Estamos lendo seu site/Instagram e extraindo os campos do negócio. Isto atualiza sozinho — aguarde concluir." | "Estou lendo seu site e anotando as informações do negócio. Atualizo aqui sozinho — enquanto isso, me conta: como você prefere que o agente fale com seus clientes?" |
| Síntese falhou (novo estado) | — | "Li seu site, mas não consegui terminar de organizar as informações. Nada se perdeu — toque para eu tentar de novo." + [Tentar de novo] |
| Galeria header | — | "Seu agente pode enviar estas fotos nas conversas com clientes. Remova as que não quiser que ele use." |
| Galeria primário | "Aprovar todas (N)" | "Usar estas fotos no agente (N)" (ou fundido no Aceitar) |
| Galeria secundário | "Remover genéricas (N)" | "Limpar fotos sem legenda (N)" (count do server + Desfazer) |
| Galeria vazia | "Nenhuma imagem encontrada…" | "Não encontrei fotos no seu site. Quer adicionar algumas? Seu agente pode enviá-las nas conversas." + [Adicionar fotos] |
| Indicador de etapa | (proposto) "síntese 8s" | "Lendo seu site… → Separando as fotos… → Organizando as informações… → Quase lá"; tempo SÓ se estourar o esperado: "Está demorando mais que o normal — pode continuar por aqui, eu aviso quando terminar." |
| Chips de status | "na fila / lendo / pronto" | "aguardando / lendo / pronto / falhou" — MESMO vocabulário nas pills do card; "· N trechos" → "· conteúdo salvo" |
| "Agora não" (erro) | "toque em Agora não para preencher manualmente" | Botão "Prefiro contar eu mesmo" (dismiss determinístico + conversa segue coletando identidade) |
| "Agora não" (normal) | (sem consequência) | tooltip/linha: "os dados extraídos ficam guardados — você pode aceitar depois em Visão geral" |
| Campos detectados | "Campos detectados" | "O que encontrei" |
| Pós-aceite | "Fontes processadas — os campos detectados já foram aplicados ao agente." | "Pronto! Usei essas informações para montar seu agente. Quer ajustar algo? É só me dizer aqui no chat." |
| IB not_found | "Confirme se o endpoint está correto." | "Não encontrei o serviço no endereço que descobri. Tente de novo mais tarde — ou me peça para conectar por webhook." |
| Quota investigação | (sem copy) | "Você usou as 10 pesquisas de integração de hoje. Amanhã libera de novo — ou crie pelo caminho manual de webhook." |
| Sidebar botão | aria "Mostrar sidebar (⌘B)" | ícone Menu + label "Menu"; tooltip "Abrir menu" / "Recolher menu"; atalho por plataforma (Ctrl+B/⌘B) ou omitido |
| Home announcement | "Build locally with QuayerCLI" (EN, 1º pixel) | remover ou "Monte seu atendente de WhatsApp em minutos" |

## D. O que os planos JÁ acertam (preservar — não "melhorar")
- Invariante anti-alucinação do `proposed` (job nunca flipa sentinel; só o aceite humano comete) — estado-da-arte de trust calibration. **Não enfraquecer ao enriquecer o card.**
- Divisão chips = narração de trabalho / card = turno de decisão (item 5) — correta sob Generative UI; só faltava lifecycle.
- FR-20/FR-17/FR-23/FR-29 da v2 — etiqueta de iniciativa mista exemplar; este review ESTENDE o FR-29 (allowlist maior), não o contraria.
- M3 do plano de paralelização (PATCH incremental + Aceitar no 1º proposed) e a rejeição do streaming da síntese.
- Diagnóstico de causa raiz dos itens 0/2/7 — todos confirmados no código pelas lentes.
- Sequência "intermediário antes do radical" nas tabs, e derivar "Você pode completar" 100% no FE (shippável já).
- DIAGNOSIS estático anti-vazamento do Integration Builder (mecanismo perfeito; só trocar as palavras).
