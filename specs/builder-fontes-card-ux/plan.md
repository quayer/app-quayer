---
Criado: 2026-06-11
Atualizado: 2026-06-11
Revisar em: quando atacar qualquer item P0/P1 abaixo
Relacionados:
  - src/client/components/projetos/chat/cards/source-progress-card.tsx
  - src/server/ai-module/builder/sources/source-synthesis.prompt.ts
  - src/server/ai-module/builder/sources/source-enrich.job.ts
  - src/client/components/layout/app-shell-client.tsx
  - src/lib/auth/jwt.ts
  - src/igniter.client.ts
---

# Plano — UX do card "Fontes do negócio" + Builder workspace (observações do founder, 2026-06-11)

> Investigação read-only por workflow de 5 agentes + diagnóstico do 401. NADA implementado ainda — este é o plano.

## 0. Raiz comum de vários sintomas: token expira em 15 min sem refresh (P0 — bug real)

`accessToken` (JWT) tem `ACCESS_TOKEN_EXPIRY='15m'` (jwt.ts:61). NÃO existe refresh automático no client — não há nenhuma chamada a `POST /api/v1/auth/refresh` no browser (só `router.refresh()` do Next). Depois de ~15 min logado, TODA chamada client-side vira **401**:
- `readiness` 401 → a liberação progressiva das tabs cai no fallback → **todas as tabs aparecem** (sintoma reportado).
- `listSourceImages` (rota autenticada) 401 → **fotos somem do card**.
- enviar mensagem / aceitar card → 401.

Evidência: logs do dev mostram 200 por ~13 min e 401 a partir de ~15 min do login. `secure` do cookie está correto (`secure:isProduction`, false em dev); CSRF não entra em GET; baseURL/credentials OK. É puramente expiração.

- **Imediato (sem código):** re-logar (F5 → middleware manda pro /login) ou recarregar e refazer OTP.
- **Fix de fundo (P0, código — recomendado):** interceptar 401 no client Igniter → `POST /api/v1/auth/refresh` (o cookie `refreshToken` tem `path=/api/v1/auth/refresh`, vai sozinho; refresh token válido por dias) → retentar a request 1×. Endpoint já existe (`session/lifecycle.routes.ts:45`, roda `setAuthCookies`). Alternativa: `AuthProvider` com refresh proativo a cada ~12 min. **Sem isso, toda sessão de teste/uso quebra a cada 15 min.**

---

## 1. Card "Fontes do negócio" não mostra detalhe (P1)

**Achado:** a síntese estrutura só **7 campos planos** (businessName, services[], audience, differentiators[], tone, address, description — `source-synthesis.prompt.ts:76-91`). NÃO há confiança%, NÃO há "dados específicos" (dormitórios/vagas/lazer/status da obra), NÃO há lista "Não encontrei". A confiança que você viu (94%) e a granularidade imobiliária **não existem como dado estruturado** — ou foram amassadas em `differentiators[]`/`description`, ou eram prosa transitória do LLM. O `groundedFields` (0-7) É calculado mas **descartado** (`source-enrich.job.ts:344-356`).

- **Ganho rápido (S):** persistir `groundedFields` no `SourceProposal` (campo opcional, aditivo) e trocar a copy fixa do header por um dinâmico quando as fontes assentam: **"Leitura concluída · confiança {N/7} · Identifiquei: {campos preenchidos} · Não encontrei: {campos vazios}"**. A lista "Não encontrei" dá pra derivar 100% no FE hoje (quais dos 7 campos vieram vazios) — entrega já.
- **Ganho estrutural (L):** adicionar um bloco `attributes: {label,value}[]` aterrado no texto + `confidence` numérico do próprio LLM → expor Empreendimento/Dormitórios/Vagas/Lazer/Status da obra como chips rotulados. Toca prompt→parse→schema→merge→accept→card→materialize. Decisão de produto (hoje é deliberadamente enxuto, anti-alucinação).

## 2. Síntese estoura timeout → card vazio intermitente (P1 — robustez)

