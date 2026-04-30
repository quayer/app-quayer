# Skill: billing

Componentes de planos e cobrança. Usados nas rotas `/org/billing` e `/admin/billing`.

## Inventário de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `pricing-content.tsx` | Tabela comparativa de planos — busca planos da API e renderiza cards |

## Fluxo de dados

```
PricingContent (Client Component)
    │  api.billing.plans.list.useQuery()
    ▼
Cards de planos com features + CTA "Assinar" / "Atual"
```

## Lógica de destaque

- Plano atual da org é detectado via `api.billing.subscription.useQuery()`
- CTA desabilitado no plano atual, habilitado nos demais
- Upgrade chama `api.billing.checkout.create.mutate({ planId })` → redirect Stripe

## Ao estender

- Nova feature num plano: editar os dados de `api.billing.plans` (backend) — o componente é data-driven
- Nova página de billing: criar em `/org/billing/[nova-rota]` + importar `pricing-content` se precisar de planos
- Lógica de pagamento está no backend (`src/server/core/billing/`) — nunca no frontend
