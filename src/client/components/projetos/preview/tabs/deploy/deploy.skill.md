---
Criado: 2026-06-11
Atualizado: 2026-06-11
Revisar em: quando o wizard de publicação ou as rotas de canal mudarem
Relacionados:
  - src/server/ai-module/builder/deploy/deploy.skill.md
  - src/server/ai-module/builder/channel/provision-whatsapp.routes.ts
  - src/server/ai-module/builder/projects/routes/channel.routes.ts
  - src/client/components/projetos/preview/tabs/overview/overview.skill.md
---

# Skill — Frontend Deploy Tab (Publicar)

Wizard de publicação do Builder. Orquestrador: `deploy-tab.tsx`.

## Wizard de 4 steps (StepIndicator)

| # | Step | Componente | O que faz |
|---|---|---|---|
| 1 | Canal | `channel-picker-section.tsx` | Canal vinculado (conectado OU pendente), attach de canal existente, provision inline |
| 2 | Requisitos | `connection-step.tsx` | Checklist dos 6 pre-deploy checks do readiness |
| 3 | Publicar | `instance-step.tsx` | Botão "Publicar vN" (gateado por `allMet`) + confirm dialog |
| 4 | Histórico | `summary-step.tsx` | Resumo, diff, rollback, timeline de versões |

## Fontes únicas (não re-derivar)

- **Canal:** query `["project-channel", id]` → `GET /builder/projects/:id/channel`. Poll de 15s sem canal, **5s enquanto canal existe mas não conectou** (aguardando scan), para em `CONNECTED/ACTIVE/READY`.
- **Requisitos:** `api.builder.getReadiness.useQuery` (mesma fonte da Overview). Blockers `plan/byok/agent/prompt/version/channel` adaptados por `readiness-checklist.ts`. `deriveChecklist` (connection-step) é só fallback degradado enquanto o readiness carrega/erra.
- **Versões:** query `["project-versions", id]` → `GET /builder/projects/:id/versions` com `unwrapVersions` (version-utils.ts). Distribuída por prop para Instance/SummaryStep. Pós-publish/rollback: invalidar essa key (`handleVersionsChanged`) — nunca `window.location.reload()`.

## Fluxo WhatsApp Business (UAZAPI)

- `POST /api/v1/builder/channel/provision-whatsapp` é **IDEMPOTENTE**: reusa a Connection WHATSAPP_WEB pendente do projeto (renova shareToken expirado, estende TTL, regenera QR, re-anexa). `force: true` cria instância/Connection novas.
- Estado do provisionamento vive em `useWhatsAppProvision` (dono: channel-picker-section) — o QR **sobrevive** à troca selector → `pending-channel.tsx` quando o canal do projeto passa a existir.
- "Gerar novo QR" chama a MESMA rota de provision (autenticada, org-scoped) — funciona mesmo após o shareToken de 15min expirar (a rota pública `share/:token` devolve 404 nesse caso).
- `qr-panel.tsx`: QR + countdown de expiração + share link + refresh, compartilhado pelo painel inicial e pela view pendente.

## Gate de publicação

`disabled={!draft || publishing || !allMet}` — mesma política do copy "não é possível publicar ainda". Tooltip lista os itens não atendidos com o CTA real do blocker. A confirmação de publish usa `POST /builder/deploy/publish-version`.

## Erros visíveis (sem empty-state mentiroso)

- Falha na query de canal/versões → `RetryCard` com "Tentar novamente" (nunca fingir lista vazia).
- Falha em mutações → `readErrorMessage` (`read-error-message.ts`, util compartilhado) extrai a mensagem do envelope Igniter.

## Referências

- Backend saga: `src/server/ai-module/builder/deploy/deploy.skill.md`
- Provision idempotente: `src/server/ai-module/builder/channel/provision-whatsapp.routes.ts`
- Rotas de canal do projeto: `src/server/ai-module/builder/projects/routes/channel.routes.ts`
- Tab registrada em `preview/tab-registry.tsx` (gate `canOpenDeploy`)