**Achado:** no 1º projeto a síntese abortou em **synthMs=25027** (= `SYNTHESIS_TIMEOUT_MS=25_000`), competindo com embed+imagens no `pLimit(5)` (efeito colateral da paralelização 436dcab). `runLLMSubAgent` aborta sem retry → `proposed` nunca grava → card fica eterno em "aguarde concluir" com Aceitar mudo. No 2º projeto a mesma URL concluiu em 3,7s.

- Subir `SYNTHESIS_TIMEOUT_MS` (25s é apertado p/ gpt-4o-mini com ~12k chars sob contenção) **e/ou** dar precedência à síntese (rodar fora do `allSettled` que disputa budget, ou cortar o char budget).
- 1 retry por-fonte na síntese (hoje só retry de job BullMQ, que no fallback síncrono do dev não cobre).
- No card: distinguir **"síntese rodando" vs "síntese falhou/timeout"** — hoje uma fonte `ready` (RAG OK) com síntese estourada cai no limbo (nem `hasProposal` nem `hasFailedWithoutProposal`). Mostrar erro + "Tentar novamente" em vez do "aguarde" eterno.

## 3. Fotos não aparecem no card (P1 — em parte é o 401)

**Achado:** o pipeline de imagens RODA local (150 blobs em `.tmp/storage`, KnowledgeImage gravado). A galeria do card (ImagesPreviewPanel) já lê tudo via `GET /builder/projects/:id/sources/images`. Dois motivos pra não aparecer:
1. **401** (item 0): a rota de listagem é autenticada → token expirado → sem URLs → sem fotos. Re-logar resolve.
2. **Porta:** `PUBLIC_STORAGE_BASE_URL` deve bater com a porta real do dev. Hoje está `:3005` e o dev está rodando na **:3005** → **correto** (não mexer). ⚠️ Cuidado: o default do `package.json` é `-p 3000`; se rodar na 3000, as fotos quebram. **Endurecer:** derivar de `NEXT_PUBLIC_APP_URL` ou emitir caminho **relativo** (`/api/v1/files/...`) — nunca quebra por porta. (Legendas ficam NULL sem chave OpenAI local — fotos aparecem mesmo assim, só sem caption.)

## 4. Catálogo de fotos — UX (P2, do founder)

- **"2 botões tipo aprovar todas"** — você achou confuso. Repensar: hoje há "Aprovar todas" + "Remover genéricas". Provavelmente 1 ação primária + seleção por-foto é mais claro.
- **Excluir imagens encontradas** — permitir remover foto a foto (descartar as ruins).
- **Anexar fotos manualmente** — espaço pra upload manual (complementar o que foi raspado). Já existe `POST /builder/media/upload` (Fase E) — reaproveitar.
- **Copy explicativa** — deixar claro: *"Estas imagens ficarão disponíveis para sua IA enviar nas conversas"* (transparência do que o agente vai usar).

## 5. Status inline no chat (chips/bullets) (P2, do founder)

**Achado:** hoje o status só vive DENTRO do card grande (slot único de active-step). Você quer um **chip pequeno inline** na conversa: `vibraresidencial.com.br · na fila → lendo → concluído`, atualizando sozinho, sem travar o papo. O backend já entrega tudo (`GET /sources/status`: status, value, type, chunkCount, error, imagesCount).

- Novo componente leve `SourceStatusChips`: 1 bullet por fonte (host curto + estado micro: na fila/Clock → lendo/Loader2 spin → pronto/CircleCheck "· N trechos" → erro/CircleAlert+tooltip). Reusar `resolvePhase`/`PHASE_PILL` (extrair pra hook compartilhado, **sem duplicar o poll**).
- Montar em `chat-panel` acima do ActiveStepCard, fora do slot do passo → persiste enquanto a conversa flui. Card grande continua só pra fase de REVISÃO.
- Ler do poll de `/status` (não do builderState seed) p/ captar o estado intermediário "lendo".

## 6. Latência ("está demorando muito") (P1)

