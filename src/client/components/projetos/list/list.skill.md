# Skill: projetos/list

Listagem table-style dos projetos do workspace (inspirada no v0 Chats page).
Ponto de entrada visual para o usuário abrir/gerenciar os agentes criados no Builder.

## Propósito

- Exibir projetos do usuário com busca, filtro por status e CTA "Novo projeto".
- Roteamento para `/projetos/[id]` ao clicar em uma linha.
- Empty state contextual (busca vazia vs. filtro vazio vs. zero projetos).

## Inventário de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `projetos-list.tsx` | Orquestrador thin — state de query/filter, compõe header + toolbar + table/empty. |
| `list-header.tsx` | Header visual (eyebrow "Workspace" + H1 serif + subtitle). |
| `list-toolbar.tsx` | Toolbar: search input + dropdown de filtro + CTA "Novo projeto". |
| `list-table.tsx` | Wrapper da `<Table>` com cabeçalho das colunas (Nome/Tipo/Status/Atualizado/Ações). |
| `list-row.tsx` | Uma `<TableRow>` clicável com ícone de tipo, status badge e menu de ações. |
| `list-empty-state.tsx` | Estado vazio — mensagem muda conforme busca/filtro. |
| `list-types.ts` | `ProjetoItem`, `ProjetosListProps`, `FilterKey`, constante `FILTERS`. |
| `list-utils.ts` | `formatRelative()` (datas pt-BR) e `matchesFilter()` (status → FilterKey). |
| `hooks/use-filtered-projects.ts` | `useMemo` que aplica filtro + busca sobre `projects`. |

## Fluxo de dados

```
props.projects (Server Component → Client)
        │
        ▼
ProjetosList (state: query, filter)
        │
        ├─ useFilteredProjects(projects, filter, query) → filtered
        │
        ├─ ListHeader (tokens)
        ├─ ListToolbar (query/filter + setters, router.push('/'))
        └─ filtered.length === 0
              ? EmptyState (query, filter)
              : ListTable → ListRow* (router.push(`/projetos/${id}`))
```

## Convenções

- Tema via `useAppTokens()` — tokens propagados como prop para filhos (evita re-subscribe).
- Zero `any`. Tipos compartilhados em `list-types.ts`.
- Shim em `../projetos-list.tsx` preserva import path público: `@/client/components/projetos/projetos-list`.
- Navegação via `next/navigation` `useRouter` — importado somente onde usado (toolbar + row).

## Ao estender

- Nova coluna: editar `list-table.tsx` (header) + `list-row.tsx` (cell).
- Novo filtro: adicionar em `FILTERS` + case em `matchesFilter()`.
- Ações em massa: criar `list-bulk-actions.tsx` e içar estado de seleção no orquestrador.
