# Skill: custom

Componentes de utilidade reutilizáveis com opinião de UX mas sem identidade de feature específica.
Usados em qualquer parte do app quando o contexto exige.

## Inventário de arquivos

| Arquivo | Componente | Quando usar |
|---|---|---|
| `empty-state.tsx` | `EmptyState` | Seção sem dados — sempre que uma lista/tabela está vazia |
| `status-badge.tsx` | `StatusBadge` | Pill colorida de status em tabelas/cards |

## EmptyState — props

```typescript
interface EmptyStateProps {
  icon?: LucideIcon          // ícone central (opcional)
  title: string              // ex: "Nenhum projeto ainda"
  description?: string       // texto de apoio
  action?: {
    label: string
    onClick: () => void
  }
}
```

## StatusBadge — valores de status

Mapeados para cores via `tokens.brand*`:

| Status | Cor |
|---|---|
| `connected` / `active` | verde |
| `disconnected` / `inactive` | cinza |
| `connecting` / `pending` | amarelo |
| `error` / `failed` | vermelho |

## Ao estender

- Novo componente utilitário sem dono de feature → adicionar aqui
- Se o componente for específico de uma feature (ex: `instance-card`) → colocar na pasta da feature
- `EmptyState` deve ser usado em vez de JSX inline para estados vazios
