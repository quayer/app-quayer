---
Criado: 2026-06-07
Atualizado: 2026-06-07
Revisar em: quando o épico entrar em roadmap (ou 2026-09-07)
Relacionados:
  - src/server/ai-module/ai-agents/tools/transfer-to-human.tool.ts
  - src/server/ai-module/ai-agents/tools/department-dispatch/
  - prisma/schema.prisma (Connection, Department, DepartmentMember)
  - docs/deprecated/ADMIN_SURFACE_REMOVED.md
---

# Épico — QR por vendedor/departamento + Warm Transfer

> **Status:** SPEC (não implementado). Design para revisão antes de qualquer código.
> Origem: pedido do dono (2026-06-07) durante a consolidação do `transfer_to_human`.

## 1. Problema / visão

Hoje o handoff do Quayer (`transfer_to_human`, 3 rotas — ver a tool) **avisa** um
humano (painel + WhatsApp do membro via número conectado do bot), mas o humano
assume **pelo painel**. A visão do dono é mais forte:

> "Liberar conexão QR por departamento e por vendedor; quando o lead é
> direcionado, a conexão daquele humano **pega o número do cliente e manda uma
> mensagem para continuar o atendimento** — além de o humano receber um resumo."

Ou seja: **warm transfer** — a conversa migra para o **WhatsApp próprio do
humano** (não o número do bot), e o humano continua dali, no app de WhatsApp dele.

## 1b. Achado da investigação (2026-06-07) — a infra JÁ é multi-conexão

Mapeamento read-only do código confirmou que **quase tudo já suporta N conexões por org**:
- `Connection` é **1:N** com Organization (`organizationId` nullable, sem unique). `prisma/schema.prisma:535-622`.
- **Webhook inbound** resolve a Connection por **`uazapiInstanceId`/`uazapiToken`** (NÃO por org) — já multi-safe. `webhooks/uazapi/route.ts:407-424`.
- **Dispatch** passa `connectionId` EXPLÍCITO ao runtime. `route.ts:686` → `processAgentMessage`.
- **Outbound** recebe `connectionId` explícito e resolve token/baseUrl por ele. `outbound.service.ts:240-242`; `uazapi-sender` é stateless (token+baseUrl por arg).
- `ChatSession`/`Message` já chaveados por `connectionId`.
- Criação/pareamento QR já cria N Connections. `builder/tools/create-instance.tool.ts` / `deploy/create-instance.handler.ts`.

**Gap real (pequeno):** (a) NÃO há vínculo `Connection ↔ Department/DepartmentMember` (só `assignedCustomerId`→User); (b) o inbound resolve a connection mas o **roteamento por dono/depto** para warm transfer não existe.

> **Re-priorização:** como o membro **já recebe o resumo** (via número do bot, `trySendRouletteWhatsApp`), a fatia "receber resumo na conexão própria" tem **valor marginal**. O valor REAL está no **warm transfer (F2)** — o lead continuar no WhatsApp do humano — que depende do **roteamento de inbound multi-instância (F1)**. F1/F2 são as partes que tocam o **caminho ao vivo** → exigem design + testes de roteamento + gate de prod. Não fazer "às cegas".

## 2. O que JÁ existe (não reconstruir)

| Capacidade | Onde |
|---|---|
| Roleta round-robin por departamento | `department-dispatch/` (`selectNextMember`) |
| Membro = nome + WhatsApp (não precisa ser usuário) | `DepartmentMember.name/whatsapp` |
| Aviso/resumo ao WhatsApp do membro (via número conectado do bot) | `trySendRouletteWhatsApp` |
| Múltiplos departamentos com números próprios | vários `Department` + membros |
| Rotas de handoff: `queue` / `department` / `self` | `transfer-to-human.tool.ts` |

**Conclusão:** os 3 "modos" (self / roleta-vendedores / departamento) e o "resumo
para o número cadastrado" **já estão entregues**. O épico é só o **delta**: dar a
cada humano uma **conexão WhatsApp própria** e fazer o **warm transfer**.

## 3. O delta (o que é NOVO)

1. **Multi-instância WhatsApp por org.** Hoje a org tem 1 `Connection` (1 número
   do bot). O épico exige N conexões: a do bot + 1 por vendedor/departamento que
   optar por QR próprio. Cada uma é um pareamento UAZapi independente.
2. **Pareamento QR por humano/departamento.** Fluxo de "ligar conexão" (QR) por
   `DepartmentMember` (vendedor) e/ou por `Department`.
3. **Roteamento de inbound multi-instância.** O webhook inbound precisa saber **de
   qual instância** veio a mensagem e rotear para a sessão/dono certo. Hoje o
   inbound assume 1 instância por org.
