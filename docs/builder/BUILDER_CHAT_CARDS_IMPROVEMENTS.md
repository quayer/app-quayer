# Builder — Melhorias propostas nos Bullets do Chat

> Complemento de [BUILDER_CHAT_TOOL_CARDS_UX.md](./BUILDER_CHAT_TOOL_CARDS_UX.md). Aqui estão sugestões priorizadas por ROI: o que já existe e não está ligado, cards novos para jornadas ausentes, e polimento do que já roda.

---

## 🔴 Achado — 3 cards já construídos mas **órfãos**

Durante a análise descobri que [cards/](../../src/client/components/projetos/cards/) contém **3 componentes completos que não são renderizados em lugar nenhum**. Só aparecem no `barrel export` [index.ts](../../src/client/components/projetos/cards/index.ts). Nenhum tool os dispara, nenhum dispatcher os escolhe.

| Componente | Arquivo | Status | Uso atual |
|---|---|---|---|
| `ChannelPickerCard` | [channel-picker-card.tsx](../../src/client/components/projetos/cards/channel-picker-card.tsx) | ✅ pronto | 0 referências |
| `ApprovalCard` | [approval-card.tsx](../../src/client/components/projetos/cards/approval-card.tsx) (primeiro export) | ✅ pronto | 0 referências |
| `ProgressCard` | [progress-card.tsx](../../src/client/components/projetos/cards/progress-card.tsx) | ✅ pronto | 0 referências |

**Oportunidade:** ativar esses 3 dá **3 cards novos no chat** com zero código visual novo — só plumbing de backend (tool + dispatcher).

---

## Tier 1 — Quick wins (cards prontos, só plugar)

### 1.1 🎯 Seletor de canal (WhatsApp Business · Cloud API · **Instagram**)

> **Exatamente o que você sugeriu.** O componente já existe — **e Instagram já funciona no backend, só tá marcado errado como "em breve" no card**.

