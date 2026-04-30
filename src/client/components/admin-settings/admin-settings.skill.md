# Skill: admin-settings

Painéis de configuração do painel super-admin (`/admin/settings`).
Cada arquivo é um painel independente composto na página principal.

## Propósito

- Configurar variáveis de sistema que afetam toda a plataforma
- Acessíveis apenas por `isSuperAdmin === true`
- Mudanças persistidas via API Igniter (`api.admin.settings.*`)

## Inventário de arquivos

| Arquivo | O que configura |
|---|---|
| `AutenticacaoSettings.tsx` | Wrapper que agrupa OAuth + Security num único card |
| `OAuthSettings.tsx` | Client ID/Secret do Google OAuth |
| `SecuritySettings.tsx` | JWT secret, session TTL, rate limit por IP |
| `EmailSettings.tsx` | Provedor de email: Resend API key / SMTP / Mock |
| `WebhookSettings.tsx` | URL e secret dos webhooks de sistema |
| `AISettings.tsx` | Modelo de IA padrão, API key Anthropic/OpenAI |
| `ApiKeysSettings.tsx` | Listagem e revogação de API keys de sistema |
| `UAZapiSettings.tsx` | Base URL e token da integração UAZapi |
| `ConcatenationSettings.tsx` | Regras de concatenação de mensagens WhatsApp |
| `ProvedoresSettings.tsx` | Config de provedores de mensageria disponíveis |
| `SystemInfo.tsx` | Read-only: versão, uptime, variáveis de ambiente visíveis |

## Padrão de composição

```tsx
// AutenticacaoSettings é wrapper de dois sub-settings:
export function AutenticacaoSettings() {
  return (
    <div className="space-y-6">
      <OAuthSettings />
      <SecuritySettings />
    </div>
  )
}
```

## Padrão de fetch/mutation

```typescript
// Cada componente faz seu próprio fetch (não prop drilling)
const { data } = api.admin.settings.email.useQuery()
const mutation = api.admin.settings.email.update.useMutation()
```

## Ao estender

- Nova seção de settings: criar `NovoSettings.tsx` + adicionar na page `/admin/settings/page.tsx`
- Nova sub-seção dentro de existente: criar componente + compor no wrapper (padrão `AutenticacaoSettings`)
- Campos sensíveis (secrets, keys): nunca exibir valor completo — mascarar com `***` e só atualizar se campo editado