4. **Warm transfer.** No handoff, a conexão do humano (não a do bot) envia ao
   **cliente** uma 1ª mensagem ("Oi, aqui é o João da Quayer, vou continuar seu
   atendimento…") + o humano recebe o **resumo** no próprio número. A partir daí,
   as respostas do cliente chegam na conexão do humano e a IA não responde mais
   (sessão pausada, já temos isso).

## 4. Modelo de dados (proposta)

- **`Connection`** ganha um vínculo opcional ao destinatário:
  `ownerType: 'org' | 'department' | 'member'` + `ownerId` (Department.id ou
  DepartmentMember.id). `ownerType='org'` = a conexão atual do bot.
- **`DepartmentMember`** / **`Department`**: campo `connectionId?` apontando para a
  conexão QR própria (quando existir). Sem ela → cai no comportamento atual
  (resumo via número do bot).
- Sessão/transfer: marcar `handoff.warmTransfer = true` + `targetConnectionId`.

> Decisão a tomar: número do humano = a **mesma** conta WhatsApp dele (QR pessoal)
> ou um número novo? QR pessoal é o que o dono descreveu ("liberar conexão").

## 5. Fluxo do warm transfer (rota nova: `routing:'department'` + warm, ou um flag)

1. Roleta escolhe o humano (já existe).
2. Resolve a `Connection` do humano (`member.connectionId`). Sem ela → degrada
   para o aviso atual (resumo via número do bot).
3. Pela conexão do humano: envia ao **cliente** a mensagem de abertura + envia ao
   **humano** o resumo (no chat com o cliente ou em self-chat).
4. Pausa a IA (já existe). Inbound futuro do cliente roteia para a conexão do
   humano (precisa do #3 de roteamento).

## 6. Riscos / questões abertas

- **Custo/limites UAZapi**: N instâncias por org = custo e limites por número.
- **Número do cliente em 2 conversas**: o cliente passa a falar com o número do
  humano; e se ele responder no número do bot? Precisa de política (encaminhar /
  ignorar / espelhar).
- **Re-pareamento/expiração** de QR por humano (manutenção operacional).
- **Privacidade/LGPD**: o número do cliente vai para o WhatsApp pessoal do humano.
- **Inbound routing** é a parte mais arriscada (toca o caminho ao vivo).

## 7. Fases sugeridas (entregáveis pequenos)

- **F0** — Multi-instância: `Connection.ownerType/ownerId` + listagem/pareamento QR
  por departamento (sem warm transfer ainda; só recebe resumo na conexão própria).
- **F1** — Roteamento de inbound multi-instância (a base mais arriscada).
- **F2** — Warm transfer (mensagem de abertura ao cliente pela conexão do humano).
- **F3** — Política de número-do-cliente-em-2-conversas + observabilidade.

## 8. Recomendação (revisada — ver §9)

A investigação (§1b) mostrou que a infra já é multi-conexão. E a análise de §9
mostra que o **warm transfer NÃO exige reescrever o roteamento de inbound** — o
épico é bem menor do que parecia. Recomendação: **F0 (vínculo + pareamento) → F2
(warm transfer)**; F1 vira opcional (espelho/persistência), não um pré-requisito.

## 9. Design técnico detalhado (pós-investigação) — IMPLEMENTÁVEL

### 9.1 Insight que encolhe o épico
"Warm transfer" = a conexão do humano (C_m) manda a 1ª mensagem ao CLIENTE; daí o
humano responde **no próprio app de WhatsApp**. Como **C_m não tem agente**
deployado, o inbound de C_m chega ao webhook, resolve a org, mas
`resolveAgentIdForConnection(C_m)` retorna nada → **o bot não processa** (caminho
já existente para conexão sem agente). **Logo NÃO há reescrita de inbound routing.**
O risco do "F1" original (roteamento ao vivo) praticamente some.

### 9.2 Modelo de dados (decisão)
`DepartmentMember.connectionId String?` (FK nullable → Connection, `onDelete: SetNull`).
- `null` (padrão) → comportamento atual (resumo via número do bot a `member.whatsapp`).
- setado → o membro tem instância própria pareada (número dele).
- (Opcional dept-level: `Department.connectionId` p/ "número do financeiro" sem roleta — fase posterior.)

### 9.3 Pareamento (reusa o que existe)
A criação/QR de instância já existe (`create-instance.tool.ts`). F0 = uma ação no
Builder "parear WhatsApp deste atendente" que cria uma Connection e grava o id em
`DepartmentMember.connectionId`. Sem motor novo de pareamento.

### 9.4 Fluxo do warm transfer (F2)
No handoff `routing:'department'` (roleta escolhe o membro M):
1. Resolve `M.connectionId`. Se `null` → comportamento atual (resumo via bot). Fail-open.
2. Com C_m: usa o token/baseUrl de C_m para enviar **ao CLIENTE** uma mensagem de
   abertura ("Oi, aqui é {M.name} da {empresa}, vou continuar seu atendimento por
   aqui 👋") + (opcional) um resumo ao próprio M.
3. Pausa a IA na sessão do bot (JÁ existe). O cliente passa a falar com o número de M.
4. O bot **não** processa o inbound de C_m (M não é agente) → M atende no app dele.

### 9.5 Política "cliente em 2 conversas"
O cliente fica com 2 contatos: número do bot (pausado) + número de M. Mitigação: a
mensagem de abertura deixa claro que o atendimento segue no novo número. Se o
cliente responder no número do bot, a IA está pausada (operador vê no painel). Sem
espelhamento no MVP (F-opcional depois).

### 9.6 Riscos remanescentes (menores que o previsto)
- Pareamento/expiração de QR por atendente (operacional).
- Custo/limites UAZapi por número (N instâncias).
- LGPD: número do cliente vai pro WhatsApp pessoal do atendente (consentir/configurar).

### 9.7 Fases revisadas
- **F0 (backend) — ✅ FEITO (2026-06-07):** `DepartmentMember.connectionId` (migration `20260606100000`) + roleta carrega o `connectionId` + dispatch faz o warm transfer quando o membro tem conexão própria (`warm-transfer.ts` `tryWarmTransferToClient`, fail-open) — a conexão do membro manda a 1ª mensagem ao cliente + carimbo `handoff.warmTransfer`. Testado (5 testes).
- **F0 (UI) — PENDENTE:** ação no Builder "parear WhatsApp deste atendente" (QR) que cria a Connection e grava `DepartmentMember.connectionId`. Sem isso a feature fica inerte (nenhum membro tem conexão própria). É o próximo passo para a feature funcionar de ponta a ponta.
- **F-opcional** — espelho/persistência do inbound de C_m no painel + `Department.connectionId` (número de depto sem roleta) + política avançada de 2-conversas.
