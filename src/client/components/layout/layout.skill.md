# Skill: layout

Componentes de shell e navegação que envolvem todas as páginas autenticadas.

## Arquitetura Server/Client

```
AppShell (Server Component)          ← faz fetch de dados server-side
    │  getBuilderSidebarData()
    ▼
AppShellClient (Client Component)    ← estado de colapso, atalhos, tema
    ├── BuilderSidebar               ← sidebar padrão (rotas normais)
    └── sidebarOverride              ← AdminNav (rotas /admin/*)
```

**Regra:** nunca fazer fetch de dados no `AppShellClient`. Dados descem via props do `AppShell`.

## Inventário de arquivos

| Arquivo | Tipo | Responsabilidade |
|---|---|---|
| `app-shell.tsx` | Server | Busca dados da sidebar, renderiza AppShellClient |
| `app-shell-client.tsx` | Client | Estado colapsado (localStorage), atalhos ⌘B/⌘K, skip link |
| `builder-sidebar.tsx` | Client | Sidebar do app principal — logo, projetos recentes, nav |
| `admin-nav.tsx` | Client | Sidebar do painel admin — menu fixo de 9 itens |
| `page-layout.tsx` | Server | Wrapper de conteúdo interno: `max-w-*` + padding |

## Uso padrão

```tsx
// Em src/app/(autenticado)/layout.tsx
import { AppShell } from "@/client/components/layout/app-shell"

export default function Layout({ children }) {
  return <AppShell>{children}</AppShell>
}

// Em src/app/admin/layout.tsx — override da sidebar
import { AdminNav } from "@/client/components/layout/admin-nav"

export default function AdminLayout({ children }) {
  return <AppShell sidebar={<AdminNav />}>{children}</AppShell>
}
```

## Tokens de tema

Ambas as sidebars usam `useAppTokens()` para cores reativas (dark/light).
- Light: sidebar background `#FFFFFF`, main `#F5F2ED`
- Dark: sidebar background `#0B0704`, main `#000000`

## Atalhos de teclado (`app-shell-client.tsx`)

| Atalho | Ação |
|---|---|
| ⌘B / Ctrl+B | Toggle sidebar (persiste em localStorage) |
| ⌘K / Ctrl+K | Foca input principal ou navega para `/` |

## Ao estender

- Nova sidebar (ex: settings vertical): criar componente + passar via `sidebar` prop do `AppShell`
- Novo atalho global: adicionar no `onKey` handler do `useEffect` em `app-shell-client.tsx`
- Novo item no admin: adicionar objeto em `ADMIN_MENU` em `admin-nav.tsx`
- Novo item no builder sidebar: editar `builder-sidebar.tsx`
- Nunca adicionar fetch de dados no `AppShellClient`
