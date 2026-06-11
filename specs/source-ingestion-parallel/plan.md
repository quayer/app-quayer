---
Criado: 2026-06-11
Atualizado: 2026-06-11
Revisar em: quando mudar source-enrich.job.ts ou o contrato de sources/status
Relacionados:
  - src/server/ai-module/builder/sources/source-enrich.job.ts
  - src/server/ai-module/builder/sources/ingest-source-refs.ts
  - src/server/ai-module/builder/sources/image-pipeline.ts
  - src/server/ai-module/ai-agents/knowledge/knowledge-ingestion.service.ts
  - src/client/components/projetos/chat/cards/source-progress-card.tsx
---

# Plano — Ingestão de Fontes do Negócio: Paralelização "brutal"

## 1. Problema (reportado pelo founder, 2026-06-11)

O card **"Fontes do negócio"** ("Estamos lendo seu site/Instagram e extraindo os
campos do negócio. Isto atualiza sozinho — aguarde concluir.") é **muito lento**.
A mensagem fica na tela durante todo o processamento e só sai quando a síntese
LLM grava `proposed` — que hoje é o **último** passo de uma cadeia 100% serial.

## 2. Diagnóstico (mapa do fluxo atual)

`runSourceEnrich` (source-enrich.job.ts:280-313) processa as fontes em
**`for (const sourceId of sourceIds) await enrichSource(...)`** — serial.

Dentro de `enrichSource` (job.ts:121-252), por fonte, **em sequência**:
1. `ingestSource` (l.133) — **fetch único** da URL (10s timeout) + embed + persist chunks
2. `extractImagesForSource` (l.178) — `await` (já é `pLimit(8)` interno)
3. `runLLMSubAgent` síntese (l.213) — 1 `generateText` gpt-4o-mini (25s timeout)

`proposed` + status são gravados num **único PATCH atômico no final**
(job.ts:320-327, 363-393) → a UI não vê progresso incremental e "aguarde
concluir" persiste pela duração inteira do lote.

**Insight crítico (homol):** o pipeline de imagens curto-circuita quando
`storage.isAvailable()` é falso (storage.ts:64 exige `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` — vazias em homol). Logo, em homol o wall-clock é
dominado por **fetch → embed → síntese serial**. As três etapas pós-fetch
(embed/persist, síntese, imagens) são **mutuamente independentes** — todas
consomem `extractedText`/`extractedHtml` do MESMO fetch e nenhuma depende da
saída da outra. Hoje rodam em série por acidente de implementação.

**Já otimizado (não mexer):** `extractedText` e `extractedHtml` vêm do mesmo
fetch (sem 2ª ida à rede); embeddings já são em lote (`embedMany`, 96/lote);
imagens já são `pLimit(8)`. `p-limit@^3.1.0` já está nas deps.

## 3. Mudanças (additivas, no worker — fora do hot-path do runtime WhatsApp)

### M1 — Fan-out das fontes com `pLimit`  ⭐ maior ganho multi-fonte
`runSourceEnrich`: trocar o `for...await` por
`await Promise.all(sourceIds.map(id => limit(() => enrichSource(id))))` com
`pLimit(SOURCE_ENRICH_CONCURRENCY=5)`. Acumular os resultados do array resolvido
(não mutar durante o loop). Para 1 URL é no-op; para N fontes corta ~N×.

### M2 — Concorrência intra-fonte: separar fetch de (embed‖síntese‖imagens)  ⭐ maior ganho single-fonte (vale em homol)
Refatorar `enrichSource`:
1. **Fetch primeiro** (sequencial, é o piso — uma página).
2. Depois `const [ingest, llm, images] = await Promise.allSettled([persistChunks(...), runLLMSubAgent(...), extractImagesForSource(...)])`.
   - Extrair de `ingestSource` a parte de **embed+persist** para rodar após o fetch, em paralelo com a síntese.
   - Wall-clock single-fonte passa de `fetch + embed + síntese` para `fetch + max(embed, síntese, imagens)`. Em homol (imagens off): `fetch + max(embed, síntese)` ≈ corta o tempo de embed do caminho crítico.
   - `allSettled` (não `all`): falha de embed NÃO derruba a síntese e vice-versa (fail-open por etapa, espelha o padrão atual).

### M3 — Progresso incremental (PATCH por fonte)  ⭐ mata a percepção de lentidão
Hoje 1 PATCH no fim. Mudar para chamar `patchSourceIngestionAtomic` **assim que
cada fonte assenta** (status `ready|error`) e **assim que a 1ª síntese aterrada
produz `proposed`** (merge semantics já é first-wins/union → seguro chamar N×).
Não corta tempo total, mas: (a) o card mostra fontes assentando uma a uma;
(b) o usuário pode "Aceitar" no instante em que existe proposta — sem esperar o
lote inteiro. O `source-progress-card.tsx` já faz poll 2s e tem condição de
parada por-fonte (`isSettled`) — passa a refletir progresso real.

### M4 — Timers de etapa (observabilidade, fazer ANTES de medir ganho)
Adicionar `Date.now()` deltas em `[source-enrich.job]` ao redor de
fetch / embed+persist / síntese / imagens, logando `durationMs` por etapa com o
`traceId`. Hoje não há timer por etapa (o `durationMs` do `runLLMSubAgent` é
descartado). Necessário p/ baseline antes/depois em homol.

### M5 — (menor, opcional) multi-row INSERT em `persistChunks`
`knowledge-ingestion.service.ts:97-113` insere chunks num `for` dentro de 1
transação. Trocar por `INSERT ... VALUES (...),(...)` único economiza ms/fonte.
Baixa prioridade vs M1-M3.

## 4. Segurança / invariantes
- Mudança vive 100% no **worker** (`scripts/start-workers.ts`), fora do caminho
  de request do runtime WhatsApp. Sem impacto em rate-limit do runtime.
- `allSettled` preserva o fail-open por etapa já existente.
- SSRF: `safeFetch` (3 hops revalidados) inalterado; concorrência não relaxa o guard.
- Concorrência de fontes limitada a 5 p/ não estourar provider LLM/embedding.
- `patchSourceIngestionAtomic` já é race-safe (read+merge+write do subtree) —
  chamadas concorrentes de M1×M3 são seguras por construção.

## 5. Testes
- Unit: `enrichSource` com fetch mockado — embed e síntese disparam após o fetch
  e em paralelo (assert ordem: fetch resolve antes; embed/síntese iniciam sem
  esperar uma à outra); falha de embed não impede `proposed`.
- Unit: `runSourceEnrich` com 3 sources — `enrichSource` chamado concorrente
  (≤5), todos os resultados acumulados, 1 falha não derruba as outras.
- Unit: PATCH incremental — status por-fonte gravado à medida que assenta;
  `proposed` gravado no 1º sucesso aterrado.
- E2E/manual homol: medir wall-clock single-site antes/depois via timers M4.

## 6. Tarefas (atômicas, ordem)
- [x] **S01** — M4 timers de etapa em `source-enrich.job.ts` (baseline primeiro) — `logStepTimings` (fetch/embed/synth/images/total) via `logger.info`, com `traceId` da fila.
- [x] **S02** — M2 refatorar `enrichSource`: fetch → `allSettled([embed+persist, síntese, imagens])` — `ingestSource` decomposto em `fetchSource` + `embedAndPersistSource` (callers de upload/knowledge-source preservados via recomposição).
- [x] **S03** — M1 fan-out de fontes com `pLimit(SOURCE_ENRICH_CONCURRENCY=5)` em `runSourceEnrich` (Promise.all; outcomes reduzidos pós-resolução).
- [x] **S04** — M3 PATCH incremental por-fonte (status+imagens+`proposed`) assim que cada fonte assenta; merge first-wins torna N PATCHes concorrentes seguros.
- [x] **S05** — testes unit verdes (source-enrich.job.test mocks atualizados p/ fetchSource+embedAndPersistSource); medição homol antes/depois pendente (rodar com os timers S01).
- [ ] **S06** — (opcional) M5 multi-row INSERT em `persistChunks`

*Gate de saída:* single-site em homol mais rápido que baseline (timers comprovam
embed fora do caminho crítico); multi-fonte ~N× mais rápido; card mostra fontes
assentando incrementalmente e habilita "Aceitar" no 1º `proposed`; nenhum teste
de sources existente quebra; worker fail-open preservado.

## 7. Risco & alternativas
- **Risco:** fan-out LLM concorrente pode esbarrar em rate-limit do provider em
  picos. *Mitigação:* `pLimit(5)` + retry×3 já existente da fila.
- **Alternativa rejeitada:** crawl multi-página do site (seguir sitemap/links)
  — aumenta cobertura mas multiplica custo/latência e abre superfície SSRF; fora
  de escopo (o produto lê só a URL colada).
- **Alternativa rejeitada:** streaming da síntese p/ UI — ganho percebido já é
  coberto por M3 (PATCH incremental) com muito menos complexidade.
