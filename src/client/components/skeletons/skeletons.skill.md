# Skill: skeletons

Loading states para páginas e seções enquanto dados são carregados server-side.
Usados em arquivos `loading.tsx` das rotas do App Router.

## Propósito

- Substituir conteúdo real durante streaming SSR / suspense boundaries
- Cada skeleton replica a estrutura visual da seção que está carregando
- Nunca têm props de dados — apenas estrutura e dimensões

## Inventário de arquivos

| Arquivo | Componente exportado | Onde usar |
|---|---|---|
| `page-header-skeleton.tsx` | `PageHeaderSkeleton` | Cabeçalhos de página com breadcrumb + título + ação |
| `table-skeleton.tsx` | `TableSkeleton({ rows?, columns? })` | Tabelas de dados — padrão: 5 linhas × 5 colunas |
| `card-grid-skeleton.tsx` | `CardGridSkeleton` | Grids de cards (ex: lista de projetos em card) |
| `stats-skeleton.tsx` | `StatsSkeleton` | Painéis de métricas / KPI cards |
| `chart-skeleton.tsx` | `ChartSkeleton` | Área de gráficos Recharts |
| `form-skeleton.tsx` | `FormSkeleton` | Formulários de settings |
| `activity-skeleton.tsx` | `ActivitySkeleton` | Feed de atividade / timeline |

## Convenção de import

```typescript
// Sempre importar da pasta skeletons/, não de layout/skeletons.tsx (deletado)
import { PageHeaderSkeleton } from "@/client/components/skeletons/page-header-skeleton"
import { TableSkeleton } from "@/client/components/skeletons/table-skeleton"
```

## Padrões

- Usam apenas `<Skeleton>` de `@/client/components/ui/skeleton` (Radix)
- Sem `"use client"` — são Server Components puros
- Props opcionais apenas para quantidade de linhas (`rows`, `columns`)
- Estrutura deve espelhar fielmente o layout real (mesmos gaps, proporções)

## Ao estender

- Nova página: criar `loading.tsx` na rota + compor skeletons existentes
- Novo skeleton específico: criar arquivo `[nome]-skeleton.tsx` nesta pasta
- Não usar `layout/skeletons.tsx` — esse arquivo foi removido (era órfão)