A paralelização (436dcab) está no código e íntegra. O que sobra:
- **Caminho crítico = tempo do LLM de síntese** (até `proposed` existir) + **poll de 2s**. 
- `SOURCE_ENRICH_SYNC=1` no dev NÃO bloqueia a resposta do chat (é fire-and-forget), mas roda o trabalho pesado DENTRO do processo Next, competindo com o SSE. **Em dev: subir worker dedicado** (`npm run start:workers`, REDIS já existe) e tirar o `SYNC=1`.
- Indicador de etapa usando os **step-timings já logados** (fetchMs/embedMs/synthMs) → "lendo seu site… (síntese 8s)" em vez do genérico. Baixar poll p/ ~1s enquanto não há `proposed`.
- Modelo de síntese mais rápido (override já suportado em base.ts) — trade-off de qualidade.

## 7. Flicker da sidebar home→workspace (P2 — bug visual)

**Causa raiz:** `app-shell-client.tsx:35` inicia `collapsed=useState(false)` (expandida) e pinta a sidebar no 1º paint; só DEPOIS da hidratação um effect (`:99-104`) detecta workspace e colapsa → a sidebar pisca e some.

- **Fix:** estado inicial derivável ANTES do paint: lazy initializer ciente da rota (`useState(() => isWorkspace(pathname) || readPersisted())`) ou `initialCollapsed` calculado server-side (AppShell Server Component, por pathname + cookie). Combina com o `suppressHydrationWarning` já presente. Reservar a largura durante `!hydrated` evita reflow.

## 8. Botão de minimizar a sidebar pouco claro (P2, do founder)

Hoje é um ícone `PanelLeft` (lucide) com `aria-label="Mostrar sidebar (⌘B)"`. Você quer algo **mais óbvio**: uma seta/chevron (`ChevronLeft`/`ChevronRight` conforme estado) e/ou um micro-texto ("Voltar"/"Menu"). Trocar o ícone + estado direcional + tooltip mais claro. Trivial (S).

## 9. Animação de revelação do workspace + tabs progressivas (P2, do founder)

- **Animação "bacana" ao abrir o workspace:** conceito proposto — um *splash* curto (~600-900ms) com o **raio da logo Quayer** "carregando" (traço do raio se desenhando / pulso de energia) sobre um fundo escuro, e então o painel + tabs **nascem** (fade+slide suave) — cobre a latência inicial e dá identidade. Criativo, mas barato: SVG path animation do raio + framer-motion (ou CSS) no mount do workspace, só na 1ª entrada.
- **Tabs progressivas (Visão geral / Prompt / Conhecimento / Mídias / Config):** você notou que aparecem **todas de uma vez**. O design v2 JÁ prevê liberação por fase (`tab-registry.tsx visibleWhen: phaseAtLeast(...)`). **Provável causa de aparecerem todas: o 401 no readiness** (sem readiness, o gate não computa → fallback mostra tudo). **Ação:** depois do fix do 401 (item 0), VERIFICAR se a liberação progressiva volta a funcionar; se ainda mostrar todas, revisar o `visibleWhen` de cada tab e a ordem de revelação (Conhecer→Revisar→Testar→Lançar). A intenção é: começa só com o essencial e vai abrindo Prompt/Conhecimento/Mídias/Config conforme avança.

---

## Priorização sugerida
- **P0 (destrava tudo):** item 0 — auto-refresh do token (ou, imediato, re-logar).
- **P1 (qualidade core do fluxo):** 1 (header rico + "não encontrei"), 2 (timeout/robustez da síntese), 3 (fotos — cai junto com o 401), 6 (latência: worker dedicado + indicador de etapa).
- **P2 (polish/UX):** 4 (catálogo de fotos: excluir/anexar/copy/1 botão), 5 (chips inline), 7 (flicker), 8 (botão sidebar), 9 (animação + verificar tabs progressivas).

## Notas de risco transversais
- Manter o invariante anti-alucinação do `proposed` (só campos aterrados; "confiança" como "N de 7 campos" é proxy honesto, não prometer 94% semântico).
- Mudanças de schema do `SourceProposal` são cross-camada (prompt→parse→state→merge→accept→card→materialize) — aditivas, mas tocam testes.
- Não baixar `SYNTHESIS_TIMEOUT` nem desligar paralelização sem medir; a contenção LLM é o gargalo real.

---

## 10. Arquitetura das tabs — "faz sentido existir todas?" (P2, do founder)

