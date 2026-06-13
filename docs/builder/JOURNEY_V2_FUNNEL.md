---
Criado: 2026-06-11
Atualizado: 2026-06-13
Revisar em: quando drafts v1 ativos = 0 (gatilho de sunset — seção 4), ou mudança no vocabulário de eventos (journey-events.ts)
Relacionados:
  - specs/jornada-builder-v2/spec.md
  - specs/jornada-builder-v2/mission-first-v3.md
  - specs/jornada-builder-v2/plan.md
  - src/server/services/journey-events.ts
  - src/server/services/jobs/journey-events-purge.job.ts
  - src/server/ai-module/builder/cards/builder-state.ts
  - prisma/migrations/20260611000000_builder_journey_events/migration.sql
---

# Funil da Jornada Builder v2 — Operação via SQL

Queries operacionais do funil da Jornada Builder v2 (`specs/jornada-builder-v2/spec.md` §2,
plan `§6.2`). **Não há admin UI** (CLAUDE.md) — a operação roda via Claude Code + MCP Supabase
(`execute_sql`) ou `psql` direto contra o Postgres de homol/prod.

Cobre:
- **T74** — funil por fase (conclusão criado→publicado, tempo até primeiro teste), por org e global.
- **T75** — monitor de drafts v1 ATIVOS + critério de sunset (seção 4).

> **Convenção de nomes de coluna (importante).** As tabelas do Builder usam Prisma SEM `@map` de
> campo — os identificadores são **camelCase entre aspas duplas** no Postgres, não snake_case.
> Sempre escreva `"createdAt"`, `"projectId"`, `"journeyVersion"`, `"organizationId"`,
> `"builderState"`, `"archivedAt"` com aspas. Sem aspas o Postgres dobra para minúsculas e a query
> falha (`column "createdat" does not exist`). Verificado nas migrations
> `20260611000000_builder_journey_events` e `20260409_add_builder_projects`.

---

## 1. Modelo de dados

### 1.1 `builder_journey_events` (fonte do funil — NFR-04)

| Coluna | Tipo | Nota |
|---|---|---|
| `"id"` | TEXT | uuid |
| `"organizationId"` | TEXT | multi-tenant (NFR-01) — toda query agrega/filtra por ele |
| `"projectId"` | TEXT | `BuilderProject.id` (sem FK relacional, igual `BuilderToolCall`) |
| `"journeyVersion"` | INTEGER | `1 \| 2` — congelado no evento |
| `"event"` | VARCHAR(60) | vocabulário FECHADO (ver 1.2) |
| `"metadata"` | JSONB | shape tipado, NUNCA contém PII/telefone (NFR-02/LGPD) |
| `"createdAt"` | TIMESTAMP(3) | default `now()` |

Índices: `("organizationId", "event", "createdAt")` (funil por org) e `("projectId", "createdAt")`
(linha do tempo por projeto). **Sem unique** — eventos repetem (ex.: reconexão de QR); por isso o
funil agrega por **`MIN("createdAt")` por `("projectId", "event")`** (o primeiro carimbo de cada
evento por projeto). Retenção: linhas > 180 dias são purgadas por cron no worker
(`journey-events-purge.job.ts`, NFR-10) — análises de funil devem caber em 6 meses.

### 1.2 Vocabulário de eventos (fechado — `journey-events.ts`)

`journey_started` → `identity_done` → `mission_selected` → `review_done` → `agent_created` → `test_done` /
`test_skipped` → `channel_connected` → `published` → `next_steps_ack`.

> **v3 (mission-first — `mission-first-v3.md`, FR-48):** `mission_selected` é emitido ao escolher a missão
> (fase Conhecer), com `metadata` tipado `{ role, businessType, objective, framework }` (sem PII — NFR-02).
> Permite quebrar o funil por papel/objetivo e ligar `AgentStrategy.successCriteria` aos marcos abaixo
> (loop de resultado — moat de dado).

Mapa fase (spec §2 / plan §3.2) → evento de entrada:

| Fase | Evento "entrou/concluiu" | Origem |
|---|---|---|
| (start) | `journey_started` | criação + duplicação de projeto |
| Conhecer | `identity_done` → `mission_selected` | submit `business_identity`/accept de fonte → submit do card Missão (v3) |
| Revisar | `review_done` | submit `agent_review` (+ `agent_created` na tool `create_agent`) |
| Testar | `test_done` / `test_skipped` | `test_drive` ou auto-flip do playground |
| Lançar | `channel_connected` → `published` → `next_steps_ack` | webhook UAZ → saga de deploy → ack |

### 1.3 `journeyVersion` por projeto (chave de rollout — sem coluna nova)