**⚠ Correção importante:** o `ChannelPickerCard` atual tem `disabled: true` no Instagram, mas a infraestrutura está **100% pronta** — [`InstagramAdapter`](../../src/lib/providers/adapters/instagram/instagram.adapter.ts) implementa 4 capabilities (Messaging, Instance, Webhooks, Media), tem endpoint [`POST /api/v1/instances/validate-instagram`](../../src/app/api/v1/instances/validate-instagram/route.ts) batendo na Meta Graph API v20, enum `Provider.INSTAGRAM_META` no schema, e o `CreateConnectionModal` já aceita `channel: INSTAGRAM`. **Primeira ação:** trocar `disabled: true` pra `false` em [channel-picker-card.tsx:41](../../src/client/components/projetos/cards/channel-picker-card.tsx#L41).

**Visual proposto (Instagram habilitado, Telegram/Email como "em breve"):**

```
┌─ ESCOLHA O CANAL ────────────────────────────────┐
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ ☁  WhatsApp Cloud API                        │ │
│ │    API oficial da Meta. Mais estável, requer │ │
│ │    aprovação.                                │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ 📱 WhatsApp Business         [RECOMENDADO] ✓ │ │ ← selecionado
│ │    Pareamento por QR Code. Rápido e sem      │ │
│ │    aprovação.                                │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ 📷 Instagram                                 │ │ ← AGORA HABILITADO
│ │    Conecta via OAuth Meta. Responde DMs com  │ │
│ │    IA.                                       │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ ✈ Telegram                    [em breve]     │ │ ← próximos
│ │    Bot API oficial (adapter ainda não feito) │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Como ativar — 4 passos:**

1. **Editar [channel-picker-card.tsx](../../src/client/components/projetos/cards/channel-picker-card.tsx):** remover `disabled: true` do Instagram; atualizar descrição pra "Conecta via OAuth Meta".
2. **Nova tool no backend:** `propose_channel_selection` em [src/server/ai-module/builder/tools/](../../src/server/ai-module/builder/tools/) retornando `{ success: true, options: ["cloudapi", "uazapi", "instagram"], preselected: "uazapi" }`.
3. **Prompt do Builder:** adicionar regra "Quando for a hora de conectar canal, SEMPRE chame `propose_channel_selection` antes de decidir o fluxo".
4. **Dispatcher** — [tool-results/index.tsx](../../src/client/components/projetos/cards/tool-results/index.tsx):
   ```typescript
   if (toolName === "propose_channel_selection" && isSuccess(result)) {
     return <ChannelPickerCard
       tokens={tokens}
       onSelect={(channel) => sendMessage(`Quero conectar via ${channel}`)}
     />
   }
   ```

**⚠ Importante:** após o usuário clicar Instagram, o Builder **NÃO pode** chamar `create_whatsapp_instance` — o adapter lança erro (`'Instagram does not support dynamic instance creation...'`). O fluxo correto é:

```
WhatsApp Business (uazapi) → create_whatsapp_instance → QR Code
WhatsApp Cloud API         → OAuth Meta Business → create_cloud_instance
Instagram                  → OAuth Meta + validate-instagram → create_instagram_instance
                              (precisa Access Token + Instagram Account ID)
```

**UX que esse card destrava:**
- Usuário não digita "quero WhatsApp Business" — **clica**.
- Educa que tem 3 opções reais (e não só QR do WhatsApp).
- Desbloqueia receita do canal Instagram que já tá no código.

**Novo card derivado necessário — `InstagramOAuthCard`** (Tier 2): input de Access Token + Instagram Account ID com botão "Validar" chamando o endpoint existente. Sem isso, clicar em Instagram no picker não leva a lugar nenhum.

---

### 1.2 ✅ Approval antes de criar agente

**Hoje:** Builder chama `create_agent` direto → aparece o card verde "Agente criado". Usuário não tem chance de ajustar antes de criar.

**Com `ApprovalCard`** (já pronto):

```
┌─ 🤖 Assistente Barbearia X ──────────────────────┐
│      Novo agente pronto para ser criado          │  ← bg brandSubtle
├──────────────────────────────────────────────────┤
│  Atende clientes pra agendar corte, tira dúvidas │
│  sobre preço e horários, e escala pra humano     │
│  quando for reclamação.                          │
├──────────────────────────────────────────────────┤
│  [ ✓ Criar Agente ]    [ ✎ Ajustar ]             │  ← CTAs
└──────────────────────────────────────────────────┘
```

**Como ativar:**

1. **Nova tool:** `propose_agent` (retorna preview sem persistir nada)
2. **Dois handlers de clique:**
   - `onApprove` → envia mensagem "Pode criar" → LLM chama `create_agent`
   - `onAdjust` → envia "quero ajustar: " → LLM entra em modo edição
3. **Dispatcher** → renderiza `ApprovalCard` com `agentName` + `description`.

**Por que importa:** reduz retrabalho. Hoje o usuário só vê o agente **depois** de criado — se não gostou, precisa pedir update.

---

### 1.3 📊 Progress stepper no primeiro turno

**Hoje:** `overview` tab tem o progresso, mas **só a partir do segundo tool call**. Nos primeiros 30 segundos da conversa o PreviewPanel é uma tela vazia.

**Com `ProgressCard`** (já pronto — 7 stages):

```
┌─ PROGRESSO DO BUILDER ───────────────────────────┐
│                                                  │
│ ● Nome do agente               ← feito           │
│ │                                                │
│ ● Objetivo                     ← feito           │
│ │                                                │
│ ⟳ Prompt do sistema            ← em andamento    │ (loader2 animado)
│ │                                                │
│ ○ Ferramentas                                    │
│ │                                                │
│ ○ Testes                                         │
│ │                                                │
│ ○ Canal WhatsApp                                 │
│ │                                                │
│ ○ Deploy                                         │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Como ativar:**

1. Detectar estágio atual via heurística do histórico (hook novo em `chat/hooks/use-builder-stage.ts`).
2. Renderizar **no topo da primeira mensagem do assistant** (não como tool card — como elemento de shell do chat).

**Por que importa:** usuário entende o **que ainda falta**. Reduz ansiedade de "quanto tempo isso vai demorar".

---

## Tier 2 — Cards novos (jornadas sem visual hoje)

Propostas ordenadas por dor que resolvem.

### 2.1 🔢 Escolha múltipla de tools (quando Builder pergunta)

**Gap:** hoje o Builder pergunta "Quer que o agente consulte agenda, colete leads, ou integre com CRM?" e espera o usuário **digitar** a resposta. Fricção pura.

**Proposta — `ToolPickerCard` (multi-select):**

```
┌─ QUAIS HABILIDADES O AGENTE PRECISA? ────────────┐
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ ☑  📅 Agendar horário                      │  │ ← check toggleável
│  │     Usa Google Calendar/Cal.com            │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ ☑  💰 Enviar tabela de preços              │  │
│  │     Lê de um arquivo ou URL                │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ ☐  📝 Coletar leads                        │  │
│  │     Salva em planilha/CRM                  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ ☐  🆘 Escalar pra humano                   │  │
│  │     Transfere para atendente               │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│        [ Confirmar 2 selecionadas → ]            │  ← CTA com contador
└──────────────────────────────────────────────────┘
```

**Tool backend:** `propose_tool_selection` → retorna catálogo filtrado por vertical.
**Resultado do clique:** envia "Quero: agendar, tabela" → Builder dispara N × `attach_tool_to_agent`.

---

### 2.2 💬 Preview de exemplos de conversa

**Gap:** depois que o prompt é gerado, usuário aprova "no escuro". Não vê como o agente **vai responder** antes de publicar.

**Proposta — `ExamplePreviewCard`:**

```
┌─ 🔮 PREVIEW DE CONVERSA ─────────────────────────┐
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ 👤 Cliente                                 │  │
│  │    quanto é um corte masculino?            │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ 🤖 Seu agente                              │  │
│  │    Oi! 👋 Aqui corte masculino tá R$ 35.   │  │
│  │    Quer marcar um horário? Temos vaga hoje │  │
│  │    às 15h e amanhã 10h. 💈                 │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ── próximo exemplo ──                           │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ 👤 Cliente                                 │  │
│  │    tá muito caro, sai pra mais barato?     │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ 🤖 Seu agente                              │  │
│  │    Nosso preço é fixo, mas temos pacote    │  │
│  │    corte + barba por R$ 50 (sai mais em    │  │
│  │    conta que separado). Te interessa?      │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  [ Ajustar tom ]     [ Aprovar prompt → ]        │
└──────────────────────────────────────────────────┘
```

**Tool backend:** `run_prompt_preview` — pede pro LLM simular 2-3 turnos com cenários típicos da vertical.
**Ganho:** usuário valida **antes** de publicar → menos iterações pós-deploy.

---

### 2.3 🎚 Ajuste de tom com sliders

**Gap:** usuário diz "deixa mais amigável" e o Builder re-gera o prompt inteiro. Sem controle fino.

**Proposta — `ToneSliderCard`:**

```
┌─ AJUSTE DE TOM ──────────────────────────────────┐
│                                                  │
│  Formalidade                                     │
│  Casual ●──────────────○────────── Formal        │
│         ▲                                        │
│                                                  │
│  Energia                                         │
│  Calmo ────────○────●──────────── Empolgado      │
│                      ▲                           │
│                                                  │
│  Emojis                                          │
│  Nenhum ──────────────●──────────── Muitos       │
│                       ▲                          │
│                                                  │
│  Detalhe                                         │
│  Direto ●──────────────────────── Verboso        │
│         ▲                                        │
│                                                  │
│         [ Aplicar ajustes → ]                    │
└──────────────────────────────────────────────────┘
```

**Tool backend:** `adjust_prompt_tone` recebe `{ formality: 0-1, energy: 0-1, emoji: 0-1, verbosity: 0-1 }` → chama `update_agent_prompt` nos bastidores.
**Ganho:** controle numérico em vez de texto ambíguo.

---

### 2.4 💳 Card de plano/billing quando há blocker

**Gap:** hoje o `DeployBlockersCard` só mostra links externos. Usuário sai do Builder, entra em `/admin/billing`, volta.

**Proposta — `PlanPickerCard` inline:**

```
┌─ ESCOLHA UM PLANO PARA PUBLICAR ─────────────────┐
│                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────┐ │
│  │   Starter    │ │    Pro   ★   │ │   Scale   │ │ ★ = recomendado
│  │              │ │              │ │           │ │
│  │   R$ 97/mês  │ │  R$ 297/mês  │ │ R$ 797/mês│ │
│  │              │ │              │ │           │ │
│  │ 1k msgs      │ │ 10k msgs     │ │ 50k msgs  │ │
│  │ 1 agente     │ │ 5 agentes    │ │ Ilimitado │ │
│  │              │ │ Analytics    │ │ + API     │ │
│  │              │ │              │ │           │ │
│  │ [ Assinar ]  │ │ [ Assinar ]  │ │[ Assinar] │ │
│  └──────────────┘ └──────────────┘ └───────────┘ │
│                                                  │
│  Pagamento via Stripe · cancele quando quiser    │
└──────────────────────────────────────────────────┘
```

**Tool backend:** `propose_plan_upgrade` retorna planos + preços.
**Ganho:** publicação **sem sair do chat** — fecha o loop no mesmo lugar.

---

### 2.5 📷 Conexão Instagram — jornada completa (não é só colar token)

**Realidade:** conectar Instagram via Meta Graph API **não é um form de 2 inputs**. O usuário precisa passar por 5-7 etapas antes de sequer ter um Access Token válido. Se a UI não guiar essa jornada, o drop-off é ~95%.

**O que o usuário realmente precisa fazer (setup manual completo):**

```
1. Ter uma Página do Facebook       (pré-requisito)
2. Converter conta IG em Business  (via app do celular)
3. Linkar IG Business à Página FB   (Meta Business Suite)
4. Criar app em developers.facebook.com
5. Adicionar produto "Instagram" no app
6. Pedir permissões: instagram_basic,
   instagram_manage_messages,
   pages_messaging, pages_show_list
7. Gerar Page Access Token de longa duração
8. Descobrir o Instagram Business Account ID
   (via GET /{page-id}?fields=instagram_business_account)
9. Configurar webhook do app → endpoint Quayer
10. Submeter app pra revisão da Meta (se for produção pública)
```

**Dois caminhos possíveis — Quayer precisa escolher um:**

---

#### 🛣 Caminho A — **OAuth gerenciado** (recomendado)

Quayer se registra como um **app Meta oficial** (uma única vez, Quayer faz). Usuário só clica "Conectar com Facebook" e a Meta faz todo o trabalho pesado.

**Card proposto — `InstagramConnectCard` (fluxo OAuth):**

```
┌─ 📷 CONECTE SEU INSTAGRAM ───────────────────────┐
│                                                  │
│    Vamos usar o login da Meta pra conectar —     │
│    você não precisa criar app nenhum.            │
│                                                  │
│    Você precisa ter:                             │
│    ✓  Uma Página do Facebook                     │
│    ✓  Conta Instagram Business vinculada         │
│        à sua Página                              │
│                                                  │
│    ┌────────────────────────────────────────┐    │
│    │  [f]  Conectar com Facebook  →         │    │  ← botão OAuth
│    └────────────────────────────────────────┘    │
│                                                  │
│    🔒 Quayer pede só o mínimo: ler DMs e         │
│       responder. Nenhum post, nenhuma foto.      │
│                                                  │
│    ❓ Ainda não tem conta Business? Criar ↗      │
└──────────────────────────────────────────────────┘
```

**Fluxo técnico:**

```
Clica "Conectar" → popup Meta OAuth
  https://www.facebook.com/v20.0/dialog/oauth
    ?client_id=QUAYER_META_APP_ID
    &redirect_uri=https://quayer.app/api/oauth/meta/callback
    &scope=instagram_basic,instagram_manage_messages,
           pages_messaging,pages_show_list
  ↓
Meta → redirect_uri com ?code=...
  ↓
Backend: POST graph.facebook.com/oauth/access_token
  → short-lived token
  ↓
Backend: GET graph.facebook.com/oauth/access_token
  (grant_type=fb_exchange_token) → long-lived (60 dias)
  ↓
Backend: GET /me/accounts → lista páginas + Page Access Tokens
  ↓
Se > 1 página → mostra PageSelectCard no chat
Se 1 página    → avança direto
  ↓
Backend: GET /{page-id}?fields=instagram_business_account
  → instagramAccountId
  ↓
validate-instagram endpoint já existente
  ↓
Persiste Instance com provider=INSTAGRAM_META
```

**Card intermediário — `PageSelectCard` (usuário com várias Páginas FB):**

```
┌─ QUAL PÁGINA CONECTAR? ──────────────────────────┐
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ 👤  Barbearia X Oficial                  │    │
│  │     @barbearia_x · 12.4k seguidores      │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ 👤  Produtos Paralelos Ltda              │    │
│  │     sem Instagram vinculado  ⚠           │    │  ← disabled
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ 👤  Segunda Loja                         │    │
│  │     @segunda_loja · 890 seguidores       │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Custo pra Quayer escolher esse caminho:**
- Registrar app na Meta uma vez (Business Verification + Data Use Checkup)
- Submeter pra App Review pedindo `instagram_manage_messages` + `pages_messaging` (~2-4 semanas de revisão Meta)
- Implementar endpoint `/api/oauth/meta/callback` + refresh token job
- **Depois disso, ZERO fricção pra todos os usuários**

---

#### 🛣 Caminho B — **Setup manual assistido** (fallback sem revisão Meta)

Se o Caminho A não dá (Meta App Review negado, MVP apertado), o Builder conduz o usuário por um **wizard multi-step** dentro do chat. Cada passo é um card separado.

**Card mestre — `InstagramSetupWizard` (stepper colapsável):**

```
┌─ 📷 CONECTE SEU INSTAGRAM — 6 PASSOS ────────────┐
│                                                  │
│  ● Passo 1 · Conta Instagram Business      [✓]   │
│  │   Sua conta precisa ser Business, não Pessoal │
│  │   [ Como converter → ]                        │
│  │                                               │
│  ● Passo 2 · Vincular à Página do Facebook  [✓]  │
│  │   Meta Business Suite → Settings              │
│  │   [ Abrir Business Suite ↗ ]                  │
│  │                                               │
│  ● Passo 3 · Criar app no Meta for Developers ⟳  │ ← atual (animado)
│  │   developers.facebook.com → Criar app         │
│  │   Tipo: "Business"                            │
│  │   [ Abrir Meta for Developers ↗ ]             │
│  │   [ Já criei, próximo → ]                     │
│  │                                               │
│  ○ Passo 4 · Adicionar produto Instagram         │
│  │                                               │
│  ○ Passo 5 · Pegar Page Access Token             │
│  │                                               │
│  ○ Passo 6 · Validar credenciais                 │
│                                                  │
│  💡 Tempo estimado: 15-20 minutos                 │
└──────────────────────────────────────────────────┘
```

**Quando chega no Passo 6, aparece um segundo card com os inputs** (o que eu tinha proposto antes, mas agora no contexto certo):

```
┌─ PASSO 6/6 · COLE O PAGE ACCESS TOKEN ───────────┐
│                                                  │
│   Page Access Token (do app que você criou)      │
│   ┌────────────────────────────────────────────┐ │
│   │ EAAG•••••••••••••••••••••••••••••••••••    │ │
│   └────────────────────────────────────────────┘ │
│   ℹ Onde achar? Graph API Explorer → User Token  │
│     → selecione a página → gere token            │
│                                                  │
│   Instagram Business Account ID                  │
│   ┌────────────────────────────────────────────┐ │
│   │ 17841405793____                            │ │
│   └────────────────────────────────────────────┘ │
│   ℹ Descobrir via: GET /{page-id}                │
│     ?fields=instagram_business_account           │
│                                                  │
│   [ 🤖 Me ajude a pegar o token ]                │  ← abre chat
│   [ ✓ Validar e conectar → ]                     │
└──────────────────────────────────────────────────┘
```

**Estado final — validação sucesso:**

```
┌─ ✓ INSTAGRAM CONECTADO ──────────────────────────┐
│                                                  │
│   ┌─────────┐                                    │
│   │  👤     │  @barbearia_x                      │
│   └─────────┘  Barbearia X Oficial                │
│                12.4k seguidores                   │
│                                                  │
│   ⚠ Token válido por 60 dias — renovamos         │
│     automaticamente antes de expirar             │
│                                                  │
│   [ Testar uma DM → ]  [ Finalizar ]             │
└──────────────────────────────────────────────────┘
```

---

**Decisão recomendada pra Quayer:**

| Critério | Caminho A (OAuth) | Caminho B (Wizard manual) |
|---|---|---|
| Fricção pro usuário | **Muito baixa** (1 clique) | Alta (20 min, 6 passos) |
| Time to market | 4-6 semanas (App Review) | 1 semana (só UI) |
| Conversion rate esperada | ~80% | ~15-25% |
| Manutenção | refresh token + webhook | suporte alto (usuários travam) |
| Dependência externa | Meta App Review | nenhuma |

**Proposta:** começar pelo Caminho B (wizard manual) como MVP pra validar demanda. **Em paralelo**, iniciar submissão Meta pro Caminho A. Quando App Review passar, substituir o botão do wizard por "Conectar com Facebook" e manter o manual como fallback pra power users / agências.

**Infraestrutura que já existe:**
- [`POST /api/v1/instances/validate-instagram`](../../src/app/api/v1/instances/validate-instagram/route.ts) ← usado no Passo 6 do wizard **e** no callback do OAuth
- [`InstagramAdapter`](../../src/lib/providers/adapters/instagram/instagram.adapter.ts) com healthCheck, sendText, webhooks — pronto pra receber os dados
- Enum `Provider.INSTAGRAM_META` no Prisma

**O que precisa ser construído:**

| Componente | Caminho A | Caminho B |
|---|---|---|
| Meta App registrado + verificado | ✅ obrigatório | ❌ não precisa |
| `/api/oauth/meta/callback` | ✅ novo endpoint | ❌ |
| Refresh token cron (60 dias) | ✅ obrigatório | ⚠ usuário regenera |
| `InstagramSetupWizard` | ❌ | ✅ novo |
| `PageSelectCard` | ✅ novo | ❌ |
| `InstagramOAuthButton` | ✅ novo | ❌ |
| Docs/video walkthrough passos 1-5 | ❌ | ✅ **crítico** |

---

### 2.6 🔑 BYOK inline — colar chave OpenAI/Anthropic

**Gap:** Builder diz "configure sua chave em /admin/byok" → usuário sai, perde contexto.

**Proposta — `ByokInlineCard`:**

```
┌─ 🔑 CONFIGURE SUA CHAVE DE IA ───────────────────┐
│                                                  │
│  Qual provedor?                                  │
│  [ OpenAI ✓ ] [ Anthropic ] [ Google ]           │  ← toggle
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ sk-proj-••••••••••••••••••••••••••••••    │  │  ← input password
│  └────────────────────────────────────────────┘  │
│  🔒 Criptografado · nunca sai do seu tenant      │
│                                                  │
│  [ Validar e salvar → ]                          │
│                                                  │
│  💡 Onde pego? platform.openai.com/api-keys ↗    │
└──────────────────────────────────────────────────┘
```

**Tool backend:** `store_byok_credentials` (existente) — só precisa do card pra receber a chave.
**Ganho:** onboarding sem context switch. Validação imediata.

---

### 2.7 🎨 Personalidade visual do agente

**Gap:** agente é sempre o mesmo avatar `<Bot />` cinza. Sem identidade.

**Proposta — `AgentPersonaCard`:**

```
┌─ DÊ UMA CARA PRO SEU AGENTE ─────────────────────┐
│                                                  │
│   ┌───┐  ┌───┐  ┌───┐  ┌───┐  ┌───┐  ┌───┐       │
│   │🤖 │  │💼 │  │💇 │  │🎓 │  │⚕️ │  │➕ │       │  ← emoji pickers
│   │ ✓ │  │   │  │   │  │   │  │   │  │   │       │    (+ upload custom)
│   └───┘  └───┘  └───┘  └───┘  └───┘  └───┘       │
│                                                  │
│   Nome:      [ Assistente Barbearia X ]          │
│   Apelido:   [ Bia ]                  (opcional) │
│                                                  │
│   Cor tema:                                      │
│   ● ● ● ● ● ● ● ●                                │  ← swatches
│       ▲                                          │
│                                                  │
│                   [ Salvar ]                     │
└──────────────────────────────────────────────────┘
```

**Ganho:** diferenciação entre múltiplos agentes na BuilderSidebar. Branding no cliente final.

---

### 2.8 📈 Stats em tempo real pós-publicação

**Gap:** `MetricsCard` do overview é placeholder. Sem métricas, sem retenção.

**Proposta — `LiveStatsCard` no chat (após publicar):**

```
┌─ 📈 PRIMEIRAS 24H EM PRODUÇÃO ───────────────────┐
│                                                  │
│  47        12         R$ 840      3min          │
│  msgs      conversas  pipeline    resposta média │
│                                                  │
│  ╭──────────────────── tendência ───────────────╮│
│  │      ▂▃▅▇█▅▃▂       ← mensagens/hora        ││
│  ╰──────────────────────────────────────────────╯│
│                                                  │
│  🏆 Pergunta mais comum:                         │
│      "qual o horário?" (12 vezes)                │
│                                                  │
│  [ Ver dashboard completo → ]                    │
└──────────────────────────────────────────────────┘
```

**Tool backend:** `get_live_stats` → query `features-module/analytics`.
**Ganho:** gatilho emocional ("meu agente está funcionando!") → retenção.

---

## Tier 3 — Polimento dos cards existentes

### 3.1 QR Code com countdown + refresh

**Hoje:** QR aparece estático. Se expirar (UAZ renova a cada ~60s) o usuário não sabe.

**Melhoria:**

```
┌─ QR CODE EXPIRA EM 0:42 ─────────────────────────┐
│         ┌─────────────────┐                      │
│         │ ████  ██  ██ ██ │                      │
│         │ ████  ██ ███ ██ │  ← anel progressivo  │
│         │ ██  ██████  ██  │    ao redor (circu-  │
│         │ ████  ██ ████   │    lar progress)     │
│         └─────────────────┘                      │
│                                                  │
│         ↻ Gerar novo QR                          │
└──────────────────────────────────────────────────┘
```

**Implementação:** `setInterval` de 1s + polling do endpoint de status. Ao expirar, botão "Gerar novo QR" chama tool de refresh.

### 3.2 Cards com ações contextuais

**Hoje:** `AgentCreatedCard` é puramente informativo. Sem CTA.

**Melhoria:** adicionar rodapé com 3 atalhos:

```
┌──────────────────────────────────────────────────┐
│ ✓  Assistente Barbearia X               [v1]     │
│    Agente criado com sucesso                     │
├──────────────────────────────────────────────────┤
│  ID: agt_01HN8X3KM9Z…                            │
├──────────────────────────────────────────────────┤
│  [ ▶ Testar ]  [ ✎ Editar prompt ]  [ 🚀 Publicar│
└──────────────────────────────────────────────────┘
```

Cada botão dispara `sendMessage` com intent específico.

### 3.3 Deduplicação do prompt no chat

**Hoje:** [chat-message.tsx:183-197](../../src/client/components/projetos/chat/chat-message.tsx#L183) tenta deduplicar prompt via `indexOf("# Papel")`. Frágil.

**Melhoria:** backend marca mensagens com `meta: { hasPromptCard: true }` → frontend esconde prose quando flag presente. Zero heurística.

### 3.4 Skeleton enquanto streaming

**Hoje:** `⏳ executando` é texto puro. Sem preview do que vai aparecer.

**Melhoria:** cada tool mostra skeleton do seu card:
- `create_agent` → skeleton de card verde
- `create_whatsapp_instance` → skeleton com placeholder de QR pulsando
- `list_whatsapp_instances` → 2-3 linhas fantasmas

### 3.5 Empty state dos collapsibles

**Hoje:** tools com result mas sem `success: true` caem no `GenericErrorCard` vermelho (assustador).

**Melhoria:** distinguir 3 casos:
- **Erro real** (throw do backend) → vermelho
- **Validação falhou** (`success: false` esperado) → amarelo + CTA de correção
- **Sem resultado** (usuário pediu dry-run) → cinza neutro

---

## Tier 4 — Cards para novos kinds de projeto

O [tab-registry.tsx](../../src/client/components/projetos/preview/tab-registry.tsx) já prevê `visibleFor: ProjectType[]`. Hoje só `ai_agent` tem tabs. Para `wa_campaign` e `wa_flow` futuros:

### 4.1 `wa_campaign` — Segmentação visual

```
┌─ SEGMENTE SUA AUDIÊNCIA ─────────────────────────┐
│                                                  │
│  Total da base:  1.247 contatos                  │
│                                                  │
│  ┌─ Filtros ─────────────────────────────────┐   │
│  │ ☑ Cidade = São Paulo            (523)     │   │
│  │ ☑ Tag = "lead-quente"           (412)     │   │
│  │ ☐ Último contato > 30 dias      (189)     │   │
│  │ ☐ Não recebeu esta campanha     (245)     │   │
│  └───────────────────────────────────────────┘   │
│                                                  │
│  Audiência final:  312 contatos                  │
│  ╭───────────────────────────────────────╮       │
│  │▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░│  25% │
│  ╰───────────────────────────────────────╯       │
│                                                  │
│      [ Confirmar segmentação → ]                 │
└──────────────────────────────────────────────────┘
```

### 4.2 `wa_campaign` — Preview da mensagem no WhatsApp

```
┌─ PREVIEW NA TELA DO WHATSAPP ────────────────────┐
│                                                  │
│    ┌──── tela iPhone mockup ───┐                 │
│    │ ◀ Cliente                 │                 │
│    │                           │                 │
│    │  Ontem, 18:32             │                 │
│    │  ┌──────────────────────┐ │                 │
│    │  │ 🎉 Oi Maria! Promoção│ │                 │
│    │  │ relâmpago: corte +   │ │                 │
│    │  │ barba por R$ 50 hoje │ │                 │
│    │  │ e amanhã. Quer marcar│ │                 │
│    │  │ um horário?          │ │                 │
│    │  │                      │ │                 │
│    │  │ [ Sim, quero ]       │ │   ← button      │
│    │  │ [ Não, obrigado ]    │ │                 │
│    │  └──────────────────────┘ │                 │
│    │             18:32  ✓✓     │                 │
│    └───────────────────────────┘                 │
│                                                  │
│  Caracteres: 127/1024                            │
│                                                  │
│  [ Editar ]        [ Enviar pra 312 → ]          │
└──────────────────────────────────────────────────┘
```

### 4.3 `wa_flow` — Diagrama de fluxo inline

Reaproveitar Excalidraw (já integrado no projeto) dentro de um card pra preview do fluxo lógico.

---

## Priorização final

| # | Proposta | Esforço | Impacto | Dependências |
|---|---|---|---|---|
| 1 | **ChannelPickerCard** ativado (+ destravar Instagram) | XS (só plumbing) | **Muito Alto** — destrava canal Instagram pronto | Nova tool + edit `disabled` |
| 2 | **ApprovalCard** ativado | XS | Alto — reduz retrabalho | Nova tool |
| 3 | **InstagramOAuthCard** (novo) | S | **Alto** — destrava receita canal Instagram | Endpoint já existe |
| 4 | **ProgressCard** no primeiro turno | S | Médio | Hook de stage detection |
| 5 | QR Code com countdown | S | Médio | Polling UAZ |
| 6 | ToolPickerCard (multi-select) | M | Alto | Nova tool + catálogo |
| 7 | ExamplePreviewCard | M | Alto | LLM simulation tool |
| 8 | PlanPickerCard inline | M | Alto | Integração Stripe |
| 9 | ByokInlineCard | S | Alto | Tool store_byok |
| 10 | ToneSliderCard | M | Médio | Tool adjust_prompt_tone |
| 11 | LiveStatsCard | L | Médio — retenção | Módulo analytics |
| 12 | AgentPersonaCard | M | Baixo (nice-to-have) | Schema avatar/cor |
| 13 | Cards `wa_campaign` | L | Alto (quando virar feature) | Novo kind de projeto |

**Sugestão pra próximo sprint:** ativar #1, #2, #3, #9 — **ChannelPicker + ApprovalCard + InstagramOAuth + BYOK inline**. Os 3 primeiros já têm backend 100% pronto (só falta wire) e destravam uma **receita inteira de canal Instagram** que está parada por causa de um `disabled: true` em um array. ROI insano pro esforço.

---

## Referências

- Cards existentes: [cards/](../../src/client/components/projetos/cards/)
- Dispatcher: [tool-results/index.tsx](../../src/client/components/projetos/cards/tool-results/index.tsx)
- Documentação dos bullets atuais: [BUILDER_CHAT_TOOL_CARDS_UX.md](./BUILDER_CHAT_TOOL_CARDS_UX.md)
- Jornada end-to-end: [BUILDER_USER_JOURNEY.md](./BUILDER_USER_JOURNEY.md)
- Gaps priorizados das tabs: [BUILDER_PREVIEW_TABS_UX.md § Gaps](./BUILDER_PREVIEW_TABS_UX.md#gaps-de-ux-priorizados)