Hoje existem **9 tabs** no registry (`tab-registry.tsx`). Na v2 elas já são reveladas progressivamente por fase (`visibleWhen`), mas mesmo assim, a partir da fase **Revisar**, ~7-8 aparecem quase juntas — o que choca com a régua "quanto menos, melhor". O "todas de uma vez" que você viu foi agravado pelo 401 (sem readiness, o gate não filtra).

### Inventário + veredito (régua: chat é o centro; configurar por exceção; avançado escondido)

| Tab | value | O que faz | Pra quem | Veredito |
|---|---|---|---|---|
| Visão geral | overview | Dashboard do agente + prontidão + CTAs | Todos | **Manter** (landing do workspace) |
| Prompt | prompt | Editor do system prompt cru | Avançado | **Mover p/ Avançado** — a IA escreve o prompt; usuário ajusta por exceção. Tab top-level convida edição que 95% não fará. |
| Conhecimento | knowledge | Base RAG (o que a IA **sabe**) | Todos | **Manter**, candidato a fundir com Mídias |
| Mídias | media | Catálogo do que a IA **envia** (fotos/vídeos/PDF) | Todos | **Fundir com Conhecimento** num "Conteúdo" com 2 seções ("o que sabe" / "o que envia") — pra leigo, 2 tabs adjacentes confunde |
| Testar | playground | Sandbox de teste | Todos | **Manter** (= fase Testar) |
| Atividade | activity | Histórico de conversas em produção | Pós-launch | **Manter** (só aparece pós-publish; não polui antes) |
| Publicar | deploy | Fluxo de publicação | Todos | **Manter** (= fase Lançar) |
| Config | credentials | BYOK / chaves de API / settings | Avançado | **Mover p/ Avançado** — é configuração de poder, não jornada |
| Avançado | advanced | Integrações (Integration Builder) + toggles | Avançado | **Manter como "gaveta" de avançado** (absorve Prompt + Config) |

### Proposta de IA consolidada (de 9 → ~5 visíveis)
**Top-level (jornada simples):** `Visão geral` · `Conhecimento` (com Mídias dentro) · `Testar` · `Publicar` · `Atividade` (pós-launch).
**Avançado** (ícone de engrenagem / "gaveta", fora da fila principal): absorve **Prompt**, **Config/BYOK** e **Integrações** em seções. Quem é técnico acha; quem não é, não tropeça.

Racional: Prompt e Config/BYOK são superfícies de poder que contradizem "a IA monta, você ajusta por exceção" — tucá-las em Avançado tira ruído sem remover capacidade (você mesmo levantou "se o usuário avançado quer ver o prompt, onde?" → resposta: Avançado). Conhecimento+Mídias são conceitos distintos (saber vs enviar) mas adjacentes demais pra justificar 2 tabs num público leigo → 1 tab, 2 seções rotuladas.

### Tensão a decidir (produto)
Algumas "tabs" são na verdade **ações de fase** da jornada chat-cêntrica (Testar = fase Testar; Publicar = fase Lançar). Caminho mais radical e alinhado à v2: a jornada no chat **leva** o usuário a essas superfícies no momento certo (a fase abre o painel), e elas deixam de ser tabs persistentes — restando só `Visão geral` + `Conhecimento` + `Avançado` como navegação livre. Mais enxuto, porém muda o modelo mental de "tabs" para "painel guiado pela conversa". **Recomendo o passo intermediário primeiro** (9→5 + gaveta Avançado), medir, e só então avaliar o radical.

### Esforço / risco
- Mover Prompt e Config p/ dentro de `AdvancedTab` (seções) + fundir Media em Knowledge: **M** — mexe em `tab-registry.tsx`, no `PreviewTab` union (`types.ts`), nos componentes de tab e na navegação por URL (`getTabByValue`). Aditivo/reversível; cuidado com deep-links existentes p/ `?tab=prompt|credentials|media` (manter alias/redirect).
- Não toca backend nem o contrato de readiness; é puramente IA/navegação no FE.
- Antes de qualquer corte: **confirmar que a revelação progressiva volta com o fix do 401** (item 0) — pode ser que, vendo as tabs abrirem fase a fase, a percepção de "muita coisa" já caia bastante sem consolidar nada.