A versão da jornada vive no JSONB `builder_project_conversations."builderState"` em
`->>'journeyVersion'` (`'1' | '2'`; chave Zod `journeyVersion`, default `1`). Projetos legados
**não têm a chave** e contam como v1 (backfill por `parseBuilderState`). A relação é 1:1 via
`builder_project_conversations."projectId" = builder_projects."id"`. Projeto sem conversa ainda
criada também é v1 por construção (a conversa nasce com a versão herdada — plan §2.2 item 1).

---

## 2. Funil por fase (T74)

### 2.1 Funil GLOBAL — contagem de projetos por marco

Conta projetos DISTINTOS que atingiram cada marco, agregando pelo primeiro carimbo de cada evento.
Útil para a taxa de conclusão criado→publicado (spec §2).

```sql
-- Funil global por marco (projetos distintos que atingiram cada evento).
-- Janela padrão: últimos 30 dias por journey_started; ajuste o INTERVAL conforme a análise.
WITH first_event AS (
  SELECT "projectId", "event", MIN("createdAt") AS first_at
  FROM builder_journey_events
  WHERE "journeyVersion" = 2
  GROUP BY "projectId", "event"
),
started AS (
  SELECT "projectId", first_at AS started_at
  FROM first_event
  WHERE "event" = 'journey_started'
    AND first_at >= now() - INTERVAL '30 days'
)
SELECT
  count(DISTINCT s."projectId")                                                  AS criados,
  count(DISTINCT CASE WHEN fe."event" = 'identity_done'  THEN fe."projectId" END) AS conheceram,
  count(DISTINCT CASE WHEN fe."event" = 'review_done'    THEN fe."projectId" END) AS revisaram,
  count(DISTINCT CASE WHEN fe."event" IN ('test_done','test_skipped')
                                                          THEN fe."projectId" END) AS testaram_ou_pularam,
  count(DISTINCT CASE WHEN fe."event" = 'test_done'      THEN fe."projectId" END) AS testaram,
  count(DISTINCT CASE WHEN fe."event" = 'channel_connected' THEN fe."projectId" END) AS conectaram,
  count(DISTINCT CASE WHEN fe."event" = 'published'      THEN fe."projectId" END) AS publicaram
FROM started s
LEFT JOIN first_event fe ON fe."projectId" = s."projectId";
```

### 2.2 Taxa de conclusão criado→publicado (spec §2, meta principal)

```sql
-- Conversão da janela: % dos projetos v2 criados nos últimos 30 dias que chegaram a 'published'.
WITH first_event AS (
  SELECT "projectId", "event", MIN("createdAt") AS first_at
  FROM builder_journey_events
  WHERE "journeyVersion" = 2
  GROUP BY "projectId", "event"
),
started AS (
  SELECT "projectId"
  FROM first_event
  WHERE "event" = 'journey_started'
    AND first_at >= now() - INTERVAL '30 days'
)
SELECT
  count(*)                                                              AS criados,
  count(*) FILTER (WHERE pub."projectId" IS NOT NULL)                   AS publicados,
  round(
    100.0 * count(*) FILTER (WHERE pub."projectId" IS NOT NULL) / NULLIF(count(*), 0),
    1
  )                                                                     AS taxa_conclusao_pct
FROM started s
LEFT JOIN first_event pub
  ON pub."projectId" = s."projectId" AND pub."event" = 'published';
```

### 2.3 Tempo até o primeiro teste (spec §2, meta < 5 min)

Mede `journey_started` → primeiro `test_done` por projeto. A meta da spec é < 5 minutos da
primeira mensagem; `journey_started` é o proxy do início da jornada.

```sql
-- Distribuição do tempo até o primeiro teste (v2, últimos 30 dias).
WITH first_event AS (
  SELECT "projectId", "event", MIN("createdAt") AS first_at
  FROM builder_journey_events
  WHERE "journeyVersion" = 2
  GROUP BY "projectId", "event"
),
spans AS (
  SELECT
    st."projectId",
    EXTRACT(EPOCH FROM (td.first_at - st.first_at)) AS secs_ate_teste
  FROM first_event st
  JOIN first_event td
    ON td."projectId" = st."projectId" AND td."event" = 'test_done'
  WHERE st."event" = 'journey_started'
    AND st.first_at >= now() - INTERVAL '30 days'
    AND td.first_at >= st.first_at
)
SELECT
  count(*)                                                            AS projetos_testados,
  round((percentile_cont(0.5)  WITHIN GROUP (ORDER BY secs_ate_teste) / 60.0)::numeric, 1) AS mediana_min,
  round((percentile_cont(0.9)  WITHIN GROUP (ORDER BY secs_ate_teste) / 60.0)::numeric, 1) AS p90_min,
  round((avg(secs_ate_teste) / 60.0)::numeric, 1)                     AS media_min,
  count(*) FILTER (WHERE secs_ate_teste <= 300)                       AS dentro_da_meta_5min,
  round(
    100.0 * count(*) FILTER (WHERE secs_ate_teste <= 300) / NULLIF(count(*), 0),
    1
  )                                                                   AS pct_dentro_meta
FROM spans;
```

