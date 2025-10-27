# 🧪 Relatório de Cobertura de Testes

**Data**: 2025-10-12
**Cobertura Estimada**: 16%

---

## 📊 Estatísticas de Testes

| Tipo | Quantidade | % |
|------|------------|---|
| Unit Tests | 6 | 19% |
| API Tests | 5 | 16% |
| E2E Tests | 20 | 65% |
| **Total** | **31** | **100%** |

**Tamanho Médio**: 10 KB

## 📈 Cobertura por Tipo de Arquivo

| Tipo | Total | Testados | Sem Teste | Cobertura |
|------|-------|----------|-----------|----------|
| component | 209 | 34 | 175 | 16% |
| page | 0 | 0 | 0 | 0% |
| hook | 0 | 0 | 0 | 0% |
| service | 0 | 0 | 0 | 0% |
| controller | 0 | 0 | 0 | 0% |
| **Total** | **209** | **34** | **175** | **16%** |

## 🔴 Componentes Sem Testes (161)

Arquivos que precisam de testes:

### component (161)

- `./src/components/app-sidebar.tsx`
- `./src/components/auth/login-form-final.tsx`
- `./src/components/auth/login-form-magic.tsx`
- `./src/components/auth/login-form.tsx`
- `./src/components/auth/login-otp-form.tsx`
- `./src/components/auth/otp-form.tsx`
- `./src/components/auth/passkey-button.tsx`
- `./src/components/auth/signup-form.tsx`
- `./src/components/auth/signup-otp-form.tsx`
- `./src/components/auth/verify-email-form.tsx`
- `./src/components/custom/empty-state.tsx`
- `./src/components/custom/status-badge.tsx`
- `./src/components/error-boundary.tsx`
- `./src/components/login-form.tsx`
- `./src/components/nav-main.tsx`
- `./src/components/nav-projects.tsx`
- `./src/components/nav-secondary.tsx`
- `./src/components/nav-user.tsx`
- `./src/components/onboarding/onboarding-wizard.tsx`
- `./src/components/organization-switcher.tsx`
- `./src/components/providers/app-providers.tsx`
- `./src/components/skeletons/activity-skeleton.tsx`
- `./src/components/skeletons/card-grid-skeleton.tsx`
- `./src/components/skeletons/chart-skeleton.tsx`
- `./src/components/skeletons/form-skeleton.tsx`
- `./src/components/skeletons/page-header-skeleton.tsx`
- `./src/components/skeletons/stats-skeleton.tsx`
- `./src/components/skeletons/table-skeleton.tsx`
- `./src/components/ui/accessible-dialog.tsx`
- `./src/components/ui/accordion.tsx`
- `./src/components/ui/activity-timeline.tsx`
- `./src/components/ui/alert-dialog.tsx`
- `./src/components/ui/alert.tsx`
- `./src/components/ui/aspect-ratio.tsx`
- `./src/components/ui/avatar.tsx`
- `./src/components/ui/badge.tsx`
- `./src/components/ui/breadcrumb.tsx`
- `./src/components/ui/bulk-action-bar.tsx`
- `./src/components/ui/button.tsx`
- `./src/components/ui/calendar.tsx`
- `./src/components/ui/card.tsx`
- `./src/components/ui/carousel.tsx`
- `./src/components/ui/chart.tsx`
- `./src/components/ui/charts/area-chart.tsx`
- `./src/components/ui/charts/bar-chart.tsx`
- `./src/components/ui/charts/index.tsx`
- `./src/components/ui/charts/line-chart.tsx`
- `./src/components/ui/checkbox.tsx`
- `./src/components/ui/collapsible.tsx`
- `./src/components/ui/command.tsx`
- `./src/components/ui/context-menu.tsx`
- `./src/components/ui/dialog.tsx`
- `./src/components/ui/drawer.tsx`
- `./src/components/ui/dropdown-menu.tsx`
- `./src/components/ui/field.tsx`
- `./src/components/ui/filter-bar.tsx`
- `./src/components/ui/form.tsx`
- `./src/components/ui/google-icon.tsx`
- `./src/components/ui/hover-card.tsx`
- `./src/components/ui/input-otp.tsx`
- `./src/components/ui/input.tsx`
- `./src/components/ui/label.tsx`
- `./src/components/ui/menubar.tsx`
- `./src/components/ui/navigation-menu.tsx`
- `./src/components/ui/page-header.tsx`
- `./src/components/ui/pagination.tsx`
- `./src/components/ui/password-input.tsx`
- `./src/components/ui/popover.tsx`
- `./src/components/ui/progress.tsx`
- `./src/components/ui/radio-group.tsx`
- `./src/components/ui/resizable.tsx`
- `./src/components/ui/scroll-area.tsx`
- `./src/components/ui/select.tsx`
- `./src/components/ui/separator.tsx`
- `./src/components/ui/sheet.tsx`
- `./src/components/ui/sidebar.tsx`
- `./src/components/ui/skeleton.tsx`
- `./src/components/ui/slider.tsx`
- `./src/components/ui/sonner.tsx`
- `./src/components/ui/stars-background.tsx`
- `./src/components/ui/switch.tsx`
- `./src/components/ui/table.tsx`
- `./src/components/ui/tabs.tsx`
- `./src/components/ui/textarea.tsx`
- `./src/components/ui/theme-switcher.tsx`
- `./src/components/ui/toggle-group.tsx`
- `./src/components/ui/toggle.tsx`
- `./src/components/ui/tooltip.tsx`
- `./src/components/whatsapp/activity-feed.tsx`
- `./src/components/whatsapp/connection-modal.tsx`
- `./src/components/whatsapp/create-instance-modal.tsx`
- `./src/components/whatsapp/details-modal.tsx`
- `./src/components/whatsapp/edit-instance-modal.tsx`
- `./src/components/whatsapp/instance-card.tsx`
- `./src/components/whatsapp/share-modal.tsx`
- `./src/app/(auth)/login/actions.ts`
- `./src/app/admin/organizations/create-organization-dialog.tsx`
- `./src/app/admin/organizations/edit-organization-dialog.tsx`
- `./src/app/api/health/route.ts`
- `./src/app/api/mcp/[transport]/route.ts`
- `./src/app/api/v1/[[...all]]/route.ts`
- `./src/app/integracoes/messages/bulk-send-dialog.tsx`
- `./src/app/integracoes/messages/send-message-dialog.tsx`
- `./src/app/integracoes/messages/template-dialog.tsx`
- `./src/app/integracoes/projects/create-project-dialog.tsx`
- `./src/app/integracoes/projects/edit-project-dialog.tsx`
- `./src/app/integracoes/webhooks/create-webhook-dialog.tsx`
- `./src/app/integracoes/webhooks/edit-webhook-dialog.tsx`
- `./src/app/integracoes/webhooks/test-webhook-dialog.tsx`
- `./src/app/integracoes/webhooks/webhook-deliveries-dialog.tsx`
- `./src/hooks/use-mobile.ts`
- `./src/hooks/use-mobile.tsx`
- `./src/hooks/use-toast.ts`
- `./src/hooks/useOnboarding.ts`
- `./src/hooks/useOrganization.ts`
- `./src/hooks/usePermissions.ts`
- `./src/services/database.ts`
- `./src/services/jobs.ts`
- `./src/services/logger.ts`
- `./src/services/redis.ts`
- `./src/services/store.ts`
- `./src/services/telemetry.ts`
- `./src/features/auth/auth.schemas.ts`
- `./src/features/auth/controllers/auth.controller.ts`
- `./src/features/auth/index.ts`
- `./src/features/auth/procedures/auth.procedure.ts`
- `./src/features/auth/repositories/auth.repository.ts`
- `./src/features/dashboard/controllers/dashboard.controller.ts`
- `./src/features/dashboard/index.ts`
- `./src/features/example/controllers/example.controller.ts`
- `./src/features/example/index.ts`
- `./src/features/instances/controllers/instances.controller.ts`
- `./src/features/instances/instances.schemas.ts`
- `./src/features/instances/procedures/instances.procedure.ts`
- `./src/features/instances/repositories/instances.repository.ts`
- `./src/features/invitations/controllers/invitations.controller.ts`
- `./src/features/invitations/index.ts`
- `./src/features/invitations/invitations.schemas.ts`
- `./src/features/messages/controllers/chats.controller.ts`
- `./src/features/messages/controllers/media.controller.ts`
- `./src/features/messages/controllers/messages.controller.ts`
- `./src/features/messages/index.ts`
- `./src/features/messages/messages.schemas.ts`
- `./src/features/onboarding/controllers/onboarding.controller.ts`
- `./src/features/onboarding/onboarding.schemas.ts`
- `./src/features/organizations/controllers/organizations.controller.ts`
- `./src/features/organizations/index.ts`
- `./src/features/organizations/organizations.repository.ts`
- `./src/features/organizations/organizations.schemas.ts`
- `./src/features/projects/controllers/projects.controller.ts`
- `./src/features/projects/index.ts`
- `./src/features/projects/projects.repository.ts`
- `./src/features/projects/projects.schemas.ts`
- `./src/features/share/controllers/share.controller.ts`
- `./src/features/share/index.ts`
- `./src/features/share/share.repository.ts`
- `./src/features/webhooks/controllers/webhooks.controller.ts`
- `./src/features/webhooks/index.ts`
- `./src/features/webhooks/webhooks.repository.ts`
- `./src/features/webhooks/webhooks.schemas.ts`
- `./src/features/webhooks/webhooks.service.ts`

## 💡 Recomendações

### 🔴 Prioridade ALTA: Aumentar Cobertura

Cobertura atual (16%) está abaixo da meta (80%).

**Ações**:
1. Criar testes para componentes críticos primeiro
2. Focar em hooks e services (lógica de negócio)
3. Adicionar testes de integração para features principais

### 🟡 Balancear Unit vs E2E

Mais E2E tests (20) do que Unit tests (6).

**Pirâmide de Testes Ideal**:
- 70% Unit Tests (lógica isolada)
- 20% Integration/API Tests
- 10% E2E Tests (fluxos completos)

### 📚 Melhorias Sugeridas

1. **Componentes UI**: Adicionar testes com Testing Library
2. **Hooks Customizados**: Testar com @testing-library/react-hooks
3. **Services**: Mockar APIs e testar lógica de negócio
4. **Error Boundaries**: Testar cenários de erro
5. **Acessibilidade**: Adicionar testes a11y com axe-core

