---
Criado: 2026-06-09
Atualizado: 2026-06-09
Revisar em: quando o controller de instâncias WhatsApp for restaurado
Relacionados:
  - docs/deprecated/ADMIN_SURFACE_REMOVED.md
  - docs/FILE_SIZE_GUIDELINES.md
  - CLAUDE.md
---

# WhatsApp Legacy UI — dead code removido (Jun/2026)

## Contexto

Desde o pivot Builder IA, os componentes legados de gestão de instâncias
WhatsApp ficaram **stubados**: os hooks reais (`useCreateInstance`,
`useConnectInstance`, etc.) foram trocados por fakes que dão
`throw new Error('WhatsApp instance controller not available')`. Nenhum deles
tinha referência viva no app (a página `/canais` atual usa
`ChannelSelectorModal` + `ConnectionCard`). Auditoria de dead code de
2026-06-09 confirmou zero imports → deletados nesta data.

## Arquivos deletados (recuperar via git se precisar)

### `src/client/components/whatsapp/` (stubs com fake hooks)
- `create-instance-modal.tsx` (~1102 linhas) — modal de criação de instância
  (form → QR code → pairing → webhook). Substituído pelo
  `ChannelSelectorModal` em `src/client/components/canais/`.
- `edit-instance-modal.tsx` (~275 linhas) — edição de instância.
- `connection-modal.tsx` (~456 linhas) — fluxo de conexão QR/status.

**Mantido:** `details-modal.tsx` — é FUNCIONAL (sem fake hooks, usa sonner) e
continua usado pela página `/canais` (`canais-page.tsx`).

### `src/client/components/integrations/` (pasta inteira, órfã)
- `CreateIntegrationModal.tsx` (~516 linhas)
- `CreateIntegrationModalSimplified.tsx` (~309 linhas)
- `IntegrationCard.tsx` (~253 linhas) — card de **instância** legado.
  **Atenção:** NÃO confundir com o `<IntegrationCard />` planejado em
  `docs/builder/BUILDER_AGENT_ARCHITECTURE.md` (OAuth card no chat do Builder,
  fase 5 item 26j) — aquele é um componente FUTURO e independente deste.

### `src/client/hooks/use-toast.ts`
Hook fake que acumulava toasts em state local **sem nunca renderizá-los**
(nenhum `<Toaster />` consumia). Os 2 consumidores
(`auth/passkey-button.tsx`, `settings/passkey-manager.tsx`) foram migrados
para **sonner** (`toast.success` / `toast.error`), o padrão do projeto.

### `src/client/components/custom/empty-state.tsx` (pasta `custom/` removida)
Não era dead code — foi **unificado** no design system:
`src/client/components/ds/empty-state.tsx` (variants `card`/`plain`), que
também absorveu os empty-states de `projetos/preview/tabs/overview` e
`projetos/preview/tabs/prompt`. Consumidores (`canais-page`, `home-page`)
atualizados para o novo path.

## Como restaurar

```bash
git log --diff-filter=D --name-only -- 'src/client/components/whatsapp/*' 'src/client/components/integrations/*'
git checkout <hash>^ -- src/client/components/whatsapp/create-instance-modal.tsx
```

Antes de restaurar qualquer modal, o controller de instâncias precisa voltar
(ver `docs/deprecated/ADMIN_SURFACE_REMOVED.md` para o inventário do que foi
removido do backend).