### 2.4 Funil POR ORG

Mesma agregação, quebrada por `"organizationId"`. Use para identificar coortes (ex.: agências) com
conversão fora da média.

```sql
-- Funil por org (v2, últimos 30 dias por journey_started). Ordena por mais publicados.
WITH first_event AS (
  SELECT "organizationId", "projectId", "event", MIN("createdAt") AS first_at
  FROM builder_journey_events
  WHERE "journeyVersion" = 2
  GROUP BY "organizationId", "projectId", "event"
),
started AS (
  SELECT "organizationId", "projectId"
  FROM first_event
  WHERE "event" = 'journey_started'
    AND first_at >= now() - INTERVAL '30 days'
)
SELECT
  s."organizationId",
  count(DISTINCT s."projectId")                                                       AS criados,
  count(DISTINCT CASE WHEN fe."event" = 'review_done' THEN fe."projectId" END)        AS revisaram,
  count(DISTINCT CASE WHEN fe."event" = 'test_done'   THEN fe."projectId" END)        AS testaram,
  count(DISTINCT CASE WHEN fe."event" = 'published'   THEN fe."projectId" END)        AS publicaram,
  round(
    100.0 * count(DISTINCT CASE WHEN fe."event" = 'published' THEN fe."projectId" END)
      / NULLIF(count(DISTINCT s."projectId"), 0),
    1
  )                                                                                   AS taxa_conclusao_pct
FROM started s
LEFT JOIN first_event fe
  ON fe."projectId" = s."projectId" AND fe."organizationId" = s."organizationId"
GROUP BY s."organizationId"
ORDER BY publicaram DESC;
```

### 2.5 Comparação de coorte v1 vs v2 (saúde do rollout)

Durante o rollout gradual (`percentage:N`, T76), compare a conversão das duas coortes para validar
que a v2 não degradou a publicação.

```sql
-- Conversão criado→publicado por journeyVersion (últimos 30 dias).
WITH first_event AS (
  SELECT "journeyVersion", "projectId", "event", MIN("createdAt") AS first_at
  FROM builder_journey_events
  GROUP BY "journeyVersion", "projectId", "event"
),
started AS (
  SELECT "journeyVersion", "projectId"
  FROM first_event
  WHERE "event" = 'journey_started'
    AND first_at >= now() - INTERVAL '30 days'
)
SELECT
  s."journeyVersion",
  count(DISTINCT s."projectId")                                                AS criados,
  count(DISTINCT pub."projectId")                                              AS publicados,
  round(100.0 * count(DISTINCT pub."projectId") / NULLIF(count(DISTINCT s."projectId"), 0), 1)
                                                                               AS taxa_conclusao_pct
FROM started s
LEFT JOIN first_event pub
  ON pub."projectId" = s."projectId" AND pub."event" = 'published'
GROUP BY s."journeyVersion"
ORDER BY s."journeyVersion";
```

---

## 3. Monitor de drafts v1 ATIVOS (T75)

Conta projetos que AINDA estão na jornada v1 (a versão legada) e **estão ATIVOS** — `status` não é
`archived` (o arquivamento de drafts v1 inativos por 90d é T106; só ativos contam para o gate de
sunset, FR-33). Um draft v1 é qualquer projeto cuja conversa NÃO tem `journeyVersion = 2` no
`builderState` (legados sem a chave contam como v1).

> A query exclui `status = 'archived'`. Os demais estados (`draft`, `production`, `paused`) contam
> como ativos. `production`/`paused` em v1 são projetos já publicados na jornada antiga — também
> precisam convergir antes do sunset dos paths v1-only.

```sql
-- Drafts/projetos v1 ATIVOS (exclui arquivados). journeyVersion 2 = v2; ausência ou '1' = v1.
SELECT count(*) AS v1_ativos
FROM builder_projects p
LEFT JOIN builder_project_conversations c
  ON c."projectId" = p."id"
WHERE p."status" <> 'archived'
  AND COALESCE(c."builderState"->>'journeyVersion', '1') <> '2';
```

Quebra por org e por status (diagnóstico de onde a v1 ainda vive):

