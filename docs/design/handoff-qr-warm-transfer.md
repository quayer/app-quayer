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

## 8. Recomendação

Começar por **F0** (multi-instância + QR por departamento, recebendo o resumo na
conexão própria) — entrega valor sem tocar o caminho de inbound ao vivo. F1/F2
(warm transfer real) só depois, com testes de roteamento e gate de prod.
