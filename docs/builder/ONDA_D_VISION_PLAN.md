---
Criado: 2026-06-06
Atualizado: 2026-06-06
Revisar em: quando a Onda D (G2 visão/imagens) for aprovada para implementação
Relacionados:
  - docs/builder/ORAYON_UPLIFT_SPEC.md
  - docs/ERD.md
  - prisma/schema.prisma
  - src/server/ai-module/builder/sources/source-enrich.job.ts
---

# Onda D — Catálogo Visual das Fontes (G2 visão/imagens) — PLANO

> Plano gerado por workflow de design (design-only, sem edição de código). É a **única onda com migration Prisma** → exige aprovação humana antes de implementar. Gap de origem: [[onda-a-builder-cards]].

## Resumo

Hoje o card `source_progress` extrai só **texto** das fontes coladas ("cole seu site/IG"). A Onda D passa a puxar **fotos** do site/Instagram, gerar **legenda via vision LLM**, persistir numa tabela nova `KnowledgeImage` (com `storageKey`, não URL volátil) e exibir **galeria + lightbox + edição de legenda + opt-out** dentro do **mesmo card** `source_progress` (estendendo o poll existente de `/sources/status`). O pay-off de runtime (tool `enviar_galeria` por busca vetorial) fica para uma fase E posterior; o MVP da D é **extração + curadoria + exibição**.

Arquitetura 100% ancorada no que já existe: reusa `source-enrich.job` (BullMQ async, fail-open), `safeFetch`/SSRF de `text-extraction`, `sniffImage` da rota `pricing-image/upload` (Onda B), `storage.upload(BUCKETS.MEDIA)`, `embedTexts` 1536 e o idiom `CardShell`+`useAppTokens`.

## Migration (model novo)

`KnowledgeImage` (tabela `knowledge_images`) — **NÃO** estender `KnowledgeChunk` (texto+vetor RAG, semântica diferente; relação 1:N com metadados de curadoria próprios; o Orayon validou esse split).

Campos: `id`(uuid), `organizationId`(carimbo tenant), `collectionId`, `sourceId`(FK KnowledgeSource), `originalUrl`, `storageKey` (path no bucket — **não** a signed URL), `caption?`, `captionEmbedding vector(1536)?` (NULLABLE), `width?/height?/sizeBytes?/sha256/mimeType?`, `confirmedAt?` (opt-out), `deletedAt?` (soft-delete), timestamps. `@@unique([sourceId, sha256])` (dedup), índices em collection/org/source. HNSW vai por SQL raw (Prisma não tipa vector). `+ imagesEnabled Boolean @default(true)` em `KnowledgeSource`.

**Dados:** persiste `storageKey` (path content-addressed `knowledge/${org}/${sourceId}/${sha256}.${ext}`) e assina on-read em cada GET — **nunca** persiste a signed URL (expira em 7d). O `builderState` recebe só um espelho leve (`imagesStatus`/`imagesCount`); as imagens vivem na tabela.

## Pipeline de visão

Pluga em `enrichSource()` (`source-enrich.job.ts`) **após** `ingestSource()` OK — mesma fila BullMQ, mesmo worker, **fail-open** (erro de imagem nunca derruba o job nem muda o status da fonte). Novos: `image-extractor.ts` (varre `<img>`/`url()`, resolve relativo→absoluto, descarta placeholders), `image-pipeline.ts` (cap 30/fonte, concorrência 8, INSERT raw `ON CONFLICT DO NOTHING`), `image-caption.service.ts` (**caminho multimodal NOVO** — `runLLMSubAgent` é text-only; usa `generateText` com image parts + BYOK), `image-caption.prompt.ts`. Reusa `safeFetch`/`assertPublicHttpUrl` (exportar — hoje privados) e `sniffImage` (extrair p/ `lib/`). HTML: propagar `extractedHtml` no `IngestResult` (evita 2º fetch). Embedding: NULL no MVP, popula na fase runtime.

## UX (estende o card source_progress, não é card novo)

Zona "Catálogo de fotos" abaixo de "Campos detectados", 3 estados (loading/empty/galeria). Componentes portados do Orayon: `ImagesPreviewPanel` (galeria por fonte), `ImagesPreviewCard` (thumb + soft-delete + legenda), `ImageLightbox` (navegação + edição de legenda via PATCH). Footer condicional: "Aprovar todas (N)" / "Remover genéricas (N)". Estende o `useSourceStatusPoll` existente para também buscar `GET /sources/images`. A galeria é **independente** do "Aceitar" dos campos de texto (não regride `confirmations.source`).

## Subdivisão (3 sub-ondas, PRs próprios)

- **D1 (M, carrega a migration + custo de visão — maior risco):** migration + image-extractor + image-pipeline + image-caption + hook no source-enrich.job + exportar safeFetch/sniffImage. Entrega "imagens são extraídas e persistidas" (testável por SQL/log, sem UI). **Só D1 exige aprovação de schema.**
- **D2 (P-M):** rotas GET/PATCH/bulk + `knowledge-images.repository` + espelho `imagesStatus` no builderState + (opcional) upload manual. Entrega "API de curadoria pronta".
- **D3 (M):** FE galeria + lightbox + edição + opt-out + estender o poll. Entrega "usuário vê e cura o catálogo".
- **Fase E (futuro, fora da D):** embedding de legenda + tool de runtime `enviar_galeria` por busca vetorial (o pay-off real).

## Riscos

- **Custo de visão:** 1 chamada/imagem × 30/fonte × N fontes. Mitigar: cap 30, `detail:low`, semáforo 8, BYOK, medir em `extServiceCosts`; filtro AI de relevância na fase 2.
- **Expiry de signed URL:** persistir `storageKey` + assinar on-read (obrigatório). Não copiar URL pública/estável do Orayon sem decisão de infra.
- **SSRF no download de imagem:** cada candidata passa por `safeFetch`/`assertPublicHttpUrl` (revalida cada hop de redirect). Não copiar o `httpx` sem-guarda do Orayon.
- **Peso de JSONB:** imagens só na tabela; builderState recebe só o flag.
- **Migration (regra dura):** aprovação + `docs/ERD.md` + tabela Prisma no CLAUDE.md no mesmo PR.
- **Captioning multimodal:** modelo BYOK do org pode ser text-only → fail-open + fallback de modelo de visão.
- **Nova dep** (`image-size`/`sharp`) p/ validar dimensão ≥200px — `image-size` é leve; revisar empacotamento do worker.
- **Instagram:** depende do actor Apify (frágil — [[quayer-apify-tavily-env-status]]) e o normalizer não mapeia mídia ainda → recomendado website-first.

## Perguntas abertas (decisão antes de codar)

1. `captionEmbedding`: incluir a coluna NULLABLE agora (migration única, popular só na fase runtime) — **recomendado** — ou adiar?
2. Storage: **signed-URL-on-read** (bucket privado, zero mudança de infra) — **recomendado** — vs bucket público (URL estável, mas expõe imagens de clientes + nova env)?
3. Instagram no MVP ou **website-first** (IG follow-up) — **recomendado website-first**?
4. Upload manual (dropzone) no MVP ou fase 2?
5. Filtro AI de relevância: fase 2 (**recomendado**) ou corte heurístico agressivo já no MVP?
6. Modelo de visão: **fixo barato** (ex. gpt-4o-mini) — **recomendado** — vs modelo BYOK do org (pode ser text-only)?
7. Caps: confirmar 30/fonte, 5MB, ≥200px?
8. Retenção/GC: limpar blobs soft-deleted/órfãos por job, ou só esconder?