```sql
SELECT
  p."organizationId",
  p."status",
  count(*) AS v1_ativos
FROM builder_projects p
LEFT JOIN builder_project_conversations c
  ON c."projectId" = p."id"
WHERE p."status" <> 'archived'
  AND COALESCE(c."builderState"->>'journeyVersion', '1') <> '2'
GROUP BY p."organizationId", p."status"
ORDER BY v1_ativos DESC;
```

Convergência (acompanhamento do gate de sunset): ativos v1 vs v2, lado a lado.

```sql
SELECT
  CASE WHEN COALESCE(c."builderState"->>'journeyVersion', '1') = '2'
       THEN 'v2' ELSE 'v1' END AS versao,
  count(*) AS ativos
FROM builder_projects p
LEFT JOIN builder_project_conversations c
  ON c."projectId" = p."id"
WHERE p."status" <> 'archived'
GROUP BY versao
ORDER BY versao;
```

---

## 4. Sunset (T75) — critério de gatilho e issue criada

A convergência destrava a remoção do código v1-only. **Critério de gatilho (testável):**

> **Drafts v1 ATIVOS = 0 (query da seção 3) por 60 dias consecutivos.**

Quando o gatilho disparar, remover:

1. **Paths v1-only do step-engine** — `QUAYER_STEPS`/`nextPendingStep` e helpers usados SÓ pela v1
   (`src/server/ai-module/builder/state/next-pending-step.ts`); manter o que a v2 reusa
   (`computeBlockers`, `FIELD_OWNERSHIP`, `step-helpers.ts`).
2. **O branch do resolver** — `src/server/ai-module/builder/state/readiness-resolver.ts`: o
   `state.journeyVersion === 2 ? nextPendingStepV2(...) : nextPendingStep(...)` passa a chamar só a
   v2; remover também o kill-switch `BUILDER_V2_FORCE_RENDER_V1` (não faz mais sentido sem o engine
   v1).
3. **A flag de rollout** — `src/lib/feature-flags/builder-v2.ts`, a env `BUILDER_JOURNEY_V2` e o
   cookie `builder-v2-override` (+ cascata `.env.example` / `docs/infra/SECRETS.md`).

### Issue de sunset

Issue criada: https://github.com/quayer/app-quayer/issues/17

- **Título:** `Sunset da jornada Builder v1`
- **Gatilho (registrar no corpo):** "Disparar quando a query da seção 3 de
  `docs/builder/JOURNEY_V2_FUNNEL.md` (drafts v1 ATIVOS) retornar `0` por **60 dias consecutivos**.
  Conferir semanalmente via MCP Supabase."
- **Escopo:** os 3 itens de remoção acima (engine v1-only, branch do resolver + kill-switch, flag +
  env + cookie + cascata de docs).
- **Pré-condições:** T106 (arquivamento de drafts v1 inativos por 90d) rodando; coorte v2 estável no
  funil (seção 2.5 sem regressão de conversão vs v1).
- **Labels sugeridas, se o repositório tiver:** `builder`, `tech-debt`, `cleanup`.

Comando histórico de referência:

```bash
gh issue create \
  --title "chore(builder): sunset dos paths v1-only da Jornada Builder" \
  --label builder,tech-debt,cleanup \
  --body "Gatilho: query da seção 3 de docs/builder/JOURNEY_V2_FUNNEL.md (drafts v1 ATIVOS) = 0 por 60 dias consecutivos. Remover: engine v1-only (next-pending-step.ts), branch do resolver + kill-switch BUILDER_V2_FORCE_RENDER_V1, flag builder-v2.ts + env BUILDER_JOURNEY_V2 + cookie builder-v2-override (cascata .env.example/SECRETS.md). Pré: T106 rodando + coorte v2 sem regressão de conversão."
```

---

## 5. Notas operacionais

- **Rodar via MCP Supabase:** `mcp__claude_ai_Supabase__execute_sql` com a query. Para escolher o
  projeto certo, `list_projects` antes (homol vs prod).
- **Janela:** as queries da seção 2 usam `INTERVAL '30 days'` por `journey_started`. Ajuste para a
  análise (ex.: `'7 days'` para acompanhamento de rollout, `'90 days'` para retrospectiva).
- **Cuidado com a retenção:** eventos > 180 dias somem (cron de purge). Análises de longo prazo
  precisam de snapshot — não há histórico além de 6 meses por design (LGPD/NFR-10).
- **`MIN("createdAt")` é deliberado:** como os eventos repetem, qualquer agregação de funil deve usar
  o primeiro carimbo por `("projectId", "event")` — nunca `count(*)` direto na tabela bruta (infla
  por reconexões de QR e re-submits).
