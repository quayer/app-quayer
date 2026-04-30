# Skill: whatsapp

Componentes de gerenciamento de instâncias WhatsApp/Instagram. Usados na rota `/canais`.

## Propósito

- CRUD de instâncias de canal (WhatsApp Cloud API, WhatsApp QR, Instagram)
- Conexão via QR code e via token CloudAPI
- Compartilhamento de links de instância
- Feed de atividade por instância

## Inventário de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `instance-card.tsx` | Card visual de uma instância — status badge, menu de ações |
| `create-instance-modal.tsx` | Wizard multi-step: escolher tipo → preencher credenciais → criar |
| `edit-instance-modal.tsx` | Editar nome e número de telefone da instância |
| `edit-credentials-modal.tsx` | Atualizar token/phone-id (CloudAPI) ou token (Instagram) |
| `connection-modal.tsx` | Fluxo de conexão QR: polling de status + exibir QR code |
| `details-modal.tsx` | Painel de detalhes: IDs copiáveis, trocar org, info técnica |
| `share-link-modal.tsx` | Gerar/exibir link compartilhável da instância |
| `activity-feed.tsx` | Lista de eventos recentes da instância (mensagens, erros) |

## Modelo de dados

```typescript
// Connection (src/server/communication/connections)
type Connection = {
  id: string
  name: string
  phone: string | null
  status: "connected" | "disconnected" | "connecting" | "error"
  brokerType: "WHATSAPP_CLOUD" | "WHATSAPP_QR" | "INSTAGRAM"
  organizationId: string
  instanceId: string | null
}
```

## Fluxo de conexão QR

```
create-instance-modal → onCreated(instance)
        │
        ▼
connection-modal (polling GET /instances/:id/status a cada 3s)
        │ status === "connected"
        ▼
    Fecha modal → revalida lista de instâncias
```

## Padrões

- Modais controlados por `isOpen` + `onClose` (nunca estado interno de aberto/fechado)
- Polling com `useEffect` + `setInterval` — limpar no cleanup
- `brokerType` determina quais campos mostrar em `edit-credentials-modal`
- Nenhum modal faz fetch direto — sempre via hooks/queries Igniter

## Ao estender

- Novo tipo de canal: adicionar `brokerType` no `create-instance-modal` wizard step 1
- Nova ação no card: adicionar em `instance-card.tsx` menu de ações + modal correspondente
- Nova credencial: editar `edit-credentials-modal.tsx` adicionando branch por `brokerType`
