# Skill: canais

Página de gerenciamento de canais de mensagem (`/canais`).
Thin wrapper que orquestra a listagem e os modais da pasta `whatsapp/`.

## Inventário de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `canais-page.tsx` | Orquestrador client: lista instâncias, abre modais, revalida |

## Fluxo de dados

```
src/app/canais/page.tsx (Server Component)
    │  api.connections.list.query() → initialInstances
    ▼
CanaisPage (Client Component)
    ├── state: selectedInstance, modalOpen (create/edit/details/connect/share/credentials)
    ├── InstanceCard[] (whatsapp/instance-card.tsx)
    └── Modais condicionais (whatsapp/*.modal.tsx)
```

## Props

```typescript
interface CanaisPageProps {
  initialInstances: Connection[]
}
```

## Padrão de revalidação

Após qualquer mutação (criar, editar, deletar, conectar):
```typescript
// Revalida a query de lista sem reload de página
api.connections.list.invalidate()
```

## Ao estender

- Novo tipo de canal: adicionar suporte no `create-instance-modal` (pasta `whatsapp/`)
- Nova ação de bulk: adicionar `BulkActionBar` acima da grid + handler em `canais-page.tsx`
- Filtro por status: adicionar `FilterBar` + estado local de filtro
- Ver [whatsapp/whatsapp.skill.md](../whatsapp/whatsapp.skill.md) para os modais
