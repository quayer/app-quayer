# Índice de Componentes — src/client/components/

Mapa completo de todas as pastas e seus arquivos de contexto.
Ler o `.skill.md` da pasta antes de modificar qualquer componente nela.

## Estrutura

```
src/client/components/
├── ui/               ← Primitivos shadcn/ui (Radix + Tailwind)
├── ds/               ← Design System Quayer (logo, icons de modelo, message-input)
├── custom/           ← Utilitários reutilizáveis sem feature (EmptyState, StatusBadge)
├── layout/           ← Shell do app (AppShell server+client, AdminNav, BuilderSidebar)
├── skeletons/        ← Loading states para loading.tsx das rotas
├── auth/             ← Formulários e fluxos de autenticação
├── home/             ← Dashboard principal (/)
├── whatsapp/         ← Modais e cards de instâncias WhatsApp/Instagram
├── canais/           ← Página /canais (orquestrador de whatsapp/)
├── projetos/         ← Builder IA: workspace, chat, preview tabs
├── admin-settings/   ← Painéis de config do super-admin
├── organization/     ← Settings da organização (tenant)
├── billing/          ← Planos e cobrança
├── editor/           ← TiptapEditor (rich text)
└── accessibility/    ← skip-link e utilitários a11y
```

## Arquivos de contexto por pasta

| Pasta | Skill/Context file | Linhas |
|---|---|---|
| `ui/` | [ui.skill.md](ui/ui.skill.md) | ~80 |
| `ds/` | [ds.skill.md](ds/ds.skill.md) | ~50 |
| `custom/` | [custom.skill.md](custom/custom.skill.md) | ~50 |
| `layout/` | [layout.skill.md](layout/layout.skill.md) | ~70 |
| `skeletons/` | [skeletons.skill.md](skeletons/skeletons.skill.md) | ~55 |
| `auth/` | [auth.skill.md](auth/auth.skill.md) | ~55 |
| `home/` | [home.skill.md](home/home.skill.md) | ~50 |
| `whatsapp/` | [whatsapp.skill.md](whatsapp/whatsapp.skill.md) | ~65 |
| `canais/` | [canais.skill.md](canais/canais.skill.md) | ~50 |
| `projetos/` | [projetos.skill.md](projetos/projetos.skill.md) | — |
| `projetos/list/` | [list.skill.md](projetos/list/list.skill.md) | ~55 |
| `projetos/chat/` | [chat.skill.md](projetos/chat/chat.skill.md) | — |
| `projetos/preview/tabs/overview/` | [overview.skill.md](projetos/preview/tabs/overview/overview.skill.md) | — |
| `projetos/preview/tabs/prompt/` | [prompt.skill.md](projetos/preview/tabs/prompt/prompt.skill.md) | — |
| `projetos/preview/tabs/deploy/` | [deploy.skill.md](projetos/preview/tabs/deploy/deploy.skill.md) | — |
| `admin-settings/` | [admin-settings.skill.md](admin-settings/admin-settings.skill.md) | ~55 |
| `organization/` | [organization.skill.md](organization/organization.skill.md) | ~55 |
| `billing/` | [billing.skill.md](billing/billing.skill.md) | ~40 |

## Duplicados investigados e resolvidos

| Item | Veredicto |
|---|---|
| `layout/skeletons.tsx` | **DELETADO** — zero imports, substituído por `skeletons/` |
| `deploy-readiness-card` em dois tabs | **FALSO ALARME** — arquivo em `deploy/` não existe |
| `app-shell.tsx` vs `app-shell-client.tsx` | **INTENCIONAL** — padrão Server/Client Next.js |
| `projetos-list.tsx` shim | **INTENCIONAL** — re-export documentado, mantém path público |

## Regra de localização de novos componentes

```
É um primitivo genérico (sem cor de marca, sem API)?  → ui/
É identidade visual Quayer (logo, ícones de modelo)?  → ds/
É utilitário reutilizável sem feature específica?     → custom/
É exclusivo de uma feature?                           → pasta da feature
É loading state de uma rota?                          → skeletons/
```

## Padrão de tamanho de arquivo

Máximo sugerido: **200 linhas por componente**.
Se ultrapassar → extrair sub-componentes em `[pasta]/components/`.
Referência: `projetos/preview/tabs/overview/components/` como exemplo de split bem feito.
