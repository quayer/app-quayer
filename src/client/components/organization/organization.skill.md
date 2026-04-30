# Skill: organization

Configurações de organização (tenant). Renderizados na rota `/org`.

## Propósito

- Configurações específicas de cada organização (não globais como admin-settings)
- Acessíveis por membros com role `OWNER` ou `ADMIN`
- Dados isolados por `organizationId` da sessão

## Inventário de arquivos

| Arquivo | O que configura |
|---|---|
| `TeamSettings.tsx` | Listar/convidar/remover membros da org |
| `BrandingSettings.tsx` | Upload de logo, cor de marca, nome da org |
| `SMTPSettings.tsx` | SMTP customizado por org (override do SMTP global) |
| `DomainSettings.tsx` | Domínio customizado — STUB (em desenvolvimento) |
| `IntegrationProviderCard.tsx` | Card reutilizável para exibir um provider de integração |

## IntegrationProviderCard — props

```typescript
interface IntegrationProviderCardProps {
  id: string
  name: string
  description: string
  logo: string | ReactNode   // URL de imagem ou componente ícone
  connected: boolean
  onConfigure: () => void    // abre modal de config
}
```

## Padrão de uso

```tsx
// Na página /org/integracoes
<IntegrationProviderCard
  id="chatwoot"
  name="Chatwoot"
  description="Sincronize conversas com o Chatwoot"
  logo="/icons/chatwoot.svg"
  connected={!!provider}
  onConfigure={() => setConfigOpen(true)}
/>
```

## Ao estender

- Nova aba de org settings: criar `NovoSettings.tsx` + adicionar na page `/org`
- Novo provider de integração: apenas criar um novo `<IntegrationProviderCard>` — sem novo componente
- `DomainSettings.tsx` está marcado como stub — ao implementar, conectar à API `api.org.domains.*`
